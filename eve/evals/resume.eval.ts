import { defineEval } from "eve/evals";
import { equals, includes } from "eve/evals/expect";
import { BRANCH, FEATURE, SETUP, outputs, stateLine, writeLine } from "./fixture/ship-loop";

// AE2 through the loop, on the scripted mock: the plan stage is pushed with its run files, the
// workspace loses the branch and every run file, and the next message restores them through
// publish_branch's restore mode, after which ship_pipeline continues at execute with a builder copy
// and no planner copy runs again. The bare repository publish_branch pushes to under AB_EVAL_MOCK=1
// lives in the sandbox's /tmp, so the loss is made by wiping the workspace's clone state, not by a
// new sandbox; tests/publish.test.ts restores into a fresh clone.
const PROVENANCE = JSON.stringify({ skill: "ab-ship-pipeline", version: "4.2.1", started_at: "2026-10-29T10:00:00Z", helper_steps: [] });

export default defineEval({
  description: "AE2: after the plan stage is pushed and the workspace is lost, restore brings back the run files and the loop continues at execute.",
  tags: ["mock"],
  timeoutMs: 600_000,
  async test(t) {
    if (process.env.AB_EVAL_MOCK !== "1") throw new Error("mock-tagged evals need AB_EVAL_MOCK=1");
    const session = await t.session();

    const plan = await session.send(
      [
        FEATURE,
        SETUP,
        "ship:",
        "brief: " +
          [
            "bash: mkdir -p docs/plans && echo '# Greeting plan' > docs/plans/greeting.md && echo plan-written",
            writeLine(".agent-blueprint/run/pr-body.md", "Adds a greeting script.\n", "body-written"),
            writeLine(".agent-blueprint/run/provenance/ab-ship-pipeline.json", `${PROVENANCE}\n`, "provenance-written"),
            writeLine(".agent-blueprint/team/ledger.md", "- plan: done\n", "ledger-written"),
            stateLine({ status: "running", stage: "execute" }),
          ].join(";;"),
        "publish: stage plan",
      ].join("\n"),
    );
    plan.expectOk();
    plan.calledTool("helper", { input: { role: "planner" }, output: { status: "completed" } });
    plan.calledTool("publish_branch", { input: { mode: "stage", stage: "plan" }, output: { status: "pushed", stage: "plan", branch: BRANCH } });
    const pushed = String(outputs(plan, "publish_branch")[0]?.sha ?? "");

    // The workspace loses the branch, the plan and every run file.
    const lost = await session.send(
      "bash: git checkout -q main && git branch -D work >/dev/null && git branch --list 'ab/*' | xargs -r git branch -D >/dev/null; rm -rf .agent-blueprint/run .agent-blueprint/team; ls docs/plans .agent-blueprint/run 2>&1; echo lost",
    );
    lost.calledTool("bash", { output: /No such file or directory[\s\S]*No such file or directory[\s\S]*lost/ });

    const resumed = await session.send(
      ["publish: restore", "ship:", "brief: read_file: .agent-blueprint/run/state.json;;read_file: docs/plans/greeting.md;;read_file: .agent-blueprint/team/ledger.md"].join("\n"),
    );
    resumed.expectOk();
    resumed.calledTool("publish_branch", {
      input: { mode: "restore" },
      output: {
        status: "resumed",
        stage: "plan",
        branch: BRANCH,
        head: pushed,
        checkpoint: "none",
        files: [
          ".agent-blueprint/run/pr-body.md",
          ".agent-blueprint/run/provenance/ab-ship-pipeline.json",
          ".agent-blueprint/run/state.json",
          ".agent-blueprint/team/ledger.md",
        ],
      },
    });
    // The loop reads the restored state.json: execute, a builder, no planner copy again.
    resumed.calledTool("ship_pipeline", { output: { outcome: "iterate", iteration: 2, stage: "execute", role: "builder" } });
    resumed.calledTool("helper", { input: { role: "builder" }, output: { status: "completed" } });
    resumed.calledTool("helper", { input: { role: "planner" }, count: 0 });
    const reply = String(outputs(resumed, "helper")[0]?.reply ?? "");
    t.check(reply, includes(/stage\W+execute/)).label("the copy read the restored state.json");
    t.check(reply, includes("# Greeting plan")).label("the copy read the plan from the pushed branch");
    t.check(reply, includes("- plan: done")).label("the copy read the restored ledger");
    t.check(pushed.length, equals(40)).label("the plan stage's push named its commit");
    t.succeeded();
  },
});
