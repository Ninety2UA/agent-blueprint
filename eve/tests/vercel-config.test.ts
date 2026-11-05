// vercel.ts against the two ways it can refuse a deploy: as the CLI compiles it, and as Vercel
// reads its source before a Git deployment builds, which the deploy button depends on.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("the source names no eve service, which Vercel would read as having no root", () => {
  const source = readFileSync(new URL("../vercel.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source.replace(/^\s*\/\/.*$/gm, ""), /\beve\s*:/);
});

test("the composed config roots both services and runs the skill count gate first", async () => {
  const { default: config } = await import("../vercel.ts");
  assert.equal(config.services.web.root, "apps/web");
  assert.equal(config.services.eve.root, ".eve/vercel-services/eve");
  assert.match(config.services.eve.buildCommand, /^node \.\.\/\.\.\/\.\.\/scripts\/check-skill-count\.mjs && /);
});
