import { defineEval } from "eve/evals";
import { includes, satisfies } from "eve/evals/expect";
import { resolveRole } from "../agent/lib/roster";

// Ruling 50: every helper starts through the roster's helper tool, so each role runs on its roster
// model. agent.ts sets tool: false, so the root is offered helper and not Eve's built-in agent tool
// (a root copy on the lead's model), and helper still opens its root copy through ctx.agent("agent").
// On the scripted mock: the tools: step replies with the names the root's model call was offered.
export default defineEval({
  description: "Ruling 50: the root is offered helper and not Eve's built-in agent tool, and a helper still starts on its role's model.",
  tags: ["mock"],
  async test(t) {
    if (process.env.AB_EVAL_MOCK !== "1") throw new Error("mock-tagged evals need AB_EVAL_MOCK=1");
    const offered = await t.send("tools:");
    offered.expectOk();
    const names = (offered.reply ?? "").split("\n").map((name) => name.trim());
    t.log(`root tools: ${names.join(", ")}`);
    t.check(names, satisfies((list: string[]) => list.includes("helper"), "helper is offered")).label("the root is offered helper");
    t.check(names, satisfies((list: string[]) => !list.includes("agent"), "agent is not offered")).label("the root is not offered Eve's built-in agent tool");

    const started = await offered.session.send("helper: reviewer bash: echo reviewed-by-helper");
    started.expectOk();
    started.calledTool("helper", {
      input: { role: "reviewer" },
      output: { role: "reviewer", model: resolveRole("reviewer").model, status: "completed" },
    });
    t.check(started.reply ?? "", includes("reviewed-by-helper")).label("the helper's root copy ran its step");
    t.succeeded();
  },
});
