// The Linear app's install (ruling 73): when a workspace admin approves the authorize link
// (actor=app), Linear sends the browser back to the app's callback with a code, and the install is
// complete only once that code is exchanged (checked live on 2026-11-02: an approval whose code
// nobody exchanged left the app uninstalled). exchangeLinearInstallCode() posts the code with the
// app's client credentials and the exact redirect_uri the authorize link named, form encoded as
// the mint in linear-token.ts is, and reports only whether Linear accepted it. The access token
// Linear returns is discarded: never returned, logged or stored, since the agent keeps minting its
// own client-credentials tokens (linear-token.ts). Under AB_EVAL_MOCK=1 the exchange goes to the
// stub on 47822, as the mint does.
//
// Two callbacks answer the browser, both through handleLinearInstall() and the same page (ruling
// 74): on Vercel the web chat's proxy rewrites `/` to its install route (apps/web/lib/linear-install.ts),
// with the callback https://<deployment>; on Railway or your own server, where nothing answers at
// `/`, the Linear channel's GET route at LINEAR_INSTALL_ROUTE (channels/linear.ts), with the
// callback https://<deployment>/eve/v1/linear/install. The redirect_uri is https:// and the host
// the browser asked for (the forwarded host on Vercel or behind a proxy AB_TRUST_PROXY names, as
// the web gate's address.ts trusts its addresses) plus that callback's path. A cancelled consent
// comes back with `error` and no code, and gets a fixed page saying nothing was installed; the
// page never repeats text from the address, so a crafted link cannot put its own words on it. The demo
// (AB_DEMO=1) uses no Linear and exchanges nothing. Neither callback checks Linear's webhook
// signature: it is the admin's browser, not a webhook. No token or secret reaches the page or the
// log; a failed exchange logs Linear's error and description.

import { linearTokenUrl } from "./linear-token";

type Env = Readonly<Record<string, string | undefined>>;
type Fetch = typeof fetch;

export type LinearInstallResult =
  | { readonly kind: "installed" }
  | { readonly kind: "unconfigured" }
  | { readonly kind: "failed"; readonly status: number | null; readonly error: string; readonly description: string | null };

export interface LinearInstallOptions {
  readonly code: string;
  /** The callback URL exactly as the authorize link named it, for example https://<deployment>. */
  readonly redirectUri: string;
  readonly env?: Env;
  readonly fetch?: Fetch;
}

export async function exchangeLinearInstallCode({ code, redirectUri, env = process.env, fetch: send = (input, init) => globalThis.fetch(input, init) }: LinearInstallOptions): Promise<LinearInstallResult> {
  const clientId = env.LINEAR_CLIENT_ID?.trim();
  const clientSecret = env.LINEAR_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return { kind: "unconfigured" };
  let response: Response;
  try {
    response = await send(linearTokenUrl(env), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri, client_id: clientId, client_secret: clientSecret }).toString(),
    });
  } catch (error) {
    return { kind: "failed", status: null, error: "unreachable", description: error instanceof Error ? error.message : null };
  }
  const body = (await response.json().catch(() => null)) as { access_token?: unknown; error?: unknown; error_description?: unknown } | null;
  if (response.ok && typeof body?.access_token === "string" && body.access_token) return { kind: "installed" };
  return {
    kind: "failed",
    status: response.status,
    error: typeof body?.error === "string" ? body.error : `HTTP ${response.status}`,
    description: typeof body?.error_description === "string" ? body.error_description : null,
  };
}

/** The agent's own install callback, for hosts without the web chat (Railway, your own server). */
export const LINEAR_INSTALL_ROUTE = "/eve/v1/linear/install";

export interface LinearInstallDeps {
  readonly env?: Env;
  readonly fetch?: Fetch;
  readonly log?: (line: string, fields: Record<string, unknown>) => void;
}

/** The redirect_uri the authorize link named: https://, the host the browser asked for, and the callback's path. */
export function linearCallbackUrl(headers: Headers, path: string, env: Env = process.env): string | null {
  let host: string | null | undefined;
  if (env.VERCEL) {
    host = headers.get("x-forwarded-host") ?? headers.get("host");
  } else if (env.AB_TRUST_PROXY?.trim()) {
    host = headers.get("x-forwarded-host")?.split(",").at(-1) ?? headers.get("host");
  } else {
    host = headers.get("host");
  }
  const trimmed = host?.trim();
  return trimmed ? `https://${trimmed}${path}` : null;
}

/** Answers the browser Linear sent back to the callback at `path`, "" for the deployment's address itself. */
export async function handleLinearInstall(request: Request, path: string, deps: LinearInstallDeps = {}): Promise<Response> {
  const env = deps.env ?? process.env;
  const log = deps.log ?? ((line: string, fields: Record<string, unknown>) => console.warn(line, fields));
  if (env.AB_DEMO === "1") return page(404, "Linear is not used on this copy of Agent Blueprint, so nothing was installed.");
  const query = new URL(request.url).searchParams;
  if (query.get("error")) {
    return page(400, "Nothing was installed, because the consent on Linear was cancelled. To install Agent Blueprint, open the authorize address again and approve.");
  }
  const code = query.get("code");
  const redirectUri = linearCallbackUrl(request.headers, path, env);
  if (!code || !redirectUri) return page(400, "This address carries no install code from Linear. Open the authorize address again.");
  const result = await exchangeLinearInstallCode({ code, redirectUri, env, fetch: deps.fetch });
  switch (result.kind) {
    case "installed":
      return page(200, "Agent Blueprint is installed in your Linear workspace. You can close this page.");
    case "unconfigured":
      return page(503, "Linear is not set up on this copy: LINEAR_CLIENT_ID and LINEAR_CLIENT_SECRET are missing. Set them, deploy again and open the authorize address again.");
    case "failed":
      log("[linear] install failed", { error: result.error, description: result.description });
      return page(
        result.status === null || result.status >= 500 ? 502 : 400,
        `Linear did not complete the install: ${result.description ?? result.error}. Open the authorize address again to retry.`,
      );
  }
}

function page(status: number, message: string): Response {
  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Agent Blueprint and Linear</title></head>
<body style="font-family: system-ui, sans-serif; max-width: 36rem; margin: 4rem auto; padding: 0 1rem; line-height: 1.5"><p>${escape(message)}</p></body>
</html>
`;
  return new Response(html, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer" } });
}

function escape(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
