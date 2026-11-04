import { createServer, type IncomingMessage } from "node:http";
import { defineEval } from "eve/evals";
import { equals, includes } from "eve/evals/expect";
import { parseList, TELEGRAM_REFUSAL, TELEGRAM_USAGE } from "../agent/lib/channel-gate";
import { COMMIT_LINE, FEATURE, readyFor, remoteFor, setupFor } from "./fixture/ship-loop";

// The Telegram channel (U3: R2, R5, R8, KTD2 to KTD4, AE1, AE4; U6: R9, KTD12, the run-end notice;
// the forum_topic_created service message from live check A2). The channel's Bot API points at
// this stub under AB_EVAL_MOCK=1, and every update goes through t.target.fetch with the secret
// header, as Telegram would send it. It needs TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET_TOKEN
// (at least 32 characters) and AB_TELEGRAM_USERS, any test values; the first listed id is the
// listed sender. One case runs every cell in order, because the cells share the stub's port.
const TELEGRAM_STUB_PORT = 47823; // agent/channels/telegram.ts points its Bot API here
const OUTSIDER = 222_000_222;
const GROUP = -100_200_300;
const ROUTE = "/eve/v1/telegram";

interface Call {
  readonly method: string;
  readonly body: Record<string, unknown>;
  /** The message id the stub answered with, for sendMessage. */
  readonly messageId: number;
}
interface Button {
  readonly text: string;
  readonly callback_data: string;
}

const read = (request: IncomingMessage) =>
  new Promise<string>((resolve) => {
    let body = "";
    request.on("data", (chunk) => (body += chunk));
    request.on("end", () => resolve(body));
  });

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const buttonsOf = (call: Call | undefined): Button[] =>
  ((call?.body.reply_markup as { inline_keyboard?: Button[][] } | undefined)?.inline_keyboard ?? []).flat();

export default defineEval({
  description: "Telegram: a listed sender's private topic runs the agent with buttons; wrong secrets, outsiders and groups start nothing.",
  tags: ["mock"],
  async test(t) {
    if (process.env.AB_EVAL_MOCK !== "1") throw new Error("mock-tagged evals need AB_EVAL_MOCK=1");
    if (process.env.AB_DEMO === "1") return t.skip("runs without AB_DEMO");
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET_TOKEN?.trim();
    const listed = Number(parseList(process.env.AB_TELEGRAM_USERS)[0]);
    if (!process.env.TELEGRAM_BOT_TOKEN || !secret || secret.length < 32 || !listed) {
      return t.skip("needs TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET_TOKEN (32 characters or more) and AB_TELEGRAM_USERS, any test values");
    }

    const calls: Call[] = [];
    let nextMessageId = 1_000;
    const server = createServer(async (request, response) => {
      const method = (request.url ?? "").split("/").pop()?.split("?")[0] ?? "";
      const raw = await read(request);
      const body = (raw ? JSON.parse(raw) : {}) as Record<string, unknown>;
      const messageId = (nextMessageId += 1);
      calls.push({ method, body, messageId });
      // Ruling 60: Telegram answers 400 to formatting it cannot parse; this marker stands in for that.
      if (method === "sendMessage" && body.parse_mode === "HTML" && String(body.text ?? "").includes("refuse-html")) {
        response.statusCode = 400;
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({ ok: false, error_code: 400, description: "Bad Request: can't parse entities" }));
        return;
      }
      const message = { message_id: messageId, date: Math.floor(Date.now() / 1000), chat: { id: body.chat_id, type: "private" }, text: body.text };
      const results: Record<string, unknown> = { sendMessage: message, editMessageText: message };
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ ok: true, result: results[method] ?? true }));
    });
    await new Promise<void>((resolve) => server.listen(TELEGRAM_STUB_PORT, "127.0.0.1", resolve));

    let updateId = 5_000;
    const post = (update: Record<string, unknown>, header: string | null = secret) =>
      t.target.fetch(ROUTE, {
        method: "POST",
        headers: { "content-type": "application/json", ...(header === null ? {} : { "x-telegram-bot-api-secret-token": header }) },
        body: JSON.stringify(update),
      });
    const message = (from: number, text: string, options: { thread?: number; chat?: number; chatType?: string } = {}) => ({
      update_id: (updateId += 1),
      message: {
        message_id: updateId,
        date: Math.floor(Date.now() / 1000),
        from: { id: from, is_bot: false, first_name: "Eval" },
        chat: { id: options.chat ?? from, type: options.chatType ?? "private", ...(options.chatType && options.chatType !== "private" ? { title: "Eval group" } : {}) },
        text,
        ...(options.thread === undefined ? {} : { message_thread_id: options.thread, is_topic_message: true }),
      },
    });
    // The service message Telegram sends first for each new thread (live check A2, 2026-10-30).
    const topicCreated = (from: number, thread: number) => ({
      update_id: (updateId += 1),
      message: {
        message_id: updateId,
        date: Math.floor(Date.now() / 1000),
        from: { id: from, is_bot: false, first_name: "Eval" },
        chat: { id: from, type: "private" },
        message_thread_id: thread,
        is_topic_message: true,
        forum_topic_created: { name: "New thread", icon_color: 7_322_096 },
      },
    });
    const press = (from: number, id: string, prompt: Call, data: string) => ({
      update_id: (updateId += 1),
      callback_query: {
        id,
        from: { id: from, is_bot: false, first_name: "Eval" },
        message: { message_id: prompt.messageId, chat: { id: listed, type: "private" }, message_thread_id: prompt.body.message_thread_id, text: prompt.body.text },
        chat_instance: "eval",
        data,
      },
    });
    const waitFor = async (what: string, predicate: (call: Call) => boolean, timeoutMs = 60_000) => {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const found = calls.find(predicate);
        if (found || Date.now() > deadline) {
          if (!found) t.log(`no ${what}; calls: ${calls.map((call) => call.method).join(", ")}`);
          return found;
        }
        await pause(250);
      }
    };
    const inThread = (thread: number) => (call: Call) => String(call.body.chat_id) === String(listed) && call.body.message_thread_id === thread;
    const keyboardIn = (thread: number, label: string) => (call: Call) =>
      call.method === "sendMessage" && inThread(thread)(call) && buttonsOf(call).some((button) => button.text === label);

    try {
      // A wrong or missing secret header gets 401 and the stub sees no call.
      const wrong = await post(message(listed, "ask: Wrong secret? | Yes | No", { thread: 90 }), `${secret.slice(0, -1)}x`);
      t.check(wrong.status, equals(401)).label("a wrong secret gets 401");
      const missing = await post(message(listed, "ask: No secret? | Yes | No", { thread: 90 }), null);
      t.check(missing.status, equals(401)).label("a missing secret gets 401");
      await pause(3_000);
      t.check(calls.length, equals(0)).label("a refused update reaches no Bot API call");

      // AE1: an unlisted sender gets one reply naming their id, no typing and no run; a second
      // message within the hour gets nothing.
      t.check((await post(message(OUTSIDER, "hello"))).status, equals(200));
      const idReply = await waitFor("id reply", (call) => call.method === "sendMessage" && String(call.body.chat_id) === String(OUTSIDER));
      t.check(String(idReply?.body.text ?? ""), includes(String(OUTSIDER))).label("the reply names the sender's id");
      t.check((await post(message(OUTSIDER, "ask: Still here? | Yes | No"))).status, equals(200));
      await pause(4_000);
      const toOutsider = calls.filter((call) => String(call.body.chat_id) === String(OUTSIDER));
      t.check(toOutsider.map((call) => call.method), equals(["sendMessage"])).label("one reply within the hour, no typing action, no run");

      // A group message from a listed id gets no reply and no run.
      t.check((await post(message(listed, "/start", { chat: GROUP, chatType: "supergroup" }))).status, equals(200));
      t.check((await post(message(listed, "ask: In a group? | Yes | No", { chat: GROUP, chatType: "supergroup" }))).status, equals(200));

      // /start from a listed id gets the usage line and no model call.
      t.check((await post(message(listed, "/start", { thread: 300 }))).status, equals(200));
      const usage = await waitFor("usage line", (call) => call.method === "sendMessage" && inThread(300)(call));
      t.check(usage?.body.text, equals(TELEGRAM_USAGE)).label("/start gets the usage line");

      // A listed sender's question arrives as an inline keyboard holding both options.
      t.check((await post(message(listed, "ask: Plan first or build now? | Plan first | Build now", { thread: 101 }))).status, equals(200));
      const prompt = await waitFor("question keyboard", keyboardIn(101, "Plan first"));
      const buttons = buttonsOf(prompt);
      t.check(buttons.map((button) => button.text), equals(["Plan first", "Build now"])).label("both options as buttons");
      t.check(buttons.every((button) => button.callback_data.startsWith("eve:")), equals(true)).label("Eve's own callback data");
      t.check(calls.some((call) => call.method === "sendChatAction" && inThread(101)(call)), equals(true)).label("the admitted message shows typing");

      if (prompt) {
        const chosen = buttons[0].callback_data;
        // AE4: a press whose sender is not listed gets the refusal text and leaves the question open.
        t.check((await post(press(OUTSIDER, "cbq-outsider", prompt, chosen))).status, equals(200));
        const refused = await waitFor("refusal acknowledgement", (call) => call.method === "answerCallbackQuery" && call.body.callback_query_id === "cbq-outsider");
        t.check(refused?.body.text, equals(TELEGRAM_REFUSAL)).label("an outsider's press gets the refusal text");
        await pause(3_000);
        const edits = () => calls.filter((call) => call.method.startsWith("editMessage") && String(call.body.message_id) === String(prompt.messageId));
        t.check(edits().length, equals(0)).label("the outsider's press resolves nothing");

        // The listed sender's press is acknowledged and the run continues.
        t.check((await post(press(listed, "cbq-listed", prompt, chosen))).status, equals(200));
        const accepted = await waitFor("answer acknowledgement", (call) => call.method === "answerCallbackQuery" && call.body.callback_query_id === "cbq-listed");
        t.check(accepted?.body.text, equals("Answer received.")).label("the listed press is acknowledged");
        const settled = await waitFor("resolved prompt", (call) => call.method === "editMessageText" && String(call.body.message_id) === String(prompt.messageId));
        t.check(String(settled?.body.text ?? ""), includes("Plan first")).label("the prompt shows the chosen answer");
        const after = await waitFor("reply after the answer", (call) => call.method === "sendMessage" && inThread(101)(call) && buttonsOf(call).length === 0);
        t.check(Boolean(after), equals(true)).label("the run continues and replies in the topic");
      }

      // KTD4: two messages in one topic share a session, so its callback ids keep counting; a
      // message in another topic starts a fresh session, whose ids start again at eve:0.
      t.check((await post(message(listed, "ask: Same topic? | Yes | No", { thread: 101 }))).status, equals(200));
      const same = await waitFor("same-topic keyboard", keyboardIn(101, "Yes"));
      t.check(buttonsOf(same)[0]?.callback_data, equals("eve:2")).label("the same topic continues its session");
      t.check((await post(message(listed, "ask: Other topic? | Yes | No", { thread: 202 }))).status, equals(200));
      const other = await waitFor("other-topic keyboard", keyboardIn(202, "Yes"));
      t.check(buttonsOf(other)[0]?.callback_data, equals("eve:0")).label("another topic is its own session");

      // Ruling 60: the agent's markdown reply arrives as Telegram HTML with parse_mode, escaped; a
      // reply Telegram refuses to parse is sent again as the plain text.
      t.check((await post(message(listed, "say: **Done** with `x` & <y>\\n```\\nline\\n```", { thread: 808 }))).status, equals(200));
      const formatted = await waitFor("formatted reply", (call) => call.method === "sendMessage" && inThread(808)(call));
      t.check(formatted?.body.parse_mode, equals("HTML")).label("the reply is sent with parse_mode HTML");
      t.check(String(formatted?.body.text ?? ""), equals("<b>Done</b> with <code>x</code> &amp; &lt;y&gt;\n<pre>line</pre>")).label("bold, code, a fenced block and a literal < render as Telegram HTML");
      t.check((await post(message(listed, "say: **refuse-html** please", { thread: 809 }))).status, equals(200));
      const plain = await waitFor("plain fallback", (call) => call.method === "sendMessage" && inThread(809)(call) && call.body.parse_mode === undefined);
      t.check(String(plain?.body.text ?? ""), equals("**refuse-html** please")).label("a refused formatted reply is sent again as plain text");
      t.check(calls.filter((call) => call.method === "sendMessage" && inThread(809)(call)).length, equals(2)).label("one formatted try, one plain send");

      // R8: a listed sender's run is interactive, so the publish approval opens as an inline keyboard.
      t.check((await post(message(listed, [...readyFor("telegram-approval"), "publish: pull-request"].join("\n"), { thread: 404 }))).status, equals(200));
      const approval = await waitFor("publish approval", (call) => call.method === "sendMessage" && inThread(404)(call) && buttonsOf(call).length > 0);
      t.check(buttonsOf(approval).length >= 2, equals(true)).label("the publish approval is an inline keyboard");
      t.log(`publish approval: ${String(approval?.body.text ?? "").slice(0, 200)} [${buttonsOf(approval).map((button) => button.text).join(" | ")}]`);

      // The group messages, sent earlier, never reached the Bot API.
      t.check(calls.filter((call) => String(call.body.chat_id) === String(GROUP)).length, equals(0)).label("a group message gets no reply and no run");

      // Live check A2: with threaded mode on, each new thread first arrives as a forum_topic_created
      // service message from the person, with no text. It starts no run and gets no reply, not even
      // the id reply.
      t.check((await post(topicCreated(listed, 606))).status, equals(200));
      await pause(4_000);
      t.check(calls.filter(inThread(606)).map((call) => call.method), equals([])).label("a forum_topic_created update starts no run and sends nothing");

      // R9, KTD12: a run that commits and then meets a 429 ends blocked; once cap-guard's push has
      // finished, the topic gets the web chat's Blocked sentence naming the ab/ branch, which is on
      // the bare remote, and the next turn completes with no notice.
      const isNotice = (thread: number) => (call: Call) => call.method === "sendMessage" && inThread(thread)(call) && String(call.body.text ?? "").startsWith("The run stopped");
      t.check((await post(message(listed, [FEATURE, setupFor("notices-telegram"), COMMIT_LINE, "fail: 429"].join("\n"), { thread: 707 }))).status, equals(200));
      const notice = await waitFor("blocked notice", isNotice(707), 120_000);
      const noticeText = String(notice?.body.text ?? "");
      t.log(`blocked notice: ${noticeText}`);
      const branch = /on the branch (ab\/[a-z0-9-]+)\./.exec(noticeText)?.[1] ?? "";
      t.check(noticeText, includes("because a service it needs is busy")).label("the notice is the web chat's Blocked sentence");
      t.check(branch, includes(/^ab\/[a-z0-9-]+$/)).label("the notice names the ab/ branch in the topic");
      t.check(noticeText, includes(`continue on branch ${branch}`)).label("the notice says how to continue");
      t.check((await post(message(listed, `bash: git ls-remote --heads ${remoteFor("notices-telegram")}`, { thread: 707 }))).status, equals(200));
      const remote = await waitFor("remote listing", (call) => call.method === "sendMessage" && inThread(707)(call) && String(call.body.text ?? "").includes("refs/heads/"));
      t.check(String(remote?.body.text ?? ""), includes(`refs/heads/${branch}`)).label("the branch is on the bare remote");
      await pause(3_000);
      t.check(calls.filter(isNotice(707)).length, equals(1)).label("a turn that completes posts no notice");
      t.check(calls.filter((call) => call.method === "sendMessage" && String(call.body.text ?? "").startsWith("The run stopped")).length, equals(1)).label("no other topic got a run-end notice");

      // Ruling 53: Telegram delivers an update again when it got no answer in time. The same update
      // posted twice starts one run and asks its question once (Eve drops the repeated update_id
      // key); the same button press posted twice answers once and the run replies once. Only the
      // typing action, sent before the run starts, repeats.
      const twice = message(listed, "ask: Delivered twice? | Once | Twice", { thread: 505 });
      t.check((await post(twice)).status, equals(200));
      t.check((await post(twice)).status, equals(200)).label("a repeated update is acknowledged");
      const asked = await waitFor("repeated-update keyboard", keyboardIn(505, "Once"));
      await pause(8_000);
      t.check(calls.filter(keyboardIn(505, "Once")).length, equals(1)).label("a repeated update starts one run and asks its question once");
      t.log(`repeated update: ${calls.filter((call) => call.method === "sendChatAction" && inThread(505)(call)).length} typing action(s)`);
      if (asked) {
        const pressTwice = press(listed, "cbq-twice", asked, buttonsOf(asked)[0].callback_data);
        t.check((await post(pressTwice)).status, equals(200));
        t.check((await post(pressTwice)).status, equals(200)).label("a repeated press is acknowledged");
        const replies = () => calls.filter((call) => call.method === "sendMessage" && inThread(505)(call) && buttonsOf(call).length === 0);
        await waitFor("reply after the repeated press", (call) => replies().includes(call));
        await pause(8_000);
        t.check(replies().length, equals(1)).label("a repeated press answers once and the run replies once");
        t.log(`repeated press, prompt edits: ${calls.filter((call) => call.method.startsWith("editMessage") && String(call.body.message_id) === String(asked.messageId)).map((call) => String(call.body.text ?? "").slice(0, 80)).join(" | ")}`);
        t.log(`repeated press: ${calls.filter((call) => call.method === "answerCallbackQuery" && call.body.callback_query_id === "cbq-twice").map((call) => String(call.body.text)).join(" | ")}`);
      }
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  },
});
