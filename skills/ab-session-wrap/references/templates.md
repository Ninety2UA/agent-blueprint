# ab-session-wrap — templates and command sets

Loaded on demand from `SKILL.md`; nothing here is needed on every invocation.

## Success criteria

- [ ] User received clear, accurate summary of session work with file paths and commit hashes
- [ ] User confirmed summary before docs were updated (or the report says a headless run took the default)
- [ ] docs/context/STATUS.md Session Continuity section has specific "start here" instruction
- [ ] docs/learnings/LEARNINGS.md reviewed this session — new entries added, or the confirmation report states "No durable learnings this session"
- [ ] docs/context/STATUS.md reflects actual current state with updated tables
- [ ] docs/context/STATUS.md commit log has new entries with real commit hashes
- [ ] docs/context/GOALS.md updated only if goals/milestones were affected
- [ ] docs/context/CONVENTIONS.md updated only if patterns/stack changed
- [ ] BACKLOG.md has completed items removed and new items added
- [ ] Active plans in docs/plans/ reflect current progress
- [ ] Active specs in docs/specs/ have updated acceptance criteria
- [ ] ADRs created for significant decisions
- [ ] Auto-memory updated if it exists
- [ ] All doc updates committed with descriptive message (in no-commit mode: message in `.agent-blueprint/run/commit-msg.md`)
- [ ] No source code files were modified
- [ ] "Last updated" dates are current

## Step 17 verification

```bash
# Verify no source code was accidentally modified
git diff --name-only | grep -v -E '\.(md|json)$' | head -5

# Verify working tree is clean (or only has expected uncommitted work)
git status
```

If this wrap modified a non-documentation file, revert that file:
```bash
git checkout -- [file]
```

Revert only files the wrap itself changed. Uncommitted work from earlier in the session belongs to the user: list it under uncommitted changes in Session Continuity instead of discarding it.

## Step 17 report

Present final confirmation to the user:
- List which files were updated (with brief reason for each)
- List which files were skipped (and why — "no changes in that domain")
- If no learning cleared the bar in Step 5, state "No durable learnings this session" — this line belongs only in the report, never in LEARNINGS.md
- Say whether the user confirmed the Step 3 summary, or that a headless run took the default without confirmation
- Flag any items that need human attention
- Confirm the docs commit was made, or in no-commit mode that its message is in `.agent-blueprint/run/commit-msg.md`

## Step 14 cleanup

```bash
# List any git worktrees created during the session
git worktree list

# Check for orphaned worktrees (worktree directory deleted but ref remains)
git worktree prune --dry-run

# Check for temp files in project root
ls -la *.tmp *.bak *~ 2>/dev/null
```

**Actions:**
- If feature worktrees exist and the branch was merged, remove them: `git worktree remove <path>`
- If worktrees are still in progress, document them in Session Continuity ("worktree at .worktrees/feat-auth still active")
- Remove any temp/backup files that shouldn't be committed
- If completed plans should be archived, add a completion note at the top rather than moving/deleting them

## Step 6 status tables

Map the session onto each STATUS.md table:

**Current State of the Code:**
- Update build/test/lint status with actual current values
- Update "last verified" date

**In Flight:**
- Update the table: progress, blockers, notes
- Remove rows for items completed this session
- Add rows for items started but not finished
- Mark blocked items with what unblocks them

**Up Next:**
- Reorder based on what the session revealed
- Add new items discovered during the session
- Remove items that are no longer relevant
- Cross-reference GOALS.md to ensure alignment

**What's Done:**
- Add rows to the commit log table for significant work done this session
- Use actual commit hashes and dates from git log
- Keep the last 20 entries; trim the oldest if longer
- Group related commits into single entries when they represent one logical change

**Decisions Made:**
- Add rows for decisions made this session
- Link to ADR files if created (Step 12)
- Keep last 10 entries

**Known Issues:**
- Add new bugs or technical debt discovered
- Remove issues that were fixed this session
- Update severity, workarounds, or discovery dates

**Dependencies and External Blockers:**
- Add any new external dependencies or blockers
- Update status of existing ones
- Remove resolved ones

## Step 4 Session Continuity template

```markdown
## Session Continuity

**Last session:** YYYY-MM-DD

**What was done:**
- [Specific accomplishment 1 with file paths]
- [Specific accomplishment 2]
- [etc.]

**What's remaining:**
- [Next task 1 — an action the reader can start now: a file, a command, or a failing test, not a topic]
- [Next task 2]
- [etc.]

**Start here:** [Exact instruction for next session, e.g., "Continue implementing the auth middleware — tests in tests/auth.test.ts are passing, next step is refresh token rotation in src/auth/refresh.ts"]

**Current state of the code:**
- Build: [passes / fails / error message]
- Tests: [X passing, Y failing — list failing tests if any]
- Uncommitted changes: [none / list of files]
```

## Step 3 summary

Confirm the summary before writing because the user may have context not in the git history — verbal decisions, chat conversations, things they want emphasized or omitted.

**Session Summary**
- Duration estimate (from first to last git timestamp, or note if unclear)
- One-sentence overview of what was accomplished

**Changes Made**
- Features added or modified (with file paths and commit hashes)
- Bugs fixed (with root cause)
- Tests added or modified (with pass/fail counts)
- Infrastructure or configuration changes
- Dependencies added or removed
- Documentation changes

**Decisions Made**
- What was decided and why (brief — detail goes in ADRs)
- Trade-offs that were accepted
- Approaches considered and rejected (and why)

**Learnings**
- Pitfalls discovered (things that will waste time again if not recorded)
- Patterns that worked well (worth replicating in other parts of the project)
- Assumptions that were wrong (correct the mental model)
- Debugging insights (what was tried, what worked, what was the root cause)

**Current State**
- Build status: passes / fails / not configured
- Test status: X passing, Y failing, Z skipped
- Lint status: clean / N warnings / N errors
- Uncommitted changes: [list or "working tree clean"]
- Current branch: [branch name]

**Remaining Work**
- Immediate next steps (what the next session should start with, in order), the first one closable: an action the reader can start now
- Items for backlog (bugs found, ideas sparked, follow-ups)
- Open questions that need human input
- Blocked items and what unblocks them

**Goal Alignment**
- Which goals/milestones this session advanced
- Whether any work was off-goal
- Whether goals or milestones need updating

## Step 1 git state

**Git state (run all in parallel):**
```bash
# Recent commits (broader session view)
git log --oneline -20

# Uncommitted changes
git status

# File-level diff summary
git diff --stat

# Session-window commits (approximate)
git log --format="%h %s (%ai)" --since="8 hours ago"

# Broader diff against session start
git diff --stat HEAD~10 HEAD 2>/dev/null

# New files added this session
git log --diff-filter=A --name-only --since="8 hours ago" --format=""

# Files deleted this session
git log --diff-filter=D --name-only --since="8 hours ago" --format=""

# Current branch
git branch --show-current

# Test status (if test command is known from CONVENTIONS.md)
# [test command] 2>&1 | tail -5

# Build status (if build command is known)
# [build command] 2>&1 | tail -5
```
