import { defineEval } from "eve/evals";

// Live: the reload after a compaction is the model following instructions.md (KTD4), which
// the scripted mock cannot show. Run with a Gateway key and without AB_EVAL_MOCK.
// Settled-turn form: turn 1 ends with the skill's first question in the reply, never on an
// ask_question interaction, because Eve 0.86.0 never settles a compaction of a parked turn.
const SKILL = "ab-brainstorming";

export default defineEval({
  description: "After a compaction mid-skill, the agent loads the active skill again before its next step.",
  tags: ["live"],
  async test(t) {
    if (process.env.AB_EVAL_MOCK === "1") {
      t.skip("live eval: the scripted mock follows its script, not the instructions");
      return;
    }
    const start = await t.send(
      `Use the ${SKILL} skill on this idea: a command that prints a project's open TODO comments. ` +
        "Follow the skill only as far as its first question to me. Write that question in your reply text; " +
        "do not use the ask_question tool. Then stop and wait for my answer.",
    );
    start.calledSkill(SKILL);
    const parked = start.interactions.length > 0 || start.events.some((event) => (event as { type?: string }).type === "turn.paused");
    if (parked) throw new Error("turn 1 parked on an interaction; a compaction of a parked turn never settles, so the eval stops here");

    // Compaction cuts a loaded skill body to 2,000 characters; this forces one between the turns.
    const compaction = await start.session.compact();
    compaction.event("context.settled", { data: { kind: "compaction", outcome: "completed" } });

    const next = await start.session.send("A small Python script is fine. Go on with the next step of the skill.");
    next.calledSkill(SKILL);
    t.succeeded();
  },
});
