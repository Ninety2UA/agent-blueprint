import { createHmac, randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { defineEval } from "eve/evals";
import { equals, includes } from "eve/evals/expect";
import { MAINTENANCE_MESSAGE, mcpTokens, parseList } from "../agent/lib/channel-gate";
import { LINEAR_SCOPE, LINEAR_STUB_PORT } from "../agent/lib/linear-token";

// The maintenance pass (U7: R6, KTD7, KTD9, AE4 and AE5, the refusal halves). Every cell runs only with
// AB_MAINTENANCE=1, on a server booted in maintenance, so no question or invocation is open here; the
// other halves (a question answered after the upgrade, agent_get on a live invocation) are live rows.
// Each channel's API points at its stub under AB_EVAL_MOCK=1: Slack 47821, Linear 47822, Telegram
// 47823. linear.eval.ts and mcp.eval.ts keep their own maintenance cells on the same ports, so CI runs
// this pass with --max-concurrency 1.
const MAINTENANCE = Boolean(process.env.AB_MAINTENANCE?.trim());
const SLACK_STUB_PORT = 47821;
const TELEGRAM_STUB_PORT = 47823;

interface Recorded {
  readonly method: string;
  readonly body: string;
}

const read = (request: IncomingMessage) =>
  new Promise<string>((resolve) => {
    let body = "";
    request.on("data", (chunk) => (body += chunk));
    request.on("end", () => resolve(body));
  });
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A stub that records every call by the last path segment and answers with `answer(method)`. */
async function stub(port: number, calls: Recorded[], answer: (method: string, body: string) => unknown): Promise<Server> {
  const server = createServer(async (request, response) => {
    const path = (request.url ?? "").split("?")[0];
    const body = await read(request);
    const method = path.replace(/^\/api\//, "").split("/").pop() ?? "";
    calls.push({ method: path === "/oauth/token" ? "oauth/token" : method, body });
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify(answer(method, body)));
  });
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  return server;
}
const close = (server: Server) => new Promise((resolve) => server.close(resolve));

async function waitFor(calls: Recorded[], predicate: (call: Recorded) => boolean, timeoutMs = 30_000): Promise<Recorded | undefined> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const found = calls.find(predicate);
    if (found || Date.now() > deadline) return found;
    await pause(250);
  }
}

const cell = (description: string, needs: () => string | null, test: Parameters<typeof defineEval>[0]["test"]) =>
  defineEval({
    description,
    tags: ["mock"],
    async test(t) {
      if (process.env.AB_EVAL_MOCK !== "1") throw new Error("mock-tagged evals need AB_EVAL_MOCK=1");
      if (process.env.AB_DEMO === "1") return t.skip("runs without AB_DEMO");
      if (!MAINTENANCE) return t.skip("runs with AB_MAINTENANCE=1");
      const missing = needs();
      if (missing) return t.skip(missing);
      return test(t);
    },
  });

// ---- MCP (AE5, KTD7, KTD9) ----

const MCP_ROUTE = "/eve/v1/mcp";
const TOKENS = mcpTokens(process.env);
const META = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientInfo": { name: "agent-blueprint-eval", version: "1.0.0" },
  "io.modelcontextprotocol/clientCapabilities": {},
};
let rpcIds = 0;

type Target = { fetch(path: string, init?: RequestInit): Promise<Response> };

async function rpc(target: Target, method: string, params: Record<string, unknown>, bearer?: string) {
  const id = (rpcIds += 1);
  const response = await target.fetch(MCP_ROUTE, {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      "mcp-protocol-version": "2026-07-28",
      "mcp-method": method,
      ...(method === "tools/call" ? { "mcp-name": String(params.name) } : {}),
      ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params: { ...params, _meta: META } }),
  });
  const text = await response.text();
  const messages = (response.headers.get("content-type") ?? "").includes("text/event-stream")
    ? text.split("\n").filter((line) => line.startsWith("data:")).map((line) => JSON.parse(line.slice(5)))
    : text
      ? [JSON.parse(text)]
      : [];
  const reply = messages.flat().find((message) => message?.id === id) as { result?: { isError?: boolean; content?: { text: string }[] } } | undefined;
  return { status: response.status, result: reply?.result, text };
}

const mcp = cell(
  "Maintenance, MCP: agent_start and agent_update are 200 tool errors with the message; agent_get and agent_cancel answer not-found; no or a wrong token is 401.",
  () => (TOKENS.length === 0 ? "needs AB_MCP_TOKEN (32 characters or more)" : null),
  async (t) => {
    const token = TOKENS[0];
    const unknown = `inv_${randomUUID()}`;
    const call = (name: string, args: Record<string, unknown>, bearer: string | null = token) => rpc(t.target, "tools/call", { name, arguments: args }, bearer ?? undefined);

    for (const [name, args] of [
      ["agent_start", { message: "bash: echo never-runs" }],
      ["agent_update", { invocationId: unknown, responses: [] }],
    ] as const) {
      const refused = await call(name, args);
      t.check(refused.status, equals(200)).label(`${name}: 200, not 403`);
      t.check(refused.result?.isError ?? false, equals(true)).label(`${name}: isError`);
      t.check(refused.result?.content?.[0]?.text ?? "", equals(MAINTENANCE_MESSAGE)).label(`${name}: the maintenance message`);
    }
    for (const name of ["agent_get", "agent_cancel"]) {
      const answered = await call(name, { invocationId: unknown });
      t.check(answered.status, equals(200)).label(`${name}: 200`);
      t.check(answered.text, includes("not_found")).label(`${name}: reaches Eve, an unknown id is not_found`);
      t.check(answered.text.includes(MAINTENANCE_MESSAGE), equals(false)).label(`${name}: not the maintenance answer`);
    }
    // KTD7: authentication comes first, so a caller without the token learns nothing about maintenance.
    const missing = await call("agent_start", { message: "bash: echo never-runs" }, null);
    t.check(missing.status, equals(401)).label("no token: 401, not the maintenance answer");
    const wrong = await call("agent_start", { message: "bash: echo never-runs" }, "a-wrong-token-that-is-long-enough-to-count-as-set");
    t.check(wrong.status, equals(401)).label("a wrong token: 401, not the maintenance answer");
  },
);

// ---- Telegram (AE4) ----

const TELEGRAM_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET_TOKEN?.trim() ?? "";
const LISTED = Number(parseList(process.env.AB_TELEGRAM_USERS)[0]);

const telegram = cell(
  "Maintenance, Telegram: a listed sender's eve: press gets the maintenance text and the keyboard is left alone; a message gets the message and no run.",
  () =>
    !process.env.TELEGRAM_BOT_TOKEN || TELEGRAM_SECRET.length < 32 || !LISTED
      ? "needs TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET_TOKEN (32 characters or more) and AB_TELEGRAM_USERS, any test values"
      : null,
  async (t) => {
    const calls: Recorded[] = [];
    let messageId = 3_000;
    const server = await stub(TELEGRAM_STUB_PORT, calls, (method) =>
      method === "sendMessage" ? { ok: true, result: { message_id: (messageId += 1), date: Math.floor(Date.now() / 1000), chat: { id: LISTED, type: "private" } } } : { ok: true, result: true },
    );
    const post = (update: object) =>
      t.target.fetch("/eve/v1/telegram", {
        method: "POST",
        headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": TELEGRAM_SECRET },
        body: JSON.stringify(update),
      });
    const from = { id: LISTED, is_bot: false, first_name: "Eval" };
    const chat = { id: LISTED, type: "private" };
    try {
      // A press on a question the bot asked before the upgrade: Eve's own callback data, from a listed id.
      const pressed = await post({
        update_id: 9_001,
        callback_query: { id: "cbq-maintenance", from, message: { message_id: 2_999, date: Math.floor(Date.now() / 1000), chat, message_thread_id: 808, text: "Plan first or build now?" }, chat_instance: "eval", data: "eve:0" },
      });
      t.check(pressed.status, equals(200)).label("the press is accepted with 200, so Telegram does not retry it");
      const answered = await waitFor(calls, (call) => call.method === "answerCallbackQuery");
      const body = JSON.parse(answered?.body || "{}") as { callback_query_id?: string; text?: string };
      t.check(body.callback_query_id, equals("cbq-maintenance")).label("the press is answered");
      t.check(body.text, equals(MAINTENANCE_MESSAGE)).label("with the maintenance text");

      const sent = await post({ update_id: 9_002, message: { message_id: 3_001, date: Math.floor(Date.now() / 1000), from, chat, message_thread_id: 809, is_topic_message: true, text: "bash: echo never-runs" } });
      t.check(sent.status, equals(200));
      const replied = await waitFor(calls, (call) => call.method === "sendMessage");
      t.check(String((JSON.parse(replied?.body || "{}") as { text?: string }).text ?? ""), equals(MAINTENANCE_MESSAGE)).label("a message gets the maintenance message");
      await pause(3_000);
      t.check(calls.filter((call) => call.method.startsWith("editMessage")).map((call) => call.method), equals([])).label("no call edits or clears the keyboard");
      t.check(calls.some((call) => call.method === "sendChatAction"), equals(false)).label("no typing, no run");
    } finally {
      await close(server);
    }
  },
);

// ---- Linear (KTD6) ----

const LINEAR_SECRET = process.env.LINEAR_WEBHOOK_SECRET?.trim() ?? "";

const linear = cell(
  "Maintenance, Linear: a created session event gets an error activity with the message and starts nothing.",
  () =>
    process.env.LINEAR_CLIENT_ID?.trim() && process.env.LINEAR_CLIENT_SECRET?.trim() && LINEAR_SECRET
      ? null
      : "needs LINEAR_CLIENT_ID, LINEAR_CLIENT_SECRET and LINEAR_WEBHOOK_SECRET, any test values",
  async (t) => {
    const calls: Recorded[] = [];
    const server = await stub(LINEAR_STUB_PORT, calls, (method, body) => {
      if (method === "token") return { access_token: "eval-linear-token-maintenance", token_type: "Bearer", expires_in: 2_591_999, scope: LINEAR_SCOPE };
      const name = /(?:mutation|query)\s+(\w+)/.exec((JSON.parse(body || "{}") as { query?: string }).query ?? "")?.[1] ?? "";
      if (name === "AgentActivityCreate") return { data: { agentActivityCreate: { success: true, agentActivity: { id: `activity-${calls.length}` } } } };
      return { data: {} };
    });
    const session = `eval-maintenance-only-${Date.now()}`;
    const event = JSON.stringify({
      type: "AgentSessionEvent",
      action: "created",
      createdAt: new Date().toISOString(),
      organizationId: "org-eval",
      oauthClientId: "client-eval",
      appUserId: "app-user-eval",
      webhookId: "webhook-eval",
      webhookTimestamp: Date.now(),
      guidance: null,
      previousComments: [],
      promptContext: "bash: echo never-runs",
      agentSession: {
        id: session,
        status: "active",
        issue: { id: `issue-${session}`, identifier: "AB-6", title: "Add a greeting script", url: "https://linear.app/eval/issue/AB-6" },
        creator: { id: "user-eval", name: "Eval Person" },
        creatorId: "user-eval",
      },
      agentActivity: null,
    });
    const activities = () =>
      calls
        .filter((call) => call.body.includes("AgentActivityCreate"))
        .map((call) => (JSON.parse(call.body) as { variables?: { input?: { agentSessionId?: string; content?: { type?: string; body?: string } } } }).variables?.input)
        .filter((input) => input?.agentSessionId === session);
    try {
      const accepted = await t.target.fetch("/eve/v1/linear", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "linear-event": "AgentSessionEvent",
          "linear-delivery": `delivery-maintenance-${Date.now()}`,
          "linear-signature": createHmac("sha256", LINEAR_SECRET).update(event).digest("hex"),
        },
        body: event,
      });
      t.check(accepted.status, equals(200)).label("the signed event is acknowledged");
      await waitFor(calls, (call) => call.body.includes("AgentActivityCreate") && call.body.includes(session));
      await pause(3_000);
      const posted = activities();
      t.check(posted.map((input) => input?.content?.type), equals(["error"])).label("one activity, an error");
      t.check(posted[0]?.content?.body, equals(MAINTENANCE_MESSAGE)).label("carrying the maintenance message");
    } finally {
      await close(server);
    }
  },
);

// ---- Slack (the first test of its maintenance refusal) ----

const slack = cell(
  "Maintenance, Slack: a signed mention gets the maintenance message in the thread and starts nothing.",
  () => (process.env.SLACK_SIGNING_SECRET && process.env.SLACK_BOT_TOKEN ? null : "needs SLACK_SIGNING_SECRET and SLACK_BOT_TOKEN, any test values"),
  async (t) => {
    const calls: Recorded[] = [];
    const server = await stub(SLACK_STUB_PORT, calls, (method) => {
      const ts = `${Date.now() / 1000}`;
      const answers: Record<string, unknown> = {
        "auth.test": { ok: true, user_id: "U0BOT", bot_id: "B0BOT", team_id: "T0TEAM", user: "agent-blueprint" },
        "chat.postMessage": { ok: true, ts, channel: "C0CHAN", message: { ts } },
        "conversations.replies": { ok: true, messages: [], has_more: false },
        "users.info": { ok: true, user: { id: "U0USER", name: "visitor", profile: { display_name: "visitor" } } },
      };
      return answers[method] ?? { ok: true, ts };
    });
    try {
      const ts = `${Math.floor(Date.now() / 1000)}.000200`;
      const body = JSON.stringify({
        type: "event_callback",
        team_id: "T0TEAM",
        api_app_id: "A0APP",
        event_id: `EvMaintenance${Date.now()}`,
        event_time: Math.floor(Date.now() / 1000),
        authorizations: [{ team_id: "T0TEAM", user_id: "U0BOT", is_bot: true }],
        event: { type: "app_mention", user: "U0USER", channel: "C0CHAN", ts, event_ts: ts, text: "<@U0BOT>\nask: Plan first or build now? | Plan first | Build now" },
      });
      const stamp = `${Math.floor(Date.now() / 1000)}`;
      const signature = `v0=${createHmac("sha256", process.env.SLACK_SIGNING_SECRET ?? "").update(`v0:${stamp}:${body}`).digest("hex")}`;
      const accepted = await t.target.fetch("/eve/v1/slack", {
        method: "POST",
        headers: { "content-type": "application/json", "x-slack-request-timestamp": stamp, "x-slack-signature": signature },
        body,
      });
      t.check(accepted.status, equals(200)).label("the signed mention is acknowledged");
      const posted = await waitFor(calls, (call) => call.method === "chat.postMessage");
      t.check(decodeURIComponent((posted?.body ?? "").replaceAll("+", " ")), includes(MAINTENANCE_MESSAGE)).label("the thread gets the maintenance message");
      await pause(3_000);
      t.log(`slack calls: ${calls.map((call) => call.method).join(", ")}`);
      t.check(calls.some((call) => call.body.includes("Plan first or build now?")), equals(false)).label("no checkpoint card, so no run");
    } finally {
      await close(server);
    }
  },
);

export default [mcp, telegram, linear, slack];
