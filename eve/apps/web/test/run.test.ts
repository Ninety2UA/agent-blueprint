// The run panel's data (ruling 58): what the chat reads from its own messages, and nothing it
// cannot read there. Stages count as pushed only on publish_branch's report; the stage a run is
// at is ship_pipeline's; a question waits while it is open.
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { describe, test } from "node:test";
import type { EveMessage, EveMessagePart } from "eve/react";

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

const { deriveRun, stageSuffix, EMPTY_RUN } = await import("../lib/chat/run.ts");

const BRANCH = "ab/add-a-version-flag-to-the-command-line-e-k3x9m2qa";
let call = 0;
function tool(name: string, output: unknown, extra: Record<string, unknown> = {}): EveMessagePart {
  call += 1;
  return { type: "tool", callId: `call_${call}`, stepIndex: call, kind: "tool", name, label: name, state: "completed", output, ...extra } as EveMessagePart;
}
const ship = (stage: string) => tool("ship_pipeline", { outcome: "iterate", stage, branch: BRANCH });
const pushed = (stage: string) => tool("publish_branch", { status: "pushed", branch: BRANCH, sha: "abc", stage });
const message = (role: "user" | "assistant", parts: EveMessagePart[]): EveMessage => ({ id: `m${(call += 1)}`, role, parts });
const request = message("user", [{ type: "text", text: "Add a --version flag to the command-line entry point that prints the version from the package, with a test." }]);

describe("the run as the chat reads it", () => {
  test("before any report: the five stages to come, no branch, no pull request", () => {
    assert.deepEqual(EMPTY_RUN.stages.map((stage) => [stage.label, stage.state]), [
      ["Plan", "todo"],
      ["Execute", "todo"],
      ["Review", "todo"],
      ["Verify", "todo"],
      ["Ship", "todo"],
    ]);
    assert.equal(EMPTY_RUN.branch, null);
    assert.equal(EMPTY_RUN.current, null);
  });

  test("mid-run: pushed stages, the stage ship_pipeline named waiting on an open question, the pushed branch", () => {
    const question = tool("ask_question", undefined, { state: "blocked", interaction: { interactionId: "i1", status: "open", request: { prompt: "Add -V as well?" } } });
    const plan = ship("plan");
    const run = deriveRun(
      [request, message("assistant", [plan, tool("helper", {}), pushed("Plan"), ship("execute"), tool("helper", {}), pushed("Execute"), ship("review"), question])],
      { busy: false },
    );
    assert.equal(run.request, "Add a --version flag to the command-line entry point that prints the version from the package, with a test.");
    assert.deepEqual(run.stages.map((stage) => [stage.name, stage.state, stage.status]), [
      ["plan", "done", "Pushed to the branch"],
      ["execute", "done", "Pushed to the branch"],
      ["review", "now", "Waiting for your answer"],
      ["verify", "todo", null],
      ["ship", "todo", null],
    ]);
    assert.equal(run.branch, BRANCH);
    assert.equal(run.current?.name, "review");
    assert.equal(run.stageStarts[(plan as { callId: string }).callId], "plan", "the stage rule sits at the call that began it");
    assert.equal(Object.keys(run.stageStarts).length, 3);
    assert.equal(stageSuffix(run.stages[0]), "pushed");
    assert.equal(stageSuffix(run.stages[2]), "waiting for your answer");
  });

  test("a running stage while a turn works; the same stage named again draws no second rule", () => {
    const run = deriveRun([request, message("assistant", [ship("plan"), ship("plan")])], { busy: true });
    assert.equal(run.stages[0]!.status, "Running");
    assert.equal(Object.keys(run.stageStarts).length, 1);
    assert.equal(deriveRun([request, message("assistant", [ship("plan")])], { busy: false }).stages[0]!.state, "todo", "idle and unanswered: no claim");
  });

  test("finished: the pull request publish_branch opened, Ship pushed, the stages a run pushed outside the five kept after them", () => {
    const run = deriveRun(
      [request, message("assistant", [pushed("Discuss"), pushed("Plan"), tool("publish_branch", { status: "done", branch: BRANCH, sha: "def", pullRequest: { number: 7, url: "https://github.com/Ninety2UA/agent-blueprint-sample/pull/7", draft: true, reused: false } })])],
      { busy: false },
    );
    assert.deepEqual(run.pullRequest, { number: 7, url: "https://github.com/Ninety2UA/agent-blueprint-sample/pull/7" });
    assert.equal(run.stages.find((stage) => stage.name === "ship")?.state, "done");
    assert.deepEqual(run.stages.map((stage) => stage.name), ["plan", "execute", "review", "verify", "ship", "discuss"]);
    assert.equal(run.current?.name, "discuss", "the last stage in the list that pushed");
  });

  test("a pull request with no stage pushed before it reads as direct; a stage pushed, or no pull request yet, does not", () => {
    const opened = tool("publish_branch", { status: "done", branch: BRANCH, pullRequest: { number: 16, url: "https://github.com/o/r/pull/16" } });
    assert.equal(deriveRun([request, message("assistant", [opened])], { busy: false }).direct, true);
    assert.equal(deriveRun([request, message("assistant", [pushed("Plan"), opened])], { busy: false }).direct, false);
    assert.equal(deriveRun([request, message("assistant", [pushed("Plan")])], { busy: true }).direct, false);
    assert.equal(EMPTY_RUN.direct, false);
    assert.equal(deriveRun([request, message("assistant", [pushed("Ship"), opened])], { busy: false }).direct, true, "a lone Ship is no stage run");
    const stopped = tool("ship_pipeline", { outcome: "ceiling", stage: "plan", branch: BRANCH, push: { status: "pushed", branch: BRANCH, sha: "abc", stage: "plan" } });
    const resumed = deriveRun([request, message("assistant", [stopped, opened])], { busy: false });
    assert.equal(resumed.direct, false, "a stop's own push counts");
    assert.equal(resumed.stages.find((stage) => stage.name === "plan")?.state, "done");
  });

  test("a needs-human stop's push leaves its stage waiting on the person, then running after the answer", () => {
    const stop = tool("ship_pipeline", { outcome: "needs-human", stage: "review", branch: BRANCH, push: { status: "pushed", branch: BRANCH, sha: "abc", stage: "review" } });
    const question = tool("ask_question", undefined, { state: "running", interaction: { status: "open" } });
    const waiting = deriveRun([request, message("assistant", [pushed("Plan"), stop, question])], { busy: false });
    assert.equal(waiting.branch, BRANCH);
    const review = waiting.stages.find((stage) => stage.name === "review");
    assert.deepEqual([review?.state, review?.status], ["now", "Waiting for your answer"]);
    const answered = deriveRun([request, message("assistant", [pushed("Plan"), stop])], { busy: true });
    assert.deepEqual([answered.stages.find((stage) => stage.name === "review")?.state, answered.stages.find((stage) => stage.name === "review")?.status], ["now", "Running"]);
  });

  test("a blocked stop finishes its stage; a stop at continuation marks nothing", () => {
    const stop = (stage: string) => tool("ship_pipeline", { outcome: "blocked", stage, branch: BRANCH, push: { status: "pushed", branch: BRANCH, sha: "abc", stage } });
    assert.equal(deriveRun([message("assistant", [stop("verify")])], { busy: false }).stages.find((stage) => stage.name === "verify")?.state, "done");
    const early = deriveRun([message("assistant", [tool("ship_pipeline", { outcome: "blocked", stage: null, branch: BRANCH, push: { status: "pushed", branch: BRANCH, sha: "abc", stage: "continuation" } })])], { busy: false });
    assert.equal(early.branch, BRANCH);
    assert.ok(early.stages.every((stage) => stage.state === "todo"));
  });

  test("a new run on the session's branch starts its stages again and keeps the branch and pull request", () => {
    const first = [pushed("Plan"), pushed("Review"), tool("publish_branch", { status: "done", branch: BRANCH, sha: "def", pullRequest: { number: 16, url: "https://github.com/o/r/pull/16" } })];
    const restart = tool("ship_pipeline", { outcome: "iterate", iteration: 1, stage: null, branch: BRANCH, restarted: true });
    const stop = tool("ship_pipeline", { outcome: "needs-human", stage: "review", branch: BRANCH, push: { status: "pushed", branch: BRANCH, sha: "abc", stage: "review" } });
    const question = tool("ask_question", undefined, { state: "running", interaction: { status: "open" } });
    const run = deriveRun([request, message("assistant", [...first, restart, pushed("Plan"), stop, question])], { busy: false });
    assert.equal(run.branch, BRANCH);
    assert.equal(run.pullRequest?.number, 16);
    const stateOf = (name: string) => run.stages.find((stage) => stage.name === name)?.state;
    assert.deepEqual([stateOf("plan"), stateOf("review"), stateOf("ship")], ["done", "now", "todo"]);
    assert.equal(run.stages.find((stage) => stage.name === "review")?.status, "Waiting for your answer");
  });

  test("a helper's stop marks its stage stopped and gives the run-end notice with the branch (ruling 139)", () => {
    const at = tool("ship_pipeline", { outcome: "iterate", iteration: 2, stage: "execute", branch: BRANCH, repository: "acme/widgets" });
    const helper = tool("helper", { role: "builder", status: "failed", interrupted: false, reply: null, error: "Failed after 3 attempts: 429 Too Many Requests" });
    const run = deriveRun([request, message("assistant", [pushed("Plan"), at, helper])], { busy: false });
    const execute = run.stages.find((stage) => stage.name === "execute");
    assert.deepEqual([execute?.state, execute?.status], ["stopped", "Stopped: a service it needs is busy"]);
    assert.equal(run.current?.name, "execute");
    assert.equal(run.repository, "acme/widgets");
    assert.equal(
      run.stopped?.notice,
      `The run stopped after the plan stage because a service it needs is busy. The branch ${BRANCH} holds its work up to that stage. To pick it up, send a new message asking to continue on branch ${BRANCH}.`,
    );
  });

  test("a parallel helper that finished hides no stop, and the demo leaves the stop to its gate notice", () => {
    const at = tool("ship_pipeline", { outcome: "iterate", iteration: 2, stage: "execute", branch: BRANCH });
    const stopped = tool("helper", { status: "cancelled", interrupted: false, reply: null, error: null });
    const finished = tool("helper", { status: "completed", interrupted: false, reply: "done", error: null });
    assert.notEqual(deriveRun([message("assistant", [at, stopped, finished])], { busy: false }).stopped, null);
    assert.notEqual(deriveRun([message("assistant", [at, finished, stopped])], { busy: false }).stopped, null);
    const demo = deriveRun([message("assistant", [at, stopped])], { busy: false, demo: true });
    assert.equal(demo.stopped, null);
    assert.ok(demo.stages.every((stage) => stage.state !== "stopped"));
  });

  test("no stop line while the turn runs, after a person's interruption, an off-demo 402, or once the loop went on", () => {
    const at = tool("ship_pipeline", { outcome: "iterate", iteration: 2, stage: "execute", branch: BRANCH });
    const cancelled = tool("helper", { status: "cancelled", interrupted: false, reply: null, error: null });
    assert.equal(deriveRun([message("assistant", [at, cancelled])], { busy: true }).stopped, null, "the turn is still settling");
    assert.notEqual(deriveRun([message("assistant", [at, cancelled])], { busy: false }).stopped, null);
    const steered = tool("helper", { status: "cancelled", interrupted: true, reply: null, error: null });
    assert.equal(deriveRun([message("assistant", [at, steered])], { busy: false }).stopped, null);
    const budget = tool("helper", { status: "failed", interrupted: false, reply: null, error: "402 Payment Required" });
    assert.equal(deriveRun([message("assistant", [at, budget])], { busy: false }).stopped, null);
    const later = deriveRun([message("assistant", [at, cancelled, tool("ship_pipeline", { outcome: "iterate", stage: "execute", branch: BRANCH })])], { busy: false });
    assert.equal(later.stopped, null);
    assert.ok(later.stages.every((stage) => stage.state !== "stopped"));
  });

  test("a stop before any push names no branch it cannot know", () => {
    const helper = tool("helper", { status: "cancelled", interrupted: false, reply: null, error: null });
    const run = deriveRun([message("assistant", [tool("ship_pipeline", { outcome: "iterate", stage: null, branch: BRANCH }), helper])], { busy: false });
    assert.equal(run.stopped?.notice, "The run stopped because a service it needs is busy. To pick it up, send a new message asking to continue.");
    assert.equal(run.stages[0].state, "stopped");
  });

  test("a failed or refused push counts for nothing", () => {
    const run = deriveRun([message("assistant", [tool("publish_branch", { status: "refused", reason: "x", branch: BRANCH }), tool("publish_branch", undefined, { state: "failed" })])], { busy: false });
    assert.equal(run.branch, null);
    assert.ok(run.stages.every((stage) => stage.state === "todo"));
  });
});
