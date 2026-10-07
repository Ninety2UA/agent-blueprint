---
name: ab-project-status
description: "Reports where the project stands: reads docs/context/STATUS.md (its Session Continuity section first), GOALS.md, BACKLOG.md and the git state, then presents the code state, work in flight, goal progress, what needs attention and the top three next actions with reasons. Use when the user asks for status, an overview or summary, what is going on, what is next or what the priorities are, or wants to get oriented at the start of a session. Not for resuming a prior session's tasks (ab-resume-session), a build, test and lint health check (ab-health-check), or setting up a new project (ab-project-start)."
---

# Project Status

The outcome is a short status report the user can act on, ending in three suggested next actions with the reason for each. It reads and reports only; it changes no files.

## Read

1. `docs/context/STATUS.md`: its **Session Continuity** section (where the last session left off), then work in flight, what is done, known issues and blockers.
2. `docs/context/GOALS.md`: objectives, milestones, priorities.
3. `BACKLOG.md`: the Inbox for unprocessed items, Triaged for P0/P1 items.
4. The git state:
   ```bash
   git log --oneline -10
   git status
   git branch --show-current
   ```

If `docs/context/` does not exist, say so and suggest the ab-project-start skill instead of guessing a status.

## Report

**Project Status — [date]**

**Code State:**
- Build, test and lint status from STATUS.md
- Current branch and uncommitted changes from git

**In Flight:**
- [table of active work from STATUS.md, with blockers highlighted]

**Goal Progress:**
- [which objectives and milestones are advancing, which are stalled]

**Attention Needed:**
- [P0/P1 backlog items not yet in flight]
- [blocked items and what unblocks them]
- [known issues by severity]
- [count of unprocessed Inbox items]

**Suggested Next Actions (top 3):**
1. [highest-priority action, based on goals, status and blockers]
2. [second priority]
3. [third priority]

Give the reasoning for each suggestion: why this one over the other options, so the user can disagree with the reason rather than just the pick.
