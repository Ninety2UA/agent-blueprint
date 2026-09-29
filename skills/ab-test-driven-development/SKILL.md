---
name: ab-test-driven-development
description: "Drives new code from tests with red-green-refactor: write one failing test, watch it fail for the expected reason, write the least code that passes, run the whole suite, then refactor while green. Code written before its test is deleted and rewritten from the test. Use when implementing a feature, fixing a bug, refactoring or changing behavior, before any implementation code and whether or not the user mentions tests. Not for backfilling tests on existing code that is not being changed (use ab-add-tests)."
metadata:
  version: "3.8.0"
---

# Test-Driven Development (TDD)

Write the test first. Watch it fail. Write minimal code to pass. The skill is done when every piece of production code it added exists because a test failed first, and the project's whole suite is green.

**Core principle:** If you didn't watch the test fail, you don't know if it tests the right thing.

**Working folder.** Blueprint working files live under `.agent-blueprint/` in the project root. Before the first write there, make sure `.agent-blueprint/.gitignore` exists and lists `run/`, `team/`, `review-runs/`, `cache/` and `.gitignore`, so run state and the ignore file itself stay out of commits while plans and notes stay tracked.

**Provenance record.** When this skill starts, write `.agent-blueprint/run/provenance/<name>.json`, where `<name>` is the `name` in this skill's frontmatter: `skill` (that name), `version` (its `metadata.version`), `started_at` (the current UTC time, ISO 8601) and an empty `helper_steps` list, replacing any older record of that name. Before that, make sure `.agent-blueprint/.gitignore` exists and lists `run/`, `team/`, `review-runs/`, `cache/` and `.gitignore`. Each Helper step adds its entry to `helper_steps`. The record tells a run, and the smoke test, which skill ran and how; it is not a security control.

## When to Use

New features, bug fixes, refactoring and behavior changes, every time. Thinking "skip TDD just this once"? That is the rationalization this skill exists to catch.

Throwaway prototypes, generated code and configuration files may skip TDD, but only with the user's go-ahead, because test-first is the default and skipping it is the user's call.

**Asking the user.** Ask with your question tool if you have one, offering at most three options; otherwise ask in plain text with a numbered list. In a headless or unattended run nobody will answer: take the default named below, say so in your output, and log it in the run state's decisions if there is a run state.

Options: 1. Skip TDD for this prototype, generated code or configuration change. 2. Keep TDD. Default when nobody answers: keep TDD.

## The Iron Law

No production code without a failing test first.

Wrote code before the test? Delete it and start over from the test. Don't keep it as a "reference", don't adapt it while writing tests, don't look at it. Code you keep shapes the tests you write, so they check what you built instead of what was required, which is testing after under another name. Keeping to the letter of this rule is the only way to keep its spirit.

## Red-Green-Refactor

The cycle as a diagram: `references/examples.md` § Cycle diagram.

### RED - Write Failing Test

Write one minimal test showing what should happen: one behavior, a clear name, real code (mocks only when unavoidable, since a test of a mock says nothing about the code). See `references/examples.md` § RED example.

### Verify RED - Watch It Fail

This step always runs, because it is the only proof that the test can catch the missing behavior. Run the one test, for example `npm test path/to/test.test.ts`.

Confirm:
- Test fails (not errors)
- Failure message is expected
- Fails because feature missing (not typos)

**Test passes?** You're testing existing behavior. Fix test.

**Test errors?** Fix error, re-run until it fails correctly.

### GREEN - Minimal Code

Write the simplest code that passes the test. Don't add features, refactor other code, or "improve" beyond the test: anything extra is code no failing test asked for. See `references/examples.md` § GREEN example.

### Verify GREEN - Watch It Pass

This step always runs. Run the test again, then the project's whole suite (the test command in `docs/context/CONVENTIONS.md`). One file passing is not green; the project suite defines green.

Confirm:
- Test passes
- The whole suite passes, and every failure is reported by name, including failures you didn't cause
- Output pristine (no errors, warnings)

**Test fails?** Fix code, not test.

**Other tests fail?** Fix now if your change caused them. If it didn't, name them in your report instead of calling the run green.

Green is the point to commit when the workflow you are in commits per cycle. A helper whose lead owns the commits leaves them to the lead.

**No-commit mode.** When the environment variable `AGENT_BLUEPRINT_GIT_WRITABLE` is `0`, or a commit fails because `.git` is read-only, make no commits: leave the changes in the working tree and add the commit message you would have used to `.agent-blueprint/run/commit-msg.md`, and the ship runner commits them after the session. A review step in this mode reviews the working tree and untracked files against the merge base instead of a commit range.

### REFACTOR - Clean Up

After green only: remove duplication, improve names, extract helpers. Keep tests green. Don't add behavior.

### Repeat

Next failing test for next feature.

What a good test looks like: `references/examples.md` § Good tests. A worked bug fix through the whole cycle: `references/examples.md` § Bug fix example.

## Red Flags - Stop and Start Over

- Code before test, or tests added "later"
- Test passes immediately, or you can't explain why it failed
- Rationalizing "just this once" or "this is different because..."
- "I already manually tested it"
- "Tests after achieve the same purpose" or "it's about spirit not ritual"
- "Keep as reference" or "adapt existing code"
- "Already spent X hours, deleting is wasteful"
- "TDD is dogmatic, I'm being pragmatic"

All of these mean: delete the code and start over with TDD. Each argument has its answer in `references/rationalizations.md` § Common rationalizations, with the long form in `references/rationalizations.md` § Why order matters. Read the answer before acting on the argument.

## Verification Checklist

Before marking work complete:

- [ ] Every new function/method has a test
- [ ] Watched each test fail before implementing
- [ ] Each test failed for expected reason (feature missing, not typo)
- [ ] Wrote minimal code to pass each test
- [ ] All tests pass
- [ ] Output pristine (no errors, warnings)
- [ ] Tests use real code (mocks only if unavoidable)
- [ ] Edge cases and errors covered

Can't check all boxes? You skipped TDD. Start over.

## When Stuck

Hard to test usually means hard to use. See `references/examples.md` § When stuck.

## Debugging Integration

Bug found? Write failing test reproducing it. Follow TDD cycle. Test proves fix and prevents regression. A bug fixed without a test can come back unnoticed, so every fix starts with one.

## Testing Anti-Patterns

When adding mocks or test utilities, read `testing-anti-patterns.md` in this skill's folder to avoid common pitfalls:
- Testing mock behavior instead of real behavior
- Adding test-only methods to production classes
- Mocking without understanding dependencies

## Final Rule

Production code → test exists and failed first. Otherwise → not TDD. The only exceptions are the ones the user grants under When to Use.
