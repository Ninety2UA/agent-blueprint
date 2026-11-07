import { calls, type SessionView } from "eve/events";
import { classifyFailure } from "./caps";
import { type RunEndOutcome, runEndNotice } from "./channel-gate";
import { helperStopsRun } from "./helper-stop";

export { helperResult } from "./helper-stop";

// How a channel learns cap-guard's push result for a run-end notice (KTD12, U6). In Eve 0.86.0 a
// commit's channel handlers run before its hooks: publishSessionEvents delivers each event to the
// channel adapter, then runs the reactions, which are the hooks
// (node_modules/eve/dist/src/execution/publish-session-events.js, deliver then react). So the
// channel's turn.settled handler runs before cap-guard's turn.settled push, and the run record it
// could read does not hold the push yet. Both run in one process, in the same publish call, so
// they meet here: the channel leaves its notice waiting under the session and turn, and cap-guard
// settles it once its push has finished (or at once when it owed no push). Whichever side comes
// second runs the notice, so the order could change without losing one.

/** cap-guard's push for a turn: whether it landed, and the branch it pushed. */
export interface PushReport {
  readonly pushed: boolean;
  readonly branch: string | null;
  readonly stage: string | null;
}

/**
 * Whether a helper's stop ended this turn off the demo, from the turn's helper calls. A cancel made
 * while a helper's call settles leaves no cause on the turn and its state writes do not survive, but
 * the calls stay in the session's view. Each call is read by the rule that cancelled the root when it
 * settled, so a person's Stop after a helper that stopped nothing, such as an off-demo 402, is not
 * taken for one, and a call that settled after the stop, as a parallel helper's does, hides nothing.
 */
export function helperStoppedTurn(helpers: readonly { readonly outcome?: string; readonly output?: unknown }[]): boolean {
  return helpers.some((helper) => helper.outcome === "completed" && helperStopsRun(helper.output));
}

/** helperStoppedTurn for a turn of the session's view. */
export const helperStoppedIn = (view: SessionView, turnId: string) => helperStoppedTurn(calls(view, { name: "helper", turnId }));


/** Whether a settled turn's cause names this hook. */
export const byCapGuard = (cause: unknown) => (cause as { hook?: unknown } | undefined)?.hook === "cap-guard";

/** What a turn's settlement means for a notice: null for a turn that gets none. */
export function turnNoticeOutcome(data: {
  readonly outcome: string;
  readonly cause?: unknown;
  readonly error?: { readonly code?: string; readonly message?: string };
  readonly helperStopped?: boolean;
}): RunEndOutcome | null {
  const cappedHere = byCapGuard(data.cause);
  if (data.outcome === "cancelled") return cappedHere || data.helperStopped ? "blocked" : null;
  if (data.outcome !== "failed") return null;
  return cappedHere || classifyFailure(data.error) !== null ? "blocked" : "failed";
}

type Notice = (report: PushReport | null) => Promise<void>;

const KEPT = 200;

/** The meeting point, one per process. Keys are `${sessionId}:${turnId}`. */
export class RunEndHandoff {
  readonly #reports = new Map<string, PushReport | null>();
  readonly #notices = new Map<string, Notice>();

  /** The channel's side: runs the notice now if cap-guard already settled the turn, else later. */
  async wait(key: string, notice: Notice): Promise<void> {
    if (this.#reports.has(key)) {
      const report = this.#reports.get(key) ?? null;
      this.#reports.delete(key);
      return notice(report);
    }
    this.#notices.set(key, notice);
    this.#trim(this.#notices);
  }

  /** cap-guard's side: the push it made for the turn, or null when it owed none. */
  async settle(key: string, report: PushReport | null): Promise<void> {
    const notice = this.#notices.get(key);
    if (notice) {
      this.#notices.delete(key);
      return notice(report);
    }
    this.#reports.set(key, report);
    this.#trim(this.#reports);
  }

  // A turn on a channel that posts no notice (the web chat, Slack, MCP) leaves its report here, so
  // only the newest few are kept.
  #trim(map: Map<string, unknown>) {
    while (map.size > KEPT) map.delete(map.keys().next().value as string);
  }
}

export const runEnd = new RunEndHandoff();

export const runEndKey = (sessionId: string, turnId: string) => `${sessionId}:${turnId}`;

/**
 * The branch a notice may name: the one cap-guard's push reported pushed; with no push for the
 * turn, the branch an earlier push of the run landed on (R9: the pushed branch, when one exists).
 */
export function noticeBranch(report: PushReport | null, record: RecordView | null): { branch: string | null; stage: string | null } {
  // cap-guard pushes a run that finished no stage as "partial", which names no stage: the notice
  // then says "the last finished stage", as the web chat does.
  const named = (stage: string | null | undefined) => (stage && stage !== "partial" ? stage : null);
  if (report) return { branch: report.pushed ? report.branch : null, stage: named(report.stage) };
  return { branch: record?.lastPushedSha ? record.branch : null, stage: named(record?.stage) };
}

/** The run record fields a notice reads (tools/publish_branch.ts keeps the record). */
export interface RecordView {
  readonly branch: string;
  readonly lastPushedSha: string | null;
  readonly stage: string | null;
}

/** The notice a session that ended gets: the branch an earlier push landed on, if any. */
export function sessionEndedNotice(record: RecordView | null): string {
  return runEndNotice({ outcome: "ended", ...noticeBranch(null, record) });
}

/**
 * A channel's turn.settled: for a turn cap-guard cancelled, or one that failed, leaves the notice
 * waiting on cap-guard's push and returns true; for any other turn returns false and posts nothing.
 * The record is read when the notice runs, after the push. A failed post is logged, never thrown,
 * because the notice may run inside cap-guard's handler.
 */
export async function noticeAfterPush(input: {
  readonly sessionId: string;
  readonly data: Parameters<typeof turnNoticeOutcome>[0] & { readonly turnId: string };
  readonly record: () => RecordView | null;
  readonly post: (text: string) => Promise<unknown>;
  readonly handoff?: RunEndHandoff;
}): Promise<boolean> {
  const outcome = turnNoticeOutcome(input.data);
  if (!outcome) return false;
  await (input.handoff ?? runEnd).wait(runEndKey(input.sessionId, input.data.turnId), async (report) => {
    const text = runEndNotice({ outcome, ...noticeBranch(report, input.record()) });
    await input.post(text).catch((error) => console.warn("[run-end] notice failed", error));
  });
  return true;
}
