import { AsyncLocalStorage } from "node:async_hooks";
import { GET, type RouteHandlerArgs } from "eve/channels";
import {
  defaultLinearAuth,
  linearChannel,
  linearContinuationToken,
  type LinearAgentSessionEvent,
  type LinearChannelState,
  type LinearSessionContext,
} from "eve/channels/linear";
import { decide, isLinearStop, LINEAR_STOPPED, linearRunContext, withDeliveryKey } from "../lib/channel-gate";
import { handleLinearInstall, LINEAR_INSTALL_ROUTE } from "../lib/linear-install";
import { linearGraphqlUrl, linearToken } from "../lib/linear-token";
import { helperStoppedIn, noticeAfterPush, sessionEndedNotice } from "../lib/run-end";
import { runRecord } from "../tools/publish_branch";

// Linear for deployers (R1, KTD2, KTD5, KTD6, KTD13): a member of a public team delegates an issue
// to the agent or mentions it, and the run's progress, questions, approvals and result appear as
// Agent Activities in that Agent Session. Eve verifies every request's Linear-Signature with
// LINEAR_WEBHOOK_SECRET and its webhookTimestamp (60 seconds of skew) before anything here runs;
// an unsigned or stale request gets 401. Then onAgentSession walks the gate (channel-gate.ts):
//   demo         AB_DEMO=1 starts nothing
//   configured   a missing LINEAR_CLIENT_ID, LINEAR_CLIENT_SECRET or LINEAR_WEBHOOK_SECRET starts
//                nothing and logs the names
//   Stop         the person pressed Stop: cancel the session's turn, working or parked on a
//                question, post one final response and dispatch nothing; maintenance does not
//                block it, since cancel stays open (R6, R10)
//   maintenance  any other event posts an error activity with the web chat's maintenance message
//                and starts nothing, which leaves an open question open
//   dispatch     created and prompted events run with Eve's default Linear auth and one context
//                line naming the issue and saying a run needs a repository
// The token is minted from the app's client credentials and kept fresh (lib/linear-token.ts);
// its fetch wrapper also keeps Linear upload links from ever receiving it (KTD13).
// onAgentSession gets no channel operations, so the route below runs Eve's handler inside an
// AsyncLocalStorage holding the request's operations; the Stop reads from() there and cancels the
// address Eve dispatches to, linearContinuationToken of the Agent Session id. Those operations pass
// the Agent Session id plus the activity id (the action for a created event) to Eve as each send's
// idempotencyKey (ruling 53), so an event Linear delivers again starts no second run and asks no
// question twice. A repeated Stop still cancels again, which finds no turn, and posts its final
// response again; a repeated event during maintenance posts the maintenance message again.
// A blocked or failed turn and an ended session get the run-end notice (R9, KTD12, lib/run-end.ts).
// The channel also answers GET /eve/v1/linear/install, the app's install callback on hosts without
// the web chat (ruling 74, lib/linear-install.ts): the admin's browser, so no Linear signature, and
// beside the webhook route rather than inside its wrapper.

const operations = new AsyncLocalStorage<RouteHandlerArgs<LinearChannelState>>();

async function post(ctx: LinearSessionContext, content: { type: "response" | "error"; body: string }): Promise<void> {
  await ctx.linear.createActivity(content).catch((error) => console.warn(`[linear] ${content.type} activity failed`, error));
}

async function stop(ctx: LinearSessionContext, event: LinearAgentSessionEvent): Promise<null> {
  const from = operations.getStore()?.from;
  if (!from) {
    console.warn("[linear] Stop arrived without channel operations; nothing was cancelled");
  } else {
    await from(linearContinuationToken({ agentSessionId: event.agentSession.id }))
      .cancel()
      .catch((error) => console.info("[linear] Stop found no turn to cancel", error instanceof Error ? error.name : error));
  }
  await post(ctx, { type: "response", body: LINEAR_STOPPED });
  return null;
}

const channel = linearChannel({
  api: { fetch: linearToken.fetch, apiBaseUrl: linearGraphqlUrl() },
  credentials: {
    accessToken: () => linearToken.get(),
    webhookSecret: () => process.env.LINEAR_WEBHOOK_SECRET?.trim() ?? "",
  },
  events: {
    // R9, KTD12: a turn cap-guard cancelled, or one that failed, gets the run-end notice as an
    // error activity once cap-guard's push has finished. Eve's default turn.settled posts only for
    // a failed turn (failureNotice in eve's channels/reply.js), so every other turn still gets what
    // the default gives it: nothing.
    async "turn.settled"(event, ctx) {
      await noticeAfterPush({
        sessionId: ctx.session.id,
        data: { ...event.data, helperStopped: event.data.outcome === "cancelled" && helperStoppedIn(ctx.view, event.data.turnId) },
        record: () => runRecord.get(),
        post: (body) => ctx.channel.linear.createActivity({ type: "error", body }),
      });
    },
    // An ended session posts a response, or an error when the session failed.
    async "session.ended"(event, ctx) {
      const type = event.data.outcome === "failed" ? "error" : "response";
      await ctx.channel.linear
        .createActivity({ type, body: sessionEndedNotice(runRecord.get()) })
        .catch((error) => console.warn(`[linear] ${type} activity failed`, error));
    },
  },
  async onAgentSession(ctx, event) {
    const halt = isLinearStop(event);
    const decision = decide({ channel: "linear", admitted: true, startsWork: !halt });
    switch (decision.kind) {
      case "demo":
      case "refused":
      case "id-reply":
        return null;
      case "unconfigured":
        console.warn(`[linear] not starting: ${decision.missing.join(", ")} missing`);
        return null;
      case "maintenance":
        await post(ctx, { type: "error", body: decision.message });
        return null;
      case "dispatch":
        if (halt) return stop(ctx, event);
        if (event.action !== "created" && event.action !== "prompted") return null;
        return { auth: defaultLinearAuth(event), context: [linearRunContext(event.agentSession.issue)] };
    }
  },
});

export default {
  ...channel,
  routes: [
    ...channel.routes.map((route) =>
      route.transport === "websocket"
        ? route
        : {
            ...route,
            handler: async (request: Request, args: RouteHandlerArgs<LinearChannelState>) => {
              const keyed = await withDeliveryKey("linear", request, args);
              return operations.run(keyed, () => route.handler(request, keyed));
            },
          },
    ),
    GET<LinearChannelState>(LINEAR_INSTALL_ROUTE, (request) => handleLinearInstall(request, LINEAR_INSTALL_ROUTE)),
  ],
} satisfies typeof channel;
