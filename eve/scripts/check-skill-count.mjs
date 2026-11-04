#!/usr/bin/env node
// check-skill-count.mjs: the skill count gate (KTD1). Eve's discovered skills plus the
// manual-only skills its resolver serves must equal skills/*/SKILL.md, name for name,
// so a dangling module or an excluded folder never builds or deploys silently.
// Usage: node scripts/check-skill-count.mjs   Exit: 0 = counts agree, 1 = they differ
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const EVE = dirname(dirname(fileURLToPath(import.meta.url)));
const SKILLS = join(EVE, "..", "skills");

function fail(message) {
  console.error(`check-skill-count: ${message}`);
  process.exit(1);
}

function isManualOnly(name) {
  const text = readFileSync(join(SKILLS, name, "SKILL.md"), "utf8");
  const frontmatter = /^---\n([\s\S]*?)\n---\n/.exec(text)?.[1] ?? "";
  return /^disable-model-invocation:\s*true\s*$/m.test(frontmatter);
}

const folders = readdirSync(SKILLS, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(join(SKILLS, entry.name, "SKILL.md")))
  .map((entry) => entry.name)
  .sort();
const manualOnly = folders.filter(isManualOnly);
const expected = new Set(folders.filter((name) => !manualOnly.includes(name)));

let info;
try {
  const out = execFileSync(join(EVE, "node_modules", ".bin", "eve"), ["info", "--json"], {
    cwd: EVE,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  info = JSON.parse(out);
} catch (error) {
  fail(`eve info failed, so no skill count could be read\n${error.stderr ?? error.message}`);
}
if (info.status !== "ready") fail(`eve info status is ${info.status}: ${JSON.stringify(info.diagnostics)}`);

const discovered = new Set(info.skills);
const missing = [...expected].filter((name) => !discovered.has(name));
const extra = [...discovered].filter((name) => !expected.has(name));
const total = discovered.size + manualOnly.length;
if (missing.length || extra.length || total !== folders.length) {
  fail(
    [
      `Eve sees ${discovered.size} skills plus ${manualOnly.length} manual-only, skills/ has ${folders.length}`,
      missing.length ? `not discovered: ${missing.join(", ")}` : "",
      extra.length ? `discovered without a skills/ folder, or manual-only: ${extra.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  );
}
console.log(
  `check-skill-count: ${total} skills: ${discovered.size} discovered by Eve plus ${manualOnly.length} manual-only (${manualOnly.join(", ")}); skills/ has ${folders.length}`,
);
