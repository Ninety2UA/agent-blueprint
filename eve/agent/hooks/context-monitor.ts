import { runs } from "eve/events";
import { defineHook } from "eve/hooks";

// The context monitor on Eve (KTD3): an observer that logs every compaction with the
// history size it started from. Eve hooks cannot add to the model's context, so the
// CLI monitor's tool-call and read-streak warnings have no Eve form; the reload after a
// compaction is the instructions' job. It never cancels a turn.
export default defineHook({
  events: {
    "context.started"(event, ctx) {
      if (event.data.kind !== "compaction") return;
      // A threshold compaction reports the input that tripped it; one that was asked for
      // reports nothing, so the last model call's input stands in.
      const lastCall = runs(ctx.view)
        .filter((run) => run.status === "settled" && run.usage)
        .at(-1);
      const triggered = event.data.trigger?.inputTokens;
      console.info("[context-monitor] compaction started", {
        sessionId: ctx.session.id,
        changeId: event.data.changeId,
        turnId: event.data.turnId ?? null,
        reason: triggered === undefined ? "requested" : "threshold",
        historyTokens: triggered ?? lastCall?.usage?.inputTokens ?? null,
        historySource: triggered === undefined ? "last model call" : "compaction trigger",
      });
    },
    "context.settled"(event, ctx) {
      if (event.data.kind !== "compaction") return;
      console.info("[context-monitor] compaction settled", {
        sessionId: ctx.session.id,
        changeId: event.data.changeId,
        outcome: event.data.outcome,
      });
    },
  },
});
