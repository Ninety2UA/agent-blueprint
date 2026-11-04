// The run panel's data (ruling 58): what the chat reads from its own messages, and nothing it
// cannot read there. Stages count as pushed only on publish_branch's report; the stage a run is
// at is ship_pipeline's; a question waits while it is open.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { EveMessage, EveMessagePart } from "eve/react";

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

  test("a failed or refused push counts for nothing", () => {
    const run = deriveRun([message("assistant", [tool("publish_branch", { status: "refused", reason: "x", branch: BRANCH }), tool("publish_branch", undefined, { state: "failed" })])], { busy: false });
    assert.equal(run.branch, null);
    assert.ok(run.stages.every((stage) => stage.state === "todo"));
  });
});
