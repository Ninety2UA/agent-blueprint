// The Linear channel's token (KTD5, KTD13), with no Linear and no Eve server: the fixed scope, one
// mint for concurrent callers, the renewal a day before expiry, the re-mint on a refused token (a 401,
// or an AUTHENTICATION_ERROR at any status, ruling 72) and its one retry, and upload links answered
// without the token.
import assert from "node:assert/strict";
import { describe, test } from "node:test";

const { createLinearToken, LINEAR_SCOPE, linearGraphqlUrl, linearTokenUrl } = await import("../agent/lib/linear-token.ts");

const ENV = { LINEAR_CLIENT_ID: "client-id", LINEAR_CLIENT_SECRET: "client-secret" };
const DAY = 24 * 60 * 60 * 1_000;
const GRAPHQL = "https://api.linear.app/graphql";
const TOKEN_URL = "https://api.linear.app/oauth/token";

interface Seen {
  readonly url: string;
  readonly body: string;
  readonly authorization: string | null;
}

/** A fake fetch: each mint answers token-1, token-2 and so on; GraphQL answers with the queued statuses, then 200. */
function fakeLinear(options: { graphqlStatuses?: number[]; expiresIn?: number; mintDelayMs?: number } = {}) {
  const seen: Seen[] = [];
  const statuses = [...(options.graphqlStatuses ?? [])];
  let mints = 0;
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const headers = new Headers(init?.headers);
    seen.push({ url, body: String(init?.body ?? ""), authorization: headers.get("authorization") });
    if (url === TOKEN_URL) {
      mints += 1;
      const token = `token-${mints}`;
      if (options.mintDelayMs) await new Promise((resolve) => setTimeout(resolve, options.mintDelayMs));
      return Response.json({ access_token: token, token_type: "Bearer", expires_in: options.expiresIn ?? 30 * 24 * 60 * 60, scope: LINEAR_SCOPE });
    }
    const status = statuses.shift() ?? 200;
    return new Response(JSON.stringify(status === 200 ? { data: { ok: true } } : { errors: [{ message: "unauthorized" }] }), { status });
  };
  return { fetch, seen, mints: () => mints };
}

const graphqlCall = (token: { fetch: typeof globalThis.fetch }, bearer: string) =>
  token.fetch(GRAPHQL, { method: "POST", headers: { authorization: `Bearer ${bearer}`, "content-type": "application/json" }, body: "{}" });

describe("minting", () => {
  test("the mint posts client credentials with the one fixed scope", async () => {
    const linear = fakeLinear();
    const token = createLinearToken({ env: ENV, fetch: linear.fetch });
    assert.equal(await token.get(), "token-1");
    const form = new URLSearchParams(linear.seen[0].body);
    assert.equal(linear.seen[0].url, TOKEN_URL);
    assert.deepEqual(Object.fromEntries(form), { grant_type: "client_credentials", client_id: "client-id", client_secret: "client-secret", scope: LINEAR_SCOPE });
    assert.equal(LINEAR_SCOPE, "read,write,app:assignable,app:mentionable");
  });

  test("two concurrent requests make one mint and get the same token", async () => {
    const linear = fakeLinear({ mintDelayMs: 20 });
    const token = createLinearToken({ env: ENV, fetch: linear.fetch });
    const [a, b] = await Promise.all([token.get(), token.get()]);
    assert.deepEqual([a, b, linear.mints()], ["token-1", "token-1", 1]);
  });

  test("the token is reused until a day before it expires, then minted again", async () => {
    const linear = fakeLinear({ expiresIn: 30 * 24 * 60 * 60 });
    let now = 1_000_000;
    const token = createLinearToken({ env: ENV, fetch: linear.fetch, now: () => now });
    assert.equal(await token.get(), "token-1");
    now += 29 * DAY - 1;
    assert.equal(await token.get(), "token-1");
    now += 1;
    assert.equal(await token.get(), "token-2");
    assert.equal(linear.mints(), 2);
  });

  test("a missing client id or secret, or a refused mint, fails the call without naming a secret", async () => {
    await assert.rejects(createLinearToken({ env: { LINEAR_CLIENT_ID: "client-id" }, fetch: fakeLinear().fetch }).get(), /LINEAR_CLIENT_ID and LINEAR_CLIENT_SECRET/);
    const refused: typeof globalThis.fetch = async () => new Response("no", { status: 401 });
    await assert.rejects(createLinearToken({ env: ENV, fetch: refused }).get(), (error: Error) => /HTTP 401/.test(error.message) && !error.message.includes("client-secret"));
  });

  test("under AB_EVAL_MOCK=1 both endpoints point at the stub on 47822", () => {
    assert.equal(linearTokenUrl({ AB_EVAL_MOCK: "1" }), "http://127.0.0.1:47822/oauth/token");
    assert.equal(linearGraphqlUrl({ AB_EVAL_MOCK: "1" }), "http://127.0.0.1:47822/graphql");
    assert.equal(linearTokenUrl({}), TOKEN_URL);
    assert.equal(linearGraphqlUrl({}), GRAPHQL);
  });
});

describe("the fetch wrapper Eve calls", () => {
  test("a GraphQL 401 drops the cached token, mints and retries once with the new one", async () => {
    const linear = fakeLinear({ graphqlStatuses: [401] });
    const token = createLinearToken({ env: ENV, fetch: linear.fetch });
    const first = await token.get();
    const response = await graphqlCall(token, first);
    assert.equal(response.status, 200);
    const graphql = linear.seen.filter((call) => call.url === GRAPHQL);
    assert.deepEqual(graphql.map((call) => call.authorization), ["Bearer token-1", "Bearer token-2"]);
    assert.equal(await token.get(), "token-2");
  });

  test("a second 401 is returned to Eve, which fails the call; no third attempt", async () => {
    const linear = fakeLinear({ graphqlStatuses: [401, 401] });
    const token = createLinearToken({ env: ENV, fetch: linear.fetch });
    const response = await graphqlCall(token, await token.get());
    assert.equal(response.status, 401);
    assert.equal(linear.seen.filter((call) => call.url === GRAPHQL).length, 2);
    assert.equal(linear.mints(), 2);
  });

  test("a 401 from anywhere but the GraphQL endpoint is passed through without a re-mint", async () => {
    const linear = fakeLinear();
    const elsewhere: typeof globalThis.fetch = async (input, init) =>
      String(input).startsWith("https://example.com") ? new Response(null, { status: 401 }) : linear.fetch(input, init);
    const token = createLinearToken({ env: ENV, fetch: elsewhere });
    await token.get();
    assert.equal((await token.fetch("https://example.com/x", { headers: { authorization: "Bearer token-1" } })).status, 401);
    assert.equal(linear.mints(), 1);
  });

  // Ruling 72: a token Linear refuses with something other than a 401 still gets one re-mint.
  const authError = { errors: [{ message: "Authentication required, not authenticated", extensions: { type: "authentication error", code: "AUTHENTICATION_ERROR" } }] };
  for (const status of [400, 403, 200]) {
    test(`a GraphQL ${status} whose errors say AUTHENTICATION_ERROR drops the token, mints and retries once`, async () => {
      const linear = fakeLinear();
      let refusals = 1;
      const fetch: typeof globalThis.fetch = async (input, init) => {
        if (String(input) === GRAPHQL && refusals > 0) {
          refusals -= 1;
          await linear.fetch(input, init);
          return Response.json(authError, { status });
        }
        return linear.fetch(input, init);
      };
      const token = createLinearToken({ env: ENV, fetch });
      const response = await graphqlCall(token, await token.get());
      assert.equal(response.status, 200);
      assert.deepEqual(linear.seen.filter((call) => call.url === GRAPHQL).map((call) => call.authorization), ["Bearer token-1", "Bearer token-2"]);
    });
  }

  test("a GraphQL error that is not about the token is returned as it is, with no re-mint", async () => {
    const linear = fakeLinear();
    const fetch: typeof globalThis.fetch = async (input, init) =>
      String(input) === GRAPHQL
        ? (await linear.fetch(input, init), Response.json({ errors: [{ message: "Entity not found", extensions: { code: "INVALID_INPUT" } }] }, { status: 400 }))
        : linear.fetch(input, init);
    const token = createLinearToken({ env: ENV, fetch });
    const response = await graphqlCall(token, await token.get());
    assert.equal(response.status, 400);
    assert.equal(linear.mints(), 1);
    assert.equal(linear.seen.filter((call) => call.url === GRAPHQL).length, 1);
  });

  test("an uploads.linear.app link is answered with 403 and never reaches the network or the token", async () => {
    const linear = fakeLinear();
    const token = createLinearToken({ env: ENV, fetch: linear.fetch });
    const response = await token.fetch("https://uploads.linear.app/org/file/shot.png", { headers: { authorization: "Bearer token-1" } });
    assert.equal(response.status, 403);
    assert.equal(linear.seen.length, 0);
  });
});
