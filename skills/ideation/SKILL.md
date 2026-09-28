---
name: ideation
description: "Trigger this skill when the user wants improvement ideas, project direction suggestions, or creative inspiration for what to work on next. Trigger when the user says 'what should I build', 'give me ideas', 'surprise me', 'what would you change', 'what's worth improving', 'suggest improvements', 'what to work on next', 'I'm stuck', 'I don't know what to do', 'what needs attention', or 'where should I focus'. Trigger even when the user seems stuck, directionless, or doesn't know what to do next — proactively suggest running ideation to generate grounded possibilities. Also trigger when a session starts with no clear goal or the user asks for a codebase health check. Generates improvement ideas by scanning the codebase, then critically filters to the strongest survivors. DO NOT TRIGGER when the user already knows what they want to build — use brainstorming instead. DO NOT TRIGGER for research on a specific known topic — use deep-research instead."
argument-hint: "[optional: focus area, constraint, or volume hint]"
---

# Generate Improvement Ideas

`/ideation` answers: **"What are the strongest ideas worth exploring?"**

This skill produces a ranked ideation artifact in `docs/research/`. It does **not** produce requirements, plans, or code. When the user selects an idea, hand off to `/writing-plans`.

## When NOT to Use

- **The user already knows what to build** — use `/brainstorming` to design that specific thing.
- **Research on a single named topic** — use `/deep-research`, not ideation.
- **Sub-tasking a known feature** — use `/writing-plans` directly.
- **Picking between two pre-named options** — use `/discuss`; ideation is for "I don't know what to do," not "which of these two?"
- **Bug triage** — use `/backlog-triage`; ideation generates new directions, it doesn't rank existing reports.

## Focus Hint

The user's argument: $ARGUMENTS

Interpret as optional context:
- A concept: `DX improvements`
- A path: `src/api/`
- A constraint: `low-complexity quick wins`
- A volume hint: `top 3`, `go deep`, `raise the bar`

If no argument, proceed with open-ended ideation.

Default volume: ~8-10 ideas per agent (yielding ~25 raw, ~15-20 after dedupe), keep 5-7 survivors. Honor clear overrides.

## Phase 0: Resume & Scope

Check `docs/research/` for ideation documents (`*-ideation.md`) created within the last 30 days.

If a relevant doc exists (matching topic/focus), ask whether to:
1. Continue from it (read, summarize, update in place)
2. Start fresh

Parse the focus hint into: focus context, volume override.

## Phase 1: Codebase Scan

Use the Task tool to dispatch 3 existing agents **in parallel** (foreground — results needed before proceeding):

```
Task("learnings-researcher: Search docs/solutions/, docs/learnings/, and docs/context/DECISIONS.md for known pain points, recurring issues, and areas flagged for improvement. Focus: {focus_hint}")

Task("codebase-context-mapper: Map project structure, patterns, conventions, and gaps. Identify areas with high complexity, missing tests, or unclear architecture. Focus: {focus_hint}")

Task("git-history-analyzer: Analyze recent git history (last 30 days). Find: hot files (most changed), recurring fix patterns, areas with frequent churn, recent refactors that may have follow-up work. Focus: {focus_hint}")
```

Consolidate results into a **grounding summary**:
- **Project shape** — language, framework, structure, key patterns
- **Known pain points** — from learnings and past solutions
- **Hot spots** — from git churn analysis
- **Gaps** — missing tests, unclear docs, incomplete features

## Phase 2: Divergent Ideation

Generate the full candidate list **before** critiquing any idea.

Use the Task tool to dispatch 3 parallel ideation subagents (inherited model). Each gets: the grounding summary, the focus hint, and a per-agent volume target (~8-10 ideas). Instruct each to generate raw candidates only — no critique.

Assign each a different **ideation frame** as a starting bias (not a constraint — cross-cutting ideas are valuable):

```
Task("Ideation agent (friction frame): Generate ~{volume} concrete improvement ideas for this project, grounded in the codebase scan below. Start from this frame: User/developer friction — What's painful, slow, confusing, or error-prone? Where do people waste time? Follow any promising thread. Every idea must be grounded in the actual codebase — no abstract product advice. For each idea, return: title, summary (2-3 sentences), why_it_matters (1 sentence), grounding_evidence (what in the scan supports this). Focus hint: {focus_hint}. Grounding summary: {grounding_summary}")

Task("Ideation agent (inversion frame): Generate ~{volume} concrete improvement ideas for this project, grounded in the codebase scan below. Start from this frame: Inversion and removal — What can be eliminated, automated, or simplified? What would happen if we removed this entirely? Follow any promising thread. Every idea must be grounded in the actual codebase — no abstract product advice. For each idea, return: title, summary (2-3 sentences), why_it_matters (1 sentence), grounding_evidence (what in the scan supports this). Focus hint: {focus_hint}. Grounding summary: {grounding_summary}")

Task("Ideation agent (leverage frame): Generate ~{volume} concrete improvement ideas for this project, grounded in the codebase scan below. Start from this frame: Leverage and compounding — What small change would make many future changes easier? Where does effort compound? Follow any promising thread. Every idea must be grounded in the actual codebase — no abstract product advice. For each idea, return: title, summary (2-3 sentences), why_it_matters (1 sentence), grounding_evidence (what in the scan supports this). Focus hint: {focus_hint}. Grounding summary: {grounding_summary}")
```

**Important:** Dispatch ALL 3 in a single message to maximize parallelism.

After all agents return:
1. Merge and dedupe into one master list
2. Synthesize cross-cutting combinations — scan for ideas from different frames that combine into something stronger (expect 2-4 additions)
3. If a focus was provided, weight toward it without excluding stronger adjacent ideas

## Phase 3: Adversarial Filtering

The orchestrator (you) reviews every candidate directly — do not dispatch subagents for critique.

For each rejected idea, write a one-line reason.

**Rejection criteria:**
- Too vague to act on
- Not actionable without major prerequisite work
- Duplicates a stronger idea
- Not grounded in the current codebase
- Too expensive relative to likely value
- Already covered by existing workflows, tools, or docs
- Interesting but trivial (not worth a brainstorm session)

**Score survivors** using: groundedness, expected value, novelty, pragmatism, leverage on future work, implementation burden.

**Size scrutiny by reversibility.** Tag each survivor as a *two-way door* (easily reversed — ship it, learn, back it out cheaply) or a *one-way door* (hard or impossible to undo — a data migration, a public API shape, a foundational dependency). Two-way doors can be decided fast on thin evidence; being wrong is cheap. One-way doors warrant deeper scrutiny — demand stronger grounding, surface more alternatives, and record the irreversibility in the idea's downsides so the user can see which choices lock the project in.

Target: keep 5-7 survivors. If too many survive, run a stricter pass. If fewer than 5, report honestly — don't lower the bar.

## Phase 4: Present Survivors

Present surviving ideas in structured form:

```
### 1. [Title]
**Description:** [Concrete explanation]
**Rationale:** [Why this improves the project]
**Downsides:** [Tradeoffs or costs]
**Confidence:** [0-100%]
**Complexity:** [Low / Medium / High]
```

Then include a brief **rejection summary** table:

| # | Idea | Reason Rejected |
|---|------|-----------------|
| 1 | ... | ... |

## Phase 5: Hand Off

After presenting, ask what should happen next:

1. **Brainstorm a selected idea** — write/update the ideation doc, mark that idea as `Explored`, then invoke `/writing-plans` with the selected idea as the seed
2. **Refine the ideation** — add more angles (→ Phase 2), raise the bar (→ Phase 3), or dig deeper on one idea
3. **End session** — write/update the ideation doc, offer to commit it

## Artifact Format

Save to `docs/research/YYYY-MM-DD-<topic>-ideation.md` (or `open-ideation.md` if no focus):

```markdown
---
date: YYYY-MM-DD
topic: <kebab-case-topic>
focus: <optional focus hint>
---

# Ideation: <Title>

## Codebase Context
[Grounding summary from Phase 1]

## Ranked Ideas

### 1. <Idea Title>
**Description:** [Concrete explanation]
**Rationale:** [Why this improves the project]
**Downsides:** [Tradeoffs or costs]
**Confidence:** [0-100%]
**Complexity:** [Low / Medium / High]
**Status:** [Unexplored / Explored]

## Rejection Summary

| # | Idea | Reason Rejected |
|---|------|-----------------|
| 1 | <Idea> | <Reason> |

## Session Log
- YYYY-MM-DD: Initial ideation — <candidate count> generated, <survivor count> survived
```

**Always write the artifact before:** handing off to `/writing-plans`, ending the session, or after refinement rounds.

## Key Principles

- **Ground before ideating** — scan the actual codebase first. No abstract advice.
- **Generate many → critique all → explain survivors** — quality comes from explicit rejection, not optimistic ranking.
- **Route to /writing-plans** — ideation identifies directions; `/writing-plans` defines the selected one precisely.

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "I already know what to build, skip ideation" | Then use `/brainstorming` directly. Ideation is for "I don't know what's worth doing" — not for re-ranking a foregone conclusion. |
| "More ideas is better" | 25 shallow ideas beats 8 strong ones less than half the time. The critique pass matters more than the volume. |
| "Skip the rejection summary, only show survivors" | The rejected list is half the value — it tells the user what was considered and why it didn't survive. Without it, survivors look arbitrary. |
| "I'll skip the codebase scan and ideate from intuition" | Ungrounded ideas drift toward generic advice. The signal is in what *this* codebase needs, not what any codebase might. |
| "Just hand the top idea to /writing-plans automatically" | The user picks. Ideation produces a ranked menu; planning operates on the chosen item. Automating the choice removes the user's leverage. |
| "Painkiller-vs-vitamin distinction is too philosophical" | It's the cheapest filter we have. Vitamins look reasonable in a list; under the painkiller test, most evaporate. |
