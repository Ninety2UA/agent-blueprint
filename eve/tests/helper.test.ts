// The helper tool's error path (R6) with a stubbed ctx.agent: no Gateway, no model call. Eve
// refuses a model its Gateway catalog does not list by throwing from ctx.agent before any call;
// the tool returns that as a failed result naming the role and its variable.
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { describe, test } from "node:test";

// The agent's modules import each other without extensions, as Eve's bundler wants; Node needs them.
registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (error) {
      if (specifier.startsWith(".")) return next(`${specifier}.ts`, context);
      throw error;
    }
  },
});
const { default: helper } = await import("../agent/tools/helper.ts");
type Execute = (input: { prompt: string; role: string }, ctx: unknown) => Promise<Record<string, unknown>>;
const execute = (helper as unknown as { execute: Execute }).execute;

// The quality preset's reviewer, refused here by the stub as Eve refuses an id its catalog lacks.
const REVIEWER = "openai/gpt-6-astra";
const CATALOG_ERROR = `Cannot select model "${REVIEWER}" because the AI Gateway model catalog this build read has no context window for it.`;

class FatalError extends Error {
  override name = "FatalError";
}

function context(agent: (name: string, options?: unknown) => unknown) {
  return { agent, abortSignal: new AbortController().signal, session: { id: "sess_helper" } };
}

describe("helper error path", () => {
  test("a model the catalog does not list: failed, the role and AB_MODEL_<ROLE> named, nothing thrown", async () => {
    const opened: unknown[] = [];
    const previous = process.env.AB_MODEL_REVIEWER;
    delete process.env.AB_MODEL_REVIEWER;
    try {
      const result = await execute(
        { prompt: "Review the diff.", role: "reviewer" },
        context((name, options) => {
          opened.push({ name, options });
          throw new FatalError(CATALOG_ERROR);
        }),
      );
      assert.equal(result.status, "failed");
      assert.equal(result.role, "reviewer");
      assert.equal(result.model, REVIEWER);
      assert.equal(result.reply, null);
      assert.match(String(result.error), /Roster role "reviewer" runs on "openai\/gpt-6-astra"/);
      assert.match(String(result.error), /AB_MODEL_REVIEWER/);
      assert.match(String(result.error), /No other model was tried/);
      assert.match(String(result.error), /Cannot select model/);
      assert.equal(opened.length, 1, "one selection, no second model");
    } finally {
      if (previous !== undefined) process.env.AB_MODEL_REVIEWER = previous;
    }
  });

  test("a turn that ends failed keeps the same shape", async () => {
    const result = await execute(
      { prompt: "Write the tests.", role: "tester" },
      context(() => ({
        send: async () => ({ result: async () => ({ status: "failed", error: { message: "Model not found" } }) }),
      })),
    );
    assert.equal(result.status, "failed");
    assert.equal(result.role, "tester");
    assert.match(String(result.error), /AB_MODEL_TESTER/);
  });

  test("a completed turn returns the reply and no error", async () => {
    const result = await execute(
      { prompt: "Write the tests.", role: "tester" },
      context(() => ({ send: async () => ({ result: async () => ({ status: "completed", reply: "done" }) }) })),
    );
    assert.deepEqual({ status: result.status, reply: result.reply, error: result.error }, { status: "completed", reply: "done", error: null });
  });
});
