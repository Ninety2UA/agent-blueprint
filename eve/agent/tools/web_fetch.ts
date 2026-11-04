import { defineTool } from "eve/tools";
import { webFetch, type WebFetchToolOutput } from "eve/tools/web_fetch";
import { headValidators, hitContent, readEntry, removeEntry, writeEntry } from "../lib/wrappers/web_fetch";

// Eve's web_fetch with the CLIs' fetch cache (KTD3, R4). A repeat fetch of a URL asks the
// origin whether the stored body changed and serves it on 304 Not Modified; any other
// answer fetches again. The body is stored only when the origin gives ETag or Last-Modified.
export default defineTool({
  ...webFetch,
  async execute(input, ctx): Promise<WebFetchToolOutput> {
    const format = input.format ?? "markdown";
    const sandbox = await ctx.getSandbox();
    const entry = await readEntry(sandbox, input.url);
    if (entry && entry.format === format && (entry.etag || entry.last_modified)) {
      const headers: Record<string, string> = {};
      if (entry.etag) headers["If-None-Match"] = entry.etag;
      if (entry.last_modified) headers["If-Modified-Since"] = entry.last_modified;
      if ((await headValidators(entry.final_url, headers)).status === 304) {
        return { url: entry.final_url, contentType: entry.content_type, truncated: entry.truncated, content: hitContent(entry) };
      }
    }

    const output = await (webFetch.execute(input, ctx) as Promise<WebFetchToolOutput>);
    if (output.content.startsWith("Request failed with status code:")) return output;
    // Validators from the address web_fetch ended on, which it already checked.
    const { etag, lastModified } = await headValidators(output.url);
    if (!etag && !lastModified) {
      await removeEntry(sandbox, input.url);
    } else {
      await writeEntry(sandbox, {
        url: input.url,
        final_url: output.url,
        format,
        etag,
        last_modified: lastModified,
        content: output.content,
        content_type: output.contentType,
        truncated: output.truncated,
        fetched_at: Math.floor(Date.now() / 1000),
      });
    }
    return output;
  },
});
