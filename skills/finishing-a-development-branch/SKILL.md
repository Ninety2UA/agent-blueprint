---
name: finishing-a-development-branch
description: "Trigger this skill when all implementation is complete and tests pass — even if the user doesn't explicitly ask what's next. Trigger when the user says 'done with the feature', 'ready to merge', 'branch is complete', 'what now', 'finished implementing', 'all tests pass now what', 'how do I wrap this up', or 'integration options'. Trigger when you detect that a feature branch has all planned work completed and tests are green. Guides completion by presenting structured options: merge to main, create a PR, or cleanup. Verifies tests pass before presenting options. DO NOT TRIGGER for creating PRs specifically — use pr-workflow instead. DO NOT TRIGGER if implementation is still in progress or tests are failing."
---

# Finishing a Development Branch

## Overview

Guide completion of development work by presenting clear options and handling chosen workflow.

**Core principle:** Verify tests → Audit the plan → Present options → Execute choice → Clean up.

**Announce at start:** "I'm using the finishing-a-development-branch skill to complete this work."

## The Process

### Step 1: Verify Tests

**Before presenting options, verify tests pass:**

```bash
# Run project's test suite
npm test / cargo test / pytest / go test ./...
```

**If tests fail:**
```
Tests failing (<N> failures). Must fix before completing:

[Show failures]

Cannot proceed with merge/PR until tests pass.
```

Stop. Don't proceed to Step 2.

**If tests pass:** Continue to Step 2.

### Step 2: Determine Base Branch

```bash
# Try common base branches
git merge-base HEAD main 2>/dev/null || git merge-base HEAD master 2>/dev/null
```

Or ask: "This branch split from main - is that correct?"

### Step 3: Plan Audit

A fresh-context, read-only agent classifies every plan item against the branch diff before any option is offered. This step owns the audit procedure. `pr-workflow` renders the result; `executing-plans` and `subagent-driven-development` pass the plan path.

**Plan path.** Use the path the caller passed. Without one, take the newest `docs/plans/*.md` file added or modified on the branch, skipping design documents:

```bash
git log --name-only --format= <base-branch>..HEAD -- docs/plans/ | grep -v -- '-design\.md$' | grep . | sort -u | tail -1
```

Plan items are `### U<N>.` headings, `### Task N:` headings, or checklist lines. No plan file, or a file with no items, reports `NO PLAN`. Show that line, skip the table, and continue to Step 4 — a missing plan never blocks.

**Dispatch.** Dispatch a fresh `code-reviewer` subagent with this prompt and nothing else (its tool grant includes Bash; the prompt, not the grant, holds it to reads):

```
Task tool (code-reviewer):
  Plan audit. Classify; do not review. Read only.

  PLAN_FILE: <plan-path>
  DIFF: git diff <base-branch>...HEAD
  ITEMS: every `### U<N>.` heading, `### Task N:` heading, and checklist line in PLAN_FILE

  Output one table row per item: | Item | State | Evidence |
  State is exactly one of DONE, CHANGED, PARTIAL, NOT DONE, DEFERRED, UNVERIFIABLE.
  CHANGED states the reason. DEFERRED names the BACKLOG.md line or the plan's
  Assumptions entry that defers it. Evidence is one line: a path and hunk, a
  commit, or the sentence that decided the call.

  Then, under the heading "Unplanned diff work", list every change in DIFF that
  no item covers, one line each, or the single word "none". Never list
  PLAN_FILE or .claude/plans/*.progress.local.md there.

  Output the table and that list only. No strengths, no issues, no assessment.
```

**States and their evidence:**

| State | Meaning | Evidence line |
|-------|---------|---------------|
| DONE | The diff delivers the item as planned | Path and hunk, or commit |
| CHANGED | Delivered, but not as planned | The hunk plus the reason |
| PARTIAL | Some of the item landed | What landed; what is missing |
| NOT DONE | Nothing in the diff addresses it | "no hunk" |
| DEFERRED | A `BACKLOG.md` line or a plan-file Assumptions entry defers it | That line, quoted |
| UNVERIFIABLE | The diff cannot show it (runtime or external behaviour) | Why the diff cannot show it |

**The gate:**

<HARD-GATE>
Any NOT DONE or PARTIAL row blocks Options 1 and 2. Show the blocking rows and offer Option 3 only. DONE, CHANGED, DEFERRED, UNVERIFIABLE, and NO PLAN never block.
</HARD-GATE>

Keep the table and the unplanned-work list: Option 2 passes both to `pr-workflow`.

**Autonomous runs** (autonomous-loop, ship-pipeline): a blocked gate stops the run. Report with autonomous-loop's structured escalation format (what I was trying / what I tried / what I think / what I need) and open no PR.

### Step 4: Present Options

Present exactly these 3 options:

```
Implementation complete. What would you like to do?

1. Merge back to <base-branch> locally
2. Push and create a Pull Request
3. Keep the branch as-is (I'll handle it later)

Which option?
```

**Don't add explanation** - keep options concise.

When Step 3 blocked, mark options 1 and 2 `(blocked by plan audit)` and accept only 3.

Discarding the branch is not on the menu. It runs only on an explicit request — see "Discarding work" below.

### Step 5: Execute Choice

#### Option 1: Merge Locally

```bash
# From the main checkout — a worktree cannot check out the branch the main checkout holds
cd <main-checkout>
git checkout <base-branch>
git pull
git merge <feature-branch>

# Verify tests on merged result
<test command>

# If tests pass: the worktree goes first (git refuses to delete a branch a worktree still holds), then the branch
git worktree remove <worktree-path>   # skip when the branch had no worktree
git branch -d <feature-branch>
```

Then: confirm the cleanup (Step 6). If `git worktree remove` refuses, keep the worktree and the branch and report the dirty state (Option 3 behaviour).

#### Option 2: Push and Create PR

**REQUIRED SUB-SKILL:** Use pr-workflow.

Pass it the Step 3 table and the unplanned-work list (or the `NO PLAN` line); its `## Plan audit` section renders them. `pr-workflow` runs the audit itself only when it receives no table.

Then: Keep the worktree for review fixes (Step 6)

#### Option 3: Keep As-Is

Report: "Keeping branch <name>. Worktree preserved at <path>."

**Don't cleanup worktree.**

#### Discarding work (explicit request only)

Not a menu option. Run this path only when the user says "Discard this work" or asks for it by name.

1. List what would be lost:
   ```bash
   git status --porcelain                                # untracked and modified files
   git log --oneline <base-branch>..<feature-branch>     # commits
   ```
2. Confirm the worktree removes cleanly: the status output must be empty. Any line printed means removal would be refused — go to **Refused removal** and run nothing else.
3. Ask for typed confirmation:
   ```
   This will permanently delete:
   - Branch <name>
   - All commits: <commit-list>
   - Worktree at <path>

   Type 'discard' to confirm.
   ```
   Wait for the exact word.
4. Only after confirmation:
   ```bash
   # In a worktree: leave it, remove it, then delete the branch
   cd <main-checkout>
   git worktree remove <worktree-path>
   git branch -D <feature-branch>

   # Plain branch, no worktree
   git checkout <base-branch>
   git branch -D <feature-branch>
   ```
   Remove the worktree before deleting the branch; git refuses to delete a branch a worktree still holds. If git refuses the removal, stop: keep the worktree and the branch, then go to **Refused removal**.

**Refused removal.** Report the state and relay the commands. Never run them yourself. With a worktree:

```
Worktree <path> has uncommitted changes and was not removed:
<git status --porcelain output>

To discard anyway, run these yourself:
  git worktree remove --force <worktree-path>
  git branch -D <feature-branch>
```

Plain branch, no worktree:

```
Branch <name> has uncommitted changes and was not deleted:
<git status --porcelain output>

Commit or stash them first, or to discard anyway run these yourself:
  git checkout <base-branch>
  git branch -D <feature-branch>
```

### Step 6: Cleanup Worktree

**For Option 1:** the merge sequence already removed the worktree before deleting the branch. Confirm nothing is left:
```bash
git worktree list | grep <feature-branch>   # must print nothing
```

No force flag, ever — using-git-worktrees, "Removing a Worktree", owns that rule. If git refused the removal, the branch still exists and the worktree is intact: report the dirty state and keep both (Option 3 behaviour).

**For Options 2 and 3:** Keep worktree.

**Discard path:** its own step 4 removes the worktree under the same rule.

## Quick Reference

| Path | Merge | Push | Keep Worktree | Cleanup Branch |
|------|-------|------|---------------|----------------|
| 1. Merge locally | ✓ | - | - | ✓ |
| 2. Create PR | - | ✓ | ✓ | - |
| 3. Keep as-is | - | - | ✓ | - |
| Discard (explicit request only) | - | - | - | ✓ (typed confirmation; never forced) |

## Common Mistakes

**Skipping test verification**
- **Problem:** Merge broken code, create failing PR
- **Fix:** Always verify tests before offering options

**Skipping the plan audit**
- **Problem:** Branch declared finished with planned work missing
- **Fix:** Run Step 3 before the menu; NOT DONE or PARTIAL blocks merge and PR

**Open-ended questions**
- **Problem:** "What should I do next?" → ambiguous
- **Fix:** Present exactly 3 structured options

**Automatic worktree cleanup**
- **Problem:** Remove worktree when might need it (Option 2, 3)
- **Fix:** Only cleanup for Option 1 and the explicit discard path

**Offering discard**
- **Problem:** A menu slot invites an accidental "4"
- **Fix:** Discard only on explicit request, after listing files, with typed "discard"

**Forcing a refused removal**
- **Problem:** Uncommitted work vanishes silently
- **Fix:** Never pass the force flag; relay the command for the user to run

## Red Flags

**Never:**
- Proceed with failing tests
- Merge or open a PR while the audit shows NOT DONE or PARTIAL
- Merge without verifying tests on result
- Offer discard as a menu option
- Delete work without typed confirmation
- Force a worktree removal (relay the command instead)
- Force-push without explicit request

**Always:**
- Verify tests before offering options
- Run the plan audit before the menu; NO PLAN is a report, not a block
- Present exactly 3 options
- List untracked and modified files before asking for the typed discard confirmation
- Clean up worktree for Option 1 and the discard path only

## Integration

**Called by:**
- **subagent-driven-development** (Progress File) - After all tasks complete; passes the plan path
- **executing-plans** (Step 5) - After all batches complete; passes the plan path

**Pairs with:**
- **using-git-worktrees** - "Removing a Worktree" owns the never-force rule and the refusal branch that Step 6 and the discard path follow
- **pr-workflow** - Option 2 delegates PR creation and passes the audit table and unplanned-work list for its `## Plan audit` section
- **code-reviewer** (agent) - Step 3 dispatches it read-only for the classification table
