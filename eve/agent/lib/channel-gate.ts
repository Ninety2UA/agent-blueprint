import { createHash, timingSafeEqual } from "node:crypto";
import type { RouteHandlerArgs } from "eve/channels";
import { fill, gateState } from "../../apps/web/lib/gate/states";
import { MAINTENANCE_MESSAGE } from "../channels/eve";

// The checks the Linear, Telegram and MCP channels share (KTD1), as pure functions beside the
// channel files that apply them, so node --test covers them without a server. Every reader takes
// the environment as an argument (process.env by default) and never throws on a missing variable,
// because check-skill-count.mjs runs eve info before every build and a throwing module blocks it.
// The gate order is the same on every new route (KTD2):
//   demo          AB_DEMO=1 admits nothing: the demo's caps count web-chat visitors only (R7)
//   configured    a channel missing a required variable starts nothing (R5)
//   audience      the caller the deployer admitted: Linear's signature, Telegram's user list,
//                 MCP's token or OAuth subject; an outsider never learns about maintenance
//   maintenance   while AB_MAINTENANCE is set, new work and checkpoint answers get the web chat's
//                 maintenance message; reads and cancel stay open (R6)
//   dispatch      Eve's handler takes it from here

export { MAINTENANCE_MESSAGE };

type Env = Readonly<Record<string, string | undefined>>;

export type ChannelName = "linear" | "telegram" | "mcp";

/** The demo switch, read as cap-guard.ts reads it. */
export function demoOn(env: Env = process.env): boolean {
  return env.AB_DEMO === "1";
}

/** The maintenance switch, read as channels/eve.ts reads it. */
export function maintenanceOn(env: Env = process.env): boolean {
  return Boolean(env.AB_MAINTENANCE?.trim());
}

/** A comma-separated list: trimmed, empties dropped, every item kept as a string (Telegram ids arrive as strings). */
export function parseList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

/** The shortest AB_MCP_TOKEN or TELEGRAM_WEBHOOK_SECRET_TOKEN value that counts as set. */
export const MIN_SECRET_LENGTH = 32;

/** Each channel's required variables (KTD2). AB_TELEGRAM_USERS is an audience, never a requirement. */
const REQUIRED: Record<ChannelName, readonly string[]> = {
  linear: ["LINEAR_CLIENT_ID", "LINEAR_CLIENT_SECRET", "LINEAR_WEBHOOK_SECRET"],
  telegram: ["TELEGRAM_BOT_TOKEN", "TELEGRAM_WEBHOOK_SECRET_TOKEN"],
  mcp: ["AB_MCP_TOKEN"],
};
const LENGTH_CHECKED = new Set(["AB_MCP_TOKEN", "TELEGRAM_WEBHOOK_SECRET_TOKEN"]);

function isSet(name: string, env: Env): boolean {
  const values = parseList(env[name]);
  if (values.length === 0) return false;
  return !LENGTH_CHECKED.has(name) || values.every((value) => value.length >= MIN_SECRET_LENGTH);
}

/** AB_MCP_TOKEN's values (one, or two during a rotation), or none when any is too short. */
export function mcpTokens(env: Env = process.env): string[] {
  return isSet("AB_MCP_TOKEN", env) ? parseList(env.AB_MCP_TOKEN) : [];
}

/**
 * The channel's required variables that are missing; empty when it may start work. MCP passes with
 * AB_MCP_TOKEN or with an OAuth resolution that is on.
 */
export function missingVariables(channel: ChannelName, env: Env = process.env, oauth?: OAuthResolution): string[] {
  if (channel === "mcp" && oauth?.on) return [];
  return REQUIRED[channel].filter((name) => !isSet(name, env));
}

export type GateDecision =
  | { readonly kind: "demo" }
  | { readonly kind: "unconfigured"; readonly missing: readonly string[] }
  /** A Telegram sender not on AB_TELEGRAM_USERS: one reply an hour naming their id (ruling 46). */
  | { readonly kind: "id-reply" }
  | { readonly kind: "refused" }
  | { readonly kind: "maintenance"; readonly message: string }
  | { readonly kind: "dispatch" };

export interface GateInput {
  readonly channel: ChannelName;
  /** Whether the channel's audience check admitted the caller. */
  readonly admitted: boolean;
  /** New work or a checkpoint answer, as opposed to a read or a cancel. */
  readonly startsWork: boolean;
  readonly env?: Env;
  readonly oauth?: OAuthResolution;
}

/** Walks KTD2's order: demo, configured, audience, maintenance, dispatch. */
export function decide({ channel, admitted, startsWork, env = process.env, oauth }: GateInput): GateDecision {
  if (demoOn(env)) return { kind: "demo" };
  const missing = missingVariables(channel, env, oauth);
  if (missing.length > 0) return { kind: "unconfigured", missing };
  if (!admitted) return channel === "telegram" ? { kind: "id-reply" } : { kind: "refused" };
  if (startsWork && maintenanceOn(env)) return { kind: "maintenance", message: MAINTENANCE_MESSAGE };
  return { kind: "dispatch" };
}

const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();

/**
 * Whether the presented token equals one of the configured values (KTD7): both sides hashed to 32
 * bytes and compared with timingSafeEqual, against every value with no early exit.
 */
export function tokenMatches(presented: string | null | undefined, configured: readonly string[]): boolean {
  if (!presented) return false;
  const given = digest(presented);
  let matched = false;
  for (const value of configured) {
    if (timingSafeEqual(given, digest(value))) matched = true;
  }
  return matched;
}

const WORK_TOOLS = new Set(["agent_start", "agent_update"]);

function isWorkCall(message: unknown): boolean {
  if (!message || typeof message !== "object") return false;
  const { method, params } = message as { method?: unknown; params?: unknown };
  if (method !== "tools/call" || !params || typeof params !== "object") return false;
  const name = (params as { name?: unknown }).name;
  return typeof name === "string" && WORK_TOOLS.has(name);
}

/** Whether a parsed MCP body (one message or a batch) holds a tools/call of agent_start or agent_update (KTD9). */
export function startsMcpWork(body: unknown): boolean {
  return Array.isArray(body) ? body.some(isWorkCall) : isWorkCall(body);
}

export const REFUSAL_WINDOW_MS = 60 * 60 * 1_000;

/** Remembers, in memory, when each key last got a refusal reply, and allows one an hour (ruling 46). */
export class RefusalLimiter {
  readonly #lastReply = new Map<string, number>();

  /** True when this key may get a reply now, and records the reply. */
  shouldReply(key: string, now: number = Date.now()): boolean {
    for (const [seen, at] of this.#lastReply) {
      if (now - at >= REFUSAL_WINDOW_MS) this.#lastReply.delete(seen);
    }
    if (this.#lastReply.has(key)) return false;
    this.#lastReply.set(key, now);
    return true;
  }
}

/** The header Telegram sends the setWebhook secret_token in. */
export const TELEGRAM_SECRET_HEADER = "x-telegram-bot-api-secret-token";

/** What /start and /help answer, without the model (KTD4: a new topic is a new run). */
export const TELEGRAM_USAGE =
  "Name a repository and a feature, for example: Work on https://github.com/owner/repo: add a search box. Start a new topic for each feature so each one gets its own run.";

/** The hourly reply to a sender not on AB_TELEGRAM_USERS (ruling 46, AE1). */
export function telegramIdReply(userId: string): string {
  return `This bot only answers people its owner has added. Your Telegram user id is ${userId}; if you should have access, send it to the owner.`;
}

/** What a refused button press is answered with: an outsider's, on the demo, or with a variable missing. */
export const TELEGRAM_REFUSAL = "This bot cannot take your answer, so the question stays open.";

/**
 * The callback data a refused or maintenance press is rewritten to. Neither starts with Eve's own
 * prefixes (eve:, eve_auth:), so Eve hands the press to onCallbackQuery, which answers it and
 * leaves the keyboard open.
 */
export const TELEGRAM_REFUSED_DATA = "ab:refused";
export const TELEGRAM_MAINTENANCE_DATA = "ab:maintenance";

/** Whether a Telegram sender is admitted (KTD3): a listed numeric id, in a private chat. */
export function telegramAdmits(userId: string | undefined, chatType: string | undefined, env: Env = process.env): boolean {
  return chatType === "private" && Boolean(userId) && parseList(env.AB_TELEGRAM_USERS).includes(userId as string);
}

/** Whether a message is /start or /help, with or without @botname and words after it. */
export function isTelegramUsageCommand(text: string): boolean {
  return /^\/(start|help)(@\w+)?(\s|$)/i.test(text);
}

/**
 * The Telegram webhook verifier's decision (KTD3). Setting a verifier turns Eve's own secret check
 * off, so this does it: null (Eve answers 401) unless TELEGRAM_WEBHOOK_SECRET_TOKEN is set, 32
 * characters or more, and equals the presented header. A button press skips onMessage and
 * onCallbackQuery when its data is Eve's, so the press walks the gate here: anything short of
 * dispatch rewrites its data, to the maintenance data for an admitted press during maintenance and
 * to the refusal data otherwise. Telegram retries non-2xx updates, so a refused press is still
 * accepted (with its rewritten body) and answered with 200. Messages pass unchanged; onMessage
 * walks the gate for them.
 */
export function telegramWebhookBody(presentedSecret: string | null | undefined, body: string, env: Env = process.env): string | null {
  if (missingVariables("telegram", env).includes("TELEGRAM_WEBHOOK_SECRET_TOKEN")) return null;
  if (!tokenMatches(presentedSecret, [(env.TELEGRAM_WEBHOOK_SECRET_TOKEN ?? "").trim()])) return null;
  let update: unknown;
  try {
    update = JSON.parse(body);
  } catch {
    return body;
  }
  const query = (update as { callback_query?: unknown } | null)?.callback_query;
  if (!query || typeof query !== "object") return body;
  const { from, message } = query as { from?: { id?: unknown }; message?: { chat?: { type?: unknown } } };
  const userId = from?.id === undefined ? undefined : String(from.id);
  const chatType = typeof message?.chat?.type === "string" ? message.chat.type : undefined;
  const decision = decide({ channel: "telegram", admitted: telegramAdmits(userId, chatType, env), startsWork: true, env });
  if (decision.kind === "dispatch") return body;
  const data = decision.kind === "maintenance" ? TELEGRAM_MAINTENANCE_DATA : TELEGRAM_REFUSED_DATA;
  return JSON.stringify({ ...(update as object), callback_query: { ...query, data } });
}

/** Where the protected-resource metadata is served: only /eve/v1/* reaches the agent on Vercel (KTD8). */
export const OAUTH_METADATA_PATH = "/eve/v1/oauth-protected-resource/mcp";

export type OAuthResolution =
  | {
      readonly on: true;
      readonly reason: string;
      readonly issuer: string;
      readonly subjects: readonly string[];
      /** Undefined under eve dev only: Eve takes the request's own origin. */
      readonly resource: string | undefined;
      readonly metadataPath: string;
    }
  | { readonly on: false; readonly reason: string };

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

function usableIssuer(issuer: string): boolean {
  try {
    const url = new URL(issuer);
    return url.protocol === "https:" || (url.protocol === "http:" && LOOPBACK.has(url.hostname));
  } catch {
    return false;
  }
}

/**
 * Turns MCP's OAuth on only when its configuration is complete (KTD8): an HTTPS (or loopback)
 * issuer, a subject list, and a resource from AB_MCP_OAUTH_RESOURCE, else the Vercel production
 * address, else the request's own origin under eve dev. Anything less is off, with the reason.
 */
export function resolveOAuth(env: Env = process.env): OAuthResolution {
  const issuer = env.AB_MCP_OAUTH_ISSUER?.trim() ?? "";
  const subjects = parseList(env.AB_MCP_OAUTH_SUBJECTS);
  const typed = env.AB_MCP_OAUTH_RESOURCE?.trim();
  if (!issuer && subjects.length === 0 && !typed) return { on: false, reason: "OAuth is not configured" };
  if (!issuer) return { on: false, reason: "AB_MCP_OAUTH_ISSUER is not set" };
  if (!usableIssuer(issuer)) return { on: false, reason: "AB_MCP_OAUTH_ISSUER is not an https URL (http is allowed on loopback only)" };
  if (subjects.length === 0) return { on: false, reason: "AB_MCP_OAUTH_SUBJECTS is empty" };
  const on = (resource: string | undefined, from: string): OAuthResolution => ({
    on: true,
    reason: `resource from ${from}`,
    issuer,
    subjects,
    resource,
    metadataPath: OAUTH_METADATA_PATH,
  });
  if (typed) return on(typed, "AB_MCP_OAUTH_RESOURCE");
  const production = env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (production) return on(`https://${production}/eve/v1/mcp`, "VERCEL_PROJECT_PRODUCTION_URL");
  if (env.EVE_DEV === "1") return on(undefined, "the request's origin under eve dev");
  return { on: false, reason: "AB_MCP_OAUTH_RESOURCE is not set and this is not a Vercel deployment" };
}

/**
 * Why a run ended: blocked, cap-guard stopped it or a service it needs refused it (a 429, a sandbox
 * that could not start); failed, any other error; ended, its session ended.
 */
export type RunEndOutcome = "blocked" | "failed" | "ended";

export interface RunEndNoticeInput {
  readonly outcome: RunEndOutcome;
  /** The branch a push reported pushed; absent when nothing was pushed. */
  readonly branch?: string | null;
  /** The last stage the run finished, when known. */
  readonly stage?: string | null;
}

/**
 * What Linear and Telegram post when a run is blocked or fails, or its session ends (KTD12, R9).
 * A blocked run with a branch reads as the web chat's Blocked state (apps/web/lib/gate/states.ts),
 * so the channels say what the web chat says; a branch adds how to carry on from it.
 */
export function runEndNotice({ outcome, branch, stage }: RunEndNoticeInput): string {
  if (!branch) {
    const what = { blocked: "The run stopped because a service it needs is busy.", failed: "The run stopped because of an error.", ended: "This session has ended." }[outcome];
    return `${what} No branch was saved.`;
  }
  const what = {
    blocked: fill(gateState("blocked").message, { branch, stage }),
    failed: fill("The run stopped after the {stage} stage because of an error, and its work is saved on the branch {branch}.", { branch, stage }),
    ended: `This session has ended, and its work is saved on the branch ${branch}.`,
  }[outcome];
  return `${what} To pick it up, send a new message asking to continue on branch ${branch}.`;
}

/** Whether a Linear Agent Session event is the person pressing Stop (KTD6): its activity carries the stop signal. */
export function isLinearStop(event: { readonly agentActivity?: { readonly signal?: string | null } | null }): boolean {
  return event.agentActivity?.signal === "stop";
}

/** The one final response a Linear Stop posts (KTD6, AE7). */
export const LINEAR_STOPPED = "Stopped. Send a new message here to start again.";

/** The context line every dispatched Linear run gets (KTD6, ruling 46 D7): the issue, and that a run needs a repository. */
export function linearRunContext(issue: { readonly identifier?: string; readonly title?: string } | null | undefined): string {
  const named = [issue?.identifier, issue?.title ? `"${issue.title}"` : undefined].filter(Boolean).join(" ");
  const from = named ? `This run comes from the Linear issue ${named}.` : "This run comes from Linear.";
  return `${from} A run needs a GitHub repository: if the issue does not name one, ask which repository to work on before you start.`;
}

/**
 * The key that turns a repeated Telegram or Linear webhook into a no-op (ruling 53): Telegram's
 * update_id; for Linear the Agent Session id plus the activity id, or the action when the event has
 * no activity (a session has one created event). It comes from the body, not a delivery header, so
 * it holds however the platform retries. Undefined when the body names neither.
 */
export function deliveryKey(channel: "telegram" | "linear", body: string): string | undefined {
  let update: Record<string, unknown> | null;
  try {
    update = JSON.parse(body) as Record<string, unknown> | null;
  } catch {
    return undefined;
  }
  let key: string | undefined;
  if (channel === "telegram") {
    if (typeof update?.update_id === "number") key = `telegram:${update.update_id}`;
  } else {
    const session = (update?.agentSession as { id?: unknown } | null | undefined)?.id;
    const activity = (update?.agentActivity as { id?: unknown } | null | undefined)?.id;
    const action = typeof update?.action === "string" ? update.action : "created";
    if (typeof session === "string" && session) key = `linear:${session}:${typeof activity === "string" && activity ? activity : action}`;
  }
  return key && key.length <= 256 ? key : undefined; // Eve refuses a key over 256 characters
}

/**
 * The route arguments with every send and respond carrying the request's delivery key as Eve's
 * idempotencyKey. Eve keeps each session's last 1,024 keys in its durable Workflow World and
 * settles a repeat as ignored, so the same update reaching another instance starts nothing new.
 */
export async function withDeliveryKey<TState>(
  channel: "telegram" | "linear",
  request: Request,
  args: RouteHandlerArgs<TState>,
): Promise<RouteHandlerArgs<TState>> {
  const key = deliveryKey(channel, await request.clone().text().catch(() => ""));
  if (!key) return args;
  return {
    ...args,
    from(address) {
      const source = args.from(address);
      return {
        ...source,
        send: (message, options) => source.send(message, { ...options, idempotencyKey: options.idempotencyKey ?? key }),
        respond: (answers, options) => source.respond(answers, { ...options, idempotencyKey: options.idempotencyKey ?? key }),
      };
    },
  };
}
