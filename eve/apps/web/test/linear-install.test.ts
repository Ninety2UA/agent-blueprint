// The Linear install callback (rulings 73 and 74) on the Fetch API: the proxy rewrites GET / with
// state=install and a code, or an error after a cancelled consent, to the install route before the
// gate, every other request to / still meets the gate, and the route answers its page from the
// exchange, with no token in the page or the log. No Next server.
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { describe, test } from "node:test";

// The app's modules import each other without extensions and through the @/ alias, as the bundlers
// want, and next/server without its .js; Node needs them spelled out.
const webRoot = new URL("../", import.meta.url).href;
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "next/server") return next("next/server.js", context);
    if (specifier.startsWith("@/")) specifier = new URL(specifier.slice(2), webRoot).href;
    try {
      return next(specifier, context);
    } catch (error) {
      if (specifier.startsWith(".") || specifier.startsWith("file:")) return next(`${specifier}.ts`, context);
      throw error;
    }
  },
});
const { NextRequest } = await import("next/server");
const { proxy } = await import("../proxy.ts");
const { callbackUrl, handleLinearInstall, isLinearInstallCallback } = await import("../lib/linear-install.ts");

const ORIGIN = "https://agent.example.test";
const CODE = "k3Jv9QpX2rTz8LmW5nB7cD1f";
const ENV = { NODE_ENV: "production", EVE_CHAT_PASSWORD: CODE, LINEAR_CLIENT_ID: "client-id", LINEAR_CLIENT_SECRET: "client-secret" };
const TOKEN = "lin_oauth_never-shown";

function install(query = "?code=the-code&state=install", headers: Record<string, string> = {}) {
  return new Request(`${ORIGIN}/${query}`, { headers: { accept: "text/html", host: "agent.example.test", ...headers } });
}

function fakeLinear(answer: () => Response) {
  const seen: URLSearchParams[] = [];
  const fetch: typeof globalThis.fetch = async (_input, init) => {
    seen.push(new URLSearchParams(String(init?.body ?? "")));
    return answer();
  };
  return { fetch, seen };
}

describe("the proxy and the Linear callback", () => {
  test("GET / with a code and state=install is rewritten to the install route without a session cookie", () => {
    const previous = process.env.EVE_CHAT_PASSWORD;
    process.env.EVE_CHAT_PASSWORD = CODE;
    try {
      const response = proxy(new NextRequest(`${ORIGIN}/?code=the-code&state=install`));
      assert.equal(response.headers.get("x-middleware-rewrite"), `${ORIGIN}/api/linear-install?code=the-code&state=install`);
      assert.notEqual(response.status, 401);
    } finally {
      if (previous === undefined) delete process.env.EVE_CHAT_PASSWORD;
      else process.env.EVE_CHAT_PASSWORD = previous;
    }
  });

  test("GET / with an error and state=install, a cancelled consent, is rewritten to the install route too", () => {
    const previous = process.env.EVE_CHAT_PASSWORD;
    process.env.EVE_CHAT_PASSWORD = CODE;
    try {
      const query = "?error=access_denied&error_description=The+user+denied+access&state=install";
      const response = proxy(new NextRequest(`${ORIGIN}/${query}`, { headers: { accept: "text/html" } }));
      assert.equal(response.headers.get("x-middleware-rewrite"), `${ORIGIN}/api/linear-install${query}`);
      assert.notEqual(response.status, 401);
    } finally {
      if (previous === undefined) delete process.env.EVE_CHAT_PASSWORD;
      else process.env.EVE_CHAT_PASSWORD = previous;
    }
  });

  test("/ without them, another state, another path or another method still meets the gate", () => {
    for (const [url, method] of [
      [`${ORIGIN}/`, "GET"],
      [`${ORIGIN}/?code=the-code`, "GET"],
      [`${ORIGIN}/?code=the-code&state=other`, "GET"],
      [`${ORIGIN}/?state=install`, "GET"],
      [`${ORIGIN}/?error=access_denied`, "GET"],
      [`${ORIGIN}/?error=access_denied&state=other`, "GET"],
      [`${ORIGIN}/?error=&state=install`, "GET"],
      [`${ORIGIN}/chat/abc?code=the-code&state=install`, "GET"],
      [`${ORIGIN}/chat/abc?error=access_denied&state=install`, "GET"],
      [`${ORIGIN}/?code=the-code&state=install`, "POST"],
      [`${ORIGIN}/?error=access_denied&state=install`, "POST"],
    ]) {
      assert.equal(isLinearInstallCallback(new Request(url, { method })), false, `${method} ${url}`);
    }
    const previous = process.env.EVE_CHAT_PASSWORD;
    process.env.EVE_CHAT_PASSWORD = CODE;
    try {
      const gated = proxy(new NextRequest(`${ORIGIN}/`, { headers: { accept: "text/html" } }));
      assert.equal(gated.status, 401);
      assert.equal(gated.headers.get("x-middleware-rewrite"), null);
      const direct = proxy(new NextRequest(`${ORIGIN}/api/linear-install?code=the-code&state=install`));
      assert.equal(direct.status, 401, "the route itself stays behind the gate");
      const directCancel = proxy(new NextRequest(`${ORIGIN}/api/linear-install?error=access_denied&state=install`));
      assert.equal(directCancel.status, 401, "a cancel sent straight to the route meets the gate too");
    } finally {
      if (previous === undefined) delete process.env.EVE_CHAT_PASSWORD;
      else process.env.EVE_CHAT_PASSWORD = previous;
    }
  });
});

describe("the install route", () => {
  test("a code Linear accepts answers the installed page, and the token appears nowhere", async () => {
    const linear = fakeLinear(() => Response.json({ access_token: TOKEN, token_type: "Bearer" }));
    const logged: unknown[] = [];
    const response = await handleLinearInstall(install(), { env: ENV, fetch: linear.fetch, log: (_line, fields) => logged.push(fields) });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const html = await response.text();
    assert.match(html, /Agent Blueprint is installed in your Linear workspace\. You can close this page\./);
    assert.equal(linear.seen[0].get("code"), "the-code");
    assert.equal(linear.seen[0].get("redirect_uri"), ORIGIN);
    for (const secret of [TOKEN, "client-secret"]) assert.ok(!html.includes(secret), secret);
    assert.deepEqual(logged, []);
  });

  test("a refused code names Linear's description, says to open the authorize address again and logs one warning", async () => {
    const linear = fakeLinear(() => Response.json({ error: "invalid_grant", error_description: "Invalid <redirect_uri>" }, { status: 400 }));
    const logged: [string, Record<string, unknown>][] = [];
    const response = await handleLinearInstall(install(), { env: ENV, fetch: linear.fetch, log: (line, fields) => logged.push([line, fields]) });
    assert.equal(response.status, 400);
    const html = await response.text();
    assert.match(html, /Invalid &lt;redirect_uri&gt;/);
    assert.match(html, /Open the authorize address again/);
    assert.ok(!html.includes("client-secret"));
    assert.deepEqual(logged, [["[linear] install failed", { error: "invalid_grant", description: "Invalid <redirect_uri>" }]]);
  });

  test("a cancelled consent says nothing was installed, names Linear's description, says how to start again and exchanges nothing", async () => {
    const linear = fakeLinear(() => Response.json({ access_token: TOKEN }));
    const response = await handleLinearInstall(install("?error=access_denied&error_description=The+user+denied+access&state=install"), { env: ENV, fetch: linear.fetch });
    assert.equal(response.status, 400);
    const html = await response.text();
    assert.match(html, /Nothing was installed, because the consent on Linear was cancelled\. To install/);
    assert.match(html, /To install Agent Blueprint, open the authorize address again and approve\./);
    assert.equal(linear.seen.length, 0);
  });

  test("missing Linear variables answer that they are missing and exchange nothing", async () => {
    const linear = fakeLinear(() => Response.json({ access_token: TOKEN }));
    const response = await handleLinearInstall(install(), { env: { NODE_ENV: "production" }, fetch: linear.fetch });
    assert.equal(response.status, 503);
    assert.match(await response.text(), /LINEAR_CLIENT_ID and LINEAR_CLIENT_SECRET are missing/);
    assert.equal(linear.seen.length, 0);
  });

  test("the demo answers that Linear is not used on this copy and exchanges nothing", async () => {
    const linear = fakeLinear(() => Response.json({ access_token: TOKEN }));
    const response = await handleLinearInstall(install(), { env: { ...ENV, AB_DEMO: "1" }, fetch: linear.fetch });
    assert.equal(response.status, 404);
    assert.match(await response.text(), /Linear is not used on this copy/);
    assert.equal(linear.seen.length, 0);
  });

  test("redirect_uri is https:// and the host the browser asked for: the forwarded host on Vercel or behind a trusted proxy, else Host", () => {
    const headers = new Headers({ host: "internal:3000", "x-forwarded-host": "agent-blueprint-channels.vercel.app" });
    assert.equal(callbackUrl(headers, { VERCEL: "1" }), "https://agent-blueprint-channels.vercel.app");
    assert.equal(callbackUrl(new Headers({ host: "agent.example.test", "x-forwarded-host": "spoofed.test, agent.example.test" }), { AB_TRUST_PROXY: "1" }), "https://agent.example.test");
    assert.equal(callbackUrl(headers, {}), "https://internal:3000");
    assert.equal(callbackUrl(new Headers(), {}), null);
  });
});
