// The roster's reasoning guard (prompt audit L6): "none" turns thinking off, which Claude Opus 5.5,
// Claude Sonnet 5.5 and the Fable models refuse with a 400, so an Anthropic role given "none" fails when
// the roster loads, naming the role and the variable, and a role on another vendor keeps it. The presets
// themselves never use it.
import assert from "node:assert/strict";
import { describe, test } from "node:test";

const { PRESETS, ROLES, resolveRole, resolveRoster } = await import("../agent/lib/roster.ts");

describe("reasoning none", () => {
  test("is refused for an Anthropic role at load, with the role, the model and the variable to change", () => {
    for (const [role, model] of [["lead", "anthropic/claude-opus-5.5"], ["tester", "anthropic/claude-sonnet-5.5"], ["documenter", "anthropic/claude-haiku-5.5"]] as const) {
      const key = role.toUpperCase();
      assert.throws(
        () => resolveRole(role, { [`AB_REASONING_${key}`]: "none" }),
        (error: Error) =>
          error.message.includes(`role "${role}"`) && error.message.includes(model) && error.message.includes(`AB_REASONING_${key}`) && /minimal or low/.test(error.message),
        role,
      );
    }
  });

  test("is refused when a model override moves a role onto Anthropic, and when the roster resolves every role", () => {
    assert.throws(() => resolveRole("reviewer", { AB_MODEL_REVIEWER: "anthropic/claude-fable-5.2", AB_REASONING_REVIEWER: "none" }), /AB_REASONING_REVIEWER/);
    assert.throws(() => resolveRoster({ AB_REASONING_PLANNER: " none " }), /role "planner"/);
  });

  test("stays allowed for a role on another vendor", () => {
    assert.equal(resolveRole("reviewer", { AB_REASONING_REVIEWER: "none" }).reasoning, "none");
    assert.equal(resolveRole("lead", { AB_ROSTER: "budget", AB_REASONING_LEAD: "none" }).reasoning, "none");
  });

  test("the other levels still pass on Anthropic, and no preset role uses none", () => {
    for (const level of ["provider-default", "minimal", "low", "medium", "high", "xhigh"]) {
      assert.equal(resolveRole("lead", { AB_REASONING_LEAD: level }).reasoning, level);
    }
    for (const preset of Object.values(PRESETS)) {
      for (const role of ROLES) assert.notEqual(preset.roles[role].reasoning, "none", role);
    }
  });
});
