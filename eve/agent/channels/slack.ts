import { defaultSlackAuth, slackChannel, type SlackContext } from "eve/channels/slack";
import { MAINTENANCE_MESSAGE } from "./eve";

// Slack for deployers (R12): mentions and DMs start a run on the same root agent, and a checkpoint
// question renders as a Slack card. Credentials come from SLACK_BOT_TOKEN and SLACK_SIGNING_SECRET,
// Eve's defaults when none are passed; a request without a valid Slack signature is refused, so
// a copy without a Slack app answers nothing here.
// While AB_MAINTENANCE is set (the upgrade procedure in README.md), a mention, a DM and an answer to
// a checkpoint card get the maintenance message in the thread and start nothing; an answer's card
// stays open, so it can be answered after the upgrade. Otherwise each handler is Eve's default.
// Under AB_EVAL_MOCK=1 the Web API points at a local stub (evals/gate.eval.ts runs it), so the mocked
// eval can read the cards the channel posts without a Slack workspace.
const SLACK_STUB_PORT = 47821; // evals/gate.eval.ts listens here

const inMaintenance = () => Boolean(process.env.AB_MAINTENANCE?.trim());

async function refuse(ctx: SlackContext): Promise<null> {
  await ctx.thread.post(MAINTENANCE_MESSAGE).catch((error) => console.warn("[slack] maintenance reply failed", error));
  return null;
}

export default slackChannel({
  ...(process.env.AB_EVAL_MOCK === "1" ? { api: { apiBaseUrl: `http://127.0.0.1:${SLACK_STUB_PORT}/api/` } } : {}),
  uploadPolicy: "disabled",
  onAppMention: (ctx, message) => (inMaintenance() ? refuse(ctx) : { auth: defaultSlackAuth(message, ctx) }),
  onDirectMessage: (ctx, message) => (inMaintenance() ? refuse(ctx) : { auth: defaultSlackAuth(message, ctx) }),
  onAnswers: (ctx) => (inMaintenance() ? refuse(ctx) : { auth: ctx.defaultAuth }),
});
