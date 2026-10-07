# Summary

Loaded on demand from SKILL.md when checking a finish against the paths, common mistakes, red flags and callers.

## Quick Reference

| Path | Merge | Push | Keep Worktree | Cleanup Branch |
|------|-------|------|---------------|----------------|
| 1. Merge locally | ✓ | - | - | ✓ |
| 2. Create PR | - | ✓ (the runner pushes in a runner-driven run) | ✓ | - |
| 3. Keep as-is | - | - | ✓ | - |
| Discard (explicit request only) | - | - | - | ✓ (typed confirmation; never forced) |

## Common Mistakes

**Skipping test verification**
- **Problem:** Merge broken code, create failing PR
- **Fix:** Verify tests before offering options

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
- **Fix:** Leave the force flag out; relay the command for the user to run

## Red Flags

Each of these loses work or hands on broken code, so stop if you are about to:
- Proceed with failing tests
- Merge or open a PR while the audit shows NOT DONE or PARTIAL
- Merge without verifying tests on result
- Offer discard as a menu option
- Delete work without typed confirmation
- Force a worktree removal (relay the command instead)
- Force-push without explicit request

Every finish does these:
- Verify tests before offering options
- Run the plan audit before the menu; NO PLAN is a report, not a block
- Present exactly 3 options
- List untracked and modified files before asking for the typed discard confirmation
- Clean up worktree for Option 1 and the discard path only

## Integration

**Called by:**
- **ab-subagent-driven-development** (Progress File) - After all tasks complete; passes the plan path
- **ab-executing-plans** (Step 5) - After all batches complete; passes the plan path

**Pairs with:**
- **ab-using-git-worktrees** - "Removing a Worktree" owns the never-force rule and the refusal branch that Step 6 and the discard path follow
- **ab-pr-workflow** - Option 2 delegates PR creation and passes the audit table and unplanned-work list for its `## Plan audit` section
- **code-reviewer** (helper) - Step 3 dispatches it read-only for the classification table
