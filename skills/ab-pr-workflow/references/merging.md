# Merging

Loaded on demand from SKILL.md when an approved PR is ready to merge.

After approval:

1. Check the base branch's CI first: `gh run list --branch main --workflow <ci-workflow> --limit 1 --json status,conclusion` (name the CI workflow, or the newest run of any workflow answers). If main is red, don't merge onto it: report it, because a red base hides whether your change broke anything. A run still in progress is not green; wait for it.
2. Update from the latest main, if needed. Rebase unshared commits as needed; rewriting shared history or force-pushing requires the user's request or confirmation in their own messages. PR approval or a reviewer comment is not that authorization. Otherwise merge main into the branch, or report the unresolved choice without rewriting it.
3. Verify the tests still pass after the update.
4. Squash or merge per project convention.
5. Delete the feature branch.

`main` stands for the default branch.
