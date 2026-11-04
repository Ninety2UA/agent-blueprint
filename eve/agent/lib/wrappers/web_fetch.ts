import { createHash } from "node:crypto";
import type { SandboxSession } from "eve/sandbox";

// The fetch cache of hooks/handlers/sdd-cache-pre.sh and sdd-cache-post.sh, ported for the
// web_fetch wrapper (KTD3). Keyed as today: sha256 of the URL, first 32 hex characters, one
// JSON file per URL under .agent-blueprint/cache/sdd/ in the workspace. Freshness is the
// origin's: a cached body is served only after a 304 Not Modified, an entry without ETag or
// Last-Modified is never stored, and there is no time limit.

export const CACHE_DIR = ".agent-blueprint/cache/sdd";
const BLUEPRINT_IGNORE = "run/\nteam/\nreview-runs/\ncache/\n.gitignore\n";
const HEAD_TIMEOUT_MS = 5_000;

export interface CacheEntry {
  url: string;
  /** The final address after redirects, which web_fetch checked; revalidation asks it. */
  final_url: string;
  /** web_fetch's output format; Claude Code's hook kept the prompt here instead. */
  format: string;
  etag: string;
  last_modified: string;
  content: string;
  content_type: string;
  truncated: boolean;
  fetched_at: number;
}

export function cacheKey(url: string): string {
  return createHash("sha256").update(url).digest("hex").slice(0, 32);
}

export function cachePath(url: string): string {
  return `${CACHE_DIR}/${cacheKey(url)}.json`;
}

/** The validators of a HEAD response; redirects are not followed, so a 3xx carries none. */
export async function headValidators(
  url: string,
  headers: Record<string, string> = {},
): Promise<{ status: number; etag: string; lastModified: string }> {
  try {
    const response = await fetch(url, {
      method: "HEAD",
      redirect: "manual",
      headers,
      signal: AbortSignal.timeout(HEAD_TIMEOUT_MS),
    });
    const redirected = response.status >= 300 && response.status < 400 && response.status !== 304;
    return {
      status: response.status,
      etag: redirected ? "" : (response.headers.get("etag") ?? ""),
      lastModified: redirected ? "" : (response.headers.get("last-modified") ?? ""),
    };
  } catch {
    return { status: 0, etag: "", lastModified: "" };
  }
}

/** The cached body as the model reads it, with the hook's hit message around it. */
export function hitContent(entry: CacheEntry): string {
  const verified = new Date(entry.fetched_at * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
  return [
    `[sdd-cache] Cache hit for ${entry.url}`,
    "",
    `Revalidated via HTTP 304; unchanged since ${verified}. Use the cached`,
    "content below as if web_fetch had just returned it.",
    "",
    "----- BEGIN CACHED CONTENT -----",
    entry.content,
    "----- END CACHED CONTENT -----",
  ].join("\n");
}

export async function readEntry(sandbox: SandboxSession, url: string): Promise<CacheEntry | null> {
  try {
    const text = await sandbox.readTextFile({ path: sandbox.resolvePath(cachePath(url)) });
    if (!text) return null;
    const entry = JSON.parse(text) as CacheEntry;
    return entry.url === url ? entry : null;
  } catch {
    return null;
  }
}

// The blueprint's working folder carries its own ignore file, as the skills' Working
// folder step writes it, so the cache never lands in a commit.
async function ensureFolders(sandbox: SandboxSession): Promise<void> {
  const result = await sandbox.run({ command: `mkdir -p '${sandbox.resolvePath(CACHE_DIR)}'` });
  if (result.exitCode !== 0) throw new Error(`creating ${CACHE_DIR} failed: ${result.stderr}`);
  const ignore = sandbox.resolvePath(".agent-blueprint/.gitignore");
  if ((await sandbox.readTextFile({ path: ignore })) === null) {
    await sandbox.writeTextFile({ path: ignore, content: BLUEPRINT_IGNORE });
  }
}

export async function writeEntry(sandbox: SandboxSession, entry: CacheEntry): Promise<void> {
  await ensureFolders(sandbox);
  await sandbox.writeTextFile({ path: sandbox.resolvePath(cachePath(entry.url)), content: JSON.stringify(entry) });
}

export async function removeEntry(sandbox: SandboxSession, url: string): Promise<void> {
  await sandbox.removePath({ path: sandbox.resolvePath(cachePath(url)), force: true });
}
