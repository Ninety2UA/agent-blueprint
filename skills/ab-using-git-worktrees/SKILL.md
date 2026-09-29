---
name: ab-using-git-worktrees
description: "Sets up an isolated git worktree for feature or parallel work: picks the worktree folder (an existing one, then the project instructions file's preference, then asks), checks that a project-local folder is git-ignored, creates the worktree on a new branch, installs dependencies and runs the tests for a clean baseline, and later removes worktrees without force. Use when work needs isolation from the current checkout, when parallel helpers need separate branches, or before running a plan in its own workspace; usually started by other skills such as ab-orchestrate. Not for plain branch creation (use git checkout -b)."
---

# Using Git Worktrees

A worktree is a second checkout of the same repository on its own branch, so work can proceed on several branches at once without switching. The skill ends with a worktree in the right folder, git-ignored when it sits inside the project, set up, and with a test baseline you have seen, because isolation is only reliable when the folder choice is systematic and the safety checks run.

**Announce at start:** "I'm using the ab-using-git-worktrees skill to set up an isolated workspace."

## Directory Selection Process

Follow this priority order: an existing directory, then the instructions file's preference, then ask. Guessing a location creates inconsistency and can break the project's conventions.

### 1. Check Existing Directories

```bash
# Check in priority order
ls -d .worktrees 2>/dev/null     # Preferred (hidden)
ls -d worktrees 2>/dev/null      # Alternative
```

**If found:** Use that directory. If both exist, `.worktrees` wins.

### 2. Check the project instructions file

```bash
grep -i "worktree.*director" AGENTS.md CLAUDE.md 2>/dev/null
```

**If preference specified:** Use it without asking.

### 3. Ask User

If no directory exists and the instructions file states no preference, ask where worktrees should go.

**Asking the user.** Ask with your question tool if you have one, offering at most three options; otherwise ask in plain text with a numbered list. In a headless or unattended run nobody will answer: take the default named below, say so in your output, and log it in the run state's decisions if there is a run state.

Options: `.worktrees/` (project-local, hidden) or `~/.agent-blueprint/worktrees/<project-name>/` (global location). Default when nobody answers: `~/.agent-blueprint/worktrees/<project-name>/`, because it sits outside the project and needs no `.gitignore` change or commit.

## Safety Verification

### For Project-Local Directories (.worktrees or worktrees)

Verify the directory is ignored before creating the worktree, because an unignored worktree gets its whole contents tracked and pollutes `git status`:

```bash
# Check if directory is ignored (respects local, global, and system gitignore)
git check-ignore -q .worktrees 2>/dev/null || git check-ignore -q worktrees 2>/dev/null
```

**If not ignored**, fix it before going on: add the directory to `.gitignore`, commit that change, then create the worktree.

**No-commit mode.** When the environment variable `AGENT_BLUEPRINT_GIT_WRITABLE` is `0`, or a commit fails because `.git` is read-only, make no commits: leave the changes in the working tree and add the commit message you would have used to `.agent-blueprint/run/commit-msg.md`, and the ship runner commits them after the session. A review step in this mode reviews the working tree and untracked files against the merge base instead of a commit range.

`git worktree add` writes to `.git` as well, so in this mode create no worktree: say so and hand back, and the caller works in the current checkout with disjoint file ownership, as the ab-orchestrate skill does.

### For Global Directory (~/.agent-blueprint/worktrees)

No .gitignore verification needed - outside project entirely.

## Creation Steps

### 1. Detect Project Name

```bash
project=$(basename "$(git rev-parse --show-toplevel)")
```

### 2. Create Worktree

```bash
# Determine full path ($HOME, since a quoted ~ is not expanded)
case "$LOCATION" in
  .worktrees|worktrees) path="$LOCATION/$BRANCH_NAME" ;;
  *) path="$HOME/.agent-blueprint/worktrees/$project/$BRANCH_NAME" ;;
esac

# Create worktree with new branch
git worktree add "$path" -b "$BRANCH_NAME"
cd "$path"
```

### 3. Run Project Setup

Detect the setup from the project's files rather than hardcoding one, since projects use different tools; skip it when none of these files exists:

```bash
if [ -f package.json ]; then npm install; fi                     # Node.js
if [ -f Cargo.toml ]; then cargo build; fi                       # Rust
if [ -f requirements.txt ]; then pip install -r requirements.txt; fi   # Python
if [ -f pyproject.toml ]; then poetry install; fi
if [ -f go.mod ]; then go mod download; fi                       # Go
```

### 4. Verify Clean Baseline

Run the project's tests (for example `npm test`, `cargo test`, `pytest`, `go test ./...`) so the worktree starts from a known state; without a baseline, new bugs cannot be told apart from old ones.

Run it from the worktree path, and keep every verification command inside it: no absolute paths into the main checkout, no `cd ..` out of the worktree, no `--prefix`/`-C` pointing at another tree. A test run that reads the main checkout reports on code the worktree didn't change.

**If tests pass:** Report ready.

**If tests fail:** report the failures and ask whether to proceed or investigate.

**Asking the user.** Ask with your question tool if you have one, offering at most three options; otherwise ask in plain text with a numbered list. In a headless or unattended run nobody will answer: take the default named below, say so in your output, and log it in the run state's decisions if there is a run state.

Options: proceed with the failures recorded as the baseline, investigate them first, or stop. Default when nobody answers: start no feature work; keep the worktree, report the failing tests as its baseline, and hand back to the caller.

### 5. Report Location

```
Worktree ready at <full-path>
Tests passing (<N> tests, 0 failures)
Ready to implement <feature-name>
```

## Removing a Worktree

Remove a worktree only after its branch is merged, or on the explicit discard path in ab-finishing-a-development-branch.

```bash
git worktree remove <path>
```

Git refuses a worktree with uncommitted changes, untracked files, or a submodule. That refusal is the safety check, so keep it:

- Never run `git worktree remove --force`, because it deletes uncommitted work for good; the user runs it by hand when they choose to lose the changes.
- On refusal, report the state (`git -C <path> status --short`), keep the worktree, and hand back.
- Do not clean, stash, or commit inside the worktree to make the removal succeed.
- Delete the branch only after the worktree is gone; git refuses to delete a branch a worktree still holds.

See `references/summary.md` for the quick reference, common mistakes, an example run, red flags and integration.
