import { defineAgent } from "eve";
import { preset, resolveRole } from "./lib/roster";
import { scriptedMockModel } from "./lib/mock-model";
import { workflowWorld } from "./lib/workflow-world";

// The root runs on the roster's lead (KTD8), read at build: a change to AB_ROSTER,
// AB_MODEL_LEAD or AB_REASONING_LEAD takes effect at the next build or deploy.
// AB_EVAL_MOCK=1 swaps in the scripted mock model for mock-tagged evals.
const lead = resolveRole("lead");
const { sessionInputTokens } = preset();

// Eve's defaults, written out so they sit beside the roster's budget.
const limits = {
  sessionUsage: ({ window }: { window: { inputTokens: number; cacheReadTokens: number } }) =>
    window.inputTokens - window.cacheReadTokens >= sessionInputTokens,
  sessionTimeoutMs: 30 * 24 * 60 * 60 * 1_000,
};
const compaction = { thresholdPercent: 0.9 };
// Eve puts the description in front of agent_start's own for MCP clients (KTD11, A8): relay every
// checkpoint to the person, and never start a second run after a lost reply without asking.
const description =
  "Agent Blueprint works on one GitHub repository and takes a feature request through planning, building and review to a draft pull request. It asks questions at checkpoints and asks before it opens a pull request. Show each question and approval to your user and send back their answer. If agent_start times out or its reply is lost, ask your user before you call it again.";
// Eve's bundler breaks a package-relative import inside @daytona/sdk; kept external and traced.
const build = { externalDependencies: ["@daytona/sdk"] };
// WORKFLOW_TARGET_WORLD, read at build, selects an installed world (Railway: @workflow/world-postgres);
// unset keeps Eve's default, Vercel Workflow on Vercel and the local world elsewhere. The Postgres
// world loads through lib/postgres-world.ts, which adds the queue route's delivery proof (ruling 83).
const world = workflowWorld();
const experimental = world ? { experimental: { workflow: { world } } } : {};
// Ruling 50: every helper starts through the roster's helper tool, so each role runs on its roster
// model. tool: false drops Eve's model-facing built-in agent tool (a root copy on the lead's model);
// the helper tool still opens the same root copy through ctx.agent("agent", { model }).
const tool = false;

export default defineAgent(
  process.env.AB_EVAL_MOCK === "1"
    ? { description, model: scriptedMockModel(), tool, limits, compaction, build, ...experimental }
    : {
        description,
        model: lead.model,
        reasoning: lead.reasoning,
        ...(lead.modelOptions ? { modelOptions: lead.modelOptions } : {}),
        tool,
        limits,
        compaction,
        build,
        ...experimental,
      },
);
