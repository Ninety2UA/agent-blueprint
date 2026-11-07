// How a model or tool failure reads, with no other import, so the web chat can share it with the
// cap hook (lib/caps.ts re-exports it).

export type Failure = "daily-budget" | "rate-limited" | "sandbox" | null;

/** Reads a model or tool failure: a 402 is the daily budget, a 429 is a rate limit. */
export function classifyFailure(error: { readonly code?: string; readonly message?: string } | undefined): Failure {
  if (!error) return null;
  const text = `${error.code ?? ""} ${error.message ?? ""}`;
  if (/\b402\b|payment required|insufficient[_ ]funds|budget (?:exceeded|reached)/i.test(text)) return "daily-budget";
  if (/\b429\b|rate[_ ]limit|too many requests/i.test(text)) return "rate-limited";
  if (/sandbox/i.test(text) && /(creat|start|provision)\w*/i.test(text) && /(fail|could not|unable|error)/i.test(text)) return "sandbox";
  return null;
}
