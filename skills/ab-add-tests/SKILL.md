---
name: ab-add-tests
description: "Backfills tests for existing code that has none: a helper inventories the current tests, traces untested branches, error paths and edge cases, ranks the gaps by risk (critical, high, medium, low) and drafts behavioral tests; the user picks which gaps to fill, each is written with the ab-test-driven-development skill, the whole suite is run, and the new tests are committed. Use when the user asks to add tests, improve coverage or find what needs tests, when a module, file or recent change has no tests, or when a coverage report shows gaps. Not for tests written while new code is being implemented (use ab-test-driven-development)."
argument-hint: "[optional: file or module to analyze]"
---

# Add Tests — Test Gap Analysis and Generation

Find the riskiest untested paths in existing code, fill the gaps the user approves with behavioral tests, and finish with every test passing and the new tests committed.

## Step 1: Analyze Gaps

The target is the file or module the user named. If no target was specified, analyze the files changed in the last 5 commits:
```bash
git diff --name-only HEAD~5 HEAD | grep -v test | grep -v spec
```

Hand the analysis to the test-gap-analyzer helper.

**Helper step.** Start a helper (subagent) for this step if you can, with the prompt file named below (its absolute path when the helper can read it, else its full text) and the listed inputs; leave its model and effort at the session's. If you cannot start one, follow the prompt file yourself. Either way, return its Output section, and note which path ran in the run's provenance record if there is one.

Prompt: `references/agents/test-gap-analyzer.md`. Inputs:

```
Task: Analyze test coverage for [target].
Focus on: [specific module if provided, otherwise the most recently changed files]
Return: Prioritized list of untested code paths with generated test code.
```

**Lower effort.** This step is safe at lower effort. If your host lets you set effort for a single helper, you may start this one lower, unless the user asked for their level everywhere; otherwise it runs at the session's level. Never switch models to save effort.

## Step 2: Review Findings

Present the helper's findings to the user:
- Critical gaps (untested error paths, security-related code)
- High-priority gaps (core business logic)
- Medium/low gaps (utilities, helpers)

Then ask which gaps to fill.

**Asking the user.** Ask with your question tool if you have one, offering at most three options; otherwise ask in plain text with a numbered list. In a headless or unattended run nobody will answer: take the default named below, say so in your output, and log it in the run state's decisions if there is a run state.

Options: 1. All critical and high gaps. 2. Specific gaps, named by their numbers in the findings. 3. None for now: keep the report and stop. Default when nobody answers: all critical and high gaps.

## Step 3: Generate Tests

For each approved gap, invoke the ab-test-driven-development skill and use it to write behavioral tests:
- Follow existing test conventions exactly
- Use Arrange-Act-Assert pattern
- Include both positive and negative cases

## Step 4: Verify

```bash
# Run all tests including new ones
[test command]
```

All tests must pass, both new and existing, because the commit in Step 5 should leave the suite green for the next change. A new test that fails because the code under test is wrong, not the test, has found a bug: leave that test out of the commit and report the bug, rather than changing the code to fit the test.

## Step 5: Commit

**Working folder.** Blueprint working files live under `.agent-blueprint/` in the project root. Before the first write there, create `.agent-blueprint/.gitignore` with the lines `run/`, `team/`, `review-runs/` and `cache/` if it does not exist yet, so run state stays out of commits while plans and notes stay tracked.

**No-commit mode.** When the environment variable `AGENT_BLUEPRINT_GIT_WRITABLE` is `0`, or a commit fails because `.git` is read-only, make no commits: leave the changes in the working tree and add the commit message you would have used to `.agent-blueprint/run/commit-msg.md`, and the ship runner commits them after the session. A review step in this mode reviews the working tree and untracked files against the merge base instead of a commit range.

Commit only the new and extended test files, in the project's commit format (see `docs/context/CONVENTIONS.md`), for example `test(auth): cover token expiry and refresh errors`. Then report the gaps filled, the gaps skipped or escalated by the helper, and any bugs found in Step 4.
