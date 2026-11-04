// The MCP channel behind a proxy that ends TLS (Railway's edge, nginx): the request reaches the
// server as http:// with X-Forwarded-Proto and X-Forwarded-Host, and Eve's check refuses http://
// off loopback. With AB_TRUST_PROXY set the channel reads the forwarded scheme and host first; Eve's
// own Host and Origin checks then run against them. Each request goes through the channel's real
// route handler, Eve's validation included, with no server.
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { describe, test } from "node:test";

// The agent's modules import each other without extensions, as Eve's bundler wants; Node needs them.
registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (error) {
      if (specifier.startsWith(".")) return next(`${specifier}.ts`, context);
      throw error;
    }
  },
});
const mcp = await import("../agent/channels/mcp.ts");
const { forwardedRequest } = await import("../agent/lib/trust-proxy.ts");

const TOKEN = "a".repeat(64);
const HOST = "agent-production-8d67.up.railway.app";
const HTTPS_REFUSAL = "MCP endpoints require HTTPS except on loopback.";
const initialize = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "check", version: "0" } } };

type Env = Record<string, string>;

/** What the server sees from the edge: http://, the public Host, and the forwarded headers. */
function fromEdge(headers: Record<string, string> = {}): Request {
  return new Request(`http://${HOST}/eve/v1/mcp`, {
    method: "POST",
    headers: {
      host: HOST,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "x-forwarded-proto": "https",
      "x-forwarded-host": HOST,
      ...headers,
    },
    body: JSON.stringify(initialize),
  });
}

/** Sends the request through the channel's POST route, as Eve's server would. */
async function send(env: Env, request: Request): Promise<Response> {
  const channel = mcp.mcpChannelFor({ env });
  const route = channel.routes.find((r) => r.transport !== "websocket" && r.method === "POST" && r.path === "/eve/v1/mcp");
  assert.ok(route && route.transport !== "websocket", "the channel has its POST route");
  return route.handler(request, {} as never);
}

async function errorMessage(response: Response): Promise<string | undefined> {
  return ((await response.clone().json().catch(() => null)) as { error?: { message?: string } } | null)?.error?.message;
}

describe("MCP behind a proxy that ends TLS", () => {
  test("without AB_TRUST_PROXY the forwarded headers are ignored and http:// gets the 403", async () => {
    const response = await send({ AB_MCP_TOKEN: TOKEN }, fromEdge({ authorization: `Bearer ${TOKEN}` }));
    assert.equal(response.status, 403);
    assert.equal(await errorMessage(response), HTTPS_REFUSAL);
  });

  test("with AB_TRUST_PROXY=1 a request with no token passes the HTTPS check and gets 401 with the Bearer challenge", async () => {
    const response = await send({ AB_MCP_TOKEN: TOKEN, AB_TRUST_PROXY: "1" }, fromEdge());
    assert.equal(response.status, 401);
    assert.match(response.headers.get("www-authenticate") ?? "", /^Bearer/);
  });

  test("with AB_TRUST_PROXY=1 a request with the token is admitted past the HTTPS check and the auth", async () => {
    const response = await send({ AB_MCP_TOKEN: TOKEN, AB_TRUST_PROXY: "1" }, fromEdge({ authorization: `Bearer ${TOKEN}` }));
    // With no Eve server behind the route, an admitted request stops at the missing route context.
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: "MCP requires agent route context." });
  });

  test("Eve's Host check still runs: a forwarded host other than the Host header gets 403", async () => {
    const response = await send({ AB_MCP_TOKEN: TOKEN, AB_TRUST_PROXY: "1" }, fromEdge({ "x-forwarded-host": "spoofed.example" }));
    assert.equal(response.status, 403);
    assert.match((await errorMessage(response)) ?? "", /Invalid Host header/);
  });

  test("Eve's Origin check runs against the forwarded origin", async () => {
    const env = { AB_MCP_TOKEN: TOKEN, AB_TRUST_PROXY: "1" };
    const own = await send(env, fromEdge({ origin: `https://${HOST}` }));
    assert.equal(own.status, 401, "the deployment's own https origin passes");
    const other = await send(env, fromEdge({ origin: "https://evil.example" }));
    assert.equal(other.status, 403);
    assert.match((await errorMessage(other)) ?? "", /Invalid Origin/);
    const plain = await send(env, fromEdge({ origin: `http://${HOST}` }));
    assert.equal(plain.status, 403, "the http origin no longer matches");
  });

  test("with AB_TRUST_PROXY=1 but no X-Forwarded-Proto, http:// still gets the 403", async () => {
    const request = fromEdge();
    request.headers.delete("x-forwarded-proto");
    const response = await send({ AB_MCP_TOKEN: TOKEN, AB_TRUST_PROXY: "1" }, request);
    assert.equal(response.status, 403);
    assert.equal(await errorMessage(response), HTTPS_REFUSAL);
  });
});

describe("forwardedRequest", () => {
  test("unset or blank AB_TRUST_PROXY returns the same request", () => {
    const request = fromEdge();
    assert.equal(forwardedRequest(request, {}), request);
    assert.equal(forwardedRequest(request, { AB_TRUST_PROXY: "  " }), request);
  });

  test("takes the last value of each header, the one the proxy in front wrote, and keeps method, headers and body", async () => {
    const request = fromEdge({ "x-forwarded-proto": "http, https", "x-forwarded-host": `spoofed.example, ${HOST}`, authorization: `Bearer ${TOKEN}` });
    const forwarded = forwardedRequest(request, { AB_TRUST_PROXY: "1" });
    assert.equal(forwarded.url, `https://${HOST}/eve/v1/mcp`);
    assert.equal(forwarded.method, "POST");
    assert.equal(forwarded.headers.get("host"), HOST, "the Host header stays as it came, for Eve's check");
    assert.equal(forwarded.headers.get("authorization"), `Bearer ${TOKEN}`);
    assert.deepEqual(await forwarded.json(), initialize);
  });

  test("drops the internal port, keeps a forwarded one, and ignores a malformed host or an unknown scheme", () => {
    const env = { AB_TRUST_PROXY: "1" };
    const internal = new Request("http://10.0.0.5:8080/eve/v1/mcp", { headers: { "x-forwarded-proto": "https", "x-forwarded-host": HOST } });
    assert.equal(forwardedRequest(internal, env).url, `https://${HOST}/eve/v1/mcp`);
    const withPort = new Request("http://10.0.0.5:8080/eve/v1/mcp", { headers: { "x-forwarded-proto": "https", "x-forwarded-host": "agent.example:8443" } });
    assert.equal(forwardedRequest(withPort, env).url, "https://agent.example:8443/eve/v1/mcp");
    const malformed = new Request(`http://${HOST}/eve/v1/mcp`, { headers: { "x-forwarded-proto": "https", "x-forwarded-host": "user@evil.example/path" } });
    assert.equal(forwardedRequest(malformed, env).url, `https://${HOST}/eve/v1/mcp`);
    const scheme = new Request(`http://${HOST}/eve/v1/mcp`, { headers: { "x-forwarded-proto": "ftp" } });
    assert.equal(forwardedRequest(scheme, env).url, `http://${HOST}/eve/v1/mcp`);
  });
});
