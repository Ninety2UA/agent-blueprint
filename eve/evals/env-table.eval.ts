import { readFileSync } from "node:fs";
import { join } from "node:path";
import { defineEval } from "eve/evals";
import { equals } from "eve/evals/expect";
import { parseVariableTable, VARIABLES } from "../agent/lib/env";

// eve eval runs from the app root, so the README is read from cwd.
const readme = readFileSync(join(process.cwd(), "README.md"), "utf8");

export default defineEval({
  description: "The variable table in eve/README.md parses into the list agent/lib/env.ts exports.",
  tags: ["mock"],
  async test(t) {
    if (process.env.AB_EVAL_MOCK !== "1") throw new Error("mock-tagged evals need AB_EVAL_MOCK=1");
    const table = parseVariableTable(readme);
    t.check(table.map((row) => row.name), equals(VARIABLES.map((row) => row.name))).label("the same names in the same order");
    for (const variable of VARIABLES) {
      t.check(table.find((row) => row.name === variable.name), equals(variable)).label(variable.name);
    }
    for (const variable of VARIABLES.filter((row) => row.sensitive)) {
      t.check(variable.default, equals(null)).label(`${variable.name} is sensitive and has no default`);
    }
    for (const variable of VARIABLES.filter((row) => !row.prompts.includes("never"))) {
      t.check(Boolean(variable.description && variable.link), equals(true)).label(`${variable.name} has a description and a link`);
    }
  },
});
