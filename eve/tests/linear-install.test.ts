// The Linear app's install exchange (ruling 73), with no Linear: the exact form it posts, a success
// that discards Linear's token, Linear's error passed through, and the missing variables; then the
// agent's own install callback (ruling 74).
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
const { exchangeLinearInstallCode, handleLinearInstall, LINEAR_INSTALL_ROUTE, linearCallbackUrl } = await import("../agent/lib/linear-install.ts");

const ENV = { LINEAR_CLIENT_ID: "client-id", LINEAR_CLIENT_SECRET: "client-secret" };
const TOKEN_URL = "https://api.linear.app/oauth/token";
const REDIRECT = "https://agent.example.test";
const TOKEN = "lin_oauth_never-returned";

function fakeLinear(answer: () => Response) {
  const seen: { url: string; body: string; type: string | null }[] = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    seen.push({ url: String(input), body: String(init?.body ?? ""), type: new Headers(init?.headers).get("content-type") });
    return answer();
  };
  return { fetch, seen };
}

describe("the install exchange", () => {
  test("posts the code with the client credentials and the exact redirect_uri, form encoded", async () => {
    const linear = fakeLinear(() => Response.json({ access_token: TOKEN, token_type: "Bearer" }));
    await exchangeLinearInstallCode({ code: "the-code", redirectUri: REDIRECT, env: ENV, fetch: linear.fetch });
    assert.equal(linear.seen.length, 1);
    assert.equal(linear.seen[0].url, TOKEN_URL);
    assert.equal(linear.seen[0].type, "application/x-www-form-urlencoded");
    assert.deepEqual(Object.fromEntries(new URLSearchParams(linear.seen[0].body)), {
      grant_type: "authorization_code",
      code: "the-code",
      redirect_uri: REDIRECT,
      client_id: "client-id",
      client_secret: "client-secret",
    });
  });

  test("a success reports installed and never returns the token Linear sent", async () => {
    const linear = fakeLinear(() => Response.json({ access_token: TOKEN, token_type: "Bearer", expires_in: 315_705_599 }));
    const result = await exchangeLinearInstallCode({ code: "the-code", redirectUri: REDIRECT, env: ENV, fetch: linear.fetch });
    assert.deepEqual(result, { kind: "installed" });
    assert.ok(!JSON.stringify(result).includes(TOKEN));
  });

  test("Linear's error and error_description pass through", async () => {
    const linear = fakeLinear(() => Response.json({ error: "invalid_grant", error_description: "The authorization code has expired" }, { status: 400 }));
    const result = await exchangeLinearInstallCode({ code: "old-code", redirectUri: REDIRECT, env: ENV, fetch: linear.fetch });
    assert.deepEqual(result, { kind: "failed", status: 400, error: "invalid_grant", description: "The authorization code has expired" });
  });

  test("a body that is not JSON, or a network failure, still fails without a secret", async () => {
    const html = await exchangeLinearInstallCode({ code: "c", redirectUri: REDIRECT, env: ENV, fetch: fakeLinear(() => new Response("<html>", { status: 502 })).fetch });
    assert.deepEqual(html, { kind: "failed", status: 502, error: "HTTP 502", description: null });
    const down: typeof globalThis.fetch = async () => {
      throw new TypeError("fetch failed");
    };
    const unreachable = await exchangeLinearInstallCode({ code: "c", redirectUri: REDIRECT, env: ENV, fetch: down });
    assert.equal(unreachable.kind, "failed");
    assert.ok(!JSON.stringify(unreachable).includes("client-secret"));
  });

  test("a missing client id or secret reports not configured and calls nothing", async () => {
    for (const env of [{}, { LINEAR_CLIENT_ID: "client-id" }, { LINEAR_CLIENT_SECRET: "client-secret" }, { LINEAR_CLIENT_ID: " ", LINEAR_CLIENT_SECRET: "client-secret" }]) {
      const linear = fakeLinear(() => Response.json({ access_token: TOKEN }));
      assert.deepEqual(await exchangeLinearInstallCode({ code: "c", redirectUri: REDIRECT, env, fetch: linear.fetch }), { kind: "unconfigured" });
      assert.equal(linear.seen.length, 0);
    }
  });

  test("under AB_EVAL_MOCK=1 the exchange goes to the stub on 47822", async () => {
    const linear = fakeLinear(() => Response.json({ access_token: TOKEN }));
    await exchangeLinearInstallCode({ code: "c", redirectUri: REDIRECT, env: { ...ENV, AB_EVAL_MOCK: "1" }, fetch: linear.fetch });
    assert.equal(linear.seen[0].url, "http://127.0.0.1:47822/oauth/token");
  });
});

// The agent's own callback (ruling 74), for Railway and your own server: GET /eve/v1/linear/install
// on the Fetch API, with no Eve server.
describe("the agent's install callback", () => {
  const CALLBACK = `${REDIRECT}${LINEAR_INSTALL_ROUTE}`;
  const callback = (query: string) => new Request(`${CALLBACK}${query}`, { headers: { accept: "text/html", host: "agent.example.test" } });

  test("the Linear channel mounts it as a GET beside the webhook route, which stays a signed POST", async () => {
    const { default: channel } = await import("../agent/channels/linear.ts");
    const routes = channel.routes.map((route) => `${route.method} ${route.path}`);
    assert.deepEqual(routes, ["POST /eve/v1/linear", "GET /eve/v1/linear/install"]);
    const args = {} as Parameters<(typeof channel.routes)[number]["handler"]>[1];
    const install = channel.routes.find((route) => route.method === "GET");
    const cancelled = await install!.handler(callback("?error=access_denied&state=install"), args);
    assert.equal(cancelled.status, 400, "no Linear signature asked of the browser");
    assert.match(await (cancelled as Response).text(), /Nothing was installed/);
    const webhook = channel.routes.find((route) => route.method === "POST");
    const previous = process.env.LINEAR_WEBHOOK_SECRET;
    process.env.LINEAR_WEBHOOK_SECRET = "webhook-secret";
    try {
      const unsigned = await webhook!.handler(new Request(`${REDIRECT}/eve/v1/linear`, { method: "POST", body: "{}" }), args);
      assert.equal(unsigned.status, 401);
    } finally {
      if (previous === undefined) delete process.env.LINEAR_WEBHOOK_SECRET;
      else process.env.LINEAR_WEBHOOK_SECRET = previous;
    }
  });

  test("an accepted code answers the installed page with the agent's callback as redirect_uri, and the token appears nowhere", async () => {
    const linear = fakeLinear(() => Response.json({ access_token: TOKEN, token_type: "Bearer" }));
    const logged: unknown[] = [];
    const response = await handleLinearInstall(callback("?code=the-code&state=install"), LINEAR_INSTALL_ROUTE, { env: ENV, fetch: linear.fetch, log: (_line, fields) => logged.push(fields) });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const html = await response.text();
    assert.match(html, /Agent Blueprint is installed in your Linear workspace\. You can close this page\./);
    const form = new URLSearchParams(linear.seen[0].body);
    assert.equal(form.get("code"), "the-code");
    assert.equal(form.get("redirect_uri"), "https://agent.example.test/eve/v1/linear/install");
    for (const secret of [TOKEN, "client-secret"]) assert.ok(!html.includes(secret), secret);
    assert.deepEqual(logged, []);
  });

  test("Linear's refusal is named on the page and logged once, without a secret", async () => {
    const linear = fakeLinear(() => Response.json({ error: "invalid_grant", error_description: "Invalid <redirect_uri>" }, { status: 400 }));
    const logged: [string, Record<string, unknown>][] = [];
    const response = await handleLinearInstall(callback("?code=the-code&state=install"), LINEAR_INSTALL_ROUTE, { env: ENV, fetch: linear.fetch, log: (line, fields) => logged.push([line, fields]) });
    assert.equal(response.status, 400);
    const html = await response.text();
    assert.match(html, /Linear did not complete the install: Invalid &lt;redirect_uri&gt;\. Open the authorize address again to retry\./);
    assert.ok(!html.includes("client-secret"));
    assert.deepEqual(logged, [["[linear] install failed", { error: "invalid_grant", description: "Invalid <redirect_uri>" }]]);
    const down = await handleLinearInstall(callback("?code=the-code&state=install"), LINEAR_INSTALL_ROUTE, { env: ENV, fetch: fakeLinear(() => new Response("", { status: 503 })).fetch, log: () => {} });
    assert.equal(down.status, 502);
  });

  test("a cancelled consent says nothing was installed and how to start again, repeats no text from the address and exchanges nothing", async () => {
    const linear = fakeLinear(() => Response.json({ access_token: TOKEN }));
    const logged: unknown[] = [];
    const response = await handleLinearInstall(callback("?error=access_denied&error_description=The+user+%3Cdenied%3E+access&state=install"), LINEAR_INSTALL_ROUTE, {
      env: ENV,
      fetch: linear.fetch,
      log: (_line, fields) => logged.push(fields),
    });
    assert.equal(response.status, 400);
    const html = await response.text();
    assert.match(html, /Nothing was installed, because the consent on Linear was cancelled\. To install/);
    assert.match(html, /To install Agent Blueprint, open the authorize address again and approve\./);
    assert.doesNotMatch(html, /denied/);
    assert.deepEqual(logged, []);
    const bare = await (await handleLinearInstall(callback("?error=access_denied&state=install"), LINEAR_INSTALL_ROUTE, { env: ENV, fetch: linear.fetch })).text();
    assert.match(bare, /the consent on Linear was cancelled\. To install Agent Blueprint/);
    const withCode = await handleLinearInstall(callback("?error=access_denied&code=the-code&state=install"), LINEAR_INSTALL_ROUTE, { env: ENV, fetch: linear.fetch });
    assert.equal(withCode.status, 400, "an error wins over a code");
    assert.equal(linear.seen.length, 0);
  });

  test("the demo answers that Linear is not used on this copy and exchanges nothing, cancelled or not", async () => {
    const linear = fakeLinear(() => Response.json({ access_token: TOKEN }));
    for (const query of ["?code=the-code&state=install", "?error=access_denied&state=install"]) {
      const response = await handleLinearInstall(callback(query), LINEAR_INSTALL_ROUTE, { env: { ...ENV, AB_DEMO: "1" }, fetch: linear.fetch });
      assert.equal(response.status, 404);
      assert.match(await response.text(), /Linear is not used on this copy/);
    }
    assert.equal(linear.seen.length, 0);
  });

  test("missing Linear variables answer that they are missing and exchange nothing; no code answers how to start again", async () => {
    const linear = fakeLinear(() => Response.json({ access_token: TOKEN }));
    const response = await handleLinearInstall(callback("?code=the-code&state=install"), LINEAR_INSTALL_ROUTE, { env: {}, fetch: linear.fetch });
    assert.equal(response.status, 503);
    assert.match(await response.text(), /LINEAR_CLIENT_ID and LINEAR_CLIENT_SECRET are missing/);
    const empty = await handleLinearInstall(callback(""), LINEAR_INSTALL_ROUTE, { env: ENV, fetch: linear.fetch });
    assert.equal(empty.status, 400);
    assert.match(await empty.text(), /carries no install code from Linear/);
    assert.equal(linear.seen.length, 0);
  });

  test("redirect_uri is https://, the host the browser asked for and the callback's path: the forwarded host on Vercel or behind a trusted proxy, else Host", () => {
    const headers = new Headers({ host: "internal:3000", "x-forwarded-host": "agent.up.railway.app" });
    assert.equal(linearCallbackUrl(headers, LINEAR_INSTALL_ROUTE, { VERCEL: "1" }), "https://agent.up.railway.app/eve/v1/linear/install");
    assert.equal(linearCallbackUrl(headers, LINEAR_INSTALL_ROUTE, { AB_TRUST_PROXY: "1" }), "https://agent.up.railway.app/eve/v1/linear/install");
    assert.equal(
      linearCallbackUrl(new Headers({ host: "internal:3000", "x-forwarded-host": "spoofed.test, agent.example.test" }), LINEAR_INSTALL_ROUTE, { AB_TRUST_PROXY: "1" }),
      "https://agent.example.test/eve/v1/linear/install",
    );
    assert.equal(linearCallbackUrl(headers, LINEAR_INSTALL_ROUTE, {}), "https://internal:3000/eve/v1/linear/install", "without either, a forwarded host is not trusted");
    assert.equal(linearCallbackUrl(new Headers({ host: "agent.example.test" }), "", {}), "https://agent.example.test");
    assert.equal(linearCallbackUrl(new Headers(), LINEAR_INSTALL_ROUTE, {}), null);
  });
});
