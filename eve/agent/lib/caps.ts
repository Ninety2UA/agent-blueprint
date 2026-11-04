// The demo's cap layers (KTD13, R16), as numbers and pure rules; hooks/cap-guard.ts applies them
// and lib/registry.ts keeps the counts across sessions.
//   layer one, tokens per session   the preset's budget, measured as Eve's sessionUsage measures it;
//                                   the hook cancels the turn at the cap, before Eve would ask to continue
//   layer two, dollars per day      the AI Gateway key's daily budget; its first 402 of the UTC day
//                                   is recorded, and the gate rests the demo until 00:00 UTC
//   layer three, time and sessions  one running session per cookie, two per address, and a parked
//                                   session ends after the idle timeout
// A 429 from the model provider, or a sandbox that could not be created, ends the run blocked with
// the branch pushed and the stage named, on every copy.

import { preset } from "./roster";

export const SESSIONS_PER_COOKIE = 1;
export const SESSIONS_PER_ADDRESS = 2;
/** A session with no activity for this long no longer counts as running. */
export const IDLE_TIMEOUT_MS = 30 * 60 * 1_000;

export interface TokenUsage {
  readonly inputTokens: number;
  readonly cacheReadTokens: number;
}

/** New input tokens: what limits.sessionUsage counts in agent.ts. */
export function newInputTokens(usage: TokenUsage | undefined): number {
  if (!usage) return 0;
  return Math.max(0, (usage.inputTokens ?? 0) - (usage.cacheReadTokens ?? 0));
}

/** The per-session cap: the roster preset's budget, the same number limits.sessionUsage reads. */
export function sessionTokenCap(): number {
  return preset().sessionInputTokens;
}

export function capReached(tokens: number, cap: number = sessionTokenCap()): boolean {
  return tokens >= cap;
}

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

/** The UTC day of a time, YYYY-MM-DD: the daily mark resets when it changes. */
export function utcDay(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/** Seconds until the next 00:00 UTC. */
export function secondsUntilUtcMidnight(at: Date): number {
  const next = Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate() + 1);
  return Math.ceil((next - at.getTime()) / 1000);
}
