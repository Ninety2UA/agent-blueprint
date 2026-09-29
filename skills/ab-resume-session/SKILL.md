---
name: ab-resume-session
description: "Reloads what earlier sessions left (the Session Continuity section and the rest of docs/context/STATUS.md, STATE.md, GOALS.md, BACKLOG.md, the latest checkpoints), checks git state and whether HEAD moved since the handoff, then presents an orientation of status, the last session's own pointers and the recorded traps, and asks where to start. Use when the user wants to resume, continue or pick up earlier work or asks what they were working on, or opens a new session with only a greeting in a project whose STATUS.md has session history. Not for a new project with no history (ab-project-start) or a quick status overview without resuming work (ab-project-status)."
---

# Resume Session

Reload all session context and present a clear starting point. The resume is done when the user has the Step 3 orientation and a starting point is chosen. Follow these steps in order.

## Step 1: Load Context

Read these files, in parallel where you can, and skip any that does not exist:

- `docs/context/STATUS.md`: read its **Session Continuity** section first (what was done, what's remaining, and where to start), then the rest: current project state, in-flight work, known issues.
- `docs/context/STATE.md`: execution state, the current wave, task progress, blockers.
- `docs/context/GOALS.md`: current objectives and priorities.
- `BACKLOG.md`: pending items and their priority.

Also check for checkpoint files, and read the newest:
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

**Freshness stamp check**, only when `docs/context/STATE.md` exists and its frontmatter (read in Step 1) has a `head:` field:

```bash
# The stamp must be an ancestor of HEAD before it can anchor a count
git merge-base --is-ancestor <head> HEAD && echo ancestor
# Non-merge commits since the stamped HEAD
git log --oneline --no-merges <head>..HEAD
```

- Zero or one commit listed: fresh (the one commit is ab-session-wrap's own wrap commit).
- More than one commit listed: warn "HEAD moved since the handoff" and list the commits.
- `<head>` doesn't resolve, or is not an ancestor of HEAD (a squash or rebase merge rewrote history; the old sha may still resolve from the branch or reflog): anchor on the last commit that touched the file instead, then re-run the count from there: `git log -1 --format=%H -- docs/context/STATE.md`.
- STATE.md doesn't exist, or exists without a `head:` field: skip this check; there's no stamp to compare against.

## Step 3: Present Orientation

Structure the orientation as status, pointers, traps.

**Status**, the current state from Step 2:
- Branch: [branch name]
- Build: [status]
- Tests: [status]
- Uncommitted changes: [list or "clean"]
- Freshness: [fresh / "HEAD moved since the handoff" with the commit list / stamp check skipped, and why]

**Pointers**: quote the prior session's own words rather than re-summarizing them, because a summary of a summary drifts:

> [Quote the "What was done", "What's remaining", and "Start here" text verbatim from the Session Continuity section of docs/context/STATUS.md.]

**Traps**: list only the priorities the project files actually record (STATE.md blockers, STATUS.md known issues, GOALS.md at-risk items, BACKLOG.md items flagged urgent). Omit a slot rather than inventing a filler priority; if none of these files name anything, say so instead of listing items by default.

Then ask whether to continue from here or work on something else.

**Asking the user.** Ask with your question tool if you have one, offering at most three options; otherwise ask in plain text with a numbered list. In a headless or unattended run nobody will answer: take the default named below, say so in your output, and log it in the run state's decisions if there is a run state.

Options: 1. Continue from the "Start here" step. 2. Work on something else (the user names it). Default when nobody answers: continue from the "Start here" step, or from STATE.md's first Next Step when there is none; stop after the orientation instead if neither names a step or the freshness check warned that HEAD moved, because the recorded step may already be done.
