import { readFileSync } from "node:fs";
import { join } from "node:path";
import { defineEval } from "eve/evals";
import { answerCheckpoints } from "./fixture/smoke-cell";

// The first heading of skills/ab-brainstorming/SKILL.md, read from the tree the agent loads.
// eve eval runs from the app root and evaluates this file from a bundle, so the path starts at cwd.
const skillMd = readFileSync(join(process.cwd(), "..", "skills", "ab-brainstorming", "SKILL.md"), "utf8");
const heading = /^# .+$/m.exec(skillMd)?.[0];
if (!heading) throw new Error("skills/ab-brainstorming/SKILL.md has no first heading");

function text(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value ?? "");
}

export default defineEval({
  description: "A skill named by the user loads from the committed tree, with its sibling files in the sandbox.",
  tags: ["mock"],
  async test(t) {
    if (process.env.AB_EVAL_MOCK !== "1") throw new Error("mock-tagged evals need AB_EVAL_MOCK=1");
    const load = await t.send("skill: ab-brainstorming");
    load.calledSkill("ab-brainstorming", { output: (output) => text(output).startsWith(heading) });

    const files = await t.send(
      [
        "bash: ls $HOME/.agents/skills/ab-ship-pipeline/scripts/",
        "bash: bash $HOME/.agents/skills/ab-ship-pipeline/scripts/scan-secrets.sh --help",
        "read_file: $HOME/.agents/skills/ab-requesting-code-review/references/agents/code-reviewer.md",
      ].join("\n"),
    );
    files.calledTool("bash", { input: { command: /^ls / }, output: /scan-secrets\.sh/ });
    files.calledTool("bash", { input: { command: /--help$/ }, output: /Usage: scan-secrets\.sh/ });
    files.calledTool("read_file", { output: /# Code Reviewer/ });
    // Against a deployment the model is live: it reports in its own words and may end on a question,
    // so the read_file output carries the proof and any question is answered (ruling 97).
    await answerCheckpoints(files);
    t.succeeded();
  },
});
