import { defineEval } from "eve/evals";
import { equals, satisfies } from "eve/evals/expect";
import { STAND_IN_REPOSITORY, seedCell, standInPush } from "./fixture/smoke-cell";

// Ruling 50(b) on the scripted mock: the build cell's seed with the stand-in remote gives the
// fixture a github.com-shaped origin and the bare repository publish_branch pushes to in an eval,
// and the build cell's gate (standInPush) sees a stage push land there. The live cell takes the
// same path with AB_EVAL_REMOTE=sandbox; the mock reaches it through AB_EVAL_MOCK=1.
export default defineEval({
  description: "Ruling 50(b): the smoke fixture's stand-in origin takes a publish_branch stage push, and the build cell's gate sees it.",
  tags: ["mock"],
  timeoutMs: 600_000,
  async test(t) {
    if (process.env.AB_EVAL_MOCK !== "1") throw new Error("mock-tagged evals need AB_EVAL_MOCK=1");
    const session = await t.session();
    await seedCell(session, "build", {}, true);
    const turn = await session.send(
      ["Add the export table", "bash: git remote get-url origin && git rev-parse --abbrev-ref HEAD", "publish: stage plan"].join("\n"),
    );
    turn.expectOk();
    turn.calledTool("bash", { output: new RegExp(`github\\.com/${STAND_IN_REPOSITORY}\\.git[\\s\\S]*smoke/build`) });
    turn.calledTool("publish_branch", { input: { mode: "stage", stage: "plan" }, output: { status: "pushed", stage: "plan" } });

    const pushed = await standInPush(session);
    t.log(`stand-in remote: ab/ branches ${pushed.branches.join(", ") || "none"}; stage calls settled pushed: ${pushed.stagePushes}`);
    t.check(pushed.stagePushes, equals(1)).label("one publish_branch stage call settled pushed");
    t.check(pushed, satisfies((value: typeof pushed) => value.branches.length > 0 && value.stagePushes > 0, "an ab/ branch on the stand-in and a stage call settled pushed"))
      .label("a stage push reached the stand-in remote");
    t.succeeded();
  },
});
