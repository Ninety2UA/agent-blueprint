---
name: ab-context-checkpoint
description: "Saves a lightweight recovery point mid-session: gathers the branch, recent commits, uncommitted changes and test state, then writes a timestamped docs/context/CHECKPOINT file with progress, decisions, next steps and open questions, or, near the end of a session, rewrites the Session Continuity section of docs/context/STATUS.md. Documentation only; faster and less complete than a session wrap. Use when the context window is getting large, before a risky operation such as a large refactor or dependency upgrade, when switching between major tasks, or after significant progress worth preserving. Mostly run by ab-pause-checkpoint. Not for the end of a session (ab-session-wrap) or as the user-facing pause (ab-pause-checkpoint)."
---

# Context Checkpoint

Capture the current session state in a lightweight checkpoint: a save point that is faster and less complete than the ab-session-wrap skill, for when the session goes on. The checkpoint is done when the file or section is written and the user has the Step 3 confirmation.

## When to Use

- Mid-session, after significant progress, as a recovery point
- Before a risky operation (large refactor, dependency upgrade)
- When the context window is getting large and key decisions need preserving
- When switching focus within the same session (checkpoint the current work, then start the new task)

**Documentation only.** Change no source code, tests or configuration files, because a save point that edits code slips an unreviewed change in with it. If you find a code change is needed, note it in the checkpoint.

## Process

### Step 1: Gather State

Collect:
```bash
# Current branch and recent commits
git branch --show-current
git log --oneline -5

# Uncommitted changes
git status --short

# Current test/build state (if known)
```

Include every uncommitted change in the checkpoint: forgetting what was changed but not committed is the most common context loss.

### Step 2: Write Checkpoint

Pick the target by situation:

| Situation | Action |
|-----------|--------|
| Mid-session save | Create checkpoint file (Option B) |
| Before risky operation | Create checkpoint file (Option B) |
| Nearly done for the day | Update Session Continuity instead (Option A) |
| Switching focus | Create checkpoint file (Option B), note the switch |

**Option A: Update Session Continuity** (near the end of a session)

Rewrite the Session Continuity section of `docs/context/STATUS.md`, at the top of the file, with the current state: update it in place when it already has content, and create it when it is missing. Write plain text with no HTML comments, because Hermes drops a context file that has one.

**Option B: Create checkpoint file** (mid-session save points)

Create `docs/context/CHECKPOINT-[YYYY-MM-DD-HHMM].md`:

```markdown
# Checkpoint: [brief description]

**Timestamp:** YYYY-MM-DD HH:MM
**Branch:** [current branch]

## What's been done so far
- [accomplishment 1 with file paths]
- [accomplishment 2]

## Current state
- Build: [passing/failing]
- Tests: [X passing, Y failing]
- Uncommitted changes: [list or "none"]

## Key decisions made
- [decision 1 and rationale]

## Next steps (in order)
1. [immediate next task]
2. [following task]

## Open questions
- [anything unresolved]
```

**Keep and cut order.** A checkpoint (and any focus instruction you give when the host compacts the context, such as Claude Code's `/compact`) keeps what can't be recovered and cuts what can:

- **Protect:** the user's goal and constraints, locked decisions with their reasons, the current task's acceptance criteria, the file paths and commands in play, unresolved errors verbatim.
- **Cut first:** tool output already acted on (old test logs, file dumps), superseded plans, repeated reads of the same file.
- **Compress before dropping:** a long log becomes its failing line plus a count, a file dump becomes `path:line` pointers, a dead-end exploration becomes one line on why it failed.

### Step 3: Confirm

Tell the user: "Checkpoint saved. You can resume from this point if context is lost."

A checkpoint should take about 30 seconds to write. If it is taking more than a minute, it is turning into a session wrap (the ab-session-wrap skill); keep it to the state someone needs to resume.
