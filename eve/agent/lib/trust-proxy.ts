// AB_TRUST_PROXY: a proxy you run sits in front of this server and writes the X-Forwarded-*
// headers (Railway's edge, or nginx or Caddy on your own server). Its one meaning everywhere: take
// the last value of an X-Forwarded-* header, the one the proxy in front wrote. The web gate's
// address.ts keys its login limiter on the last x-forwarded-for hop, linear-install.ts builds the
// install callback from the last x-forwarded-host, and this module gives the MCP channel the
// address the client used.
//
// Why MCP needs it: a proxy that ends TLS forwards plain http://, and Eve's MCP check refuses an
// http:// request URL off loopback ("MCP endpoints require HTTPS except on loopback."). The built
// server (Nitro's node preset on srvx) never passes srvx's own trustProxy option, and Eve offers no
// setting for it, so the channel rebuilds the request before Eve sees it, the way srvx would:
// the scheme from X-Forwarded-Proto and the host from X-Forwarded-Host. The Host header stays as
// it came, so Eve's Host check still requires it to equal the forwarded host, and its Origin check
// compares a browser's Origin with https://<that host>. Unset, nothing is read: a server reached
// directly would otherwise take a scheme and host any caller can write.

type Env = Readonly<Record<string, string | undefined>>;

/** The last entry of a comma-separated header, trimmed; undefined when absent or empty. */
function lastValue(value: string | null): string | undefined {
  const last = value?.split(",").at(-1)?.trim();
  return last ? last : undefined;
}

/** A bare host with an optional port, as `host` of an https URL; anything else is ignored. */
function plainHost(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(`https://${value}`);
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) return undefined;
    return url.host;
  } catch {
    return undefined;
  }
}

/** The request as the client sent it to the proxy, when AB_TRUST_PROXY is set; otherwise the request itself. */
export function forwardedRequest(request: Request, env: Env = process.env): Request {
  if (!env.AB_TRUST_PROXY?.trim()) return request;
  const url = new URL(request.url);
  const proto = lastValue(request.headers.get("x-forwarded-proto"))?.toLowerCase();
  const protocol = proto === "https" || proto === "http" ? `${proto}:` : url.protocol;
  const host = plainHost(lastValue(request.headers.get("x-forwarded-host"))) ?? url.host;
  const target = new URL(`${url.pathname}${url.search}`, `${protocol}//${host}`);
  if (target.href === url.href) return request;
  const init: RequestInit & { duplex?: "half" } = { method: request.method, headers: request.headers, signal: request.signal };
  if (request.body) {
    init.body = request.body;
    init.duplex = "half";
  }
  return new Request(target, init);
}
