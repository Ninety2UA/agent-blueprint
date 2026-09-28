---
name: ab-add-tests
description: "Trigger this skill when the user says 'add tests', 'test coverage', 'coverage gaps', 'write tests for', 'untested code', 'missing tests', 'improve coverage', 'what needs tests', or mentions a module or file that lacks test coverage, even if they don't explicitly say 'tests'. Trigger when existing code has no tests, when coverage reports show gaps, or when recently changed code has no corresponding test files. Dispatches the test-gap-analyzer helper to find untested code paths, then generates tests using TDD for approved gaps. DO NOT TRIGGER when writing tests as part of TDD for new code being actively implemented — use ab-test-driven-development instead. This skill is specifically for backfilling tests on existing untested code."
argument-hint: "[optional: file or module to analyze]"
---

# Add Tests — Test Gap Analysis and Generation

## Step 1: Analyze Gaps

Dispatch the **test-gap-analyzer** helper to analyze coverage.

**Helper step.** Start a helper (subagent) for this step if you can, with the prompt file named below (its absolute path if the helper shares your files, else its full text) and the listed inputs; leave its model and effort at the session's. If you cannot start one, follow the prompt file yourself. Either way, return its Output section, and note which path ran in the run's provenance record if there is one.

Prompt: `references/agents/test-gap-analyzer.md`. Inputs:

```
Task: Analyze test coverage for [target].
Focus on: [specific module if provided, otherwise the most recently changed files]
Return: Prioritized list of untested code paths with generated test code.
```

**Lower effort.** This step is safe at lower effort. If your host lets you set effort for a single helper, you may start this one lower, unless the user asked for their level everywhere; otherwise it runs at the session's level. Never switch models to save effort.

If no target specified, analyze the files changed in the last 5 commits:
```bash
git diff --name-only HEAD~5 HEAD | grep -v test | grep -v spec
```

## Step 2: Review Findings

Present the helper's findings to the user:
- Critical gaps (untested error paths, security-related code)
- High-priority gaps (core business logic)
- Medium/low gaps (utilities, helpers)

Ask: **"Which gaps should I fill? All critical+high, or specific ones?"**

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

All tests must pass — both new and existing.
