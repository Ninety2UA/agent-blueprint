---
name: project-status
description: "Trigger this skill when the user says 'status', 'where are we', 'what's going on', 'project state', 'what's next', 'priorities', 'what should I work on', 'show me the state', 'overview', 'summary', or anything indicating they want to understand current project state. Trigger at the start of any session when the user seems to be orienting themselves, even without the word 'status' — e.g. 'what's happening', 'catch me up', 'where do things stand'. Trigger even if the user doesn't explicitly ask for a report, as long as they seem to want orientation. Reads CLAUDE.md, STATUS.md, GOALS.md, BACKLOG.md, and git state, then presents a concise report with suggested next actions. DO NOT TRIGGER when the user wants to resume a prior session and pick up specific tasks — use resume-session instead. DO NOT TRIGGER when the user wants to set up a new project — use project-start instead."
---

# Project Status

Read these files and present a concise status report:

1. Read **Session Continuity** section in `CLAUDE.md` — where the last session left off
2. Read `docs/context/STATUS.md` — in flight work, what's done, known issues, blockers
3. Read `docs/context/GOALS.md` — objectives, milestones, priorities
4. Read `BACKLOG.md` — check Inbox for unprocessed items, Triaged for P0/P1 items
5. Run:
   ```bash
   git log --oneline -10
   git status
   git branch --show-current
   ```

Then present:

**Project Status — [date]**

**Code State:**
- Build/Tests/Lint status from STATUS.md
- Current branch and uncommitted changes from git

**In Flight:**
- [table of active work from STATUS.md with blockers highlighted]

**Goal Progress:**
- [which objectives/milestones are advancing, which are stalled]

**Attention Needed:**
- [P0/P1 backlog items not yet in flight]
- [Blocked items and what unblocks them]
- [Known issues by severity]
- [Unprocessed inbox items count]

**Suggested Next Actions (top 3):**
1. [highest priority action based on goals + status + blockers]
2. [second priority]
3. [third priority]

Include reasoning for each suggestion — why this over other options.
