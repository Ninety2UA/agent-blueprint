---
name: session-continuity
description: "Trigger this skill when pausing, resuming, or handing off work between sessions. Manages persistent state tracking via docs/context/STATE.md to ensure no context is lost across session boundaries. Trigger when session state needs to be written or updated — wave progress, task completion status, blockers, or execution phase changes. Usually invoked internally by pause-checkpoint and session-wrap, not directly by users. Trigger even when the user doesn't mention STATE.md explicitly — any session transition (pause, resume, wrap, handoff) needs state tracking. DO NOT TRIGGER as the primary user-facing command for pausing — use pause-checkpoint instead. DO NOT TRIGGER as the primary user-facing command for ending sessions — use session-wrap instead. This skill is the internal state persistence engine that those user-facing skills delegate to."
---

# Session Continuity

## Overview

Manage state across session boundaries so work can be paused and resumed without losing context. This skill extends the existing `/pause-checkpoint` and `/resume-session` skills with structured state tracking.

**Core principle:** Every session should be resumable. If you can't resume cleanly from a state file, the state file is incomplete.

## State File: docs/context/STATE.md

The central state tracking file. Updated automatically by `/pause-checkpoint`, `/session-wrap`, and wave-orchestration.

### State File Format

```markdown
---
last-updated: YYYY-MM-DD HH:MM
head: [current HEAD sha at the time of the stamp — optional on read; older STATE.md files won't have it]
session-id: [branch-name or task identifier]
phase: [planning | researching | executing | reviewing | compounding]
status: [active | paused | blocked | complete]
---

# Session State

## Current Work
- **Task:** [what's being worked on]
- **Branch:** [git branch name]
- **Phase:** [where in the workflow — planning/executing/reviewing]
- **Progress:** [X/Y tasks complete, or current step]

## Execution State

### Plan File
[path to current plan file]

### Wave Progress (if using wave-orchestration)
| Wave | Status | Tasks |
|------|--------|-------|
| Wave 1 | Complete | Tasks 1, 2, 3 |
| Wave 2 | In Progress (2/3) | Tasks 4, ~~5~~, 6 |
| Wave 3 | Pending | Tasks 7, 8 |

### Completed Tasks
- [x] Task 1: [description] — commit [sha]
- [x] Task 2: [description] — commit [sha]
- [ ] Task 3: [description] — IN PROGRESS
- Progress file: .claude/plans/<plan-basename>.progress.local.md — [when one exists: its ticks are the per-task resume point; an interrupted run leaves it in place]

## Context Needed to Resume
- [Key decision that was made and must be honored]
- [File that was being edited]
- [Test that was failing and why]

## Blockers (if any)
- [What's blocking progress and what's needed to unblock]

## Next Steps (in order)
1. [Immediate next action]
2. [Following action]
3. [After that]
```

## When to Update State

| Event | Action |
|-------|--------|
| Starting work on a plan | Create/update STATE.md with plan reference and phase |
| Completing a task in a plan | Update progress and completed tasks list |
| Completing a wave | Update wave progress table |
| Hitting a blocker | Add to blockers section |
| `/pause-checkpoint` | Full state dump including uncommitted changes |
| `/session-wrap` | Final state update before session end |
| `/resume-session` | Read STATE.md to reload context |

## Process: Pausing Work

When the user runs `/pause-checkpoint` or you need to save state:

1. **Capture git state:**
   ```bash
   git branch --show-current
   git status --short
   git log --oneline -5
   git stash list
   ```

2. **Update STATE.md** with current progress, decisions, and next steps

3. **Update Session Continuity** in CLAUDE.md with a one-line summary

4. **Confirm to user:** "State saved. Resume with `/resume-session` in a new session."

## Process: Resuming Work

When the user runs `/resume-session`:

1. **Read STATE.md** — full state including wave progress, blockers, next steps
2. **Read CLAUDE.md Session Continuity** — summary and "start here" instruction
3. **Check git state** — branch, uncommitted changes, stashes
4. **Verify plan file** — is it still current? Any tasks completed outside this session?
5. **Present orientation** — summary of where things stand and what's next
6. **Ask:** "Ready to continue from [next step]?"

## Process: Handing Off Between Sessions

When context is getting large or the session is ending:

1. Run full state dump to STATE.md
2. Note which subagents are pending (if any)
3. Record any in-flight decisions that aren't committed yet
4. Update the Session Continuity section in CLAUDE.md

The next session reads STATE.md and picks up exactly where work stopped.

## Integration with Wave Orchestration

During wave-orchestrated execution:
- STATE.md is updated after each wave completes
- If a session ends mid-wave, STATE.md records which tasks in the wave are done
- On resume, the orchestrator reads STATE.md and continues from the incomplete wave

## Common Mistakes

**Not updating on pause** — If you pause without updating STATE.md, the next session starts blind.

**Over-documenting state** — STATE.md is a resume point, not a diary. Key decisions + progress + next steps. That's it.

**Forgetting uncommitted changes** — Always run `git status` and record uncommitted changes. They're the most fragile state.

**Not recording decisions** — A decision made in session 1 but not recorded will be re-debated in session 2. Write it down.
