---
name: ab-scope-cutting
description: "Cuts a feature or plan down to the smallest useful deliverable: lists everything in scope, sorts it with MoSCoW (must, should, could, won't), checks the must-haves still make a usable, testable, shippable feature, rewrites the plan around them and tracks the rest in BACKLOG.md. Use when a feature or plan is too big for the time available, a plan has more than about 10 tasks, a spike found more complexity than expected, or the user worries about the timeline or asks to scope down, simplify or find the MVP. Not for a feature that is already minimal, or one whose complexity sits in the core, which needs a different approach rather than less scope."
---

# Scope Cutting

The outcome is a revised plan holding only the must-haves, every cut item tracked in BACKLOG.md with the iteration it targets, and a short note to the user on what was cut and why. Every feature has a core that delivers value and a periphery that adds polish; under time or complexity pressure, ship the core and make the rest follow-ups. Cutting scope is engineering judgment, not failure: ship the smallest thing that is useful.

## When to use

- A feature estimate exceeds the available time, or a plan has grown beyond one focused session
- You are 60% through a plan and it is bigger than expected, or a spike revealed more complexity than anticipated
- The user says "this is taking too long" or "can we simplify?"
- You are adding "while I'm here" improvements during implementation

Not when the feature is already minimal (cutting more would make it useless), when the complexity is in the core rather than the periphery (you need a different approach, not less scope), or before anyone has estimated (estimate first, then cut if needed).

**Cut features, never quality.** Tests, error handling, input validation and basic security stay in whatever ships, because fewer features done well beat more features done poorly, and a defect shipped to fit one more feature costs more than that feature is worth. If you are tempted to skip any of them to fit more in, you are cutting quality, not scope.

## Process

### Step 1: List everything

Write down every task, feature or requirement in the current scope, including the ones you assumed but never wrote down.

Example: `references/worked-example.md` § Step 1 list.

### Step 2: Classify each item

Use the MoSCoW method:

| Priority | Meaning | Rule of thumb |
|----------|---------|---------------|
| **Must** | Without this, the feature doesn't work or isn't useful | Users cannot use the feature without it |
| **Should** | Important, but the feature works without it | Users will ask for it soon after launch |
| **Could** | Nice to have, adds polish | Users would appreciate it but won't miss it |
| **Won't** (this time) | Explicitly out of scope | Documented for future consideration |

Example: `references/worked-example.md` § Step 2 classification.

### Step 3: Validate the cut

Check the Must list against these criteria:

| Check | Question |
|-------|----------|
| **Usable** | Can a real user accomplish their goal with only the Must items? |
| **Coherent** | Does the reduced feature make sense, or does it feel broken? |
| **Testable** | Can you write meaningful tests for the reduced scope? |
| **Shippable** | Would you be comfortable deploying this to real users? |
| **Extensible** | Can the Should and Could items be added later without rework? |

If any check fails, move items from Should to Must until every check passes.

### Step 4: Update the plan

Rewrite the implementation plan with only the Must items, and move everything else to a "Follow-up" section. Then add each follow-up item to BACKLOG.md with the iteration or milestone it targets, because an untracked cut is forgotten and "later" without a target means never.

Example: `references/worked-example.md` § Step 4 revised plan.

### Step 5: Communicate the cut

Tell the user, or the team, what ships now, what ships next, what is deferred, why, and the trade-off users will live with in the meantime. A silent cut surprises people who expected the full scope.

Example: `references/worked-example.md` § Step 5 cut summary.

## Ways to cut

Walking skeleton, feature flag, hardcode and manual cuts, with what each one looks like: `references/patterns.md`.

## Common mistakes

- **Cutting the wrong things.** Cutting the core to save the periphery leaves nothing worth shipping; error handling, input validation and basic security are part of the core.
- **Cutting too late.** At 90% complete you have already paid for most of the work, so cut when you first suspect the scope is too large.
- **Negotiating with yourself.** Once the cut is made, hold it: squeezing in "one more thing" is scope creep in reverse, and it reopens the time problem the cut solved.

## Signs you need to cut

- The plan has more than 8-10 tasks for one session
- You keep discovering new tasks during implementation
- The estimate exceeds the available time by more than 30%
- Dependencies between tasks form a deep chain (more than 4 levels)
- You are tempted to skip tests "just this once" to fit everything in
- The user is asking "how much longer?"

## Related skills

| Situation | Skill |
|-----------|-------|
| Re-plan after cutting scope | the ab-writing-plans skill |
| Unsure what is truly essential | the ab-brainstorming skill, re-exploring with the new constraints |
| A spike revealed the scope is larger than expected | the ab-spike-exploration skill, then this one |
| The reduced plan is ready to run | the ab-executing-plans or ab-autonomous-loop skill |
