---
name: ab-discuss
description: "Captures and locks the user's decisions before planning: asks a few focused multiple-choice questions on the ambiguous choices, checks earlier ADRs, plans, research and learnings for prior art, and records decisions, non-goals and open questions in docs/context/DECISIONS.md for planners to honor. Use when requirements are ambiguous or assumptions undocumented, or when the user wants to settle decisions, constraints or requirements before a plan is written. Not for exploring designs and alternatives (ab-brainstorming) or for implementing anything: it records decisions and does not act on them."
---

# Discuss: Decision Capture

The outcome is a set of locked decisions in `docs/context/DECISIONS.md`, captured before planning, so the plan follows what the user chose instead of what a planner assumed.

Announce at start: "I'm using the ab-discuss skill to capture decisions before we plan, so nothing gets lost or assumed."

## Process

### Step 1: Understand the goal

Take the goal from the user's request that came with this skill, and ask the user to describe what they want to build or change only when the request does not say. Listen for:
- **Explicit requirements**: features, behavior, constraints
- **Implicit preferences**: technology choices, patterns, trade-offs
- **Non-goals**: what this is not (scope boundaries)

**Asking the user.** Ask with your question tool if you have one, offering at most three options; otherwise ask in plain text with a numbered list. In a headless or unattended run nobody will answer: take the default named below, say so in your output, and log it in the run state's decisions if there is a run state.

An open question, with no options. Default when nobody answers: work from the request as given, and let step 2 settle what it leaves unstated.

### Step 2: Ask clarifying questions

Ask about the ambiguous areas as structured choices, your recommendation first:
- Technology or approach (for example, "REST or GraphQL?")
- Scope (for example, "Include the admin UI now or later?")
- Priority trade-offs (for example, "Optimize for speed or flexibility?")

Ask 2-4 focused questions per round, because a longer list gets skimmed answers; if more clarity is needed, ask another round.

**Asking the user.** Ask with your question tool if you have one, offering at most three options; otherwise ask in plain text with a numbered list. In a headless or unattended run nobody will answer: take the default named below, say so in your output, and log it in the run state's decisions if there is a run state.

Options: the likely answers to each question, your recommendation first. Default when nobody answers: take the recommended answer and lock it marked `(assumed)`, so planners and the user can see which decisions nobody confirmed.

### Step 3: Search for prior art

Before finalizing, look for related history:
1. `docs/decisions/` for related ADRs
2. `docs/plans/` for similar past plans
3. `docs/research/` for relevant research
4. `docs/learnings/LEARNINGS.md` and the Learnings section of the project instructions file

When something relevant turns up, present it: "Found a related decision in [file]: [summary]. Does this still apply?"

**Asking the user.** Ask with your question tool if you have one, offering at most three options; otherwise ask in plain text with a numbered list. In a headless or unattended run nobody will answer: take the default named below, say so in your output, and log it in the run state's decisions if there is a run state.

Options: it still applies; it no longer applies; it applies with changes (say which). Default when nobody answers: treat it as still applying and cite it in the decision.

### Step 4: Lock decisions

Write the decisions to `docs/context/DECISIONS.md` in this format. If the file already exists, append a new section and keep the earlier ones unless the user says to replace them, because other plans may rely on them.

```markdown
# Locked Decisions — [Feature/Topic]

_Captured: YYYY-MM-DD_

## Decisions

- **[Decision 1]:** [What was decided and why]
- **[Decision 2]:** [What was decided and why]

## Non-Goals

- [What is explicitly out of scope]

## Open Questions

- [Anything still unresolved — planners should ask about these]
```

### Step 5: Confirm

Present the locked decisions and say: "These decisions are now locked for planning, and planners will honor them. Anything to change?"

**Asking the user.** Ask with your question tool if you have one, offering at most three options; otherwise ask in plain text with a numbered list. In a headless or unattended run nobody will answer: take the default named below, say so in your output, and log it in the run state's decisions if there is a run state.

Options: keep them as written, or change them (say which). Default when nobody answers: keep them as written.

## Rules

- Planners treat locked decisions as fixed, because they record the user's choices; a planner who disagrees raises it with the user instead of planning around it.
- Resolve open questions before planning starts, because a plan built on an open question bakes in a guess.
- When the user later changes a locked decision, update DECISIONS.md, so no planner follows a stale choice.
- Keep DECISIONS.md to decisions, not discussion, so a planner can read it in one pass.
