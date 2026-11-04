// The checks the Linear, Telegram and MCP channels share (KTD1, KTD2, KTD7, KTD8, KTD9, KTD12),
// with no Eve server: the switches, "configured", list parsing, the token match, the MCP body
// classifier, the refusal limiter, the OAuth resolver and the run-end notice.
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
const gate = await import("../agent/lib/channel-gate.ts");
const { MAINTENANCE_MESSAGE: eveMaintenance } = await import("../agent/channels/eve.ts");

const TOKEN_A = "a".repeat(64);
const TOKEN_B = `${"b".repeat(63)}c`;
const SECRET = "s".repeat(32);

describe("the switches", () => {
  test("demo reads AB_DEMO=1 and maintenance any non-blank AB_MAINTENANCE, as eve.ts and cap-guard.ts do", () => {
    assert.equal(gate.demoOn({ AB_DEMO: "1" }), true);
    assert.equal(gate.demoOn({ AB_DEMO: "true" }), false);
    assert.equal(gate.demoOn({}), false);
    assert.equal(gate.maintenanceOn({ AB_MAINTENANCE: "1" }), true);
    assert.equal(gate.maintenanceOn({ AB_MAINTENANCE: "  " }), false);
    assert.equal(gate.maintenanceOn({}), false);
  });

  test("the maintenance message is the web chat's", () => {
    assert.equal(gate.MAINTENANCE_MESSAGE, eveMaintenance);
  });
});

describe("list parsing", () => {
  test("trims, drops empties and keeps strings", () => {
    assert.deepEqual(gate.parseList(" 12345 , ,678,, "), ["12345", "678"]);
    assert.deepEqual(gate.parseList(""), []);
    assert.deepEqual(gate.parseList(undefined), []);
    assert.equal(typeof gate.parseList("42")[0], "string");
  });
});

describe("configured", () => {
  test("Linear needs its client ID, client secret and webhook secret", () => {
    assert.deepEqual(gate.missingVariables("linear", {}), ["LINEAR_CLIENT_ID", "LINEAR_CLIENT_SECRET", "LINEAR_WEBHOOK_SECRET"]);
    assert.deepEqual(gate.missingVariables("linear", { LINEAR_CLIENT_ID: "id", LINEAR_CLIENT_SECRET: "x", LINEAR_WEBHOOK_SECRET: "y" }), []);
  });

  test("Telegram reports the bot token missing when only the secret is set, and never the user list", () => {
    assert.deepEqual(gate.missingVariables("telegram", { TELEGRAM_WEBHOOK_SECRET_TOKEN: SECRET }), ["TELEGRAM_BOT_TOKEN"]);
    assert.deepEqual(gate.missingVariables("telegram", { TELEGRAM_BOT_TOKEN: "123:abc", TELEGRAM_WEBHOOK_SECRET_TOKEN: SECRET }), []);
    assert.deepEqual(gate.missingVariables("telegram", { TELEGRAM_BOT_TOKEN: "123:abc", TELEGRAM_WEBHOOK_SECRET_TOKEN: "s".repeat(31) }), [
      "TELEGRAM_WEBHOOK_SECRET_TOKEN",
    ]);
    assert.ok(!gate.missingVariables("telegram", {}).includes("AB_TELEGRAM_USERS"));
  });

  test("a 31-character AB_MCP_TOKEN counts as missing and a 64-character one passes", () => {
    assert.deepEqual(gate.missingVariables("mcp", { AB_MCP_TOKEN: "t".repeat(31) }), ["AB_MCP_TOKEN"]);
    assert.deepEqual(gate.missingVariables("mcp", { AB_MCP_TOKEN: TOKEN_A }), []);
    assert.deepEqual(gate.missingVariables("mcp", { AB_MCP_TOKEN: `${TOKEN_A},short` }), ["AB_MCP_TOKEN"], "each value of a rotation counts");
    assert.deepEqual(gate.mcpTokens({ AB_MCP_TOKEN: ` ${TOKEN_A} , ${TOKEN_B} ` }), [TOKEN_A, TOKEN_B]);
    assert.deepEqual(gate.mcpTokens({ AB_MCP_TOKEN: "t".repeat(31) }), []);
  });

  test("MCP passes with no token when the OAuth resolver says on", () => {
    const env = { AB_MCP_OAUTH_ISSUER: "https://example.authkit.app", AB_MCP_OAUTH_SUBJECTS: "user_1", AB_MCP_OAUTH_RESOURCE: "https://a.example/eve/v1/mcp" };
    assert.deepEqual(gate.missingVariables("mcp", env, gate.resolveOAuth(env)), []);
    assert.deepEqual(gate.missingVariables("mcp", {}, gate.resolveOAuth({})), ["AB_MCP_TOKEN"]);
  });
});

describe("the gate order: demo, configured, audience, maintenance, dispatch", () => {
  const telegram = { TELEGRAM_BOT_TOKEN: "123:abc", TELEGRAM_WEBHOOK_SECRET_TOKEN: SECRET };

  test("a private Telegram message with an empty user list gets the id reply", () => {
    const admitted = gate.parseList(undefined).includes("12345");
    assert.deepEqual(gate.decide({ channel: "telegram", admitted, startsWork: true, env: telegram }), { kind: "id-reply" });
  });

  test("each step in its place", () => {
    const listed = { ...telegram, AB_TELEGRAM_USERS: "12345" };
    const admitted = gate.parseList(listed.AB_TELEGRAM_USERS).includes("12345");
    assert.deepEqual(gate.decide({ channel: "telegram", admitted, startsWork: true, env: { ...listed, AB_DEMO: "1" } }), { kind: "demo" });
    assert.deepEqual(gate.decide({ channel: "telegram", admitted, startsWork: true, env: { AB_TELEGRAM_USERS: "12345" } }), {
      kind: "unconfigured",
      missing: ["TELEGRAM_BOT_TOKEN", "TELEGRAM_WEBHOOK_SECRET_TOKEN"],
    });
    assert.deepEqual(gate.decide({ channel: "mcp", admitted: false, startsWork: true, env: { AB_MCP_TOKEN: TOKEN_A, AB_MAINTENANCE: "1" } }), {
      kind: "refused",
    }, "an outsider learns nothing about maintenance");
    assert.deepEqual(gate.decide({ channel: "telegram", admitted, startsWork: true, env: { ...listed, AB_MAINTENANCE: "1" } }), {
      kind: "maintenance",
      message: gate.MAINTENANCE_MESSAGE,
    });
    assert.deepEqual(gate.decide({ channel: "mcp", admitted: true, startsWork: false, env: { AB_MCP_TOKEN: TOKEN_A, AB_MAINTENANCE: "1" } }), {
      kind: "dispatch",
    }, "reads and cancel stay open");
    assert.deepEqual(gate.decide({ channel: "telegram", admitted, startsWork: true, env: listed }), { kind: "dispatch" });
  });
});

describe("the token match", () => {
  const configured = [TOKEN_A, TOKEN_B];

  test("accepts each of two configured values", () => {
    assert.equal(gate.tokenMatches(TOKEN_A, configured), true);
    assert.equal(gate.tokenMatches(TOKEN_B, configured), true);
  });

  test("refuses a value one character off, a prefix, an empty string and no token", () => {
    assert.equal(gate.tokenMatches(`${TOKEN_A.slice(0, -1)}b`, configured), false);
    assert.equal(gate.tokenMatches(TOKEN_A.slice(0, 32), configured), false);
    assert.equal(gate.tokenMatches("", configured), false);
    assert.equal(gate.tokenMatches(null, configured), false);
    assert.equal(gate.tokenMatches(TOKEN_A, []), false);
  });
});

describe("the Telegram verifier", () => {
  const LISTED = "111111111";
  const OUTSIDER = "222222222";
  const env = { TELEGRAM_BOT_TOKEN: "123:abc", TELEGRAM_WEBHOOK_SECRET_TOKEN: SECRET, AB_TELEGRAM_USERS: `${LISTED}, 333333333` };
  const press = (from: string, data = "eve:0", chatType = "private") =>
    JSON.stringify({
      update_id: 7,
      callback_query: {
        id: "cbq-1",
        from: { id: Number(from), is_bot: false, first_name: "A" },
        message: { message_id: 40, chat: { id: Number(LISTED), type: chatType }, text: "Plan first or build now?" },
        chat_instance: "ci",
        data,
      },
    });
  const message = JSON.stringify({
    update_id: 8,
    message: { message_id: 41, chat: { id: Number(OUTSIDER), type: "private" }, from: { id: Number(OUTSIDER), is_bot: false }, text: "hi" },
  });
  const dataOf = (body: string | null) => (body === null ? null : (JSON.parse(body) as { callback_query: { data: string } }).callback_query.data);

  test("passes a correct secret and keeps the body as it came", () => {
    assert.equal(gate.telegramWebhookBody(SECRET, message, env), message);
    assert.equal(gate.telegramWebhookBody(SECRET, press(LISTED), env), press(LISTED), "a listed id's press is left alone");
  });

  test("refuses a wrong, missing or prefix secret, and every request while the secret variable is unset or short", () => {
    assert.equal(gate.telegramWebhookBody(`${SECRET.slice(0, -1)}x`, message, env), null);
    assert.equal(gate.telegramWebhookBody(null, message, env), null);
    assert.equal(gate.telegramWebhookBody("", message, env), null);
    assert.equal(gate.telegramWebhookBody(SECRET.slice(0, 16), message, env), null);
    const { TELEGRAM_WEBHOOK_SECRET_TOKEN: _unset, ...unset } = env;
    assert.equal(gate.telegramWebhookBody(SECRET, message, unset), null);
    assert.equal(gate.telegramWebhookBody("", message, unset), null);
    const short = "s".repeat(31);
    assert.equal(gate.telegramWebhookBody(short, message, { ...env, TELEGRAM_WEBHOOK_SECRET_TOKEN: short }), null);
  });

  test("rewrites an eve: press from an unlisted id, or from a group, to the refusal data", () => {
    assert.equal(dataOf(gate.telegramWebhookBody(SECRET, press(OUTSIDER), env)), gate.TELEGRAM_REFUSED_DATA);
    assert.equal(dataOf(gate.telegramWebhookBody(SECRET, press(LISTED, "eve:0", "group"), env)), gate.TELEGRAM_REFUSED_DATA);
    assert.equal(dataOf(gate.telegramWebhookBody(SECRET, press(LISTED), { ...env, AB_TELEGRAM_USERS: "" })), gate.TELEGRAM_REFUSED_DATA, "empty admits nobody");
    assert.ok(!gate.TELEGRAM_REFUSED_DATA.startsWith("eve"), "the private data never reaches Eve's own callback handlers");
  });

  test("rewrites a listed id's press to the refusal on the demo and when TELEGRAM_BOT_TOKEN is missing, so the question stays open", () => {
    assert.equal(dataOf(gate.telegramWebhookBody(SECRET, press(LISTED), { ...env, AB_DEMO: "1" })), gate.TELEGRAM_REFUSED_DATA);
    const { TELEGRAM_BOT_TOKEN: _missing, ...noBot } = env;
    assert.equal(dataOf(gate.telegramWebhookBody(SECRET, press(LISTED), noBot)), gate.TELEGRAM_REFUSED_DATA);
  });

  test("rewrites a listed id's press during maintenance to the maintenance data, and an outsider's to the refusal", () => {
    const upgrading = { ...env, AB_MAINTENANCE: "1" };
    assert.equal(dataOf(gate.telegramWebhookBody(SECRET, press(LISTED), upgrading)), gate.TELEGRAM_MAINTENANCE_DATA);
    assert.equal(dataOf(gate.telegramWebhookBody(SECRET, press(OUTSIDER), upgrading)), gate.TELEGRAM_REFUSED_DATA, "an outsider learns nothing about maintenance");
    assert.equal(gate.telegramWebhookBody(SECRET, message, upgrading), message, "messages are onMessage's to answer");
  });

  test("a body that is not JSON passes through for Eve to drop", () => {
    assert.equal(gate.telegramWebhookBody(SECRET, "not json", env), "not json");
  });

  test("telegramAdmits takes listed ids in private chats only", () => {
    assert.equal(gate.telegramAdmits(LISTED, "private", env), true);
    assert.equal(gate.telegramAdmits("333333333", "private", env), true);
    assert.equal(gate.telegramAdmits(LISTED, "group", env), false);
    assert.equal(gate.telegramAdmits(LISTED, "supergroup", env), false);
    assert.equal(gate.telegramAdmits(OUTSIDER, "private", env), false);
    assert.equal(gate.telegramAdmits(LISTED, "private", {}), false);
  });

  test("the usage commands are /start and /help, with or without the bot's name", () => {
    for (const text of ["/start", "/help", "/start@ab_check_bot", "/help please", "/START"]) assert.equal(gate.isTelegramUsageCommand(text), true, text);
    for (const text of ["start", "/stop", "/started", "Work on /start", ""]) assert.equal(gate.isTelegramUsageCommand(text), false, text);
  });

  test("the id reply names the sender's id, and the usage line asks for a repository, a feature and a new topic", () => {
    assert.match(gate.telegramIdReply(OUTSIDER), new RegExp(OUTSIDER));
    assert.match(gate.TELEGRAM_USAGE, /repository/);
    assert.match(gate.TELEGRAM_USAGE, /new topic/);
    const visible = `${gate.telegramIdReply(OUTSIDER)}${gate.TELEGRAM_USAGE}${gate.TELEGRAM_REFUSAL}`;
    assert.doesNotMatch(visible, /[\u2013\u2014]/);
    assert.ok(gate.TELEGRAM_REFUSAL.length <= 200, "answerCallbackQuery shows at most 200 characters");
  });
});

describe("the MCP body classifier", () => {
  const call = (name: string, id = 1) => ({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: {} } });

  test("flags a tools/call of agent_start, and a batch whose second element is agent_update", () => {
    assert.equal(gate.startsMcpWork(call("agent_start")), true);
    assert.equal(gate.startsMcpWork([call("agent_get", 1), call("agent_update", 2)]), true);
  });

  test("passes agent_get, agent_cancel, initialize, tools/list and a notification", () => {
    assert.equal(gate.startsMcpWork(call("agent_get")), false);
    assert.equal(gate.startsMcpWork(call("agent_cancel")), false);
    assert.equal(gate.startsMcpWork({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }), false);
    assert.equal(gate.startsMcpWork({ jsonrpc: "2.0", id: 2, method: "tools/list" }), false);
    assert.equal(gate.startsMcpWork({ jsonrpc: "2.0", method: "notifications/initialized" }), false);
    assert.equal(gate.startsMcpWork(null), false);
    assert.equal(gate.startsMcpWork("agent_start"), false);
  });
});

describe("the refusal limiter", () => {
  test("answers the first refusal for an id, swallows a second within the hour, answers again after it", () => {
    const limiter = new gate.RefusalLimiter();
    const t0 = Date.parse("2026-10-30T10:00:00Z");
    assert.equal(limiter.shouldReply("12345", t0), true);
    assert.equal(limiter.shouldReply("12345", t0 + 59 * 60_000), false);
    assert.equal(limiter.shouldReply("67890", t0 + 59 * 60_000), true, "another id has its own hour");
    assert.equal(limiter.shouldReply("12345", t0 + 60 * 60_000), true);
    assert.equal(limiter.shouldReply("12345", t0 + 61 * 60_000), false, "the hour restarts at the reply");
  });
});

describe("the OAuth resolver", () => {
  const issuer = "https://example.authkit.app";

  test("off with a reason when the configuration is incomplete", () => {
    const empty = gate.resolveOAuth({ AB_MCP_OAUTH_ISSUER: issuer, VERCEL_PROJECT_PRODUCTION_URL: "a.example" });
    assert.equal(empty.on, false);
    assert.match(empty.reason, /AB_MCP_OAUTH_SUBJECTS/);

    const plain = gate.resolveOAuth({ AB_MCP_OAUTH_ISSUER: "http://idp.example.com", AB_MCP_OAUTH_SUBJECTS: "user_1", AB_MCP_OAUTH_RESOURCE: "https://a.example/eve/v1/mcp" });
    assert.equal(plain.on, false);
    assert.match(plain.reason, /AB_MCP_OAUTH_ISSUER/);

    const nowhere = gate.resolveOAuth({ AB_MCP_OAUTH_ISSUER: issuer, AB_MCP_OAUTH_SUBJECTS: "user_1" });
    assert.equal(nowhere.on, false);
    assert.match(nowhere.reason, /AB_MCP_OAUTH_RESOURCE/);

    assert.equal(gate.resolveOAuth({}).on, false);
  });

  test("on with the resource from VERCEL_PROJECT_PRODUCTION_URL when that is set", () => {
    const resolved = gate.resolveOAuth({ AB_MCP_OAUTH_ISSUER: issuer, AB_MCP_OAUTH_SUBJECTS: " user_1 , user_2 ", VERCEL_PROJECT_PRODUCTION_URL: "a.example" });
    assert.equal(resolved.on, true);
    assert.equal(resolved.on && resolved.issuer, issuer);
    assert.deepEqual(resolved.on && resolved.subjects, ["user_1", "user_2"]);
    assert.equal(resolved.on && resolved.resource, "https://a.example/eve/v1/mcp");
    assert.equal(resolved.on && resolved.metadataPath, "/eve/v1/oauth-protected-resource/mcp");
  });

  test("AB_MCP_OAUTH_RESOURCE wins; a loopback issuer and eve dev's own origin are allowed", () => {
    const typed = gate.resolveOAuth({
      AB_MCP_OAUTH_ISSUER: issuer,
      AB_MCP_OAUTH_SUBJECTS: "*",
      AB_MCP_OAUTH_RESOURCE: "https://typed.example/eve/v1/mcp",
      VERCEL_PROJECT_PRODUCTION_URL: "a.example",
    });
    assert.equal(typed.on && typed.resource, "https://typed.example/eve/v1/mcp");
    const local = gate.resolveOAuth({ AB_MCP_OAUTH_ISSUER: "http://localhost:9000", AB_MCP_OAUTH_SUBJECTS: "user_1", EVE_DEV: "1" });
    assert.equal(local.on, true);
    assert.equal(local.on && local.resource, undefined, "the request's own origin");
  });
});

describe("the run-end notice", () => {
  test("a blocked outcome with a branch names the branch and the continue sentence", () => {
    const text = gate.runEndNotice({ outcome: "blocked", branch: "ab/add-search-sess0123" });
    assert.match(text, /ab\/add-search-sess0123/);
    assert.match(text, /continue on branch ab\/add-search-sess0123/);
  });

  test("without a branch it omits both and says no branch was saved", () => {
    const text = gate.runEndNotice({ outcome: "blocked" });
    assert.doesNotMatch(text, /continue on branch/);
    assert.doesNotMatch(text, /ab\//);
    assert.match(text, /No branch was saved/);
  });

  test("an ended session says so, and the outcomes read differently", () => {
    const ended = gate.runEndNotice({ outcome: "ended", branch: "ab/x-sess0123" });
    assert.match(ended, /continue on branch ab\/x-sess0123/);
    const bare = (["blocked", "failed", "ended"] as const).map((outcome) => gate.runEndNotice({ outcome }));
    assert.equal(new Set(bare).size, 3);
    assert.doesNotMatch(`${ended}${bare.join("")}`, /[\u2013\u2014]/);
  });

  test("a blocked run says what the web chat's Blocked state says, with the stage it finished", async () => {
    const { fill, gateState } = await import("../apps/web/lib/gate/states.ts");
    const text = gate.runEndNotice({ outcome: "blocked", branch: "ab/add-search-sess0123", stage: "plan" });
    const web = fill(gateState("blocked").message, { branch: "ab/add-search-sess0123", stage: "plan" });
    assert.ok(text.startsWith(web), text);
    assert.match(text, /after the plan stage/);
    assert.match(gate.runEndNotice({ outcome: "blocked", branch: "ab/x-sess0123" }), /after the last finished stage/);
  });

  test("a failed run names the error, not a busy service", () => {
    const text = gate.runEndNotice({ outcome: "failed", branch: "ab/x-sess0123", stage: "build" });
    assert.match(text, /after the build stage because of an error/);
    assert.doesNotMatch(text, /busy/);
  });
});

describe("the run-end notice's timing (U6, KTD12)", async () => {
  const runEnd = await import("../agent/lib/run-end.ts");
  const record = { branch: "ab/x-sess0123", lastPushedSha: "a".repeat(40), stage: "plan" };

  test("only a turn cap-guard cancelled, or one that failed, gets a notice", () => {
    assert.equal(runEnd.turnNoticeOutcome({ outcome: "completed" }), null);
    assert.equal(runEnd.turnNoticeOutcome({ outcome: "cancelled" }), null, "a person's Stop or a session that failed");
    assert.equal(runEnd.turnNoticeOutcome({ outcome: "cancelled", cause: { deliveryId: "d1" } }), null);
    assert.equal(runEnd.turnNoticeOutcome({ outcome: "cancelled", cause: { hook: "cap-guard" } }), "blocked");
    assert.equal(runEnd.turnNoticeOutcome({ outcome: "failed", error: { message: "429 Too Many Requests" } }), "blocked");
    assert.equal(runEnd.turnNoticeOutcome({ outcome: "failed", error: { message: "boom" } }), "failed");
  });

  test("the branch is the one cap-guard's push reported pushed; a refused push names none", () => {
    assert.deepEqual(runEnd.noticeBranch({ pushed: true, branch: "ab/y-sess0123", stage: "build" }, record), { branch: "ab/y-sess0123", stage: "build" });
    assert.deepEqual(runEnd.noticeBranch({ pushed: false, branch: "ab/y-sess0123", stage: null }, record), { branch: null, stage: null });
    assert.deepEqual(runEnd.noticeBranch({ pushed: true, branch: "ab/y-sess0123", stage: "partial" }, null), { branch: "ab/y-sess0123", stage: null });
  });

  test("with no push for the turn, the branch an earlier push landed on, if any", () => {
    assert.deepEqual(runEnd.noticeBranch(null, record), { branch: "ab/x-sess0123", stage: "plan" });
    assert.deepEqual(runEnd.noticeBranch(null, { ...record, lastPushedSha: null }), { branch: null, stage: "plan" });
    assert.deepEqual(runEnd.noticeBranch(null, null), { branch: null, stage: null });
    assert.match(runEnd.sessionEndedNotice(record), /^This session has ended, and its work is saved on the branch ab\/x-sess0123\./);
    assert.equal(runEnd.sessionEndedNotice(null), "This session has ended. No branch was saved.");
  });

  test("the channel's notice waits for cap-guard's push, in either order", async () => {
    const posted: string[] = [];
    const handoff = new runEnd.RunEndHandoff();
    const notice = (sessionId: string, turnId: string, data: { outcome: string; cause?: unknown }) =>
      runEnd.noticeAfterPush({ sessionId, data: { ...data, turnId }, record: () => null, post: async (text) => posted.push(text), handoff });

    // Eve 0.86.0's order: the channel's turn.settled first, then cap-guard's after its push.
    assert.equal(await notice("s1", "t1", { outcome: "cancelled", cause: { hook: "cap-guard" } }), true);
    assert.deepEqual(posted, [], "nothing is posted before the push has finished");
    await handoff.settle(runEnd.runEndKey("s1", "t1"), { pushed: true, branch: "ab/a-sess0001", stage: null });
    assert.equal(posted.length, 1);
    assert.match(posted[0], /saved on the branch ab\/a-sess0001\./);

    // The other order still posts once.
    await handoff.settle(runEnd.runEndKey("s2", "t1"), { pushed: false, branch: "ab/b-sess0002", stage: null });
    await notice("s2", "t1", { outcome: "failed" });
    assert.equal(posted.length, 2);
    assert.equal(posted[1], "The run stopped because of an error. No branch was saved.");

    // A completed turn posts nothing, and its settlement is only remembered.
    assert.equal(await notice("s3", "t1", { outcome: "completed" }), false);
    await handoff.settle(runEnd.runEndKey("s3", "t1"), null);
    assert.equal(posted.length, 2);
  });

  test("a post that fails is logged, never thrown into cap-guard", async () => {
    const handoff = new runEnd.RunEndHandoff();
    const warn = console.warn;
    console.warn = () => {};
    try {
      await runEnd.noticeAfterPush({
        sessionId: "s4",
        data: { outcome: "failed", turnId: "t1" },
        record: () => null,
        post: async () => {
          throw new Error("Linear is down");
        },
        handoff,
      });
      await handoff.settle(runEnd.runEndKey("s4", "t1"), null);
    } finally {
      console.warn = warn;
    }
  });
});

// ---- the MCP channel's one auth function (U5: KTD7, KTD8, KTD9) ----
// It runs through Eve's own routeAuth, so the statuses and challenges are the ones a client sees.
// The OAuth verifier is injected here; evals/mcp.eval.ts runs the real one against an issuer stub.
describe("the MCP auth function", async () => {
  const { routeAuth } = await import("eve/channels/auth");
  const mcp = await import("../agent/channels/mcp.ts");
  const RESOURCE = "https://agent.example.com/eve/v1/mcp";
  const ISSUER = "https://example.authkit.app";
  const oauthEnv = { AB_MCP_OAUTH_ISSUER: ISSUER, AB_MCP_OAUTH_SUBJECTS: "user_a", AB_MCP_OAUTH_RESOURCE: RESOURCE };
  const startCall = { jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "agent_start", arguments: { message: "hello" } } };
  const getCall = { jsonrpc: "2.0", id: 8, method: "tools/call", params: { name: "agent_get", arguments: { invocationId: "inv_1" } } };
  type Seen = { issuer?: string; audiences?: readonly string[] }[];

  /** A POST whose body records whether anything read it. */
  function post(body: unknown, authorization?: string) {
    let pulled = false;
    const bytes = new TextEncoder().encode(JSON.stringify(body));
    const stream = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          pulled = true;
          controller.enqueue(bytes);
          controller.close();
        },
      },
      { highWaterMark: 0 },
    );
    const request = new Request("http://127.0.0.1:3000/eve/v1/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", ...(authorization ? { authorization } : {}) },
      body: stream,
      duplex: "half",
    } as RequestInit);
    return { request, pulled: () => pulled };
  }

  /** A verifier that accepts any token as the given subject, recording what it was asked. */
  function verifierFor(subject: string, seen: Seen = []) {
    return async (token: string | null, config: { issuer: string; audiences: readonly string[] }) => {
      seen.push({ issuer: config.issuer, audiences: config.audiences });
      if (!token) return { ok: false as const };
      return {
        ok: true as const,
        sessionAuth: { attributes: {}, authenticator: "oidc", issuer: config.issuer, principalId: `oidc:${subject}`, principalType: "service", subject },
      };
    };
  }

  test("during maintenance a missing token gets 401 with a Bearer challenge and a wrong one 401 invalid_token, the body unread", async () => {
    const env = { AB_MCP_TOKEN: TOKEN_A, AB_MAINTENANCE: "1" };
    const auth = mcp.mcpAuth({ env, oauth: gate.resolveOAuth(env) });
    const missing = post(startCall);
    const none = await routeAuth(missing.request, auth);
    assert.ok(none instanceof Response);
    assert.equal(none.status, 401);
    assert.match(none.headers.get("www-authenticate") ?? "", /^Bearer/);
    assert.equal(missing.pulled(), false);
    const wrong = post(startCall, `Bearer ${TOKEN_B}`);
    const refused = await routeAuth(wrong.request, auth);
    assert.ok(refused instanceof Response);
    assert.equal(refused.status, 401);
    assert.match(refused.headers.get("www-authenticate") ?? "", /error="invalid_token"/);
    assert.equal(wrong.pulled(), false);
  });

  test("during maintenance a signed-in subject not on the list gets 403, the body unread", async () => {
    const env = { ...oauthEnv, AB_MAINTENANCE: "1" };
    const auth = mcp.mcpAuth({ env, oauth: gate.resolveOAuth(env), verify: verifierFor("user_b") });
    const request = post(startCall, "Bearer signed.by.the.provider");
    const refused = await routeAuth(request.request, auth);
    assert.ok(refused instanceof Response);
    assert.equal(refused.status, 403);
    assert.doesNotMatch(refused.headers.get("www-authenticate") ?? "", /insufficient_scope/, "no step-up loop back into sign-in");
    assert.equal(request.pulled(), false);
  });

  test("during maintenance an admitted agent_start gets a 200 tool error with the maintenance message; agent_get passes", async () => {
    const env = { AB_MCP_TOKEN: TOKEN_A, AB_MAINTENANCE: "1" };
    const auth = mcp.mcpAuth({ env, oauth: gate.resolveOAuth(env) });
    const start = post(startCall, `Bearer ${TOKEN_A}`);
    const answered = await routeAuth(start.request, auth);
    assert.ok(answered instanceof Response);
    assert.equal(answered.status, 200);
    const body = await answered.json();
    assert.equal(body.jsonrpc, "2.0");
    assert.equal(body.id, 7);
    assert.equal(body.result.isError, true);
    assert.equal(body.result.content[0].text, gate.MAINTENANCE_MESSAGE);
    assert.deepEqual(JSON.parse(await start.request.text()), startCall, "the original body is still readable");

    const update = { ...startCall, id: 9, params: { name: "agent_update", arguments: {} } };
    const batch = await routeAuth(post([getCall, update], `Bearer ${TOKEN_A}`).request, auth);
    assert.ok(batch instanceof Response);
    const results = await batch.json();
    assert.ok(Array.isArray(results));
    assert.deepEqual(results.map((r: { id: number }) => r.id), [8, 9]);
    assert.ok(results.every((r: { result: { isError: boolean } }) => r.result.isError));

    const read = await routeAuth(post(getCall, `Bearer ${TOKEN_A}`).request, auth);
    assert.ok(!(read instanceof Response));
    assert.equal(read.principalType, "user");
    assert.equal(read.authenticator, "mcp-token");
  });

  test("the second of two configured token values is admitted as the one shared user", async () => {
    const env = { AB_MCP_TOKEN: `${TOKEN_A},${TOKEN_B}` };
    const auth = mcp.mcpAuth({ env, oauth: gate.resolveOAuth(env) });
    const first = await routeAuth(post(getCall, `Bearer ${TOKEN_A}`).request, auth);
    const second = await routeAuth(post(getCall, `Bearer ${TOKEN_B}`).request, auth);
    assert.ok(!(first instanceof Response) && !(second instanceof Response));
    assert.equal(second.principalId, first.principalId, "every holder shares invocations");
  });

  test("on the demo, and with no token and no OAuth, nobody is admitted", async () => {
    const demo = { AB_MCP_TOKEN: TOKEN_A, AB_DEMO: "1" };
    const onDemo = await routeAuth(post(getCall, `Bearer ${TOKEN_A}`).request, mcp.mcpAuth({ env: demo, oauth: gate.resolveOAuth(demo) }));
    assert.ok(onDemo instanceof Response);
    assert.equal(onDemo.status, 401);
    const short = { AB_MCP_TOKEN: "t".repeat(31) };
    const unconfigured = await routeAuth(post(getCall, `Bearer ${"t".repeat(31)}`).request, mcp.mcpAuth({ env: short, oauth: gate.resolveOAuth(short) }));
    assert.ok(unconfigured instanceof Response);
    assert.equal(unconfigured.status, 401, "a 31-character token counts as missing");
  });

  test("a signed-in subject not on the list gets 403, and the log names the user id to add; a listed one logs nothing", async () => {
    const warnings: string[] = [];
    const warn = console.warn;
    console.warn = (...args: unknown[]) => void warnings.push(args.map(String).join(" "));
    try {
      const refused = await routeAuth(
        post(getCall, "Bearer signed.by.the.provider").request,
        mcp.mcpAuth({ env: oauthEnv, oauth: gate.resolveOAuth(oauthEnv), verify: verifierFor("user_b") }),
      );
      assert.ok(refused instanceof Response);
      assert.equal(refused.status, 403);
      assert.deepEqual(warnings, ["[mcp] refused a signed-in user not on AB_MCP_OAUTH_SUBJECTS: user_b"]);
      await routeAuth(post(getCall, "Bearer signed.by.the.provider").request, mcp.mcpAuth({ env: oauthEnv, oauth: gate.resolveOAuth(oauthEnv), verify: verifierFor("user_a") }));
      assert.equal(warnings.length, 1);
    } finally {
      console.warn = warn;
    }
  });

  test("OAuth admits a listed subject as a user, checks the issuer and the resource as audience, and * admits any subject", async () => {
    const seen: Seen = [];
    const listed = await routeAuth(
      post(getCall, "Bearer signed.by.the.provider").request,
      mcp.mcpAuth({ env: oauthEnv, oauth: gate.resolveOAuth(oauthEnv), verify: verifierFor("user_a", seen) }),
    );
    assert.ok(!(listed instanceof Response));
    assert.equal(listed.principalType, "user");
    assert.equal(listed.subject, "user_a");
    assert.deepEqual(seen, [{ issuer: ISSUER, audiences: [RESOURCE] }]);
    const open = { ...oauthEnv, AB_MCP_OAUTH_SUBJECTS: "*" };
    const anyone = await routeAuth(post(getCall, "Bearer x.y.z").request, mcp.mcpAuth({ env: open, oauth: gate.resolveOAuth(open), verify: verifierFor("user_z") }));
    assert.ok(!(anyone instanceof Response));
    assert.equal(anyone.subject, "user_z");
    const rejected = await routeAuth(
      post(getCall, "Bearer x.y.z").request,
      mcp.mcpAuth({ env: oauthEnv, oauth: gate.resolveOAuth(oauthEnv), verify: async () => ({ ok: false as const }) }),
    );
    assert.ok(rejected instanceof Response);
    assert.equal(rejected.status, 401);
  });

  test("the token is tried before OAuth, so a token holder never reaches the provider", async () => {
    const env = { ...oauthEnv, AB_MCP_TOKEN: TOKEN_A };
    const seen: Seen = [];
    const admitted = await routeAuth(post(getCall, `Bearer ${TOKEN_A}`).request, mcp.mcpAuth({ env, oauth: gate.resolveOAuth(env), verify: verifierFor("user_a", seen) }));
    assert.ok(!(admitted instanceof Response));
    assert.equal(admitted.authenticator, "mcp-token");
    assert.equal(seen.length, 0);
  });
});

describe("Linear (KTD6)", () => {
  test("a Stop is an event whose activity carries the stop signal; anything else is not", () => {
    assert.equal(gate.isLinearStop({ agentActivity: { signal: "stop" } }), true);
    assert.equal(gate.isLinearStop({ agentActivity: { signal: "select" } }), false);
    assert.equal(gate.isLinearStop({ agentActivity: { signal: null } }), false);
    assert.equal(gate.isLinearStop({}), false);
  });

  test("a Stop walks the gate as a cancel: maintenance does not block it, while a prompt gets the maintenance message", () => {
    const env = { LINEAR_CLIENT_ID: "id", LINEAR_CLIENT_SECRET: "secret", LINEAR_WEBHOOK_SECRET: "hook", AB_MAINTENANCE: "1" };
    assert.equal(gate.decide({ channel: "linear", admitted: true, startsWork: false, env }).kind, "dispatch");
    assert.equal(gate.decide({ channel: "linear", admitted: true, startsWork: true, env }).kind, "maintenance");
    assert.deepEqual(gate.decide({ channel: "linear", admitted: true, startsWork: true, env: { ...env, LINEAR_CLIENT_SECRET: "" } }), {
      kind: "unconfigured",
      missing: ["LINEAR_CLIENT_SECRET"],
    });
    assert.equal(gate.decide({ channel: "linear", admitted: true, startsWork: false, env: { ...env, AB_DEMO: "1" } }).kind, "demo");
  });

  test("the run context names the issue and says a run needs a repository; the stop reply has no dashes", () => {
    const line = gate.linearRunContext({ identifier: "AB-5", title: "Add a search box" });
    assert.match(line, /^This run comes from the Linear issue AB-5 "Add a search box"\. /);
    assert.match(line, /needs a GitHub repository/);
    assert.match(gate.linearRunContext(null), /^This run comes from Linear\. /);
    for (const text of [line, gate.LINEAR_STOPPED]) assert.doesNotMatch(text, /[\u2013\u2014]/);
  });
});

describe("repeated deliveries (ruling 53)", () => {
  test("the delivery key comes from the body: Telegram's update_id, Linear's session plus activity or action", () => {
    assert.equal(gate.deliveryKey("telegram", JSON.stringify({ update_id: 5001, message: { message_id: 7 } })), "telegram:5001");
    assert.equal(gate.deliveryKey("telegram", JSON.stringify({ update_id: 5002, callback_query: { id: "cbq" } })), "telegram:5002");
    assert.equal(gate.deliveryKey("telegram", "{}"), undefined);
    assert.equal(gate.deliveryKey("telegram", "not json"), undefined);
    const prompted = { type: "AgentSessionEvent", action: "prompted", agentSession: { id: "s-1" }, agentActivity: { id: "a-9" } };
    assert.equal(gate.deliveryKey("linear", JSON.stringify(prompted)), "linear:s-1:a-9");
    assert.equal(gate.deliveryKey("linear", JSON.stringify({ ...prompted, action: "created", agentActivity: null })), "linear:s-1:created");
    assert.equal(gate.deliveryKey("linear", JSON.stringify({ type: "Issue", action: "update" })), undefined);
    assert.equal(gate.deliveryKey("linear", JSON.stringify({ ...prompted, agentSession: { id: "s".repeat(300) } })), undefined);
  });

  test("the keyed operations add the key to send and respond and leave the request readable", async () => {
    const seen: Array<{ verb: string; key: unknown }> = [];
    const source = {
      send: async (_message: unknown, options: { idempotencyKey?: string }) => seen.push({ verb: "send", key: options.idempotencyKey }),
      respond: async (_answers: unknown, options: { idempotencyKey?: string }) => seen.push({ verb: "respond", key: options.idempotencyKey }),
      cancel: async () => seen.push({ verb: "cancel", key: undefined }),
    };
    const args = { from: () => source, resolveSession: async () => undefined, waitUntil: () => {} } as never;
    const request = new Request("http://eval/eve/v1/telegram", { method: "POST", body: JSON.stringify({ update_id: 42 }) });
    const keyed = (await gate.withDeliveryKey("telegram", request, args)) as unknown as { from: (address: string) => typeof source };
    await keyed.from("chat").send("hi", {});
    await keyed.from("chat").respond([], {});
    await keyed.from("chat").cancel();
    assert.deepEqual(seen, [
      { verb: "send", key: "telegram:42" },
      { verb: "respond", key: "telegram:42" },
      { verb: "cancel", key: undefined },
    ]);
    assert.equal(await request.text(), JSON.stringify({ update_id: 42 }));
    const unkeyed = new Request("http://eval/eve/v1/telegram", { method: "POST", body: "{}" });
    assert.equal(await gate.withDeliveryKey("telegram", unkeyed, args), args);
  });
});
