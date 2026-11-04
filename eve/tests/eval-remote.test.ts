// The eval-only stand-in remote switch (ruling 50(b)): AB_EVAL_REMOTE=sandbox works only inside a
// local eve eval and is refused, with a throw and never a fall back to GitHub, on the demo and on Vercel.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { evalRemote, evalRemoteUrl } from "../agent/lib/eval-remote.ts";

const EVAL = { AB_EVAL_REMOTE: "sandbox", EVE_EVALUATION: "1" };

describe("evalRemote (ruling 50(b))", () => {
  test("unset: a real run, the App token and github.com", () => {
    assert.equal(evalRemote({}), null);
    assert.equal(evalRemote({ AB_EVAL_REMOTE: " " }), null);
  });

  test("AB_EVAL_MOCK=1 keeps the mocked evals' stand-in", () => {
    assert.equal(evalRemote({ AB_EVAL_MOCK: "1" }), "mock");
  });

  test("AB_EVAL_REMOTE=sandbox inside a local eve eval", () => {
    assert.equal(evalRemote(EVAL), "sandbox");
  });

  test("refused on the demo", () => {
    assert.throws(() => evalRemote({ ...EVAL, AB_DEMO: "1" }), /AB_EVAL_REMOTE=sandbox is refused: this is the demo \(AB_DEMO=1\)/);
  });

  test("refused on Vercel", () => {
    assert.throws(() => evalRemote({ ...EVAL, VERCEL: "1" }), /AB_EVAL_REMOTE=sandbox is refused: this runs on Vercel/);
  });

  test("refused outside a local eve eval", () => {
    assert.throws(() => evalRemote({ AB_EVAL_REMOTE: "sandbox" }), /is refused: this is not a local eve eval/);
  });

  test("refused for any other value", () => {
    assert.throws(() => evalRemote({ ...EVAL, AB_EVAL_REMOTE: "github" }), /AB_EVAL_REMOTE=github is refused: the only value is "sandbox"/);
  });

  test("the stand-in path names owner and repository", () => {
    assert.equal(evalRemoteUrl("ab-eval/smoke-fixture"), "file:///tmp/ab-eval-remote/ab-eval--smoke-fixture.git");
  });
});
