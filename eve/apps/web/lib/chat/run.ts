import type { EveMessage, EveToolPart } from "eve/react";
import { helperStopsRun } from "../../../../agent/lib/helper-stop";
import { CONTINUE_ON_BRANCH, fill } from "../gate/states";

// The run as the chat can read it from its own messages (the approved chat C3's run panel, ruling
// 58): nothing here is guessed. A stage counts as pushed when publish_branch reported it pushed
// (mode stage) or opened the pull request (Ship); the stage a run is at is the one ship_pipeline
// last returned; the run waits for an answer while a question is open. The branch shown is the
// one a push reached, and the pull request the one publish_branch opened.

/** The ship pipeline's five stages, in order: the panel's list before any stage reports. */
export const RUN_STAGES = ["plan", "execute", "review", "verify", "ship"] as const;

export type StageState = "done" | "now" | "stopped" | "todo";

export interface RunStage {
  /** The stage's name in lower case, as the tools report it. */
  readonly name: string;
  /** The name as the panel shows it: "Plan". */
  readonly label: string;
  readonly state: StageState;
  /** "Pushed to the branch", "Waiting for your answer", "Running", "Stopped: ...", or nothing yet. */
  readonly status: string | null;
}

export interface RunView {
  /** The chat's first request, whole: the sheet's title once the chat has one. */
  readonly request: string | null;
  readonly stages: readonly RunStage[];
  /** The branch a push reached; null before the first push. */
  readonly branch: string | null;
  /** owner/name the run works on, from ship_pipeline; null before its first call. */
  readonly repository: string | null;
  readonly pullRequest: { readonly number: number; readonly url: string } | null;
  /** The run opened its pull request with no stage pushed before it: the panel says so instead of listing stages. */
  readonly direct: boolean;
  /** The stage the run is at, or the last one pushed: the strip's line on a phone. */
  readonly current: RunStage | null;
  /** The ship_pipeline calls that begin a stage, by call id: where the conversation rules a stage. */
  readonly stageStarts: Readonly<Record<string, string>>;
  /**
   * A helper's stop ended the run (ruling 139): the hook pushed the branch and cancelled the turn,
   * and no ship_pipeline result says so, so the chat shows the run-end notice the channels post.
   */
  readonly stopped: { readonly notice: string } | null;
}

export const EMPTY_RUN: RunView = deriveRun([], { busy: false });

export const STAGE_STATUS = {
  done: "Pushed to the branch",
  waiting: "Waiting for your answer",
  running: "Running",
  stopped: "Stopped: a service it needs is busy",
} as const;

export function deriveRun(messages: readonly EveMessage[], options: { readonly busy: boolean; readonly demo?: boolean }): RunView {
  const pushed = new Set<string>();
  const seen: string[] = [];
  const stageStarts: Record<string, string> = {};
  let branch: string | null = null;
  let pullRequest: RunView["pullRequest"] = null;
  let at: string | null = null;
  let waiting = false;
  let request: string | null = null;
  let repository: string | null = null;
  let lastPushed: string | null = null;
  // A helper since the loop's last step stopped the run, whichever of parallel helpers it was; a
  // later step of the loop means it went on.
  let helperStopped = false;
  const see = (name: string) => {
    if (!seen.includes(name)) seen.push(name);
  };

  const notePush = (push: Record<string, unknown>) => {
    const stage = stageName(push.stage);
    if (stage) {
      pushed.add(stage);
      see(stage);
      lastPushed = stage;
    }
    if (typeof push.branch === "string") branch = push.branch;
  };

  for (const message of messages) {
    if (request === null && message.role === "user") {
      const text = message.parts.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n").trim();
      if (text) request = text;
    }
    for (const part of message.parts) {
      if (part.type !== "tool") continue;
      if (part.interaction?.status === "open") waiting = true;
      if (part.state !== "completed") continue;
      const output = record(part.output);
      if (!output) continue;
      const name = toolName(part);
      if (name === "helper" && helperStopsRun(output)) helperStopped = true;
      if (name === "publish_branch" || name === "ship_pipeline") helperStopped = false;
      if (name === "publish_branch") {
        if (output.status === "pushed") notePush(output);
        else if (output.status === "done") {
          if (typeof output.branch === "string") branch = output.branch;
          const pr = record(output.pullRequest);
          if (pr && typeof pr.number === "number" && typeof pr.url === "string") pullRequest = { number: pr.number, url: pr.url };
          pushed.add("ship");
          see("ship");
        }
      } else if (name === "ship_pipeline") {
        // A new run on the session's branch starts its stages again.
        if (output.restarted === true) {
          pushed.clear();
          at = null;
          lastPushed = null;
        }
        if (typeof output.repository === "string") repository = output.repository;
        // A stop pushes the branch inside the tool and reports it under `push`. Only a run's last
        // stop finishes its stage: after needs-human the stage is still waiting on the person.
        const push = record(output.push);
        if (push?.status === "pushed") {
          if (typeof push.branch === "string") branch = push.branch;
          if ((output.outcome === "blocked" || output.outcome === "ceiling") && push.stage !== "continuation") notePush(push);
        }
        const stage = stageName(output.stage);
        if (stage && stage !== "continuation") {
          if (stage !== at) stageStarts[part.callId] = stage;
          at = stage;
          see(stage);
        }
      }
    }
  }

  const names = [...RUN_STAGES, ...seen.filter((name) => !(RUN_STAGES as readonly string[]).includes(name))];
  // On the demo the gate's notice names the real reason, a token cap included, so only a copy shows this.
  const stopped = helperStopped && !waiting && !options.busy && !options.demo;
  // The stage it stopped at: the one ship_pipeline last named, else the first one not pushed.
  const stoppedAt = stopped ? (at && !pushed.has(at) ? at : (names.find((name) => !pushed.has(name)) ?? null)) : null;
  const stages = names.map((name): RunStage => {
    const label = name.charAt(0).toUpperCase() + name.slice(1);
    if (pushed.has(name)) return { name, label, state: "done", status: STAGE_STATUS.done };
    if (name === stoppedAt) return { name, label, state: "stopped", status: STAGE_STATUS.stopped };
    if (name === at && (waiting || options.busy)) {
      return { name, label, state: "now", status: waiting ? STAGE_STATUS.waiting : STAGE_STATUS.running };
    }
    return { name, label, state: "todo", status: null };
  });
  const current =
    stages.find((stage) => stage.state === "now" || stage.state === "stopped") ?? [...stages].reverse().find((stage) => stage.state === "done") ?? null;
  const direct = pullRequest !== null && [...pushed].every((name) => name === "ship");
  return { request, stages, branch, repository, pullRequest, direct, current, stageStarts, stopped: stopped ? { notice: stopNotice(branch, lastPushed) } : null };
}

/**
 * The run-end notice for the branch the chat knows. The chat sees only the pushes its tools
 * reported, not the hook's push after the stop, so it vouches for the last stage it saw pushed.
 */
function stopNotice(branch: string | null, stage: string | null): string {
  if (!branch) return "The run stopped because a service it needs is busy. To pick it up, send a new message asking to continue.";
  const after = stage ? ` after the ${stage} stage` : "";
  const saved = stage ? `The branch ${branch} holds its work up to that stage.` : `Its work was pushed to the branch ${branch} as it went.`;
  return `The run stopped${after} because a service it needs is busy. ${saved} ${fill(CONTINUE_ON_BRANCH, { branch })}`;
}

/** The divider's words for a stage: "pushed", "waiting for your answer", "running", or none. */
export function stageSuffix(stage: RunStage | undefined): string | null {
  return stage?.status ? stage.status.charAt(0).toLowerCase() + stage.status.slice(1).replace(/ to the branch$/, "") : null;
}

function toolName(part: EveToolPart): string {
  return part.name.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function stageName(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim().toLowerCase() : null;
}

function record(value: unknown): Record<string, unknown> | null {
  if (typeof value === "string") {
    try {
      return record(JSON.parse(value));
    } catch {
      return null;
    }
  }
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}
