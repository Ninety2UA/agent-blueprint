import { clientAddress } from "./address";
import {
  COOKIE_MAX_AGE_SECONDS,
  COOKIE_NAME,
  configuredSecret,
  cookieAttributes,
  cookieFromHeaders,
  issueCookie,
  verifyCode,
} from "./code";
import { type LoginLimiter, loginLimiter } from "./limiter";
import { gatePage } from "./pages";
import { fill, gateState, type GateStateId, type GateValues } from "./states";

// The gate's request handlers, written on the Fetch API so the tests drive them without Next:
//   login    POST only; the code in the body (JSON or a form), never the query; the limiter runs
//            before the compare; the log line carries the status code and nothing from the body
//   logout   clears the cookie, so the next request meets the gate again
//   pages    the proxy's check: a page request without a valid cookie gets the 401 gate page,
//            and an /api/ request a 401 with no page; the agent's own routes check the same
//            cookie in agent/channels/eve.ts

export const AUTH_HINT_COOKIE = "eve_logged_in";

export interface GateDeps {
  readonly env?: NodeJS.ProcessEnv;
  readonly limiter?: LoginLimiter;
  readonly now?: () => number;
  /** The socket address, where the server exposes it; used when neither Vercel nor a trusted proxy names the caller. */
  readonly socket?: string;
  readonly log?: (line: string, fields: Record<string, unknown>) => void;
}

const defaultLog = (line: string, fields: Record<string, unknown>) => console.info(line, fields);

export async function handleLogin(request: Request, deps: GateDeps = {}): Promise<Response> {
  const env = deps.env ?? process.env;
  const log = deps.log ?? defaultLog;
  const demo = env.AB_DEMO === "1";
  const html = wantsHtml(request);
  const answer = (response: Response) => {
    log("[gate] login", { status: response.status });
    return response;
  };

  if (request.method !== "POST") return answer(new Response(null, { status: 405, headers: { allow: "POST" } }));
  const secret = configuredSecret(env);
  if (!secret) return answer(Response.json({ message: "This chat has no password set yet." }, { status: 409 }));
  if (!sameOrigin(request)) return answer(Response.json({ message: "The request came from another site." }, { status: 403 }));

  const limited = (deps.limiter ?? loginLimiter).take(clientAddress(request.headers, deps.socket, env));
  if (!limited.ok) {
    return answer(stateResponse("limited", { waitSeconds: limited.retryAfterSeconds }, { demo, html, headers: { "retry-after": String(limited.retryAfterSeconds) } }));
  }

  const code = await readCode(request);
  if (!verifyCode(code, secret)) return answer(stateResponse("wrong-code", {}, { demo, html, typed: code }));

  const { value } = issueCookie(secret, deps.now?.());
  const headers = new Headers({ "cache-control": "no-store" });
  headers.append("set-cookie", serializeCookie(COOKIE_NAME, value, cookieAttributes(COOKIE_MAX_AGE_SECONDS, env)));
  headers.append("set-cookie", serializeCookie(AUTH_HINT_COOKIE, "1", { ...cookieAttributes(COOKIE_MAX_AGE_SECONDS, env), httpOnly: false }));
  if (html) {
    headers.set("location", "/");
    return answer(new Response(null, { status: 303, headers }));
  }
  headers.set("content-type", "application/json");
  return answer(new Response(JSON.stringify({ ok: true }), { status: 200, headers }));
}

export function handleLogout(request: Request, deps: GateDeps = {}): Response {
  const env = deps.env ?? process.env;
  if (request.method !== "POST") return new Response(null, { status: 405, headers: { allow: "POST" } });
  if (!sameOrigin(request)) return Response.json({ message: "The request came from another site." }, { status: 403 });
  const headers = new Headers({ "content-type": "application/json", "cache-control": "no-store" });
  headers.append("set-cookie", serializeCookie(COOKIE_NAME, "", { ...cookieAttributes(0, env) }));
  headers.append("set-cookie", serializeCookie(AUTH_HINT_COOKIE, "", { ...cookieAttributes(0, env), httpOnly: false }));
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
}

/**
 * Paths the gate leaves open: the login and logout routes and the static assets the gate page needs.
 * public/gate-assets/ is the one folder of files the gate page loads (its loop, the poster, the
 * fonts); a path opens there only as plain names, so no dot segment or encoded character leads out.
 */
export function isOpenPath(pathname: string): boolean {
  return (
    pathname === "/api/password-auth/login" ||
    pathname === "/api/password-auth/logout" ||
    pathname.startsWith("/_next/static/") ||
    pathname === "/favicon.ico" ||
    pathname === "/icon.svg" ||
    GATE_ASSET_PATH.test(pathname)
  );
}

const GATE_ASSET_PATH = /^\/gate-assets\/(?:[\w-]+\/)*[\w-]+\.[a-z0-9]+$/i;

/**
 * The proxy's check for every other request: null lets it through, otherwise the 401. Local
 * development without a password stays open, as the template's starter mode does.
 */
export function gateRequest(request: Request, deps: GateDeps = {}): Response | null {
  const env = deps.env ?? process.env;
  const { pathname } = new URL(request.url);
  if (isOpenPath(pathname)) return null;
  const secret = configuredSecret(env);
  if (!secret) {
    if (env.NODE_ENV === "development" && env.VERCEL !== "1") return null;
    return new Response("This chat has no password set yet.", { status: 503, headers: { "content-type": "text/plain" } });
  }
  if (cookieFromHeaders(request.headers, secret, deps.now?.())) return null;
  if (pathname.startsWith("/api/") || pathname.startsWith("/eve/")) {
    return Response.json({ ok: false, code: "unauthorized", message: "Sign in first." }, { status: 401, headers: { "cache-control": "no-store" } });
  }
  return stateResponse("no-cookie", {}, { demo: env.AB_DEMO === "1", html: true });
}

function stateResponse(id: GateStateId, values: GateValues, options: { demo: boolean; html: boolean; typed?: string; headers?: Record<string, string> }): Response {
  const state = gateState(id);
  const status = state.status ?? 200;
  const headers = { "cache-control": "no-store", ...options.headers };
  if (options.html) {
    return new Response(gatePage(state, values, { demo: options.demo, typed: options.typed }), {
      status,
      headers: { ...headers, "content-type": "text/html; charset=utf-8" },
    });
  }
  const message = !options.demo && state.deployerMessage ? state.deployerMessage : fill(state.message, values);
  return Response.json({ state: state.id, message, action: fill(state.action.label, values) }, { status, headers });
}

async function readCode(request: Request): Promise<string> {
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const body = (await request.json().catch(() => null)) as { code?: unknown; password?: unknown } | null;
    const code = body?.code ?? body?.password;
    return typeof code === "string" ? code : "";
  }
  if (type.includes("application/x-www-form-urlencoded") || type.includes("multipart/form-data")) {
    const form = await request.formData().catch(() => null);
    const code = form?.get("code");
    return typeof code === "string" ? code : "";
  }
  return "";
}

function wantsHtml(request: Request): boolean {
  const type = request.headers.get("content-type") ?? "";
  return !type.includes("application/json") && (request.headers.get("accept") ?? "").includes("text/html");
}

/** A POST must come from this site: its Origin host equals the host it was sent to. */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host) return false;
  try {
    const url = new URL(origin);
    const proto = request.headers.get("x-forwarded-proto");
    return url.host === host && (!proto || url.protocol === `${proto}:`);
  } catch {
    return false;
  }
}

function serializeCookie(name: string, value: string, options: { httpOnly: boolean; maxAge: number; path: string; sameSite: "lax"; secure: boolean }): string {
  return [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${options.path}`,
    `Max-Age=${options.maxAge}`,
    ...(options.maxAge === 0 ? ["Expires=Thu, 01 Jan 1970 00:00:00 GMT"] : []),
    ...(options.httpOnly ? ["HttpOnly"] : []),
    ...(options.secure ? ["Secure"] : []),
    "SameSite=Lax",
  ].join("; ");
}
