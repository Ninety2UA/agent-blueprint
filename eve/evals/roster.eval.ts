import { defineEval } from "eve/evals";
import { equals, includes } from "eve/evals/expect";
import { PRESETS, ROLES, preset, resolveRole, resolveRoster, rosterModelError } from "../agent/lib/roster";

// The resolver runs here in the runner with an explicit environment, so each case sets its own
// variables. A turn on a real roster model needs Gateway credits; the notes give that command.
const CACHING = { providerOptions: { gateway: { caching: "auto" } } };

function thrown(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return "nothing thrown";
}

export default defineEval({
  description: "The roster resolves every role from either preset, one override changes one role, and failures name the role and the id.",
  tags: ["mock"],
  async test(t) {
    if (process.env.AB_EVAL_MOCK !== "1") throw new Error("mock-tagged evals need AB_EVAL_MOCK=1");
    const quality = resolveRoster({ AB_ROSTER: "quality" });
    t.check(quality.lead, equals({ role: "lead", model: "anthropic/claude-opus-5.5", reasoning: "high", modelOptions: CACHING }));
    t.check(quality.reviewer, equals({ role: "reviewer", model: "openai/gpt-6-astra", reasoning: "high" }));
    for (const role of ROLES) {
      if (quality[role].model.startsWith("anthropic/")) {
        t.check(quality[role].modelOptions, equals(CACHING)).label(`${role} carries the Gateway caching option`);
      }
    }
    t.check(resolveRoster({}), equals(quality)).label("an unset AB_ROSTER is the quality preset");

    const override = resolveRoster({ AB_ROSTER: "quality", AB_MODEL_REVIEWER: "openai/gpt-6-luna-fast" });
    t.check(override.reviewer, equals({ role: "reviewer", model: "openai/gpt-6-luna-fast", reasoning: "high" }));
    for (const role of ROLES.filter((name) => name !== "reviewer")) {
      t.check(override[role], equals(quality[role])).label(`${role} unchanged by AB_MODEL_REVIEWER`);
    }
    t.check(resolveRole("tester", { AB_REASONING_TESTER: "low" }), equals({ ...quality.tester, reasoning: "low" }));
    t.check(resolveRole("tester", { AB_MODEL_TESTER: "" }), equals(quality.tester)).label("an empty override is unset");

    const unserved = rosterModelError(
      resolveRole("reviewer", { AB_MODEL_REVIEWER: "acme/unserved-model" }),
      new Error("Model acme/unserved-model not found"),
    ).message;
    t.check(unserved, includes('role "reviewer"'));
    t.check(unserved, includes('"acme/unserved-model"'));
    t.check(unserved, includes("AB_MODEL_REVIEWER"));

    const budget = resolveRoster({ AB_ROSTER: "budget" });
    const glm = "zai/glm-5.3";
    const flash = "deepseek/deepseek-v4.1-flash-1017";
    t.check(budget, equals({
      lead: { role: "lead", model: glm, reasoning: "high" },
      planner: { role: "planner", model: glm, reasoning: "high" },
      builder: { role: "builder", model: glm, reasoning: "high" },
      reviewer: { role: "reviewer", model: flash, reasoning: "xhigh" },
      tester: { role: "tester", model: flash, reasoning: "high" },
      analyst: { role: "analyst", model: flash, reasoning: "high" },
      documenter: { role: "documenter", model: flash, reasoning: "high" },
    })).label("AB_ROSTER=budget resolves every role to the budget preset");
    t.check(preset({ AB_ROSTER: "budget" }).sessionInputTokens, equals(PRESETS.quality.sessionInputTokens))
      .label("budget keeps the quality preset's session input token limit");
    const budgetOverride = resolveRoster({ AB_ROSTER: "budget", AB_MODEL_LEAD: "anthropic/claude-opus-5.5", AB_REASONING_REVIEWER: "medium" });
    t.check(budgetOverride.lead, equals({ role: "lead", model: "anthropic/claude-opus-5.5", reasoning: "high", modelOptions: CACHING }))
      .label("AB_MODEL_LEAD applies on top of budget");
    t.check(budgetOverride.reviewer, equals({ ...budget.reviewer, reasoning: "medium" })).label("AB_REASONING_REVIEWER applies on top of budget");
    for (const role of ROLES.filter((name) => name !== "lead" && name !== "reviewer")) {
      t.check(budgetOverride[role], equals(budget[role])).label(`${role} unchanged by the budget overrides`);
    }

    const unknown = thrown(() => resolveRoster({ AB_ROSTER: "cheap" }));
    t.check(unknown, includes('AB_ROSTER is "cheap"'));
    t.check(unknown, includes("quality")).label("an unknown preset names quality");
    t.check(unknown, includes("budget")).label("an unknown preset names budget");
    t.check(thrown(() => resolveRole("builder", { AB_MODEL_BUILDER: "opus" })), includes('role "builder"'));
    t.check(thrown(() => resolveRole("builder", { AB_MODEL_BUILDER: "opus" })), includes('"opus"'));
    t.check(thrown(() => resolveRole("analyst", { AB_REASONING_ANALYST: "max" })), includes('role "analyst"'));
  },
});
