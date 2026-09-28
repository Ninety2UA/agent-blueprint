---
name: add-tests
description: "Trigger this skill when the user says 'add tests', 'test coverage', 'coverage gaps', 'write tests for', 'untested code', 'missing tests', 'improve coverage', 'what needs tests', or mentions a module or file that lacks test coverage, even if they don't explicitly say 'tests'. Trigger when existing code has no tests, when coverage reports show gaps, or when recently changed code has no corresponding test files. Dispatches the test-gap-analyzer agent to find untested code paths, then generates tests using TDD for approved gaps. DO NOT TRIGGER when writing tests as part of TDD for new code being actively implemented — use test-driven-development instead. This skill is specifically for backfilling tests on existing untested code."
argument-hint: "[optional: file or module to analyze]"
---

# Add Tests — Test Gap Analysis and Generation

## Step 1: Analyze Gaps

Dispatch the **test-gap-analyzer** agent to analyze coverage:

```
Task: Analyze test coverage for [target].
Focus on: [specific module if provided, otherwise the most recently changed files]
Return: Prioritized list of untested code paths with generated test code.
```

If no target specified, analyze the files changed in the last 5 commits:
```bash
git diff --name-only HEAD~5 HEAD | grep -v test | grep -v spec
```

## Step 2: Review Findings

Present the agent's findings to the user:
- Critical gaps (untested error paths, security-related code)
- High-priority gaps (core business logic)
- Medium/low gaps (utilities, helpers)

Ask: **"Which gaps should I fill? All critical+high, or specific ones?"**

## Step 3: Generate Tests

For each approved gap, invoke the test-driven-development skill and use it to write behavioral tests:
- Follow existing test conventions exactly
- Use Arrange-Act-Assert pattern
- Include both positive and negative cases

## Step 4: Verify

```bash
# Run all tests including new ones
[test command]
```

All tests must pass — both new and existing.
