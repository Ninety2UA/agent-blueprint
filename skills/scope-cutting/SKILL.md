---
name: scope-cutting
description: "Trigger this skill when a feature is too large, a plan has grown unwieldy, or timeline pressure demands cutting scope. Trigger when the user says 'scope down', 'MVP', 'too big', 'what can we cut', 'simplify', 'reduce scope', 'deadline risk', 'we don't have time for all of this', 'this is taking too long', 'can we ship less', or 'minimum viable'. Trigger even when the user hasn't explicitly asked to cut scope — proactively suggest this skill whenever a plan has more than 10 tasks, an estimate exceeds available time, or the user expresses concern about timeline or complexity. Systematically separates must-haves from nice-to-haves and identifies the smallest useful deliverable. DO NOT TRIGGER when the feature is already minimal and cutting more would make it useless. DO NOT TRIGGER when the complexity is in the core (you need a different approach, not less scope)."
---

# Scope Cutting

## Overview

Scope cutting is not failure — it's engineering judgment. Every feature has a core that delivers value and a periphery that adds polish. When time or complexity pressure hits, surgically remove the periphery and ship the core.

**Core principle:** Ship the smallest thing that's useful. Everything else is a follow-up.

## When to Use

- A feature estimate exceeds the available time
- A plan has grown beyond one focused session
- You're 60% through a plan and realize it's bigger than expected
- The user says "this is taking too long" or "can we simplify?"
- You're adding "while I'm here" improvements during implementation
- A spike revealed more complexity than anticipated

**Don't use when:**
- The feature is already minimal (cutting more would make it useless)
- The complexity is in the core, not the periphery (you need a different approach, not less scope)
- You haven't tried to estimate yet (estimate first, then cut if needed)

## The Iron Law

<HARD-GATE>
Never cut quality to save scope. Fewer features, done well, always beats more features done poorly. If you're tempted to skip tests, skip error handling, or skip validation to fit more features — you're cutting quality, not scope.
</HARD-GATE>

## Process

### Step 1: List Everything

Write down every task, feature, or requirement in the current scope. Include things you assumed but didn't write down.

```markdown
## Current Scope: [feature name]

1. User authentication with email/password
2. OAuth integration (Google, GitHub)
3. Password reset flow
4. Email verification
5. Remember me / persistent sessions
6. Account settings page
7. Profile picture upload
8. Two-factor authentication
9. Session management (view/revoke active sessions)
10. Audit log of login events
```

### Step 2: Classify Each Item

Use the MoSCoW method:

| Priority | Meaning | Rule of Thumb |
|----------|---------|---------------|
| **Must** | Without this, the feature doesn't work or isn't useful | Users literally cannot use the feature without it |
| **Should** | Important but the feature works without it | Users will ask for it soon after launch |
| **Could** | Nice to have, adds polish | Users would appreciate but won't miss |
| **Won't** (this time) | Explicitly out of scope | Documented for future consideration |

Apply the classification:

```markdown
## Scope Classification

### Must Have (ship-blocking)
1. User authentication with email/password
4. Email verification

### Should Have (next iteration)
3. Password reset flow
5. Remember me / persistent sessions
6. Account settings page

### Could Have (if time permits)
2. OAuth integration (Google, GitHub)
7. Profile picture upload

### Won't Have (future work)
8. Two-factor authentication
9. Session management
10. Audit log
```

### Step 3: Validate the Cut

Check the "Must Have" list against these criteria:

| Check | Question |
|-------|----------|
| **Usable** | Can a real user accomplish their goal with only the Must Haves? |
| **Coherent** | Does the reduced feature make sense, or does it feel broken? |
| **Testable** | Can you write meaningful tests for the reduced scope? |
| **Shippable** | Would you be comfortable deploying this to real users? |
| **Extensible** | Can the Should/Could items be added later without rework? |

If any check fails, move items from Should → Must until the checks pass.

### Step 4: Update the Plan

Rewrite the implementation plan with only the Must Haves. Move everything else to a "Follow-up" section.

```markdown
## Revised Plan: [feature name] — MVP

### This Iteration
- [ ] Task 1: [must-have item]
- [ ] Task 2: [must-have item]
- [ ] Task 3: [must-have item]

### Follow-up (add to BACKLOG.md)
- Password reset flow
- Remember me / persistent sessions
- Account settings page
- OAuth integration
- Profile picture upload
- Two-factor authentication
- Session management
- Audit log
```

Add the follow-up items to BACKLOG.md so they're tracked.

### Step 5: Communicate the Cut

Tell the user (or team) what was cut and why:

```markdown
## Scope Reduction: [feature name]

**Original scope:** 10 items
**Revised scope:** 2 items (Must Haves only)
**Reason:** [complexity exceeded estimate / time constraint / dependency blocked]

**What ships now:**
- Email/password authentication
- Email verification

**What ships next:**
- Password reset, persistent sessions, account settings

**What's deferred:**
- OAuth, 2FA, session management, audit log

**Trade-off:** Users can sign up and log in. They can't reset passwords yet —
support team handles resets manually until the next iteration.
```

## Scope Cutting Patterns

### The Walking Skeleton

Ship the thinnest possible end-to-end flow. For a CRUD app:
- One entity type
- Create and Read only (no Update/Delete yet)
- No pagination, no search, no filters
- Minimal validation
- Default styling only

### The Feature Flag Cut

Instead of removing code, gate it behind a feature flag:
- Ship the core feature enabled by default
- Keep partially-built features behind flags
- Enable them incrementally as they're finished
- Useful when the code is written but not tested

### The Hardcode Cut

Replace dynamic behavior with hardcoded values:
- Settings page? Hardcode defaults, add settings later
- Multi-currency support? Hardcode USD, add others later
- Configurable templates? Ship one template, add customization later

### The Manual Cut

Replace automation with manual process:
- Automated email notifications? Team sends them manually for now
- Self-service onboarding? Admin creates accounts manually
- Automated reporting? Export CSV, team builds reports manually

## Common Mistakes

**Cutting the wrong things** — Don't cut the core to save the periphery. Error handling, input validation, and basic security are never optional.

**Cutting without communicating** — Silently reducing scope creates surprise. Always tell stakeholders what was cut and what the plan is to add it back.

**Cutting too late** — Scope cutting at 90% completion means you've already paid for most of the work. Cut early, when you first suspect the scope is too large.

**Not tracking what was cut** — If it's not in BACKLOG.md, it's forgotten. Every cut item needs a tracking entry.

**"We'll add it later" without a plan** — "Later" means "never" without a concrete plan. Specify which iteration or milestone the cut items target.

**Negotiating with yourself** — "I'll just squeeze in one more thing." No. The cut is the cut. Additional items are scope creep in reverse.

## Red Flags That You Need to Cut Scope

- Plan has more than 8-10 tasks for one session
- You keep discovering new tasks during implementation
- Estimated time exceeds available time by > 30%
- Dependencies between tasks form a deep chain (> 4 levels)
- You're tempted to skip tests "just this once" to fit everything in
- The user is asking "how much longer?"

## Integration with Other Skills

| Situation | Skill |
|-----------|-------|
| Need to re-plan after cutting scope | writing-plans |
| Unsure what's truly essential | brainstorming (re-explore with constraints) |
| Cut items need to be tracked | Add to BACKLOG.md |
| Spike revealed scope is larger than expected | spike-exploration → scope-cutting |
| Reduced plan ready for execution | executing-plans or autonomous-loop |
