# Discarding work

Loaded on demand from SKILL.md when the user explicitly asks to discard the branch.

## Discarding work (explicit request only)

Discarding deletes the branch, its commits and its worktree, and none of that can be undone. So it is not a menu option: run this path only when the user says "Discard this work" or asks for it by name, and delete nothing until they have typed the confirmation word. The steps run in this order, and each one can stop the path.

**Step 1. List what would be lost:**

```bash
git status --porcelain                                # untracked and modified files
git log --oneline <base-branch>..<feature-branch>     # commits
```

**Step 2. Confirm the worktree removes cleanly:** the status output must be empty. Any line printed means removal would be refused, so go to **Refused removal** and run nothing else.

**Step 3. Ask for typed confirmation.** Show the list from Step 1 in this form:

```
This will permanently delete:
- Branch <name>
- All commits: <commit-list>
- Worktree at <path>

Type 'discard' to confirm.
```

**Asking the user.** Ask with your question tool if you have one, offering at most three options; otherwise ask in plain text with a numbered list. In a headless or unattended run nobody will answer: take the default named below, say so in your output, and log it in the run state's decisions if there is a run state.

The only answer that confirms is the word `discard`, typed back (the question tool's free-text answer, or a plain-text reply), never an option picked from a list, because a pick is too easy to make by accident for a step that cannot be undone. Any other answer keeps everything. Default when nobody answers: discard nothing, and keep the branch, its commits and the worktree.

**Step 4. Only after confirmation:**

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

## Refused removal

Report the state and relay the commands for the user to run; do not run them yourself, because a forced removal deletes uncommitted work that no commit or reflog can bring back, and that call is the user's. With a worktree:

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
