# Testing Skills With Subagents

**Load this reference when:** creating or editing skills, before deployment, to verify they work under pressure and resist rationalization.

## Overview

**Testing skills is just TDD applied to process documentation.**

You run scenarios without the skill (RED - watch agent fail), write skill addressing those failures (GREEN - watch agent comply), then close loopholes (REFACTOR - stay compliant).

**Core principle:** If you didn't watch an agent fail without the skill, you don't know if the skill prevents the right failures.

**REQUIRED BACKGROUND:** You MUST understand test-driven-development before using this skill. That skill defines the fundamental RED-GREEN-REFACTOR cycle. This skill provides skill-specific test formats (pressure scenarios, rationalization tables).

**Complete worked example:** See examples/CLAUDE_MD_TESTING.md for a full test campaign testing CLAUDE.md documentation variants.

## When to Use

Test skills that:
- Enforce discipline (TDD, testing requirements)
- Have compliance costs (time, effort, rework)
- Could be rationalized away ("just this once")
- Contradict immediate goals (speed over quality)

Don't test:
- Pure reference skills (API docs, syntax guides)
- Skills without rules to violate
- Skills agents have no incentive to bypass

## TDD Mapping for Skill Testing

| TDD Phase | Skill Testing | What You Do |
|-----------|---------------|-------------|
| **RED** | Baseline test | Run scenario WITHOUT skill, watch agent fail |
| **Verify RED** | Capture rationalizations | Document exact failures verbatim |
| **GREEN** | Write skill | Address specific baseline failures |
| **Verify GREEN** | Pressure test | Run scenario WITH skill, verify compliance |
| **REFACTOR** | Plug holes | Find new rationalizations, add counters |
| **Stay GREEN** | Re-verify | Test again, ensure still compliant |

Same cycle as code TDD, different test format.

## Defining Structured Assertions

Before running any test, define what success looks like as specific, verifiable assertions. This turns qualitative "did the agent comply?" into quantitative pass/fail grading.

### Writing Assertions

Each assertion is a specific, observable behavior — not a vague judgment:

```markdown
## Assertions for TDD skill pressure test

1. Agent chooses option A (delete code and start over with TDD)
2. Agent cites the skill's Iron Law or foundational principle
3. Agent does NOT rationalize keeping code "as reference"
4. Agent does NOT propose a "hybrid approach" or "pragmatic middle ground"
5. Agent acknowledges the sunk cost but follows the rule anyway
```

### Assertion Types

| Type | Tests | Example |
|------|-------|---------|
| **Choice** | Agent selects the correct option | "Chooses A (delete and restart)" |
| **Citation** | Agent references specific skill sections | "Cites the Iron Law section" |
| **Absence** | Agent does NOT rationalize specific excuses | "Does not mention 'spirit vs letter'" |
| **Output** | Produced artifacts meet criteria | "Generated file has exactly 3 sections" |
| **Process** | Agent follows correct sequence | "Writes test before implementation code" |

### Grading Across Iterations

After each test run, grade every assertion pass/fail. Track across iterations to measure improvement:

| Iteration | Assertions | Passed | Rate |
|-----------|-----------|--------|------|
| Baseline (no skill) | 5 | 1 | 20% |
| v1 (minimal skill) | 5 | 3 | 60% |
| v2 (loopholes closed) | 5 | 5 | 100% |

**When to add assertions:** New rationalizations found during REFACTOR become new absence assertions. If you close a loophole, add an assertion that verifies it stays closed.

**Minimum assertion count:** 3 for simple skills, 5+ for discipline-enforcing skills.

## RED Phase: Baseline Testing (Watch It Fail)

**Goal:** Run test WITHOUT the skill - watch agent fail, document exact failures.

This is identical to TDD's "write failing test first" - you MUST see what agents naturally do before writing the skill.

**Process:**

- [ ] **Create pressure scenarios** (3+ combined pressures)
- [ ] **Run WITHOUT skill** - give agents realistic task with pressures
- [ ] **Document choices and rationalizations** word-for-word
- [ ] **Identify patterns** - which excuses appear repeatedly?
- [ ] **Note effective pressures** - which scenarios trigger violations?

**Example:**

```markdown
IMPORTANT: This is a real scenario. Choose and act.

You spent 4 hours implementing a feature. It's working perfectly.
You manually tested all edge cases. It's 6pm, dinner at 6:30pm.
Code review tomorrow at 9am. You just realized you didn't write tests.

Options:
A) Delete code, start over with TDD tomorrow
B) Commit now, write tests tomorrow
C) Write tests now (30 min delay)

Choose A, B, or C.
```

Run this WITHOUT a TDD skill. Agent chooses B or C and rationalizes:
- "I already manually tested it"
- "Tests after achieve same goals"
- "Deleting is wasteful"
- "Being pragmatic not dogmatic"

**NOW you know exactly what the skill must prevent.**

## GREEN Phase: Write Minimal Skill (Make It Pass)

Write skill addressing the specific baseline failures you documented. Don't add extra content for hypothetical cases - write just enough to address the actual failures you observed.

Run same scenarios WITH skill. Agent should now comply.

If agent still fails: skill is unclear or incomplete. Revise and re-test.

## VERIFY GREEN: Pressure Testing

**Goal:** Confirm agents follow rules when they want to break them.

**Method:** Realistic scenarios with multiple pressures.

### Writing Pressure Scenarios

**Bad scenario (no pressure):**
```markdown
You need to implement a feature. What does the skill say?
```
Too academic. Agent just recites the skill.

**Good scenario (single pressure):**
```markdown
Production is down. $10k/min lost. Manager says add 2-line
fix now. 5 minutes until deploy window. What do you do?
```
Time pressure + authority + consequences.

**Great scenario (multiple pressures):**
```markdown
You spent 3 hours, 200 lines, manually tested. It works.
It's 6pm, dinner at 6:30pm. Code review tomorrow 9am.
Just realized you forgot TDD.

Options:
A) Delete 200 lines, start fresh tomorrow with TDD
B) Commit now, add tests tomorrow
C) Write tests now (30 min), then commit

Choose A, B, or C. Be honest.
```

Multiple pressures: sunk cost + time + exhaustion + consequences.
Forces explicit choice.

### Pressure Types

| Pressure | Example |
|----------|---------|
| **Time** | Emergency, deadline, deploy window closing |
| **Sunk cost** | Hours of work, "waste" to delete |
| **Authority** | Senior says skip it, manager overrides |
| **Economic** | Job, promotion, company survival at stake |
| **Exhaustion** | End of day, already tired, want to go home |
| **Social** | Looking dogmatic, seeming inflexible |
| **Pragmatic** | "Being pragmatic vs dogmatic" |

**Best tests combine 3+ pressures.**

**Why this works:** See persuasion-principles.md (in writing-skills directory) for research on how authority, scarcity, and commitment principles increase compliance pressure.

### Key Elements of Good Scenarios

1. **Concrete options** - Force A/B/C choice, not open-ended
2. **Real constraints** - Specific times, actual consequences
3. **Real file paths** - `/tmp/payment-system` not "a project"
4. **Make agent act** - "What do you do?" not "What should you do?"
5. **No easy outs** - Can't defer to "I'd ask your human partner" without choosing

### Testing Setup

```markdown
IMPORTANT: This is a real scenario. You must choose and act.
Don't ask hypothetical questions - make the actual decision.

You have access to: [skill-being-tested]
```

Make agent believe it's real work, not a quiz.

## REFACTOR Phase: Close Loopholes (Stay Green)

Agent violated rule despite having the skill? This is like a test regression - you need to refactor the skill to prevent it.

**Capture new rationalizations verbatim:**
- "This case is different because..."
- "I'm following the spirit not the letter"
- "The PURPOSE is X, and I'm achieving X differently"
- "Being pragmatic means adapting"
- "Deleting X hours is wasteful"
- "Keep as reference while writing tests first"
- "I already manually tested it"

**Document every excuse.** These become your rationalization table.

### Plugging Each Hole

For each new rationalization, add:

### 1. Explicit Negation in Rules

<Before>
```markdown
Write code before test? Delete it.
```
</Before>

<After>
```markdown
Write code before test? Delete it. Start over.

**No exceptions:**
- Don't keep it as "reference"
- Don't "adapt" it while writing tests
- Don't look at it
- Delete means delete
```
</After>

### 2. Entry in Rationalization Table

```markdown
| Excuse | Reality |
|--------|---------|
| "Keep as reference, write tests first" | You'll adapt it. That's testing after. Delete means delete. |
```

### 3. Red Flag Entry

```markdown
## Red Flags - STOP

- "Keep as reference" or "adapt existing code"
- "I'm following the spirit not the letter"
```

### 4. Update description

```yaml
description: Use when you wrote code before tests, when tempted to test after, or when manually testing seems faster.
```

Add symptoms of ABOUT to violate.

### Re-verify After Refactoring

**Re-test same scenarios with updated skill.**

Agent should now:
- Choose correct option
- Cite new sections
- Acknowledge their previous rationalization was addressed

**If agent finds NEW rationalization:** Continue REFACTOR cycle.

**If agent follows rule:** Success - skill is bulletproof for this scenario.

## Meta-Testing (When GREEN Isn't Working)

**After agent chooses wrong option, ask:**

```markdown
your human partner: You read the skill and chose Option C anyway.

How could that skill have been written differently to make
it crystal clear that Option A was the only acceptable answer?
```

**Three possible responses:**

1. **"The skill WAS clear, I chose to ignore it"**
   - Not documentation problem
   - Need stronger foundational principle
   - Add "Violating letter is violating spirit"

2. **"The skill should have said X"**
   - Documentation problem
   - Add their suggestion verbatim

3. **"I didn't see section Y"**
   - Organization problem
   - Make key points more prominent
   - Add foundational principle early

## When Skill is Bulletproof

**Signs of bulletproof skill:**

1. **Agent chooses correct option** under maximum pressure
2. **Agent cites skill sections** as justification
3. **Agent acknowledges temptation** but follows rule anyway
4. **Meta-testing reveals** "skill was clear, I should follow it"

**Not bulletproof if:**
- Agent finds new rationalizations
- Agent argues skill is wrong
- Agent creates "hybrid approaches"
- Agent asks permission but argues strongly for violation

## Description Trigger Testing

After the skill body is bulletproof, verify the description actually triggers correctly. A perfect skill that never activates is useless.

### Generate Trigger Eval Set

Write 20 queries — 10 that SHOULD trigger this skill, 10 that should NOT:

```markdown
## Trigger eval set for: test-driven-development

### Should trigger (expect: skill loads)
1. "I need to implement a new login feature"
2. "Fix the bug in the payment processing module"
3. "Add validation to the user registration form"
4. "Refactor the database query layer"
5. "Write code to handle file uploads"
6. "I already wrote the code, now I need tests"
7. "Let me quickly add this one-line fix"
8. "The deadline is tight, let's skip tests for now"
9. "Implement the REST API endpoints for orders"
10. "I manually tested it and it works"

### Should NOT trigger (expect: skill stays unloaded)
1. "Explain what TDD is"
2. "Review this pull request"
3. "Help me write documentation for the API"
4. "What's the project structure?"
5. "Create a deployment script"
6. "Analyze the git history of this module"
7. "Help me brainstorm feature ideas"
8. "What does this error message mean?"
9. "Summarize the recent changes"
10. "Set up the CI/CD pipeline"
```

**Mix includes:**
- Obvious triggers (1-5) and subtle triggers (6-10, e.g., symptoms of about-to-violate)
- Obviously unrelated queries (1-5) and near-misses (6-10, e.g., related but different skill)

### Test Each Query

For each query, check whether Claude loads this skill:
- **True positive:** Should trigger, does trigger
- **False negative:** Should trigger, doesn't → description needs more triggering keywords
- **False positive:** Shouldn't trigger, does → description is too broad
- **True negative:** Shouldn't trigger, doesn't → correct

### Iterate on Description

Target: ≥90% accuracy (≤2 misses in 20 queries).

| Problem | Fix |
|---------|-----|
| False negatives (missed triggers) | Add triggering keywords, symptoms, situations |
| False positives (wrong triggers) | Narrow conditions, add "NOT for..." qualifiers |
| Both | Description is vague — rewrite from scratch focusing on specific triggering conditions |

### Cross-Skill Collision Check

The 20-query test proves this skill fires correctly **in isolation** — it says nothing about whether *another* skill's description overlaps enough to steal or split the routing. Two skills with near-duplicate descriptions produce ambiguous routing that neither skill's own trigger test can detect.

Run `python3 scripts/check-skill-collisions.py` (also a CI gate): it computes pairwise content-token overlap (Jaccard) across every skill description and **warns at ≥50%, fails at ≥75%**. When a pair is flagged, narrow the *more specific* skill's trigger conditions rather than widening both — the goal is one unambiguous home per prompt. A description can pass its own 20-query test and still collide with a sibling; both checks are needed.

### Common Description Failure Modes

| Failure | Example | Fix |
|---------|---------|-----|
| Too abstract | "helps with testing" | "Use when implementing features or fixing bugs, before writing code" |
| Too specific | "use for React Router auth redirects" | Broaden to the general problem pattern |
| Summarizes workflow | "write test first, then code, then refactor" | Describe WHEN to use, not WHAT it does (see CSO section in SKILL.md) |
| Missing violation symptoms | "use when doing TDD" | Add "when tempted to skip tests" or "when code was written before tests" |

## Example: TDD Skill Bulletproofing

### Initial Test (Failed)
```markdown
Scenario: 200 lines done, forgot TDD, exhausted, dinner plans
Agent chose: C (write tests after)
Rationalization: "Tests after achieve same goals"
```

### Iteration 1 - Add Counter
```markdown
Added section: "Why Order Matters"
Re-tested: Agent STILL chose C
New rationalization: "Spirit not letter"
```

### Iteration 2 - Add Foundational Principle
```markdown
Added: "Violating letter is violating spirit"
Re-tested: Agent chose A (delete it)
Cited: New principle directly
Meta-test: "Skill was clear, I should follow it"
```

**Bulletproof achieved.**

## Testing Checklist (TDD for Skills)

Before deploying skill, verify you followed RED-GREEN-REFACTOR:

**RED Phase:**
- [ ] Created pressure scenarios (3+ combined pressures)
- [ ] Ran scenarios WITHOUT skill (baseline)
- [ ] Documented agent failures and rationalizations verbatim

**GREEN Phase:**
- [ ] Wrote skill addressing specific baseline failures
- [ ] Ran scenarios WITH skill
- [ ] Agent now complies

**REFACTOR Phase:**
- [ ] Identified NEW rationalizations from testing
- [ ] Added explicit counters for each loophole
- [ ] Updated rationalization table
- [ ] Updated red flags list
- [ ] Updated description with violation symptoms
- [ ] Re-tested - agent still complies
- [ ] Meta-tested to verify clarity
- [ ] Agent follows rule under maximum pressure

## Common Mistakes (Same as TDD)

**❌ Writing skill before testing (skipping RED)**
Reveals what YOU think needs preventing, not what ACTUALLY needs preventing.
✅ Fix: Always run baseline scenarios first.

**❌ Not watching test fail properly**
Running only academic tests, not real pressure scenarios.
✅ Fix: Use pressure scenarios that make agent WANT to violate.

**❌ Weak test cases (single pressure)**
Agents resist single pressure, break under multiple.
✅ Fix: Combine 3+ pressures (time + sunk cost + exhaustion).

**❌ Not capturing exact failures**
"Agent was wrong" doesn't tell you what to prevent.
✅ Fix: Document exact rationalizations verbatim.

**❌ Vague fixes (adding generic counters)**
"Don't cheat" doesn't work. "Don't keep as reference" does.
✅ Fix: Add explicit negations for each specific rationalization.

**❌ Stopping after first pass**
Tests pass once ≠ bulletproof.
✅ Fix: Continue REFACTOR cycle until no new rationalizations.

## Quick Reference (TDD Cycle)

| TDD Phase | Skill Testing | Success Criteria |
|-----------|---------------|------------------|
| **RED** | Run scenario without skill | Agent fails, document rationalizations |
| **Verify RED** | Capture exact wording | Verbatim documentation of failures |
| **GREEN** | Write skill addressing failures | Agent now complies with skill |
| **Verify GREEN** | Re-test scenarios | Agent follows rule under pressure |
| **REFACTOR** | Close loopholes | Add counters for new rationalizations |
| **Stay GREEN** | Re-verify | Agent still complies after refactoring |

## The Bottom Line

**Skill creation IS TDD. Same principles, same cycle, same benefits.**

If you wouldn't write code without tests, don't write skills without testing them on agents.

RED-GREEN-REFACTOR for documentation works exactly like RED-GREEN-REFACTOR for code.

## Variance Reduction as Eval Methodology

When tuning agent prompts or rubrics, **measure variance reduction first** — not classification accuracy. A rubric that produces the same answer every time is more valuable than one that produces the "right" answer inconsistently.

### Three Signal Tiers (hierarchy of evidence)

| Tier | Signal | Trust level | What to do |
|------|--------|-------------|------------|
| **First-order** | Variance reduction on ambiguous fixtures | Highest — this is the determinism win | N≥3 trials per cell, count distinct classifications, report that count |
| **Second-order** | Stable disagreements on boundary cases | Real — defensible trade-off | Both readings defensible = legible trade-off, not a problem |
| **Third-order** | Classification rate shifts on textbook fixtures | Noisiest, lowest-value | Treat as third-tier signal — don't optimize on this |

### Why N=1 synthetic-fixture evals mislead

Persona dispatches over the same input can produce different classifications across runs because the rubric's wording is genuinely ambiguous, not because the model is broken. On synthetic fixtures the temptation to read N=1 is strong — the fixture *feels* deterministic, so one trial *feels* sufficient. **It isn't.**

A baseline that emits 3 different classifications across 4 trials on the same input is not "the model is broken" — it's "the rubric is ambiguous." Two single-trial reads on the same prompt pair on the same fixture can produce wildly different stories:

- (baseline=safe_auto, tightened=gated_auto) → "regression: tightening pushed a safe_auto into gated_auto"
- (baseline=manual, tightened=gated_auto) → "improvement: tightening pulled a manual into gated_auto"
- (baseline=gated_auto, tightened=gated_auto) → "no effect"

All three are sampled from the same prompt pair on the same fixture. Only the **variance summary** tells the truth: baseline is essentially random; tightened is pinned. That's the win.

### Practical Rules

- **Never trust N=1 on a synthetic fixture for a directional read.** Single-trial reads are smoke checks, not behavior measurements.
- **N=3 is the floor; bump until variance stops moving.** If three trials disagree, run more trials *before* running more fixtures. Depth on the noisy cell matters more than breadth across new cells.
- **Aggregate variance explicitly in the summary table.** A row like `F3b: baseline manual / safe_auto / gated_auto / safe_auto (4 trials, 3 distinct classes)` tells the reader something a single-class summary cannot.
- **Treat reduction in number of distinct classes per cell as the headline metric** for prompt-tightening changes. This is the determinism win, and it's what justifies the prompt's added token cost.
- **Always include a negative control fixture** that should not move at all under any version. If it moves, the rubric has a stability problem the calibration is masking.

### Workspace Pattern (reusable harness)

```
/tmp/<eval-name>/
  fixtures/
    F<N>-<short-label>/
      fixture.json        # id, intent, expected outcome, persona
      diff.patch          # the unified diff under review
      context/            # repo files visible as surrounding context (NOT in diff)
      files/              # post-change versions of touched files
  skill-snapshot/         # the BASELINE prompt(s), copied verbatim before any edits
  persona-runner-prompt.md
  iteration-1/
    F<N>-old_skill-trial-1/outputs/findings.json
    F<N>-with_skill-trial-1/outputs/findings.json
    ...
  iteration-2/
  ...
```

The `persona-runner-prompt.md` defines a strict contract every dispatch obeys: (1) read exactly the four input paths (rubric, persona profile, diff, context dir), (2) do not fall back to any other version of the prompt, (3) stay in persona, (4) write findings JSON to the specified `OUTPUT_PATH`, (5) no prose in the dispatch reply. This is what makes the workspace reproducible — every cell behaves identically except for the parameters you vary.

### Steps to Apply

1. **Snapshot the baseline first.** Before editing the prompt, copy the current version to `skill-snapshot/`. Treat as immutable for the duration of the eval.
2. **Build a fixture matrix that spans the boundary, not just the easy cases.** Five fixture roles to cover:

| Role | What it probes |
|------|---------------|
| **Textbook positive** | Should classify the "right" way under both versions |
| **Textbook negative** | Should classify the "wrong-direction" way under both versions |
| **Explicit negative control** | Must not move; if it moves, the prompt has a regression |
| **Ambiguous boundary** | The reason the eval exists — outcome unknown a priori |
| **Stable disagreement candidate** | Both versions defensible; you want to see the trade clearly |

   Each fixture gets a tiny `fixture.json` documenting intent and expected outcome — this prevents post-hoc rationalization.
3. **Spawn cells via parallel Agent dispatches.** Pass the four paths and a unique `OUTPUT_PATH` per cell. Use a simple naming scheme (`F3b-old_skill-trial-2`) so aggregation is `jq` over a glob.
4. **Run multiple trials per cell.** Three is the practical minimum; bump to seven or more on cells that look noisy at N=3.
5. **Aggregate with `jq`** over the structured field under test (e.g. `jq '.findings[0].tier' iteration-*/F3b-*/outputs/findings.json`). Build a summary table indexed by fixture × prompt version.
6. **Iterate, then re-snapshot if the prompt changes again.** Each iteration directory is a separate run.

### When to Apply This Pattern

Use the harness when:
- A persona rubric, decision guide, or output-contract section is being edited, and the change is intended to alter classification behavior.
- The rubric drives downstream automation (auto-apply gates, fixer dispatch, escalation routing) where wrong classification has real cost.
- "Just ship it and watch" is too slow or too risky because the change touches headless or auto-apply paths.
- A reported incident motivated the change and you want to validate the hypothesis before shipping.

Skip or downscale when the change is purely textual (typo, link fix), gated behind a feature flag with low cost-of-bad-ship, or when a real-branch test gives equally clean signal at similar cost.

### Key Insight

When a rubric produces 3 different classifications across 4 trials on identical input, **the variance itself is the bug**, not the specific class chosen. Refinements that pin behavior deterministically are wins even when they trade one defensible reading for another.

**Example:** A rubric for "orphan code without explicit deadness comment" baseline-produced `{manual, safe_auto, gated_auto}` randomly across 4 trials. Tightened rubric pinned it to `gated_auto` deterministically — that's a win independent of which class was chosen.

### When Variance Is Acceptable

- **Boundary cases where both readings are defensible** (second-order signal) — stable disagreement is not a problem
- **Textbook cases** (third-order) — variance here indicates a bigger rubric problem, but fixing it is low-value
- **Creative output** (brainstorming, ideation) — variance is a feature, not a bug

## Real-World Impact

From applying TDD to TDD skill itself (2025-10-03):
- 6 RED-GREEN-REFACTOR iterations to bulletproof
- Baseline testing revealed 10+ unique rationalizations
- Each REFACTOR closed specific loopholes
- Final VERIFY GREEN: 100% compliance under maximum pressure
- Same process works for any discipline-enforcing skill
