---
name: discuss
description: "Trigger this skill when the user wants to lock down decisions, capture requirements, or clarify assumptions before planning begins. Trigger when the user says 'discuss', 'let's talk about', 'capture decisions', 'requirements', 'what do we need', 'before planning', 'lock in decisions', 'clarify requirements', 'document assumptions', or 'what are the constraints'. Trigger even when the user hasn't explicitly asked to discuss — if requirements are ambiguous, assumptions are undocumented, or the team is about to plan without aligned decisions, proactively suggest this skill. This is a decision-capture-only skill that produces locked decisions planners must honor. DO NOT TRIGGER when the user wants full design exploration with alternatives and creative options — use brainstorming instead. DO NOT TRIGGER for implementation or code changes — this skill captures decisions, it does not execute them."
---

# Discuss — Decision Capture

You are capturing decisions BEFORE planning begins. This prevents assumption drift and ensures planners honor user intent.

**Announce at start:** "I'm using the discuss skill to capture decisions before we plan. This ensures nothing gets lost or assumed."

## Process

### Step 1: Understand the Goal

Ask the user to describe what they want to build or change. Listen for:
- **Explicit requirements** — features, behavior, constraints
- **Implicit preferences** — technology choices, patterns, trade-offs
- **Non-goals** — what this is NOT (scope boundaries)

### Step 2: Ask Clarifying Questions

Use AskUserQuestion to present structured choices for ambiguous areas:
- Technology or approach choices (e.g., "REST vs GraphQL?")
- Scope decisions (e.g., "Include admin UI now or later?")
- Priority trade-offs (e.g., "Optimize for speed or flexibility?")

Ask 2-4 focused questions. Do NOT ask more than 4 at once. If more clarity is needed, ask in rounds.

### Step 3: Search for Prior Art

Before finalizing, search the project for relevant history:
1. Check `docs/decisions/` for related ADRs
2. Check `docs/plans/` for similar past plans
3. Check `docs/research/` for relevant research
4. Check CLAUDE.md Key Learnings for related entries

If you find relevant prior art, present it: "Found related decision in [file] — [summary]. Does this still apply?"

### Step 4: Lock Decisions

Write captured decisions to `docs/context/DECISIONS.md` in this format:

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

Present the summary of locked decisions to the user.

Say: "These decisions are now locked for planning. Planners MUST honor them. Anything to change?"

## Rules

- Decisions marked as locked are NON-NEGOTIABLE for planners
- Open questions MUST be resolved before planning proceeds
- If the user changes a locked decision later, update DECISIONS.md
- Keep DECISIONS.md concise — decisions only, not discussion
- If `docs/context/DECISIONS.md` already exists, append new decisions (don't overwrite previous ones unless the user says to)
