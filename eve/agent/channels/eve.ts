import { type AuthFn, extractBearerToken, ForbiddenError, localDev, vercelOidc } from "eve/channels/auth";
import { eveChannel } from "eve/channels/eve";
import { clientAddress } from "../../apps/web/lib/gate/address";
import { configuredSecret, cookieFromHeaders } from "../../apps/web/lib/gate/code";
import { NOT_OWNER_MESSAGE, ownedByOther } from "../../apps/web/lib/gate/owner";

// The HTTP channel (KTD11, R12): the web chat and HTTP triggers both reach the agent here.
// Route auth, in order:
//   the chat cookie   the web chat's session cookie, issued by apps/web for the shared code; every
//                     holder is one principal, with the cookie id and address as attributes for
//                     the demo's per-cookie and per-address session counts; on the demo a
//                     session another cookie started is refused with 403 (ruling 52)
//   Vercel OIDC       the eve CLI against a deployment, and triggers from other deployments or
//                     Vercel cron: the bearer the README shows for unattended runs
//   local dev         eve dev and vercel dev only; it admits nothing on a deployment
// The anonymous helper, none(), is never in the list, so a request no entry recognises gets 401.
// While AB_MAINTENANCE is set (the upgrade procedure in README.md), a caller the walk admits gets
// the maintenance message with 403 on the two routes that start work: a new session, and a message
// or a checkpoint answer to an existing one. Health, info, streams, cancel and reset stay open, so
// running sessions can be watched and ended.

const chatCookie: AuthFn<Request> = async (request) => {
  const secret = configuredSecret();
  const cookie = secret ? cookieFromHeaders(request.headers, secret) : null;
  if (!cookie) return null;
  // Ruling 52: on the demo a session answers only the cookie that started it (apps/web/lib/gate/owner.ts).
  if (await ownedByOther(request, cookie.cookieId)) throw new ForbiddenError({ code: "not-owner", message: NOT_OWNER_MESSAGE });
  return {
    attributes: { cookieId: cookie.cookieId, address: clientAddress(request.headers, undefined) },
    authenticator: "chat-cookie",
    issuer: "agent-blueprint-chat",
    principalId: "chat-user",
    principalType: "user",
    subject: "chat-user",
  };
};

// The mocked evals' stand-in for an unattended trigger: only under eve dev with AB_EVAL_MOCK=1,
// where localDev() already admits every local caller, a bearer of "eval-trigger" is a service
// principal, so the eval can drive the unattended posture without a Vercel OIDC token.
const evalTrigger: AuthFn<Request> = (request) => {
  if (process.env.AB_EVAL_MOCK !== "1" || process.env.EVE_DEV !== "1") return null;
  if (extractBearerToken(request.headers.get("authorization")) !== "eval-trigger") return null;
  return { attributes: {}, authenticator: "eval-trigger", principalId: "eval-trigger", principalType: "service" };
};

/** The route auth walk, exported for the gate tests. */
export const walk: AuthFn<Request>[] = [chatCookie, evalTrigger, vercelOidc(), localDev()];

export const MAINTENANCE_MESSAGE =
  "This agent is being upgraded and is not starting new work right now, so try again a little later.";

/** POST /eve/v1/session and POST /eve/v1/session/:id: the routes that create a session or deliver input to one. */
function startsWork(request: Request): boolean {
  return request.method === "POST" && /\/session(?:\/[^/]+)?\/?$/.test(new URL(request.url).pathname);
}

const maintenance: AuthFn<Request> = async (request) => {
  if (!process.env.AB_MAINTENANCE?.trim() || !startsWork(request)) return null;
  for (const entry of walk) {
    if (await entry(request)) throw new ForbiddenError({ code: "maintenance", message: MAINTENANCE_MESSAGE });
  }
  return null;
};

export default eveChannel({
  auth: [maintenance, ...walk],
  uploadPolicy: "disabled",
});
