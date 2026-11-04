import { secondsUntilUtcMidnight, IDLE_TIMEOUT_MS } from "../../../../agent/lib/caps";
import { type Registry, type SessionEntry, refusal } from "../../../../agent/lib/registry";
import { clientAddress } from "./address";
import { configuredSecret, cookieFromHeaders } from "./code";
import { branchUrl, fill, gateState, type GateStateId } from "./states";

// Which gate state the chat should show, read from the demo's registry: for the chat's own
// session when it has one (the cap hook ended it, or the idle timeout did), otherwise for a new
// session from this cookie and address (resting, or busy). Off the demo there is no registry,
// so there is never a state to show.
//
// A busy state names the real time left: a running entry ends after IDLE_TIMEOUT_MS without
// activity (registry.ts, settle), so the wait runs from the entry's last activity, the soonest of
// the entries that hold the cap. Busy under the caller's own cookie also returns that cookie's
// running session id, so the chat can offer the way back to it when this browser lists the chat;
// another cookie's session id is never returned.

export interface GateStatus {
  readonly state: GateStateId | null;
  readonly message?: string;
  /** Busy under this cookie: the sentence for a running chat this browser does not list. */
  readonly goneMessage?: string;
  /** A second line saying why the state holds. */
  readonly why?: string;
  readonly action?: string;
  readonly actionKind?: string;
  readonly inputDisabled?: boolean;
  readonly branchUrl?: string | null;
  /** Busy under this cookie: the caller's own running session, the one active last. */
  readonly runningSessionId?: string;
}

const BY_OUTCOME: Record<string, GateStateId> = {
  "token-cap": "token-cap",
  blocked: "blocked",
  "idle-ended": "idle-ended",
  resting: "resting",
};

export async function gateStatus(request: Request, registry: Registry | null, env: NodeJS.ProcessEnv = process.env): Promise<GateStatus> {
  if (env.AB_DEMO !== "1" || !registry) return { state: null };
  const cookie = cookieFromHeaders(request.headers, configuredSecret(env));
  if (!cookie) return { state: null };
  const sessionId = new URL(request.url).searchParams.get("session") ?? "";
  const document = await registry.snapshot();
  const now = registry.now();
  const entry = sessionId ? document.sessions[sessionId] : undefined;
  if (entry && entry.cookieId !== cookie.cookieId) return { state: null };
  const caller = { sessionId: sessionId || "new", cookieId: cookie.cookieId, address: clientAddress(request.headers, undefined, env) };
  let id: GateStateId | null = null;
  if (entry?.status === "ended") id = BY_OUTCOME[entry.outcome ?? ""] ?? null;
  else {
    const refused = refusal(document, caller);
    if (refused?.kind === "resting" || refused?.kind === "busy-cookie" || refused?.kind === "busy-address") id = refused.kind;
  }
  if (!id) return { state: null };
  const state = gateState(id);
  const running = Object.values(document.sessions).filter((row) => row.status === "running");
  const holding =
    id === "busy-cookie"
      ? running.filter((row) => row.cookieId === cookie.cookieId)
      : id === "busy-address"
        ? running.filter((row) => row.address === caller.address)
        : [];
  const values = {
    branch: entry?.branch,
    stage: entry?.stage,
    waitSeconds: id === "resting" ? secondsUntilUtcMidnight(now) : holding.length ? secondsLeft(holding, now) : Math.ceil(IDLE_TIMEOUT_MS / 1000),
  };
  const own = id === "busy-cookie" ? lastActive(holding) : undefined;
  return {
    state: id,
    message: fill(state.message, values),
    ...(state.goneMessage ? { goneMessage: fill(state.goneMessage, values) } : {}),
    ...(state.why ? { why: state.why } : {}),
    action: fill(state.action.label, values),
    actionKind: state.action.kind,
    inputDisabled: state.inputDisabled,
    branchUrl: branchUrl(entry?.repository, entry?.branch),
    ...(own ? { runningSessionId: own.sessionId } : {}),
  };
}

/** Seconds until the first of these running entries reaches the idle timeout; at least one. */
function secondsLeft(entries: readonly SessionEntry[], now: Date): number {
  const ends = Math.min(...entries.map((row) => Date.parse(row.lastActivity) + IDLE_TIMEOUT_MS));
  return Math.max(1, Math.ceil((ends - now.getTime()) / 1000));
}

function lastActive(entries: readonly SessionEntry[]): SessionEntry | undefined {
  return [...entries].sort((a, b) => Date.parse(b.lastActivity) - Date.parse(a.lastActivity))[0];
}
