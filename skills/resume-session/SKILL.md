---
name: resume-session
description: "Trigger this skill when the user says 'resume', 'continue', 'pick up where I left off', 'what was I working on', 'last session', 'keep going', 'where did we stop', 'let's continue', or anything suggesting they want to pick up prior work. Trigger at the start of any new session when CLAUDE.md Session Continuity has prior session data, even if the user just says 'hi', 'let's go', 'I'm back', or 'hey' — they likely want to resume. Trigger even when the user doesn't explicitly ask to resume, as long as there is session history to restore. Reads all session state (CLAUDE.md, STATE.md, STATUS.md, GOALS.md, BACKLOG.md, checkpoints) and presents an orientation with priorities and suggested starting point. DO NOT TRIGGER on a brand new project with no session history — use project-start instead. DO NOT TRIGGER when the user just wants a quick status overview without resuming work — use project-status instead."
---

# Resume Session

Reload all session context and present a clear starting point. Follow these steps in order:

## Step 1: Load Context (read all in parallel)

Read these files to understand where things stand:

- `CLAUDE.md` — Read the **Session Continuity** section first. This tells you what was done, what's remaining, and where to start.
- `docs/context/STATE.md` — Execution state: current wave, task progress, blockers (if exists)
- `docs/context/STATUS.md` — Current project state, in-flight work, known issues
- `docs/context/GOALS.md` — Current objectives and priorities
- `BACKLOG.md` — Pending items and their priority

Also check for checkpoint files:
```bash
ls docs/context/CHECKPOINT-*.md docs/context/STATE.md 2>/dev/null | sort -r | head -5
```

## Step 2: Check Git State

```bash
# Current branch
git branch --show-current

# Any uncommitted changes from last session
git status --short

# Recent commits
git log --oneline -10

# Any stashed work
git stash list
```

**Freshness stamp check** — only when `docs/context/STATE.md` exists and its frontmatter (read in Step 1) has a `head:` field:

```bash
# The stamp must be an ancestor of HEAD before it can anchor a count
git merge-base --is-ancestor <head> HEAD && echo ancestor
# Non-merge commits since the stamped HEAD
git log --oneline --no-merges <head>..HEAD
```

- Zero or one commit listed → fresh (the one commit is session-wrap's own wrap commit).
- More than one commit listed → warn "HEAD moved since the handoff" and list the commits.
- `<head>` doesn't resolve, or is not an ancestor of HEAD (a squash or rebase merge rewrote history; the old sha may still resolve from the branch or reflog) → anchor on the last commit that touched the file instead, then re-run the count from there: `git log -1 --format=%H -- docs/context/STATE.md`.
- STATE.md doesn't exist, or exists without a `head:` field → skip this check; there's no stamp to compare against.

## Step 3: Present Orientation

Structure the orientation as status, pointers, traps.

**Status** — current state, from Step 2:
- Branch: [branch name]
- Build: [status]
- Tests: [status]
- Uncommitted changes: [list or "clean"]
- Freshness: [fresh / "HEAD moved since the handoff" with the commit list / stamp check skipped, and why]

**Pointers** — quote the prior session's own words; don't re-summarize them:

> [Quote the "What was done", "What's remaining", and "Start here" text verbatim from CLAUDE.md's Session Continuity section.]

**Traps** — list only the priorities the project files actually record (STATE.md blockers, STATUS.md known issues, GOALS.md at-risk items, BACKLOG.md items flagged urgent). Omit a slot rather than inventing a filler priority — if none of these files name anything, say so instead of listing items by default.

Ask: **"Ready to continue from here, or would you like to work on something else?"**
