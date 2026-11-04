import { type AuthFn, type AuthResult, extractBearerToken, ForbiddenError, oauthResource, verifyOidc, withAuthChallenges } from "eve/channels/auth";
import type { RouteHandlerArgs } from "eve/channels";
import { mcpChannel } from "eve/channels/mcp";
import {
  decide,
  demoOn,
  MAINTENANCE_MESSAGE,
  maintenanceOn,
  mcpTokens,
  type OAuthResolution,
  resolveOAuth,
  startsMcpWork,
  tokenMatches,
} from "../lib/channel-gate";
import { forwardedRequest } from "../lib/trust-proxy";

// MCP for deployers (R3, KTD7 to KTD9): Claude Code, Cursor or VS Code send AB_MCP_TOKEN as their
// bearer; Claude.ai and ChatGPT sign in through the deployer's own identity provider (OAuth 2.1,
// MCP authorization 2026-07-28) when AB_MCP_OAUTH_* is complete. Both reach the root agent through
// Eve's four agent_* tools at /eve/v1/mcp; the agent's own tools and skills are not published.
// One auth function walks the gate (channel-gate.ts, KTD2):
//   demo          AB_DEMO=1 admits nobody (R7)
//   audience      the token first, compared in constant time against each configured value, as one
//                 shared interactive user; then, with OAuth on, the provider's access token for this
//                 resource, its subject on AB_MCP_OAUTH_SUBJECTS, or 403 for a subject not listed
//   configured    neither a token of 32 characters or more nor OAuth: nothing is admitted, one log line
//   maintenance   only for a caller the audience step admitted: agent_start and agent_update get a
//                 tool error with the maintenance message (a 200, which clients report as a reason);
//                 agent_get and agent_cancel stay open (R6)
// No localDev() and no anonymous helper: a missing credential is 401 under eve dev too (AE2).
// The OAuth variables are read when this module loads: at build, where Eve fixes the channel's routes
// (the metadata route among them), and again when the server starts, where the auth is built (KTD8).
// With OAuth on, the protected-resource metadata is served under /eve/v1/, the only path that
// reaches the agent on Vercel.
// Behind a proxy that ends TLS (Railway's edge, nginx), Eve refuses the forwarded http:// request;
// with AB_TRUST_PROXY set, every route of the channel first takes the scheme and host the client
// used from the proxy's X-Forwarded-* headers (lib/trust-proxy.ts), read at each request.

type Env = Readonly<Record<string, string | undefined>>;
type Verify = (token: string | null, config: { issuer: string; audiences: readonly string[] }) => ReturnType<typeof verifyOidc>;

const ROUTE = "/eve/v1/mcp";

/** What an OAuth user who signed in but is not on AB_MCP_OAUTH_SUBJECTS reads. */
export const NOT_LISTED_MESSAGE = "You signed in, but this account is not on the list of people who may use this agent. Ask the person who runs it to add your user id.";

/** Every token holder is this one user, as every holder of the web chat's code is one user (KTD7). */
const TOKEN_PRINCIPAL: AuthResult = {
  attributes: {},
  authenticator: "mcp-token",
  issuer: "agent-blueprint-mcp",
  principalId: "mcp-token",
  principalType: "user",
  subject: "mcp-token",
};

/** Eve returns a thrown object's response as is: here, a JSON-RPC answer during maintenance (KTD9). */
class MaintenanceAnswer extends Error {
  readonly response: Response;
  constructor(response: Response) {
    super(MAINTENANCE_MESSAGE);
    this.response = response;
  }
}

/** The maintenance answer for a body that starts work, read from a clone so Eve can still read the original. */
async function maintenanceAnswer(request: Request): Promise<Response | null> {
  let body: unknown;
  try {
    body = await request.clone().json();
  } catch {
    return null;
  }
  if (!startsMcpWork(body)) return null;
  const replies = (Array.isArray(body) ? body : [body])
    .filter((message): message is { id: string | number } => Boolean(message) && typeof message === "object" && (message as { id?: unknown }).id != null)
    .map((message) => ({ jsonrpc: "2.0", id: message.id, result: { content: [{ type: "text", text: MAINTENANCE_MESSAGE }], isError: true } }));
  return Response.json(Array.isArray(body) ? replies : replies[0], { headers: { "cache-control": "no-store" } });
}

async function oauthPrincipal(request: Request, token: string, oauth: Extract<OAuthResolution, { on: true }>, verify: Verify): Promise<AuthResult | null> {
  const resource = oauth.resource ?? new URL(ROUTE, request.url).toString();
  const verified = await verify(token, { issuer: oauth.issuer, audiences: [resource] });
  if (!verified.ok) return null;
  const subject = verified.sessionAuth.subject;
  if (!subject || !(oauth.subjects.includes("*") || oauth.subjects.includes(subject))) {
    // Claude.ai shows its own connection error, not the 403's message (RUNBOOK B4.11), so the log names the id to add.
    console.warn(`[mcp] refused a signed-in user not on AB_MCP_OAUTH_SUBJECTS: ${subject || "(no subject)"}`);
    throw new ForbiddenError({ code: "not_listed", message: NOT_LISTED_MESSAGE });
  }
  // Eve types an OIDC caller service; a person signed in here, and posture.ts names MCP interactive either way.
  return { ...verified.sessionAuth, principalType: "user" };
}

let reportedMissing = false;

export interface McpAuthOptions {
  /** Read at each request: the token, AB_DEMO and AB_MAINTENANCE. */
  readonly env?: Env;
  /** Resolved once, when the module loads. */
  readonly oauth?: OAuthResolution;
  /** The OAuth access-token check; tests replace it. */
  readonly verify?: Verify;
}

/** The channel's one auth function (KTD7). A 401 from it carries a Bearer challenge. */
export function mcpAuth({ env = process.env, oauth = resolveOAuth(env), verify = verifyOidc }: McpAuthOptions = {}): AuthFn<Request> {
  return withAuthChallenges(async (request: Request) => {
    let principal: AuthResult | null = null;
    if (!demoOn(env)) {
      const token = extractBearerToken(request.headers.get("authorization"));
      if (tokenMatches(token, mcpTokens(env))) principal = TOKEN_PRINCIPAL;
      else if (token && oauth.on) principal = await oauthPrincipal(request, token, oauth, verify);
    }
    const answer = principal && maintenanceOn(env) ? await maintenanceAnswer(request) : null;
    const decision = decide({ channel: "mcp", admitted: principal !== null, startsWork: answer !== null, env, oauth });
    if (decision.kind === "unconfigured" && !reportedMissing) {
      reportedMissing = true;
      console.warn(`[mcp] the MCP channel admits nobody: set ${decision.missing.join(", ")} (32 characters or more) or the AB_MCP_OAUTH_* variables`);
    }
    if (decision.kind === "maintenance" && answer) throw new MaintenanceAnswer(answer);
    return decision.kind === "dispatch" ? principal : null;
  }, [{ scheme: "Bearer" }]);
}

/** The channel as this module exports it; tests build it with their own env and verifier. */
export function mcpChannelFor({ env = process.env, oauth = resolveOAuth(env), verify = verifyOidc }: McpAuthOptions = {}) {
  const auth = mcpAuth({ env, oauth, verify });
  const channel = mcpChannel({
    auth: oauth.on
      ? oauthResource(auth, { issuer: oauth.issuer, metadataPath: oauth.metadataPath, ...(oauth.resource ? { resource: oauth.resource } : {}) })
      : auth,
    agent: true,
    tools: false,
    skills: false,
  });
  return {
    ...channel,
    routes: channel.routes.map((route) =>
      route.transport === "websocket"
        ? route
        : { ...route, handler: async (request: Request, args: RouteHandlerArgs) => route.handler(forwardedRequest(request, env), args) },
    ),
  } satisfies typeof channel;
}

const oauth = resolveOAuth();
if (!oauth.on && oauth.reason !== "OAuth is not configured") console.warn(`[mcp] OAuth sign-in is off: ${oauth.reason}`);

export default mcpChannelFor({ oauth });
