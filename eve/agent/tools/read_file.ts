import { defineTool } from "eve/tools";
import { readFile, type ReadFileToolOutput } from "eve/tools/read_file";
import { readBanner } from "../lib/wrappers/read_file";

// Eve's read_file with the read-time injection scanner (KTD3, R4). Text that matches a
// pattern is returned whole, with the warning read-injection-scanner.js gives in the CLIs
// placed before it. An image or PDF read passes through unchanged.
export default defineTool({
  ...readFile,
  async execute(input, ctx): Promise<ReadFileToolOutput> {
    const output = await (readFile.execute(input, ctx) as Promise<ReadFileToolOutput>);
    if (output.file !== undefined) return output;
    const banner = readBanner(output.path, output.content);
    return banner ? { ...output, content: `${banner}\n\n${output.content}` } : output;
  },
});
