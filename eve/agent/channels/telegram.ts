import type { RouteHandlerArgs } from "eve/channels";
import { defaultTelegramAuth, telegramChannel, type TelegramChannelState, type TelegramContext } from "eve/channels/telegram";
import {
  decide,
  isTelegramUsageCommand,
  MAINTENANCE_MESSAGE,
  missingVariables,
  RefusalLimiter,
  TELEGRAM_MAINTENANCE_DATA,
  TELEGRAM_REFUSAL,
  TELEGRAM_REFUSED_DATA,
  TELEGRAM_SECRET_HEADER,
  TELEGRAM_USAGE,
  telegramAdmits,
  telegramIdReply,
  telegramWebhookBody,
  withDeliveryKey,
} from "../lib/channel-gate";
import { noticeAfterPush, sessionEndedNotice } from "../lib/run-end";
import { sendFormatted } from "../lib/telegram-format";
import { runRecord } from "../tools/publish_branch";

// Telegram for deployers (R2, KTD2 to KTD4, KTD13): a person on AB_TELEGRAM_USERS messages the bot
// in a private chat and gets a run on the same root agent; a checkpoint question arrives as inline
// buttons or a forced reply. With the bot's threaded mode on in BotFather each topic is its own
// session, record and budget, because Eve keys a continuation on the chat plus message_thread_id.
// The gate (channel-gate.ts) runs in two places:
//   webhookVerifier  every update: the secret header, compared here because a verifier turns Eve's
//                    own check off; a button press walks the gate too, since a press on Eve's
//                    buttons skips both hooks, and a refused one is rewritten for onCallbackQuery
//   onMessage        messages: groups, senderless messages and messages with no text, caption or
//                    attachment (such as the forum_topic_created service message each new
//                    thread opens with) are ignored; demo and a missing
//                    variable start nothing; an unlisted sender gets their id at most once an hour;
//                    maintenance answers with the web chat's message; /start and /help get the usage
//                    line without the model; the rest dispatch with Eve's default Telegram auth
// The route passes the update_id to Eve as each send's and button answer's idempotencyKey (ruling
// 53), so an update Telegram delivers again starts no second run and answers no question twice.
// What runs before the send still repeats: the typing action, and the usage, id or maintenance
// reply (the id reply is held to one an hour per instance).
// Uploads stay off, as on the web chat and Slack. Under AB_EVAL_MOCK=1 the Bot API points at a
// local stub (evals/telegram.eval.ts runs it).
const TELEGRAM_STUB_PORT = 47823; // evals/telegram.eval.ts listens here

const refusals = new RefusalLimiter();

async function reply(ctx: TelegramContext, text: string): Promise<null> {
  await ctx.telegram.sendMessage(text).catch((error) => console.warn("[telegram] reply failed", error));
  return null;
}

const channel = telegramChannel({
  ...(process.env.AB_EVAL_MOCK === "1" ? { api: { apiBaseUrl: `http://127.0.0.1:${TELEGRAM_STUB_PORT}` } } : {}),
  credentials: {
    botToken: () => {
      const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
      if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");
      return token;
    },
    webhookVerifier: (request, body) => telegramWebhookBody(request.headers.get(TELEGRAM_SECRET_HEADER), body),
  },
  uploadPolicy: "disabled",
  events: {
    // Ruling 60: Eve's default posts the reply as plain text, so the model's markdown showed raw.
    // The reply goes as Telegram HTML instead, split under the cap, plain again if Telegram refuses
    // it. Notices, refusals and the usage line stay plain text.
    async "content.completed"(event, ctx) {
      const part = event.data as { kind?: unknown; phase?: unknown; value?: unknown };
      if (part.kind !== "text" || part.phase !== "reply" || typeof part.value !== "string" || !part.value) return;
      await sendFormatted((message) => ctx.channel.telegram.sendMessage(message), part.value);
    },
    // R9, KTD12: a turn cap-guard cancelled, or one that failed, gets the run-end notice in its chat
    // and topic once cap-guard's push has finished; an ended session gets one too. Eve's defaults
    // post only for a failed turn or session, which these replace.
    async "turn.settled"(event, ctx) {
      await noticeAfterPush({ sessionId: ctx.session.id, data: event.data, record: () => runRecord.get(), post: (text) => ctx.channel.telegram.sendMessage(text) });
    },
    async "session.ended"(_event, ctx) {
      await reply(ctx.channel, sessionEndedNotice(runRecord.get()));
    },
  },
  async onMessage(ctx, message) {
    const sender = message.from;
    if (message.chat.type !== "private" || !sender) return null;
    if (!message.text.trim() && !message.caption.trim() && message.attachments.length === 0) return null;
    const usage = isTelegramUsageCommand(message.text);
    const decision = decide({ channel: "telegram", admitted: telegramAdmits(sender.id, message.chat.type), startsWork: !usage });
    switch (decision.kind) {
      case "demo":
      case "refused":
        return null;
      case "unconfigured":
        console.warn(`[telegram] not starting: ${decision.missing.join(", ")} missing`);
        return null;
      case "id-reply":
        return refusals.shouldReply(sender.id) ? reply(ctx, telegramIdReply(sender.id)) : null;
      case "maintenance":
        return reply(ctx, decision.message);
      case "dispatch":
        if (usage) return reply(ctx, TELEGRAM_USAGE);
        await ctx.telegram.startTyping();
        return { auth: defaultTelegramAuth(message) };
    }
  },
  async onCallbackQuery(ctx, query) {
    const maintenance = query.data === TELEGRAM_MAINTENANCE_DATA;
    if (query.data === TELEGRAM_REFUSED_DATA) {
      const missing = missingVariables("telegram");
      if (missing.length > 0) console.warn(`[telegram] press refused: ${missing.join(", ")} missing`);
    }
    const text = maintenance ? MAINTENANCE_MESSAGE : query.data === TELEGRAM_REFUSED_DATA ? TELEGRAM_REFUSAL : "Unsupported action.";
    await ctx.telegram.answerCallbackQuery({ callbackQueryId: query.id, text, showAlert: maintenance });
  },
});

export default {
  ...channel,
  routes: channel.routes.map((route) =>
    route.transport === "websocket"
      ? route
      : { ...route, handler: async (request: Request, args: RouteHandlerArgs<TelegramChannelState>) => route.handler(request, await withDeliveryKey("telegram", request, args)) },
  ),
} satisfies typeof channel;
