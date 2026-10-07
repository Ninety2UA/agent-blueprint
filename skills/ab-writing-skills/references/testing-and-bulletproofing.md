# ab-writing-skills — testing, bulletproofing, iteration

Loaded on demand from `SKILL.md`; nothing here is needed on every invocation.

## Iteration Strategy by Skill Type

Different skill types need different iteration approaches. Using the wrong strategy produces either brittle skills or vague ones.

### Discipline-Enforcing Skills (TDD, verification, coding standards)

**Strategy: Close every loophole explicitly.**

These skills have a compliance cost — agents are incentivized to skip them. Iteration means finding specific rationalizations and adding specific counters.

- Each test failure reveals a specific excuse → add explicit negation
- Build rationalization table from all observed excuses
- Fiddly, targeted changes work because you're plugging specific holes
- "Violating the letter IS violating the spirit" cuts off an entire rationalization class

**When it's working:** Agent follows rule under maximum pressure and cites specific skill sections.

### Technique/Pattern Skills (debugging methods, design patterns, mental models)

**Strategy: Generalize with different metaphors, don't make fiddly adjustments.**

If a technique skill isn't working, the problem is usually that the agent doesn't *understand* — not that it's trying to cheat. Adding more rules makes it worse.

- Reframe using a different analogy or metaphor
- Transmit *understanding* into instructions, not rigid ALL-CAPS directives
- If one explanation doesn't land, try a completely different angle
- Explain the WHY behind each step — agents that understand comply naturally

**When it's working:** Agent applies technique correctly to novel scenarios not covered by examples.

### Reference Skills (API docs, syntax guides, tool documentation)

**Strategy: Iterate on organization, not content.**

If Claude can't find information in a reference skill, the problem is structure — not missing text.

- Restructure sections so Claude's natural search patterns hit the right content
- Add a table of contents for files over 100 lines
- Keep references one level deep from SKILL.md
- If Claude repeatedly reads the wrong file, your navigation cues are misleading

**When it's working:** Agent finds and correctly applies reference information on first attempt.

## Bulletproofing Skills Against Rationalization

Skills that enforce discipline (like TDD) need to resist rationalization. Agents are smart and will find loopholes when under pressure.

**Psychology note:** Understanding WHY persuasion techniques work helps you apply them systematically. See persuasion-principles.md for research foundation (Cialdini, 2021; Meincke et al., 2025) on authority, commitment, scarcity, social proof, and unity principles.

### Close Every Loophole Explicitly

Don't just state the rule - forbid specific workarounds:

<Bad>
```markdown
Write code before test? Delete it.
```
</Bad>

<Good>
```markdown
Write code before test? Delete it. Start over.

**No exceptions:**
- Don't keep it as "reference"
- Don't "adapt" it while writing tests
- Don't look at it
- Delete means delete
```
</Good>

### Address "Spirit vs Letter" Arguments

Add foundational principle early:

```markdown
**Violating the letter of the rules is violating the spirit of the rules.**
```

This cuts off entire class of "I'm following the spirit" rationalizations.

### Build Rationalization Table

Capture rationalizations from baseline testing (see Testing section below). Every excuse agents make goes in the table:

```markdown
| Excuse | Reality |
|--------|---------|
| "Too simple to test" | Simple code breaks. Test takes 30 seconds. |
| "I'll test after" | Tests passing immediately prove nothing. |
| "Tests after achieve same goals" | Tests-after = "what does this do?" Tests-first = "what should this do?" |
```

### Create Red Flags List

Make it easy for agents to self-check when rationalizing:

```markdown
## Red Flags - STOP and Start Over

- Code before test
- "I already manually tested it"
- "Tests after achieve the same purpose"
- "It's about spirit not ritual"
- "This is different because..."

**All of these mean: Delete code. Start over with TDD.**
```

### Update CSO for Violation Symptoms

Add to description: symptoms of when you're ABOUT to violate the rule:

```yaml
description: use when implementing any feature or bugfix, before writing implementation code
```

## Testing All Skill Types

Different skill types need different test approaches:

### Discipline-Enforcing Skills (rules/requirements)

**Examples:** TDD, ab-verification-before-completion, ab-brainstorming

**Test with:**
- Academic questions: Do they understand the rules?
- Pressure scenarios: Do they comply under stress?
- Multiple pressures combined: time + sunk cost + exhaustion
- Identify rationalizations and add explicit counters

**Success criteria:** Agent follows rule under maximum pressure

### Technique Skills (how-to guides)

**Examples:** condition-based-waiting, root-cause-tracing, defensive-programming

**Test with:**
- Application scenarios: Can they apply the technique correctly?
- Variation scenarios: Do they handle edge cases?
- Missing information tests: Do instructions have gaps?

**Success criteria:** Agent successfully applies technique to new scenario

### Pattern Skills (mental models)

**Examples:** reducing-complexity, information-hiding concepts

**Test with:**
- Recognition scenarios: Do they recognize when pattern applies?
- Application scenarios: Can they use the mental model?
- Counter-examples: Do they know when NOT to apply?

**Success criteria:** Agent correctly identifies when/how to apply pattern

### Reference Skills (documentation/APIs)

**Examples:** API documentation, command references, library guides

**Test with:**
- Retrieval scenarios: Can they find the right information?
- Application scenarios: Can they use what they found correctly?
- Gap testing: Are common use cases covered?

**Success criteria:** Agent finds and correctly applies reference information

## Native runner: `claude plugin eval`

`claude plugin eval` (CLI 2.1.269+; git 2.31+ from 2.1.283) measures what this methodology designs. Each case runs in a fresh, non-interactive session with only the plugin loaded, three runs by default, next to a no-plugin baseline arm, and reports with, without, and the delta. Graders: `regex`, `tool_used` (including `Skill`, so it can score whether a skill triggered), `tool_order`, `file_exists`, `llm`, and `baseline`; there are no custom-code graders. `claude plugin eval init` drafts cases, and `--json`, `--threshold` (exit 1 below it), and `--max-cost-usd` (exit 2 over it) make it usable in CI.

Before relying on it:

- **It bills real calls:** cases × runs × two arms, plus judge calls for each `llm` or `baseline` grader per run.
- **Its case format is its own.** Eval files written for other tools do not carry over.
- **Keep suites out of the installed tree's skill folders.** The whole Agent Blueprint repository installs as the plugin, so an eval suite ships to every user wherever it sits; keep it under `tests/`, and never name a fixture `SKILL.md`, or recursive installers pick it up as a skill.

The fresh process per run gives it cleaner isolation than subagent-based testing, which inherits the tester's session context. It doesn't replace the scenario design above (pressure types, the 20-query trigger sets, why one run misleads); it runs those scenarios reproducibly. The blueprint ships no suite and no CI gate, because a gate would bill every push and need an API-key secret in a public repository.

## Common rationalizations for skipping testing

| Excuse | Reality |
|--------|---------|
| "The skill is obviously clear" | Clear to you is not clear to other agents. Test it. |
| "It's just a reference" | References have gaps and unclear sections too. Test retrieval. |
| "Testing is overkill" | Untested skills have issues. Fifteen minutes of testing saves hours. |
| "I'll test if problems emerge" | Problems mean agents can't use the skill. Test before deploying. |
| "Too tedious to test" | Less tedious than debugging a bad skill in production. |
| "I'm confident it's good" | Confidence is not evidence. Test anyway. |
| "Academic review is enough" | Reading is not using. Test application scenarios. |
| "No time to test" | An untested skill costs more time fixing later. |
