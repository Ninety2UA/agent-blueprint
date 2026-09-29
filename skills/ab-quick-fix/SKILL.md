---
name: ab-quick-fix
description: "Makes a small, well-understood change through a short test-first loop: checks that the change qualifies (under 3 files, obvious approach), writes a failing test, makes the minimal fix, runs the full test suite, build and lint, and commits on a branch. Use when the change is a bug fix whose cause is known, a typo, copy or config change, a rename, a changed default or minor refactor within one module, or a test for existing behavior, whether or not the user says 'quick'. Not for changes touching 4 or more files, new public APIs, endpoints or schemas, data-model changes, or an unclear approach (use ab-brainstorming, then ab-build-pipeline), nor for a bug whose cause is not yet known (use ab-systematic-debugging first)."
argument-hint: "[describe the change]"
metadata:
  version: "3.8.0"
---

# Quick Fix — Lightweight Change Workflow

A finished quick fix is one commit on a branch that holds the change and a test that failed before it and passes after, with the full test suite, build and lint green. The workflow stays this short only because the change is small and its approach obvious; when either stops being true, hand over to the full workflow.

**Working folder.** Blueprint working files live under `.agent-blueprint/` in the project root. Before the first write there, create `.agent-blueprint/.gitignore` with the lines `run/`, `team/`, `review-runs/` and `cache/` if it does not exist yet, so run state stays out of commits while plans and notes stay tracked.

**Provenance record.** When this skill starts, write `.agent-blueprint/run/provenance/<name>.json`, where `<name>` is the `name` in this skill's frontmatter: `skill` (that name), `version` (its `metadata.version`), `started_at` (the current UTC time, ISO 8601) and an empty `helper_steps` list, replacing any older record of that name. If `.agent-blueprint/.gitignore` is missing, create it first with the lines `run/`, `team/`, `review-runs/` and `cache/`. Each Helper step adds its entry to `helper_steps`. The record tells a run, and the smoke test, which skill ran and how; it is not a security control.

## When Not to Use

- **Touching 4+ files**: use the ab-build-pipeline skill (or ab-ship-pipeline for an autonomous run).
- **New public API, endpoint or schema**: it needs design first, with the ab-brainstorming skill.
- **Auth, payments or data-migration code**: always the full pipeline with review, never this skill, because a small-looking change there can do outsized harm.
- **Approach unclear, or several options**: use the ab-discuss or ab-brainstorming skill.
- **Bug with a non-obvious root cause**: use the ab-systematic-debugging skill first, and this skill once the cause is known and the fix is small.

## Step 1: Qualification Check

Before starting, confirm the change is quick.

**Qualifies:**
- Bug fix with obvious root cause (< 3 files touched)
- Typo, copy, or config fix
- Adding a test for existing behavior
- Renaming or minor refactor within a single module

**Does not qualify (redirect to ab-brainstorming):**
- Touching 4+ files
- Adding new public API or endpoint
- Changing data models or schemas
- Anything where you're unsure of the approach

If the change does not qualify, say: "This looks like it needs the full workflow. Let me switch to ab-brainstorming." Then use the ab-brainstorming skill instead. If it qualified but grows past these limits mid-fix, stop and switch to the ab-build-pipeline skill.

## Step 2: Write a Failing Test

Use the ab-test-driven-development skill.

Write a test that describes the expected behavior before any implementation code. Run it: it should fail (red).

## Step 3: Implement the Fix

Write the minimum code to make the test pass. Run the test: it should pass (green).

## Step 4: Verify

Run the full test suite (not just your test), the build and the linter, with the commands in `docs/context/CONVENTIONS.md` or the project instructions file:

```bash
[test command]
[build command]
[lint command]
```

All three pass before you commit.

## Step 5: Commit

Commit on a branch unless the user said otherwise; on the default branch, create one first (in no-commit mode, below, do neither). Stage only the files you changed, and follow the project's commit conventions:

```bash
git add [specific files]
git commit -m "[type](scope): [description]"
```

**No-commit mode.** When the environment variable `AGENT_BLUEPRINT_GIT_WRITABLE` is `0`, or a commit fails because `.git` is read-only, make no commits: leave the changes in the working tree and add the commit message you would have used to `.agent-blueprint/run/commit-msg.md`, and the ship runner commits them after the session. A review step in this mode reviews the working tree and untracked files against the merge base instead of a commit range.

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "It's quick, I'll skip the failing test" | Quick-fix without a test is a guess. The test is what makes the fix verifiable; skipping it means you can't tell if you fixed anything. |
| "The qualification check feels like overhead" | Misqualifying a complex change as ab-quick-fix is how 3-file fixes balloon into 12-file regressions. The check is the cheapest insurance. |
| "Three files now, but I'm sure it'll stay small" | If you're sure, prove it: scope it, do it, commit. If scope creeps mid-fix, stop and switch to `ab-build-pipeline`. Don't backfill design after the fact. |
| "I'll skip lint — it's just style" | Lint catches structural issues alongside style. Quick-fix is short; lint is fast; run it. |
| "Trivial fix, I'll commit straight to main" | Quick-fix is fast, not unreviewed. Commit to a branch unless explicitly told otherwise. |
