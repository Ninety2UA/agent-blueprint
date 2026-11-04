import { handleLinearInstall as answerLinearInstall, linearCallbackUrl, type LinearInstallDeps } from "../../../agent/lib/linear-install";

// The Linear app's callback on Vercel (rulings 73 and 74). The app's registered redirect URI is
// the deployment's address itself, so Linear sends the admin's browser to `/?code=...&state=install`
// after an approval, or to `/?error=...&state=install` after a cancelled consent. The proxy
// rewrites exactly those requests, a GET to `/` with state=install and a code or an error, to the
// install route before the gate runs; the route itself stays behind the gate, so only the rewrite
// passes without a session cookie. The route answers through agent/lib/linear-install.ts, the same
// handler and page as the agent's own callback, with the redirect_uri https:// and the host the
// browser asked for.

export const LINEAR_INSTALL_PATH = "/api/linear-install";

export type { LinearInstallDeps };

type Env = Readonly<Record<string, string | undefined>>;

/** Whether the request is Linear sending the browser back after an install: GET / with state=install and a code or an error. */
export function isLinearInstallCallback(request: Request): boolean {
  if (request.method !== "GET") return false;
  const url = new URL(request.url);
  const query = url.searchParams;
  return url.pathname === "/" && query.get("state") === "install" && Boolean(query.get("code") || query.get("error"));
}

/** The redirect_uri the authorize link named: https:// and the host the browser asked for. */
export function callbackUrl(headers: Headers, env: Env = process.env): string | null {
  return linearCallbackUrl(headers, "", env);
}

export function handleLinearInstall(request: Request, deps: LinearInstallDeps = {}): Promise<Response> {
  return answerLinearInstall(request, "", deps);
}
