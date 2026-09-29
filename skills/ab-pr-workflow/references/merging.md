# Merging

Loaded on demand from SKILL.md when an approved PR is ready to merge.

After approval:

1. Check the base branch's CI first: `gh run list --branch main --workflow <ci-workflow> --limit 1 --json status,conclusion` (name the CI workflow, or the newest run of any workflow answers). If main is red, don't merge onto it: report it, because a red base hides whether your change broke anything. A run still in progress is not green; wait for it.
2. Rebase onto the latest main, if needed.
3. Verify the tests still pass after the rebase.
4. Squash or merge per project convention.
5. Delete the feature branch.

`main` stands for the default branch.
