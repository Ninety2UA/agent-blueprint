import { readFileSync } from "node:fs";
import { join } from "node:path";
import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";

// Manual-only skills (R2, KTD9, AE3). The mock's "plan:" step loads the offered skill whose
// description best matches the request, as a model would; "guess:" loads a name the message
// does not contain, as a model that knows the name would.
const SKILL = "ab-plugin-update";
const GUESS = `guess: ${[...SKILL].reverse().join("")}`;
const heading = /^# .+$/m.exec(readFileSync(join(process.cwd(), "..", "skills", SKILL, "SKILL.md"), "utf8"))?.[0];
if (!heading) throw new Error(`skills/${SKILL}/SKILL.md has no first heading`);

// The request in ab-plugin-update's own description words, without its name.
const MATCHING = "plan: Upgrade the Agent Blueprint plugin itself to its latest release, refresh or reinstall it";

function text(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value ?? "");
}
const loadsHeading = (output: unknown) => text(output).startsWith(heading);
const requested = { data: { capability: { kind: "skill", name: SKILL } } } as const;
// Eve refuses a load of a skill it does not offer at input validation, before any call event;
// the reply carries the message inside a JSON string, so its quotes may be escaped.
const REFUSED = new RegExp(`No skill named \\\\?"${SKILL}\\\\?"`);

export default defineEval({
  description: "ab-plugin-update loads only when the user names it, and stays loadable for that invocation.",
  tags: ["mock"],
  async test(t) {
    if (process.env.AB_EVAL_MOCK !== "1") throw new Error("mock-tagged evals need AB_EVAL_MOCK=1");
    // AE3: matching but unnamed, the skill is never requested, and a guessed load fails.
    const unnamed = await t.send(MATCHING);
    unnamed.notEvent("call.requested", requested);
    const guessed = await unnamed.session.send(GUESS);
    guessed.notEvent("call.requested", requested);
    t.check(guessed.reply ?? "", includes(REFUSED));

    // Named, it loads, and its sibling files are in the sandbox.
    const named = await t.send(`Run /${SKILL} on this copy.\n${MATCHING}\nbash: ls $HOME/.agents/skills/${SKILL}/references/`);
    named.calledSkill(SKILL, { output: loadsHeading });
    named.calledTool("bash", { output: /\.md/ });

    // A checkpoint reply without the name, then a compaction: the skill reloads after both.
    const reply = await named.session.send(`1\n${GUESS}`);
    reply.calledSkill(SKILL, { output: loadsHeading });
    const compaction = await named.session.compact();
    compaction.event("context.settled", { data: { kind: "compaction", outcome: "completed" } });
    const reload = await named.session.send(`Carry on.\n${GUESS}\nbash: ls $HOME/.agents/skills/${SKILL}/references/`);
    reload.calledSkill(SKILL, { output: loadsHeading });
    reload.calledTool("bash", { output: /\.md/ });

    // Completed: a later message naming another skill ends the invocation.
    const next = await named.session.send(`Now ab-project-status, please.\n${GUESS}`);
    next.notEvent("call.requested", requested);
    t.check(next.reply ?? "", includes(REFUSED));

    // Abandoned: a cancelled turn ends it too.
    const again = await t.send(`Run /${SKILL}.\nskill: ${SKILL}`);
    again.calledSkill(SKILL, { output: loadsHeading });
    const live = await again.session.start("bash: sleep 20");
    await live.waitForEvent("call.started");
    await live.cancel();
    const cancelled = await live.result();
    cancelled.event("turn.settled", { data: { outcome: "cancelled" } });
    const after = await again.session.send(GUESS);
    after.notEvent("call.requested", requested);
    t.check(after.reply ?? "", includes(REFUSED));

    // A fresh session without the name does not load it.
    const fresh = await t.send(GUESS);
    fresh.notEvent("call.requested", requested);
    t.check(fresh.reply ?? "", includes(REFUSED));
    t.succeeded();
  },
});
