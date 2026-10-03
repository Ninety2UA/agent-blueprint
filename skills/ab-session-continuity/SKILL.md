---
name: ab-session-continuity
description: "Keeps docs/context/STATE.md, the execution-state file, current across session boundaries (plan and phase, wave and task progress, blockers, decisions to honor, next steps, a HEAD stamp) and refreshes the one-line summary in the Session Continuity section of docs/context/STATUS.md, so a later session or another tool resumes exactly where work stopped. Mostly run by ab-pause-checkpoint, ab-session-wrap and wave execution rather than by the user. Use when execution state must be written or read: starting or finishing a plan task or wave, hitting a blocker, pausing, handing off or resuming. Not the user-facing pause (ab-pause-checkpoint) or end-of-session wrap (ab-session-wrap)."
---

# Session Continuity

Manage state across session boundaries so work can be paused and resumed without losing context. This skill adds structured execution state to the ab-pause-checkpoint and ab-resume-session skills.

Every session should be resumable: if the next session can't resume cleanly from the state file, the state file is incomplete.

## State File: docs/context/STATE.md

The central execution-state file, updated by the ab-pause-checkpoint and ab-session-wrap skills.

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

### Wave Progress (if using ab-wave-orchestration)
| Wave | Status | Tasks |
|------|--------|-------|
| Wave 1 | Complete | Tasks 1, 2, 3 |
| Wave 2 | In Progress (2/3) | Tasks 4, ~~5~~, 6 |
| Wave 3 | Pending | Tasks 7, 8 |

### Completed Tasks
- [x] Task 1: [description] — commit [sha]
- [x] Task 2: [description] — commit [sha]
- [ ] Task 3: [description] — IN PROGRESS
- Progress file: .agent-blueprint/plans/<plan-basename>.progress.md — [when one exists: its ticks are the per-task resume point; an interrupted run leaves it in place]

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
| ab-pause-checkpoint | Full state dump including uncommitted changes |
| ab-session-wrap | Final update and HEAD stamp, only when STATE.md already exists |
| ab-resume-session | Read STATE.md to reload context |

**Tracking tasks.** The plan file's checkboxes are the record of progress: tick each one when its task is done and verified, so another session or another tool can continue from there. A host task list, if you have one, may mirror them, but it never replaces them.

STATE.md summarizes that progress for the handoff; it does not replace the plan's boxes or its progress file. When they disagree, trust the boxes and correct STATE.md from them.

## Process: Pausing Work

When the ab-pause-checkpoint skill runs, or you need to save state:

1. **Capture git state:**
   ```bash
   git branch --show-current
   git rev-parse HEAD
   git status --short
   git log --oneline -5
   git stash list
   ```

2. **Update STATE.md** with current progress, decisions and next steps, and stamp `last-updated:` and `head:` (the sha from `git rev-parse HEAD`) in its frontmatter, the stamp the ab-resume-session skill checks for freshness.

3. **Refresh Session Continuity** in `docs/context/STATUS.md`: a one-line summary of where work stands, and the Start here line rewritten to the same next action STATE.md now lists first, because the ab-resume-session skill continues from Start here before it reads STATE.md, and a stale Start here repeats finished work. Keep the section's other lines (what was done, what's remaining) in place.

4. **Confirm to the user:** "State saved. Resume with ab-resume-session in a new session."

## Process: Resuming Work

The ab-resume-session skill owns this: it reads STATE.md and the Session Continuity section of `docs/context/STATUS.md`, checks the git state, verifies the plan file is current, presents the orientation and asks whether to continue, with its own headless default. Keep both files in the shapes above and that skill finds what it needs.

## Process: Handing Off Between Sessions

When context is getting large or the session is ending:

1. Run a full state dump to STATE.md.
2. Note which helpers are still pending, if any.
3. Record any in-flight decisions that aren't committed yet.
4. Refresh the Session Continuity section in `docs/context/STATUS.md`.

The next session reads STATE.md and picks up exactly where work stopped.

## Integration with Wave Orchestration

During wave-orchestrated execution:
- STATE.md is updated after each wave completes
- If a session ends mid-wave, STATE.md records which tasks in the wave are done
- On resume, the orchestrator reads STATE.md and continues from the incomplete wave

## Common Mistakes

**Not updating on pause.** Pausing without updating STATE.md leaves the next session starting blind.

**Over-documenting state.** STATE.md is a resume point, not a diary: key decisions, progress and next steps, nothing more.

**Forgetting uncommitted changes.** Run `git status` and record what it shows, because uncommitted changes are the most fragile state.

**Not recording decisions.** A decision made in session 1 but not recorded will be re-debated in session 2, so write it under Context Needed to Resume.
