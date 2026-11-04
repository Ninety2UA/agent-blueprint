import { readFileSync } from "node:fs";
import { join } from "node:path";
import { defineEval } from "eve/evals";
import { equals } from "eve/evals/expect";
import { configuredSecret, COOKIE_NAME, issueCookie } from "../apps/web/lib/gate/code";

// Ruling 65: a demo visitor's bare request, as a suggested-request button sends it, is about the
// demo's repository: the agent clones it with no question first. Two passes, as gate.eval.ts runs:
//   AB_DEMO=1 AB_TRUST_PROXY=1 EVE_CHAT_PASSWORD=<code>   the demo cell
//   AB_DEMO unset                                          the deployer cell: nothing is cloned
// What the scripted mock shows: the demo's instruction reaches the model call's system text on the
// demo and not elsewhere, and the clone tool takes the URL it names. The mock clones when it reads
// that instruction, so this cannot show that a live model obeys it; the live demo-live eval does.
const DEMO = process.env.AB_DEMO === "1";
const REPOSITORY = `https://github.com/${process.env.AB_DEMO_REPOSITORY?.trim() || "Ninety2UA/agent-blueprint-sample"}`;

// The three suggested requests, read from the chat's source so a changed button text is followed.
// eve eval runs from the app root, so the path starts at cwd.
function suggestedRequests(): string[] {
  const source = readFileSync(join(process.cwd(), "apps", "web", "components", "chat", "gate-notice.tsx"), "utf8");
  const list = /SUGGESTED_REQUESTS[^=]*=\s*\[([\s\S]*?)\];/.exec(source)?.[1] ?? "";
  const requests = [...list.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((match) => JSON.parse(`"${match[1]}"`) as string);
  if (requests.length !== 3) throw new Error(`expected three suggested requests in gate-notice.tsx, found ${requests.length}`);
  return requests;
}

const [REQUEST] = suggestedRequests();

const demo = defineEval({
  description: "The demo: a bare suggested request clones the demo's repository first, with no question.",
  tags: ["mock"],
  async test(t) {
    if (process.env.AB_EVAL_MOCK !== "1") throw new Error("mock-tagged evals need AB_EVAL_MOCK=1");
    if (!DEMO) return t.skip("runs with AB_DEMO=1");
    if (!configuredSecret()) throw new Error("the demo cell needs EVE_CHAT_PASSWORD");
    const { value } = issueCookie(configuredSecret());
    const headers = { cookie: `${COOKIE_NAME}=${value}`, "x-forwarded-for": "198.51.100.200" };
    const session = await t.session({ headers });
    const turn = await session.send(REQUEST, { headers });
    turn.calledTool("clone_repository", { input: { repository: REPOSITORY }, output: { action: "cloned", repository: REPOSITORY.toLowerCase() }, count: 1 });
    t.check(turn.toolCalls.some((call) => JSON.stringify(call).includes("ask_question")), equals(false)).label("no ask_question");
    turn.event("interaction.opened", { count: 0 });
    t.succeeded();
  },
});

// Ruling 78: on the demo a run that changed BACKLOG.md is refused at the done rule, so a visitor's
// pull request never carries it; put back as it was at the base, the same run is ready. The script
// commits the file itself, as a helper that followed its skill over the demo's instruction could.
const backlog = defineEval({
  description: "The demo: a run that changed BACKLOG.md is not done until the file is back as it was at the base.",
  tags: ["mock"],
  async test(t) {
    if (process.env.AB_EVAL_MOCK !== "1") throw new Error("mock-tagged evals need AB_EVAL_MOCK=1");
    if (!DEMO) return t.skip("runs with AB_DEMO=1");
    if (!configuredSecret()) throw new Error("the demo cell needs EVE_CHAT_PASSWORD");
    const { value } = issueCookie(configuredSecret());
    const headers = { cookie: `${COOKIE_NAME}=${value}`, "x-forwarded-for": "198.51.100.201" };
    const session = await t.session({ headers });
    const script = [
      REQUEST,
      `clone: ${REPOSITORY}`,
      "bash: printf -- '- [ ] Add a --json flag\\n' >> BACKLOG.md && git add BACKLOG.md && git commit -qm 'docs: note a follow-up'",
      "publish: check",
      "bash: (git checkout origin/HEAD -- BACKLOG.md 2>/dev/null || git rm -q BACKLOG.md) && git commit -qm 'chore: leave BACKLOG.md out of the demo pull request'",
      "publish: check",
    ].join("\n");
    const turn = await session.send(script, { headers });
    turn.calledTool("publish_branch", { input: { mode: "check" }, output: { status: "refused", reason: /the demo leaves BACKLOG\.md out of a visitor's pull request/ }, count: 1 });
    turn.calledTool("publish_branch", { input: { mode: "check" }, output: { status: "ready" }, count: 1 });
    t.succeeded();
  },
});

const deployer = defineEval({
  description: "Off the demo: the same bare request clones nothing; the demo's instruction is absent.",
  tags: ["mock"],
  async test(t) {
    if (process.env.AB_EVAL_MOCK !== "1") throw new Error("mock-tagged evals need AB_EVAL_MOCK=1");
    if (DEMO) return t.skip("runs without AB_DEMO");
    const turn = await t.send(REQUEST);
    turn.calledTool("clone_repository", { count: 0 });
    t.check(turn.reply, equals("No script steps."));
    t.succeeded();
  },
});

export default [demo, backlog, deployer];
