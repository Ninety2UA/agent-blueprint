---
name: ab-verification-before-completion
description: "Backs every completion claim with fresh evidence: names the output that would prove the claim false, runs the full verification command, reads its output and exit code, and only then states the result, quoting that evidence. Use before saying work is done, tests pass, a build succeeds or a bug is fixed; before committing, opening a PR or reporting a task complete; and before trusting a helper's success report. A run from an earlier message does not count."
---

# Verification Before Completion

## Overview

A completion claim without verification is a guess presented as a fact. The person reading it acts on it, so an unverified "done" costs more than the check would have. Done means the claim in the reply names the command that was run in this message and quotes the output that backs it, or states the actual status with the evidence that contradicts the claim.

**Core principle:** Evidence before claims, always.

Rewording a claim to avoid this rule still breaks it, because the reader hears the same claim.

## The Iron Law

```
NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE
```

If you haven't run the verification command in this message, you cannot claim it passes: code, dependencies and the working tree may have changed since the last run.

## The Gate Function

```
BEFORE claiming any status or expressing satisfaction:

1. IDENTIFY: What command proves this claim, and what output would prove it FALSE?
   - No failing direction named = no verification (a check that cannot fail is a ritual)
   - For a test claim, the failing direction is the red-green-revert row under Common Failures
2. RUN: Execute the FULL command (fresh, complete)
3. READ: Full output, check exit code, count failures
4. VERIFY: Does output confirm the claim?
   - If NO: State actual status with evidence
   - If YES: State claim WITH evidence
5. ONLY THEN: Make the claim

Skip any step = lying, not verifying
```

## Common Failures

| Claim | Requires | Not Sufficient |
|-------|----------|----------------|
| Tests pass | The project suite's output: 0 failures, or every failure named (including ones you didn't cause) | One file's run, previous run, "should pass" |
| Linter clean | Linter output: 0 errors | Partial check, extrapolation |
| Build succeeds | Build command: exit 0 | Linter passing, logs look good |
| Bug fixed | Test original symptom: passes | Code changed, assumed fixed |
| Regression test works | Red-green-revert: write → run (pass) → revert the fix → run (MUST FAIL) → restore → run (pass) | Test passes once |
| Agent completed | VCS diff shows changes | Agent reports "success" |
| Requirements met | Re-read the plan, one checklist line per requirement, each verified | Tests passing |
| Check is meaningful | Failing direction named before the run: the output that would refute the claim | A command that passes no matter what the code does |

## Red Flags: Stop and Verify

Each of these means a claim is about to outrun its evidence:

- Using "should", "probably", "seems to"
- Expressing satisfaction before verification ("Great!", "Perfect!", "Done!", etc.)
- About to commit, push or open a PR without verification
- Trusting a helper's success report
- Relying on partial verification
- Thinking "just this once"
- Tired and wanting the work over
- Any wording that implies success without a verification run

Tempted anyway? Read `references/rationalizations.md`: the excuses, what each one actually costs, and the failures this rule exists to prevent.
