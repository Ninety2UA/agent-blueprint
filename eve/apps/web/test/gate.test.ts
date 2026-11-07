// The web chat's gate (KTD11, AE5, AE6) on the Fetch API: the proxy check, the login and logout
// routes, the limiter, the cookie, the states table and the registry-backed states the chat shows.
// No Next server and no browser: the handlers take a Request and return a Response.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";

// The app's modules import each other without extensions, as the bundlers want; Node needs them.
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
const { gateRequest, handleLogin, handleLogout } = await import("../lib/gate/handlers.ts");
const { COOKIE_NAME, configuredSecret, digestCode, issueCookie, verifyCookie } = await import("../lib/gate/code.ts");
const { LoginLimiter } = await import("../lib/gate/limiter.ts");
const { canonicalAddress, clientAddress } = await import("../lib/gate/address.ts");
const { GATE_STATES, fill } = await import("../lib/gate/states.ts");
const { gatePage } = await import("../lib/gate/pages.ts");
const { gateStatus } = await import("../lib/gate/status.ts");
const { noticeMessage, runningChatHref, runningChatId } = await import("../lib/gate/running-chat.ts");
const { Registry, fileBackend } = await import("../../../agent/lib/registry.ts");

const CODE = "k3Jv9QpX2rTz8LmW5nB7cD1f"; // 24 characters, as the demo's
const ORIGIN = "https://try.example.test";
const DEMO_ENV = { NODE_ENV: "production", AB_DEMO: "1", EVE_CHAT_PASSWORD: CODE } as NodeJS.ProcessEnv;

const scratch = mkdtempSync(join(tmpdir(), "ab-gate-"));
after(() => rmSync(scratch, { recursive: true, force: true }));

function page(path: string, headers: Record<string, string> = {}) {
  return new Request(`${ORIGIN}${path}`, { headers: { accept: "text/html", ...headers } });
}

function login(code: string, headers: Record<string, string> = {}, path = "/api/password-auth/login") {
  return new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN, host: "try.example.test", ...headers },
    body: JSON.stringify({ code }),
  });
}

function cookieOf(response: Response): string | null {
  const line = response.headers.getSetCookie().find((cookie) => cookie.startsWith(`${COOKIE_NAME}=`));
  return line ? line.split(";")[0] : null;
}

describe("AE5: the gate in front of the chat", () => {
  test("an anonymous request gets the 401 gate page that says the code comes with Dominik's message, with the contact link, and no API route answers", async () => {
    const denied = gateRequest(page("/"), { env: DEMO_ENV });
    assert.ok(denied);
    assert.equal(denied.status, 401);
    const html = await denied.text();
    assert.match(html, /data-gate-state="no-cookie"/);
    assert.match(html, /the code comes in Dominik's message to you/);
    assert.match(html, /data-gate-contact/);
    assert.match(html, /<form method="post" action="\/api\/password-auth\/login"/);
    for (const path of ["/chat/abc", "/api/bootstrap", "/api/gate", "/eve/v1/session"]) {
      const response = gateRequest(page(path), { env: DEMO_ENV });
      assert.equal(response?.status, 401, path);
    }
  });

  test("a wrong code is 401 with the message inline and the field kept, and each try is counted", async () => {
    const limiter = new LoginLimiter(() => 0);
    const logged: unknown[] = [];
    const wrong = await handleLogin(login("not-the-code"), { env: DEMO_ENV, limiter, log: (_line, fields) => logged.push(fields) });
    assert.equal(wrong.status, 401);
    assert.equal(cookieOf(wrong), null);
    const body = (await wrong.json()) as { state: string; message: string };
    assert.equal(body.state, "wrong-code");
    assert.match(body.message, /does not match the one in Dominik's message/);
    const form = await handleLogin(
      new Request(`${ORIGIN}/api/password-auth/login`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", accept: "text/html", origin: ORIGIN, host: "try.example.test" },
        body: "code=typed-wrong",
      }),
      { env: DEMO_ENV, limiter, log: (_line, fields) => logged.push(fields) },
    );
    assert.equal(form.status, 401);
    const html = await form.text();
    assert.match(html, /value="typed-wrong"/, "the field keeps what was typed");
    assert.match(html, /data-gate-contact/);
    assert.deepEqual(logged, [{ status: 401 }, { status: 401 }], "the login log has the status and nothing from the body");
  });

  test("the right code sets the cookie, HttpOnly, Secure, SameSite=Lax, host-only, 12 hours, and the chat loads", async () => {
    const ok = await handleLogin(login(CODE), { env: DEMO_ENV, limiter: new LoginLimiter() });
    assert.equal(ok.status, 200);
    const line = ok.headers.getSetCookie().find((cookie) => cookie.startsWith(`${COOKIE_NAME}=`)) ?? "";
    assert.match(line, /; HttpOnly/);
    assert.match(line, /; Secure/);
    assert.match(line, /; SameSite=Lax/);
    assert.match(line, /; Max-Age=43200/);
    assert.doesNotMatch(line, /Domain=/i);
    const cookie = cookieOf(ok);
    assert.ok(cookie);
    assert.equal(gateRequest(page("/", { cookie }), { env: DEMO_ENV }), null, "the chat page passes the gate");
    assert.equal(gateRequest(page("/eve/v1/session", { cookie }), { env: DEMO_ENV }), null);
  });

  test("logout clears the cookie, and the chat is gated again", async () => {
    const out = handleLogout(new Request(`${ORIGIN}/api/password-auth/logout`, { method: "POST", headers: { origin: ORIGIN, host: "try.example.test" } }), { env: DEMO_ENV });
    assert.equal(out.status, 200);
    const cleared = out.headers.getSetCookie().find((cookie) => cookie.startsWith(`${COOKIE_NAME}=`)) ?? "";
    assert.match(cleared, /^eve_chat_session=; /);
    assert.match(cleared, /Max-Age=0/);
    const cookie = cleared.split(";")[0];
    assert.equal(gateRequest(page("/", { cookie }), { env: DEMO_ENV })?.status, 401);
  });

  test("a GET with the code in the query is refused and sets nothing", async () => {
    const response = await handleLogin(new Request(`${ORIGIN}/api/password-auth/login?code=${CODE}`), { env: DEMO_ENV, limiter: new LoginLimiter() });
    assert.equal(response.status, 405);
    assert.equal(cookieOf(response), null);
    assert.equal(gateRequest(page(`/?code=${CODE}`), { env: DEMO_ENV })?.status, 401);
  });

  test("a POST from another site is refused before the code is read", async () => {
    const response = await handleLogin(login(CODE, { origin: "https://elsewhere.test" }), { env: DEMO_ENV, limiter: new LoginLimiter() });
    assert.equal(response.status, 403);
    assert.equal(cookieOf(response), null);
  });
});

describe("the code, its digest and the cookie", () => {
  test("the digest form from the README's one-liner is accepted, and a wrong code is not", async () => {
    const env = { NODE_ENV: "production", AB_DEMO: "1", EVE_CHAT_PASSWORD_DIGEST: digestCode(CODE, randomBytes(16)) } as NodeJS.ProcessEnv;
    assert.match(configuredSecret(env), /^scrypt\$[\w-]+\$[\w-]+$/);
    assert.equal((await handleLogin(login(CODE), { env, limiter: new LoginLimiter() })).status, 200);
    assert.equal((await handleLogin(login(`${CODE}x`), { env, limiter: new LoginLimiter() })).status, 401);
  });

  test("rotating the code revokes every cookie issued under the old one", () => {
    const { value } = issueCookie(CODE);
    assert.ok(verifyCookie(value, CODE));
    assert.equal(verifyCookie(value, "a-new-code-after-rotation"), null);
  });

  test("a cookie past 12 hours, or one that claims a longer life, is refused", () => {
    const issued = Date.UTC(2026, 9, 29, 12);
    const { value } = issueCookie(CODE, issued);
    assert.ok(verifyCookie(value, CODE, issued + 11 * 3_600_000));
    assert.equal(verifyCookie(value, CODE, issued + 12 * 3_600_000 + 1_000), null);
    const [version, id, , signature] = value.split(".");
    assert.equal(verifyCookie(`${version}.${id}.${Math.floor(issued / 1000) + 99 * 3600}.${signature}`, CODE, issued), null);
  });
});

describe("the login limiter", () => {
  test("twenty wrong codes from one address within a minute: the limiter denies before the compare", async () => {
    let now = 1_000_000;
    const limiter = new LoginLimiter(() => now);
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 20; attempt += 1) {
      now += 100;
      statuses.push((await handleLogin(login(`wrong-${attempt}`, { "x-vercel-forwarded-for": "203.0.113.7" }), { env: { ...DEMO_ENV, VERCEL: "1" }, limiter })).status);
    }
    assert.deepEqual(statuses.slice(0, 10), Array(10).fill(401));
    assert.ok(statuses.slice(10).every((status) => status === 429), statuses.join(","));
    // The right code is still refused while limited: the compare never ran.
    const right = await handleLogin(login(CODE, { "x-vercel-forwarded-for": "203.0.113.7" }), { env: { ...DEMO_ENV, VERCEL: "1" }, limiter });
    assert.equal(right.status, 429);
    assert.equal(cookieOf(right), null);
    assert.ok(Number(right.headers.get("retry-after")) >= 1);
    const body = (await right.json()) as { state: string; message: string };
    assert.equal(body.state, "limited");
    assert.match(body.message, /wait \d+ seconds? and try again/);
    // Another address is not limited by this one.
    const other = await handleLogin(login(CODE, { "x-vercel-forwarded-for": "198.51.100.4" }), { env: { ...DEMO_ENV, VERCEL: "1" }, limiter });
    assert.equal(other.status, 200);
  });

  test("the global bucket caps everyone together", () => {
    const limiter = new LoginLimiter(() => 0);
    const results = Array.from({ length: 101 }, (_, index) => limiter.take(`198.51.100.${index}`));
    assert.ok(results.slice(0, 100).every((result) => result.ok));
    assert.equal(results[100].ok, false);
  });

  test("the address: x-vercel-forwarded-for on Vercel, the last hop with AB_TRUST_PROXY, never a first hop the caller wrote", () => {
    const headers = new Headers({ "x-forwarded-for": "6.6.6.6, 203.0.113.9", "x-vercel-forwarded-for": "198.51.100.2" });
    assert.equal(clientAddress(headers, "10.0.0.1", { VERCEL: "1" }), "198.51.100.2");
    assert.equal(clientAddress(headers, "10.0.0.1", { AB_TRUST_PROXY: "1" }), "203.0.113.9");
    assert.equal(clientAddress(headers, "10.0.0.1", {}), "10.0.0.1");
    assert.equal(clientAddress(headers, undefined, {}), "unknown");
  });

  test("IPv6 is expanded and keyed on its /64; a mapped IPv4 is the IPv4", () => {
    assert.equal(canonicalAddress("2001:db8::1"), "2001:0db8:0000:0000::/64");
    assert.equal(canonicalAddress("2001:0DB8:0:0:ffff::2"), "2001:0db8:0000:0000::/64");
    assert.equal(canonicalAddress("[2001:db8:1::1%eth0]"), "2001:0db8:0001:0000::/64");
    assert.equal(canonicalAddress("::ffff:203.0.113.7"), "203.0.113.7");
    assert.equal(canonicalAddress("203.0.113.7"), "203.0.113.7");
  });
});

describe("the states table", () => {
  test("every state renders its message and its next action; the cap state offers no continue", () => {
    const values = { branch: "ab/add-a-flag-sess0123", stage: "plan", waitSeconds: 45 };
    assert.deepEqual(
      GATE_STATES.map((state) => state.id),
      ["no-cookie", "wrong-code", "limited", "token-cap", "resting", "busy-cookie", "busy-address", "blocked", "idle-ended"],
    );
    for (const state of GATE_STATES) {
      const message = fill(state.message, values);
      assert.doesNotMatch(message, /[{}]/, state.id);
      assert.doesNotMatch(message, /\u2014/, `${state.id}: no em dash`);
      assert.equal(message.split(/(?<=[.!?])\s+/).length, 1, `${state.id}: one sentence`);
      assert.ok(fill(state.action.label, values).length > 0, state.id);
      const html = gatePage(state, values, { demo: true });
      assert.ok(html.includes(message.replaceAll("'", "'")) || state.id === "wrong-code", `${state.id} page shows its message`);
    }
    const cap = GATE_STATES.find((state) => state.id === "token-cap")!;
    assert.equal(cap.action.kind, "branch-link");
    assert.equal(cap.inputDisabled, true);
    assert.doesNotMatch(`${cap.message} ${cap.action.label} ${gatePage(cap, values, { demo: true })}`, /continue/i);
    assert.match(fill(cap.message, values), /ab\/add-a-flag-sess0123 after the plan stage/);
    const resting = GATE_STATES.find((state) => state.id === "resting")!;
    assert.match(fill(resting.action.label, values), /00:00 UTC/);
    for (const id of ["no-cookie", "wrong-code"]) {
      const state = GATE_STATES.find((row) => row.id === id)!;
      assert.equal(state.contact, true);
      assert.match(gatePage(state, values, { demo: true }), /Dominik's message/);
      assert.doesNotMatch(gatePage(state, values, { demo: false }), /Dominik|data-gate-contact/, `${id} on a deployer's copy`);
    }
  });

  test("the README's Demo gate table is the states table", async () => {
    const { readFileSync } = await import("node:fs");
    const readme = readFileSync(join(import.meta.dirname, "..", "..", "..", "README.md"), "utf8");
    const section = readme.slice(readme.indexOf("## Demo gate"));
    for (const state of GATE_STATES) {
      assert.ok(section.includes(`| ${state.trigger} | ${state.message} |`), `README row for ${state.id}`);
    }
  });
});

describe("AE6 at the gate: the states the chat reads from the registry", () => {
  const registryFile = join(scratch, "registry.json");
  let clock = new Date("2026-10-29T10:00:00Z");
  const registry = new Registry(fileBackend(registryFile), () => clock);
  const signedIn = (address: string) => {
    const { value, session } = issueCookie(CODE);
    return { cookie: `${COOKIE_NAME}=${value}`, cookieId: session.cookieId, address };
  };
  const ask = (who: { cookie: string; address: string }, session?: string) =>
    gateStatus(
      new Request(`${ORIGIN}/api/gate${session ? `?session=${session}` : ""}`, { headers: { cookie: who.cookie, "x-vercel-forwarded-for": who.address } }),
      registry,
      { ...DEMO_ENV, VERCEL: "1" },
    );

  test("a second session under the same cookie is busy; a third from one address is busy", async () => {
    const first = signedIn("203.0.113.20");
    assert.equal((await registry.admit({ sessionId: "s1", cookieId: first.cookieId, address: first.address })).kind, "admitted");
    const sameCookie = await ask(first);
    assert.equal(sameCookie.state, "busy-cookie");
    assert.equal(sameCookie.inputDisabled, true);
    assert.match(sameCookie.message ?? "", /another chat/);
    assert.equal((await ask(first, "s1")).state, null, "the running session itself is not busy");
    const second = signedIn("203.0.113.20");
    assert.equal((await registry.admit({ sessionId: "s2", cookieId: second.cookieId, address: second.address })).kind, "admitted");
    const third = signedIn("203.0.113.20");
    assert.equal((await ask(third)).state, "busy-address");
  });

  test("busy names the real time left from the running entry's last activity, and the caller's own session only", async () => {
    clock = new Date("2026-10-29T11:00:00Z");
    const who = signedIn("203.0.113.21");
    await registry.admit({ sessionId: "s-wait", cookieId: who.cookieId, address: who.address });
    clock = new Date("2026-10-29T11:12:00Z");
    const busy = await ask(who);
    assert.equal(busy.state, "busy-cookie");
    assert.equal(busy.message, "You already have a run going in another chat, so carry on there or wait 18 minutes for it to end.");
    assert.equal(busy.goneMessage, "You already have a run going in a chat this browser does not list, so wait 18 minutes for it to end.");
    assert.equal(busy.why, "A chat counts as running until it has been idle for 30 minutes.");
    assert.equal(busy.action, "Try again in 18 minutes");
    assert.equal(busy.runningSessionId, "s-wait", "the caller's own running session, to open it again");
    clock = new Date("2026-10-29T11:29:30Z");
    assert.equal((await ask(who)).action, "Try again in 30 seconds");
    const neighbour = signedIn("203.0.113.21");
    await registry.admit({ sessionId: "s-wait-2", cookieId: neighbour.cookieId, address: neighbour.address });
    const third = await ask(signedIn("203.0.113.21"));
    assert.equal(third.state, "busy-address");
    assert.equal(third.runningSessionId, undefined, "another cookie's session id is never returned");
    assert.match(third.message ?? "", /within 30 seconds/, "the soonest of the address's running entries");
    clock = new Date("2026-10-29T10:00:00Z");
  });

  test("ruling 76: busy offers the browser's own running chat, on New session and in the refused chat, and says so when the browser does not list it", async () => {
    const who = signedIn("203.0.113.22");
    await registry.admit({ sessionId: "wrun_01RUNNING", cookieId: who.cookieId, address: who.address });
    // The browser's chat list, keyed by its own chat ids, each holding the Eve session it runs.
    const listed = [{ id: "5f0c2a9e-0d4e-4c39-9b8a-2f6d1e7a3c11", sessionId: "wrun_01RUNNING" }];
    const inThisBrowser = (sessionId: string) => listed.find((chat) => chat.sessionId === sessionId)?.id ?? null;
    const inAnotherBrowser = () => null;

    for (const status of [await ask(who), await ask(who, "wrun_01REFUSED")]) {
      assert.equal(status.state, "busy-cookie");
      const id = runningChatId(status, inThisBrowser);
      assert.equal(id, "5f0c2a9e-0d4e-4c39-9b8a-2f6d1e7a3c11", "the local chat that runs the registry's session");
      const href = runningChatHref(id);
      assert.equal(href, "/chat/5f0c2a9e-0d4e-4c39-9b8a-2f6d1e7a3c11", "Open that chat opens it");
      assert.equal(noticeMessage(status, href), "You already have a run going in another chat, so carry on there or wait 30 minutes for it to end.");

      const gone = runningChatHref(runningChatId(status, inAnotherBrowser));
      assert.equal(gone, null, "nothing to open in a browser that does not list the chat");
      assert.equal(noticeMessage(status, gone), "You already have a run going in a chat this browser does not list, so wait 30 minutes for it to end.");
    }

    const neighbour = signedIn("203.0.113.22");
    await registry.admit({ sessionId: "wrun_01NEIGHBOUR", cookieId: neighbour.cookieId, address: neighbour.address });
    const address = await ask(signedIn("203.0.113.22"));
    assert.equal(address.state, "busy-address");
    assert.equal(runningChatId(address, inThisBrowser), null, "busy under the address never offers another cookie's chat");
    assert.equal(noticeMessage(address, null), address.message);
  });

  test("the cap state names the pushed branch and its stage and links the branch", async () => {
    const who = signedIn("198.51.100.30");
    await registry.admit({ sessionId: "s-cap", cookieId: who.cookieId, address: who.address });
    await registry.recordProgress("s-cap", { repository: "dbenger/ab-demo-sample", branch: "ab/add-a-flag-scap0000", stage: "plan" });
    await registry.end("s-cap", "token-cap");
    const status = await ask(who, "s-cap");
    assert.equal(status.state, "token-cap");
    assert.equal(status.actionKind, "branch-link");
    assert.equal(status.branchUrl, "https://github.com/dbenger/ab-demo-sample/tree/ab/add-a-flag-scap0000");
    assert.match(status.message ?? "", /ab\/add-a-flag-scap0000 after the plan stage/);
    assert.doesNotMatch(JSON.stringify(status), /continue/i);
  });

  test("after the day's 402 is recorded a new session sees the resting state, until 00:00 UTC", async () => {
    await registry.markResting();
    const fresh = signedIn("192.0.2.40");
    const status = await ask(fresh);
    assert.equal(status.state, "resting");
    assert.match(status.message ?? "", /resting until 00:00 UTC/);
    clock = new Date("2026-10-30T00:00:01Z");
    assert.equal((await ask(signedIn("192.0.2.40"))).state, null, "the mark clears at the UTC day");
  });

  test("off the demo, or without the cookie, there is no state to show", async () => {
    const who = signedIn("192.0.2.50");
    assert.equal((await gateStatus(new Request(`${ORIGIN}/api/gate`, { headers: { cookie: who.cookie } }), null, { ...DEMO_ENV, AB_DEMO: "" })).state, null);
    assert.equal((await gateStatus(new Request(`${ORIGIN}/api/gate`), registry, DEMO_ENV)).state, null);
  });
});

const { NOT_OWNER_MESSAGE, ownedByOther, sessionIdOf } = await import("../lib/gate/owner.ts");
const { routeAuth } = await import("eve/channels/auth");
const { walk } = await import("../../../agent/channels/eve.ts");

describe("ruling 52: a demo session answers only the cookie that started it", () => {
  const registry = new Registry(fileBackend(join(scratch, "owner-registry.json")));
  const signedIn = () => {
    const { value, session } = issueCookie(CODE);
    return { cookie: `${COOKIE_NAME}=${value}`, cookieId: session.cookieId };
  };
  const call = (path: string, headers: Record<string, string> = {}, method = "GET") =>
    new Request(`${ORIGIN}${path}`, { method, headers: { "x-vercel-forwarded-for": "203.0.113.70", ...headers } });

  test("the session id is read from every /eve/v1/session/:id route and from no other path", () => {
    for (const path of [
      "/eve/v1/session/wrun_01",
      "/eve/v1/session/wrun_01/",
      "/eve/v1/session/wrun_01/stream",
      "/eve/v1/session/wrun_01/cancel",
      "/eve/v1/session/wrun_01/reset",
      "/eve/v1/session/wrun_01/descendants/stream",
      "/eve/v1/session/wrun_01/subagents/call_1/wrun_02/stream",
      "/eve/v1/session/%77run_01/stream",
      "//eve//v1//session//wrun_01//stream",
    ]) {
      assert.equal(sessionIdOf(path), "wrun_01", path);
    }
    for (const path of ["/eve/v1/session", "/eve/v1/session/", "/eve/v1/info", "/api/gate", "/chat/wrun_01", "/x/v1/session/wrun_01"]) {
      assert.equal(sessionIdOf(path), null, path);
    }
  });

  test("the owner passes, another cookie is refused, a session with no entry has no owner yet, off the demo nothing is checked", async () => {
    const owner = signedIn();
    const stranger = signedIn();
    await registry.admit({ sessionId: "wrun_own1", cookieId: owner.cookieId, address: "203.0.113.70" });
    const env = { ...DEMO_ENV };
    assert.equal(await ownedByOther(call("/eve/v1/session/wrun_own1/stream"), owner.cookieId, { env, registry }), false);
    assert.equal(await ownedByOther(call("/eve/v1/session/wrun_own1/stream"), stranger.cookieId, { env, registry }), true);
    assert.equal(await ownedByOther(call("/eve/v1/session/wrun_fresh/stream"), stranger.cookieId, { env, registry }), false);
    assert.equal(await ownedByOther(call("/eve/v1/session"), stranger.cookieId, { env, registry }), false);
    assert.equal(await ownedByOther(call("/eve/v1/session/wrun_own1"), stranger.cookieId, { env: { ...env, AB_DEMO: "" }, registry }), false);
  });

  test("a helper's session answers its root's cookie once its first turn is admitted", async () => {
    const owner = signedIn();
    const stranger = signedIn();
    const env = { ...DEMO_ENV };
    await registry.admit({ sessionId: "wrun_root2", cookieId: owner.cookieId, address: "203.0.113.71" });
    assert.equal(await ownedByOther(call("/eve/v1/session/wrun_helper2/stream"), stranger.cookieId, { env, registry }), false, "before its first turn it has no owner to compare");
    await registry.admit({ sessionId: "wrun_root2", helperId: "wrun_helper2", cookieId: owner.cookieId, address: "203.0.113.71" });
    for (const path of ["/eve/v1/session/wrun_helper2/stream", "/eve/v1/session/wrun_helper2/cancel", "/eve/v1/session/wrun_helper2/reset"]) {
      assert.equal(await ownedByOther(call(path), stranger.cookieId, { env, registry }), true, path);
      assert.equal(await ownedByOther(call(path), owner.cookieId, { env, registry }), false, path);
    }
  });

  describe("through the eve channel's route auth walk (agent/channels/eve.ts)", () => {
    // The walk reads process.env and the default registry, the file under .workflow-data/ beside
    // the working folder, so these tests run in a folder of their own with the demo's variables.
    const saved = { cwd: process.cwd(), env: { ...process.env } };
    const folder = mkdtempSync(join(tmpdir(), "ab-owner-"));
    const owner = signedIn();
    const stranger = signedIn();
    before(async () => {
      process.chdir(folder);
      for (const name of ["VERCEL", "EVE_DEV", "AB_EVAL_MOCK", "AB_MAINTENANCE"]) delete process.env[name];
      Object.assign(process.env, { AB_DEMO: "1", EVE_CHAT_PASSWORD: CODE });
      const local = new Registry(fileBackend(join(folder, ".workflow-data", "agent-blueprint", "registry.json")));
      await local.admit({ sessionId: "wrun_walk1", cookieId: owner.cookieId, address: "203.0.113.70" });
    });
    after(() => {
      process.chdir(saved.cwd);
      process.env = saved.env;
      rmSync(folder, { recursive: true, force: true });
    });

    const SESSION_ROUTES: [string, string][] = [
      ["POST", "/eve/v1/session/wrun_walk1"],
      ["GET", "/eve/v1/session/wrun_walk1/stream"],
      ["GET", "/eve/v1/session/wrun_walk1/descendants/stream"],
      ["GET", "/eve/v1/session/wrun_walk1/subagents/call_1/wrun_child/stream"],
      ["POST", "/eve/v1/session/wrun_walk1/cancel"],
      ["POST", "/eve/v1/session/wrun_walk1/clear"],
      ["POST", "/eve/v1/session/wrun_walk1/compact"],
      ["POST", "/eve/v1/session/wrun_walk1/reset"],
    ];

    test("the owner's cookie is the chat principal on every session route", async () => {
      for (const [method, path] of SESSION_ROUTES) {
        const result = await routeAuth(call(path, { cookie: owner.cookie }, method), walk);
        assert.ok(!(result instanceof Response), `${method} ${path}`);
        assert.equal(result.principalId, "chat-user");
        assert.equal(result.attributes?.cookieId, owner.cookieId);
      }
    });

    test("another visitor's cookie gets 403 with the not-owner message on every session route", async () => {
      for (const [method, path] of SESSION_ROUTES) {
        const result = await routeAuth(call(path, { cookie: stranger.cookie }, method), walk);
        assert.ok(result instanceof Response, `${method} ${path}`);
        assert.equal(result.status, 403);
        assert.deepEqual(await result.json(), { code: "not-owner", error: NOT_OWNER_MESSAGE, ok: false });
      }
    });

    test("without a cookie the session routes stay 401", async () => {
      const result = await routeAuth(call("/eve/v1/session/wrun_walk1/stream"), walk);
      assert.ok(result instanceof Response);
      assert.equal(result.status, 401);
    });

    test("existing flows are unchanged: a new session, a session with no entry yet, info, and off the demo", async () => {
      for (const [method, path] of [["POST", "/eve/v1/session"], ["GET", "/eve/v1/session/wrun_unseen/stream"], ["GET", "/eve/v1/info"]]) {
        const result = await routeAuth(call(path, { cookie: stranger.cookie }, method), walk);
        assert.ok(!(result instanceof Response), path);
      }
      process.env.AB_DEMO = "";
      try {
        const result = await routeAuth(call("/eve/v1/session/wrun_walk1/stream", { cookie: stranger.cookie }), walk);
        assert.ok(!(result instanceof Response), "off the demo one password is one principal");
      } finally {
        process.env.AB_DEMO = "1";
      }
    });

    test("the refusal sentence carries no dashes and is the one the README quotes", async () => {
      assert.doesNotMatch(NOT_OWNER_MESSAGE, /[–—]| - /);
      const { readFileSync } = await import("node:fs");
      const readme = readFileSync(join(import.meta.dirname, "..", "..", "..", "README.md"), "utf8");
      assert.ok(readme.includes(`"${NOT_OWNER_MESSAGE}"`));
    });
  });
});
