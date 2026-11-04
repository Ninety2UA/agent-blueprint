import { defineEval } from "eve/evals";
import { equals, satisfies } from "eve/evals/expect";
import { evalRemote } from "../agent/lib/eval-remote";
import { answerCheckpoints, cellPrompt, runCheck, seedCell, skipLive, standInPush } from "./fixture/smoke-cell";

// Live smoke cell (KTD15): ab-build-pipeline on the smoke fixture, on local Docker. It passes as
// the CLI cell does: scenarios/build/check.sh (the hidden acceptance test in a venv built from the
// declared dependencies, and a commit after the base) and the skill's provenance record. It also
// measures the prompt cache: every Anthropic call after the first reads from it. With
// AB_EVAL_REMOTE=sandbox (ruling 50(b)) the fixture has a stand-in origin, and the cell checks that a
// stage push through publish_branch reached it.
const SKILL = "ab-build-pipeline";

type Fact = { type: string; data?: object };

// The cache reads of the session's own Anthropic model calls, in call order.
function anthropicCacheReads(events: readonly Fact[]): number[] {
  const models = new Map<string, string>();
  const reads: number[] = [];
  for (const event of events) {
    const data = (event.data ?? {}) as Record<string, unknown>;
    if (event.type === "model.started") models.set(String(data.runId), String(data.modelId ?? ""));
    if (event.type !== "usage.recorded") continue;
    const owner = (data.owner ?? {}) as { runId?: string };
    if (!owner.runId || !models.get(owner.runId)?.startsWith("anthropic/")) continue;
    reads.push(Number((data.usage as { cacheReadTokens?: number } | undefined)?.cacheReadTokens ?? 0));
  }
  return reads;
}

export default defineEval({
  description: "Build: ab-build-pipeline implements the fixture's export-table plan, the acceptance test passes and the work is committed.",
  tags: ["live"],
  timeoutMs: 3_600_000,
  async test(t) {
    if (skipLive(t, "docker", "npx eve eval build (in eve/, AI_GATEWAY_API_KEY set, AB_EVAL_MOCK unset, Docker running)")) return;
    const session = await t.session();
    const seeded = await seedCell(session, "build");
    const { turn } = await answerCheckpoints(await session.send(cellPrompt("build")));

    t.calledSkill(SKILL);
    const check = await runCheck(session, seeded, turn.reply ?? "");
    t.check(check.reason, satisfies(() => check.ok, "scenarios/build/check.sh passes")).label("build check");
    t.check(check.provenance, equals(true)).label(`.agent-blueprint/run/provenance/${SKILL}.json exists`);

    if (evalRemote() === "sandbox") {
      const pushed = await standInPush(session);
      t.log(`stand-in remote: ab/ branches ${pushed.branches.join(", ") || "none"}; publish_branch stage calls settled pushed: ${pushed.stagePushes}`);
      t.check(pushed, satisfies((value: typeof pushed) => value.branches.length > 0 && value.stagePushes > 0, "an ab/ branch on the stand-in and a stage call settled pushed"))
        .label("a stage push reached the stand-in remote");
    }

    const reads = anthropicCacheReads(session.events);
    t.log(`Anthropic calls: ${reads.length}; cache reads per call: ${reads.join(", ")}`);
    if (reads.length > 1) {
      t.check(reads.slice(1).filter((value) => value === 0).length, equals(0)).label("cache reads above zero on every Anthropic call after the first");
    }
    t.succeeded();
  },
});
