// The Railway Dockerfile's build arguments (KTD12, ruling 77). BuildKit prints each RUN step's
// command with every "$NAME" of a build argument expanded, so a RUN line that names the Daytona key
// writes the key into the build log (seen in the 2026-11-03 rehearsal). A build argument declared
// with ARG already reaches the RUN commands after it as an environment variable.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { workflowWorld } from "../agent/lib/workflow-world.ts";
import { preset, resolveRole } from "../agent/lib/roster.ts";

const dockerfile = readFileSync(new URL("../Dockerfile", import.meta.url), "utf8");
// Instructions with their continuation lines joined, comments left out.
const instructions = dockerfile
  .replace(/\\\n/g, " ")
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#"));
const buildStage = instructions.slice(0, instructions.findIndex((line, i) => i > 0 && line.startsWith("FROM ")));

// The variables agent.ts reads while eve build evaluates it: its own process.env reads, plus those of the
// roster and world calls it makes at module level, recorded by making the same calls on a recording env.
// AB_EVAL_MOCK is left out: it switches the mocked evals and the local rehearsal image, never a deploy.
const agentSource = readFileSync(new URL("../agent/agent.ts", import.meta.url), "utf8");
function agentBuildVariables(): string[] {
  const read = new Set<string>();
  for (const [, name] of agentSource.matchAll(/process\.env\.([A-Z0-9_]+)/g)) read.add(name);
  const saved = process.env;
  process.env = new Proxy({} as NodeJS.ProcessEnv, { get: (_env, name) => void (typeof name === "string" && read.add(name)) });
  try {
    for (const [, role] of agentSource.matchAll(/resolveRole\("([a-z]+)"\)/g)) resolveRole(role as never);
    if (/\bpreset\(\)/.test(agentSource)) preset();
    if (/\bworkflowWorld\(\)/.test(agentSource)) workflowWorld();
  } finally {
    process.env = saved;
  }
  read.delete("AB_EVAL_MOCK");
  return [...read];
}
// The build also needs the Daytona key, and the MCP channel reads its OAuth settings then (agent/channels).
const BUILD_ARGS = [...agentBuildVariables(), "DAYTONA_API_KEY", "AB_MCP_OAUTH_ISSUER", "AB_MCP_OAUTH_SUBJECTS", "AB_MCP_OAUTH_RESOURCE"];

test("the build variables agent.ts reads are all found", () => {
  for (const name of ["AB_ROSTER", "AB_MODEL_LEAD", "AB_REASONING_LEAD", "WORKFLOW_TARGET_WORLD"]) {
    assert.ok(BUILD_ARGS.includes(name), name);
  }
});

test("the build stage declares every build argument before the build runs", () => {
  const buildAt = buildStage.findIndex((line) => /^RUN .*npm run build/.test(line));
  assert.ok(buildAt > 0, "the build stage runs npm run build");
  for (const name of BUILD_ARGS) {
    const declaredAt = buildStage.indexOf(`ARG ${name}`);
    assert.ok(declaredAt >= 0 && declaredAt < buildAt, `ARG ${name} comes before the build`);
  }
});

test("no RUN line expands a build argument, so the build log never shows a value", () => {
  for (const line of instructions.filter((l) => l.startsWith("RUN "))) {
    for (const name of BUILD_ARGS) assert.doesNotMatch(line, new RegExp(`\\$\\{?${name}\\b`), line);
  }
});

// Railway stops the old container with SIGTERM. Under `npm start`, npm takes the signal, exits 143 and
// leaves eve's server running, so Railway marks every replaced deployment CRASHED (2026-11-03). eve start
// traps SIGTERM, stops its server and exits 0, so the image runs it as PID 1 in exec form.
test("the image starts eve itself in exec form, so SIGTERM reaches it", () => {
  const cmd = instructions.filter((line) => line.startsWith("CMD ")).at(-1) ?? "";
  const argv = JSON.parse(cmd.slice("CMD ".length)) as string[];
  assert.deepEqual(argv.slice(0, 3), ["node", "node_modules/eve/bin/eve.js", "start"], cmd);
});
