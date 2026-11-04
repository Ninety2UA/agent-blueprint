import { defineEval } from "eve/evals";
import { equals, includes } from "eve/evals/expect";
import { BODY_LINE, BRANCH, COMMIT_LINE, FEATURE, SETUP, outputs, readyFor, setupFor, stateLine, writeLine } from "./fixture/ship-loop";

// The ship loop on the scripted mock (KTD3 as ruled on 2026-10-29: one iteration per call). The
// root runs what instructions.md tells it: ship_pipeline, the brief to a helper in the role it
// names, publish_branch in stage mode when a stage finished, ship_pipeline again. Each helper copy
// runs its own script on the mock and writes state.json in the shared sandbox, as the skill would.
// publish_branch pushes to a bare repository in the sandbox (AB_EVAL_MOCK=1), with no token.
// The live ship cell, which runs the skill itself on the demo, is ship.eval.ts.
const mockCell = (description: string, test: Parameters<typeof defineEval>[0]["test"]) =>
  defineEval({
    description,
    tags: ["mock"],
    timeoutMs: 600_000,
    async test(t) {
      if (process.env.AB_EVAL_MOCK !== "1") throw new Error("mock-tagged evals need AB_EVAL_MOCK=1");
      return test(t);
    },
  });

const loop = mockCell("The loop: iterations brief copies by stage, a stage push, done claimed without a pull request body, then the ceiling with the branch pushed.", async (t) => {
  const turn = await t.send(
    [
      FEATURE,
      SETUP,
      "ship: 2",
      `brief: ${stateLine({ status: "running", stage: "execute" })}`,
      "publish: stage plan",
      "ship: 2",
      `brief: ${stateLine({ status: "done", stage: "ship" })}`,
      "ship: 2",
    ].join("\n"),
  );
  turn.expectOk();
  const ships = outputs(turn, "ship_pipeline");
  t.check(ships.length, equals(3)).label("three calls, one iteration each");

  // Iteration 1: no state file yet, Stage 0, a planner copy.
  turn.calledTool("ship_pipeline", { output: { outcome: "iterate", iteration: 1, ceiling: 2, stage: null, role: "planner" } });
  turn.calledTool("helper", { input: { role: "planner", prompt: /Ship loop iteration 1 of at most 2\. You work as the planner role, from Stage 0\./ } });
  turn.calledTool("helper", { input: { role: "planner" }, output: { status: "completed", reply: /state-execute-running/ } });
  turn.calledTool("publish_branch", { input: { mode: "stage", stage: "plan" }, output: { status: "pushed", stage: "plan", branch: BRANCH } });

  // Iteration 2: the tool read the copy's state.json, so the stage is execute and the copy a builder.
  turn.calledTool("ship_pipeline", { output: { outcome: "iterate", iteration: 2, stage: "execute", role: "builder" } });
  turn.calledTool("helper", { input: { role: "builder", prompt: /iteration 2 of at most 2\. You work as the builder role, from the execute stage\./ } });

  // Call 3: done claimed, but the run has no pull request body, so it is not done; the ceiling stops it.
  turn.calledTool("ship_pipeline", { output: { outcome: "ceiling", iteration: 3, stage: "ship", role: null, brief: null } });
  t.check(String(ships[2]?.reason), includes("reached its ceiling of 2 iterations without finishing, at the ship stage"));
  t.check(String(ships[2]?.reason), includes("is pushed at"));
  t.check((ships[2]?.push as { status?: string } | undefined)?.status, equals("pushed")).label("the stop pushed the branch");
  t.succeeded();
});

const doneRule = mockCell("The done rule: status done with no commits since the base is not done; with a commit and the body it is.", async (t) => {
  const turn = await t.send(
    [
      FEATURE,
      SETUP,
      "ship:",
      `brief: ${stateLine({ status: "done", stage: "ship" })};;${writeLine(".agent-blueprint/run/pr-body.md", "Adds a greeting script.\n", "body-written")}`,
      "ship:",
      `brief: ${COMMIT_LINE}`,
      "ship:",
    ].join("\n"),
  );
  turn.expectOk();
  const ships = outputs(turn, "ship_pipeline");
  turn.calledTool("ship_pipeline", { output: { outcome: "iterate", iteration: 2, stage: "ship", role: "documenter" } });
  t.check(String(ships[1]?.reason), includes("state.json says done, but no commits since the recorded base; not done"));
  t.check(String(ships[1]?.brief), includes("set status done, but no commits since the recorded base"));
  turn.calledTool("ship_pipeline", { output: { outcome: "done", iteration: 3, brief: null } });
  t.check(String(ships[2]?.reason), includes("publish_branch with mode pull-request"));
  turn.calledTool("publish_branch", { count: 0 });
  t.succeeded();
});

// Each crash: the iteration is counted, then the copy's turn fails (the provider refuses its model
// call), so the helper returns failed and the root calls the loop again. A failed root turn is not
// used: on Eve 0.86.0 it ends the session, and the record with it.
const crashes = mockCell("Two crashes mid-iteration count two iterations: the third call reaches a ceiling of two, the branch pushed.", async (t) => {
  const turn = await t.send([FEATURE, SETUP, "ship: 2", "brief: fail: 400", "ship: 2", "brief: fail: 400", "ship: 2"].join("\n"));
  turn.expectOk();
  turn.calledTool("helper", { input: { role: "planner" }, output: { status: "failed" }, count: 2 });
  const ships = outputs(turn, "ship_pipeline");
  t.check(ships.map((ship) => `${ship.iteration}:${ship.outcome}`), equals(["1:iterate", "2:iterate", "3:ceiling"]));
  t.check(String(ships[2]?.reason), includes("reached its ceiling of 2 iterations without finishing, at the first stage"));
  t.check((ships[2]?.push as { status?: string } | undefined)?.status, equals("pushed"));
  t.succeeded();
});

// An unattended run (the eval's service bearer under eve dev, as in gate.eval.ts): the skill takes
// a documented default and the loop records it; a question with no default stops as needs-human,
// the branch pushed, without asking anyone.
const trigger = { authorization: "Bearer eval-trigger" };
const DEFAULT_TAKEN = { stage: "plan", question: "Split the change into two pull requests?", choice: "one pull request", reason: "headless default" };
const unattended = mockCell("Unattended: a documented default is taken and recorded; a question with none stops as needs-human with the branch pushed.", async (t) => {
  const session = await t.session({ headers: trigger });
  const turn = await session.send(
    [
      FEATURE,
      SETUP,
      "ship:",
      `brief: ${stateLine({ status: "running", stage: "execute", decisions: [DEFAULT_TAKEN] })}`,
      "ship:",
      `brief: ${stateLine({ status: "needs-human", stage: "execute", reason: "Which log format should the script use? The skill documents no default.", decisions: [DEFAULT_TAKEN] })}`,
      "ship:",
    ].join("\n"),
    { headers: trigger },
  );
  turn.expectOk();
  const ships = outputs(turn, "ship_pipeline");
  turn.calledTool("ship_pipeline", { output: { outcome: "iterate", stage: "execute", posture: "unattended", defaults: [DEFAULT_TAKEN] } });
  turn.calledTool("ship_pipeline", { output: { outcome: "needs-human", stage: "execute", posture: "unattended", defaults: [] } });
  t.check(String(ships[2]?.reason), includes("the execute stage needs a person: Which log format"));
  t.check((ships[2]?.push as { status?: string } | undefined)?.status, equals("pushed"));
  turn.event("interaction.opened", { count: 0 });
  turn.event("turn.paused", { count: 0 });
  t.succeeded();
});

// Ruling 59: the first live Telegram run asked the person to approve three pull-request calls
// that could not succeed. A pull-request call with no body is denied by the approval policy with
// the done rule's reason, and nobody is asked; check mode reports the same reason with no approval;
// once the body is written, check answers ready (the real listing in this sandbox finds no
// straggler, its own included), and only then does the pull-request call ask the person.
const askOnlyWhenReady = mockCell("A pull request with no body is refused before anyone is asked; check reports it, then ready; only the ready call asks.", async (t) => {
  const session = await t.session();
  const turn = await session.send(
    [FEATURE, setupFor("ask-when-ready"), COMMIT_LINE, "publish: pull-request", "publish: check", BODY_LINE, "publish: check", "publish: pull-request"].join("\n"),
  );
  const publishes = turn.toolCalls.filter((call) => call.name === "publish_branch");
  t.log(`publish_branch calls: ${publishes.map((call) => JSON.stringify({ input: call.input, output: call.output })).join(" | ").slice(0, 2_000)}`);
  t.check(publishes.length, equals(4)).label("four publish_branch calls");
  const denied = JSON.stringify(publishes[0] ?? {});
  t.check(denied, includes("refused by the tool before publishing, not by the person")).label("the first pull-request call is denied by the tool");
  t.check(denied, includes(".agent-blueprint/run/pr-body.md is missing or empty")).label("with the done rule's reason");
  turn.calledTool("publish_branch", { input: { mode: "check" }, output: { status: "refused", reason: /pr-body\.md is missing or empty/ } });
  turn.calledTool("publish_branch", { input: { mode: "check" }, output: { status: "ready", branch: BRANCH } });
  turn.event("interaction.opened", { count: 1 });
  session.requireInteraction({ toolName: "publish_branch" });
});

// Ruling 60: each live run asked "Approve Publish branch?" for every pull-request call. Once the
// person approves one in a run, a later pull-request call of the same run (here the update of the
// pull request it opened) asks nobody; a denial asks again at the next call, and so does a new
// session, which is a new run. The GitHub REST calls go to the in-process stand-in under the mock.
const approveOnce = mockCell("One approval per run: the second pull-request call asks nobody; a denial or a new run asks again.", async (t) => {
  const first = await t.session();
  const asked = await first.send([FEATURE, ...readyFor("approve-once"), "publish: pull-request", "publish: pull-request"].join("\n"));
  asked.event("interaction.opened", { count: 1 });
  first.requireInteraction({ toolName: "publish_branch" });
  const approved = await first.respondAll("approve");
  approved.event("interaction.opened", { count: 0 });
  approved.event("turn.settled", { count: 1, data: { outcome: "completed" } });
  const results = [...outputs(asked, "publish_branch"), ...outputs(approved, "publish_branch")].filter((output) => output.status === "done");
  t.log(`approved run: ${JSON.stringify(results).slice(0, 1_000)}`);
  t.check(results.length, equals(2)).label("both pull-request calls ran");
  t.check(JSON.stringify(results[0]?.pullRequest ?? {}), includes('"reused":false')).label("the first call opened the pull request");
  t.check(JSON.stringify(results[1]?.pullRequest ?? {}), includes('"reused":true')).label("the second call updated it without asking");
  t.check(String(results[1]?.branch ?? ""), includes(BRANCH)).label("on the run's branch");

  const second = await t.session();
  const askedAgain = await second.send([FEATURE, ...readyFor("deny-resets"), "publish: pull-request", "publish: pull-request"].join("\n"));
  askedAgain.event("interaction.opened", { count: 1 });
  second.requireInteraction({ toolName: "publish_branch" });
  const denied = await second.respondAll("deny");
  denied.event("interaction.opened", { count: 1 });
  second.requireInteraction({ toolName: "publish_branch" });
  t.log(`after the denial: ${second.pendingInteractions.length} open approval(s)`);
});

export default [loop, doneRule, crashes, unattended, askOnlyWhenReady, approveOnce];
