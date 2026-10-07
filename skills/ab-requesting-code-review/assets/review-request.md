# Review Request

The data for one code review. Fill in the placeholders and hand this, with the reviewer's prompt file, to the helper. It carries no checklist and no output format of its own: the reviewer applies its own checklist and returns its prompt file's Output section, so every review in the blueprint comes back in the same scored shape.

## What was implemented

{WHAT_WAS_IMPLEMENTED}

{DESCRIPTION}

## Requirements or plan

{PLAN_OR_REQUIREMENTS}

{PLAN_REFERENCE}

## Range to review

**Base:** {BASE_SHA}
**Head:** {HEAD_SHA}

```bash
git diff --stat {BASE_SHA}..{HEAD_SHA}
git diff {BASE_SHA}..{HEAD_SHA}
```

When **Head** is `working tree` (no-commit mode: the changes are not committed yet), review the working tree against the base instead, and read each untracked file in full:

```bash
git diff --stat {BASE_SHA}
git diff {BASE_SHA}
git ls-files --others --exclude-standard
```

## What to judge

Production readiness against the requirements above: correctness and edge cases, error handling, tests that check behavior rather than mocks, security, and scope (anything the plan never asked for is a finding for a human to decide). On a final whole-branch review, also list what you could not assess and why, one line each, so the session can rule on it.
