# Merging locally

Loaded on demand from SKILL.md when the user picks Option 1 (merge back to the base branch locally).

## Merge sequence

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

If the tests fail on the merged result, stop before the cleanup lines: keep the worktree and the branch, and report the failures. Then confirm the cleanup (SKILL.md Step 6, which also owns a refused removal).

## Confirm the cleanup

The merge sequence already removed the worktree before deleting the branch. Confirm nothing is left:

```bash
git worktree list | grep <feature-branch>   # must print nothing
```
