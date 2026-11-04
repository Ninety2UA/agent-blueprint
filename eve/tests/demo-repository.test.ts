// The demo's repository and the instruction that names it (ruling 65): present with AB_DEMO=1,
// absent without, and read back by the scripted mock from the same text.
import assert from "node:assert/strict";
import { describe, test } from "node:test";

const { DEFAULT_DEMO_REPOSITORY, DEMO_REPOSITORY_URL, demoInstructions, demoInstructionsFor, demoRepository } = await import("../agent/lib/demo-repository.ts");

describe("the demo's repository", () => {
  test("AB_DEMO=1: AB_DEMO_REPOSITORY, or the sample when unset or blank", () => {
    assert.equal(demoRepository({ AB_DEMO: "1" }), "Ninety2UA/agent-blueprint-sample");
    assert.equal(demoRepository({ AB_DEMO: "1", AB_DEMO_REPOSITORY: "  " }), DEFAULT_DEMO_REPOSITORY);
    assert.equal(demoRepository({ AB_DEMO: "1", AB_DEMO_REPOSITORY: " acme/widgets.js " }), "acme/widgets.js");
  });

  test("off the demo, or a value that is not owner/name: none", () => {
    assert.equal(demoRepository({}), null);
    assert.equal(demoRepository({ AB_DEMO: "true", AB_DEMO_REPOSITORY: "acme/widgets" }), null);
    assert.equal(demoRepository({ AB_DEMO: "1", AB_DEMO_REPOSITORY: "https://github.com/acme/widgets" }), null);
    assert.equal(demoRepository({ AB_DEMO: "1", AB_DEMO_REPOSITORY: "acme" }), null);
  });
});

describe("the demo's instruction", () => {
  test("AB_DEMO=1: every request is about the repository, cloned first, never asked about; BACKLOG.md stays out (ruling 78)", () => {
    const text = demoInstructions({ AB_DEMO: "1" }) ?? "";
    assert.match(text, /`https:\/\/github\.com\/Ninety2UA\/agent-blueprint-sample`/);
    assert.match(text, /Every request a visitor sends is about that repository, whether or not they name it\./);
    assert.match(text, /Call `clone_repository` with that URL before anything else, and never ask which repository to work on\./);
    assert.match(text, /names another repository, say in one line that this demo works on Ninety2UA\/agent-blueprint-sample only/);
    assert.match(text, /Leave `BACKLOG\.md` out of a visitor's pull request: on this demo, never create or change it, even where a skill says to\./);
    assert.match(text, /Pass each follow-up you would have written there, and each one a helper returns, to `publish_branch` as `followUps` in the pull-request call/);
    assert.ok(!text.includes(String.fromCharCode(0x2014)), "no em dash");
  });

  test("absent off the demo, so a deployer's copy is unchanged", () => {
    assert.equal(demoInstructions({}), null);
    assert.equal(demoInstructions({ AB_DEMO_REPOSITORY: "acme/widgets" }), null);
    assert.equal(demoInstructions({ AB_DEMO: "0" }), null);
  });

  test("review #6: a helper on the demo gets the BACKLOG.md rule and not the clone rule; the root gets both; off the demo, neither", () => {
    const parent = { sessionId: "sess_root", callId: "call_1", turn: 1, rootSessionId: "sess_root" };
    const helper = demoInstructionsFor({ parent }, { AB_DEMO: "1" }) ?? "";
    assert.match(helper, /never create or change `BACKLOG\.md`, even where a skill says to\./);
    assert.match(helper, /Return each follow-up you would have written there in your reply, and the lead passes it to `publish_branch` as `followUps`\./);
    assert.ok(!helper.includes("clone_repository"), helper);
    assert.equal(DEMO_REPOSITORY_URL.exec(helper), null, "the mock finds no repository to clone in a helper's text");
    assert.ok(!helper.includes(String.fromCharCode(0x2014)), "no em dash");

    const root = demoInstructionsFor({}, { AB_DEMO: "1" }) ?? "";
    assert.equal(root, demoInstructions({ AB_DEMO: "1" }));
    assert.match(root, /Call `clone_repository` with that URL before anything else/);
    assert.match(root, /never create or change it, even where a skill says to\./);

    assert.equal(demoInstructionsFor({ parent }, {}), null);
    assert.equal(demoInstructionsFor({}, {}), null);
  });

  test("the mock reads the URL back from the text, a repository name with dots included", () => {
    assert.equal(DEMO_REPOSITORY_URL.exec(demoInstructions({ AB_DEMO: "1" }) ?? "")?.[1], "https://github.com/Ninety2UA/agent-blueprint-sample");
    assert.equal(DEMO_REPOSITORY_URL.exec(demoInstructions({ AB_DEMO: "1", AB_DEMO_REPOSITORY: "acme/widgets.js" }) ?? "")?.[1], "https://github.com/acme/widgets.js");
  });
});
