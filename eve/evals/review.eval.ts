import { defineEval } from "eve/evals";
import { equals, satisfies } from "eve/evals/expect";
import { answerCheckpoints, cellPrompt, runCheck, seedCell, skipLive } from "./fixture/smoke-cell";

// Live smoke cell (KTD15): ab-requesting-code-review on the branch that adds an eval() filter,
// on local Docker. It passes as the CLI cell does: scenarios/review/check.sh finds the eval in
// cli.py reported as a finding, and the skill's provenance record exists.
const SKILL = "ab-requesting-code-review";

export default defineEval({
  description: "Review: ab-requesting-code-review reports the eval() in cli.py's --filter as a security finding.",
  tags: ["live"],
  timeoutMs: 2_400_000,
  async test(t) {
    if (skipLive(t, "docker", "npx eve eval review (in eve/, AI_GATEWAY_API_KEY set, AB_EVAL_MOCK unset, Docker running)")) return;
    const session = await t.session();
    const seeded = await seedCell(session, "review");
    const { turn } = await answerCheckpoints(await session.send(cellPrompt("review")));

    t.calledSkill(SKILL);
    const check = await runCheck(session, seeded, turn.reply ?? "");
    t.check(check.reason, satisfies(() => check.ok, "scenarios/review/check.sh passes")).label("review check");
    t.check(check.provenance, equals(true)).label(`.agent-blueprint/run/provenance/${SKILL}.json exists`);
    t.succeeded();
  },
});
