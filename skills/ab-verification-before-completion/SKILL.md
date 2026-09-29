---
name: ab-verification-before-completion
description: "Backs every completion claim with fresh evidence: names the output that would prove the claim false, runs the full verification command, reads its output and exit code, and only then states the result, quoting that evidence. Use before saying work is done, tests pass, a build succeeds or a bug is fixed; before committing, opening a PR or reporting a task complete; and before trusting a helper's success report. A run from an earlier message does not count."
---

# Verification Before Completion

## Overview

A completion claim without verification is a guess presented as a fact. The person reading it acts on it, so an unverified "done" costs more than the check would have.

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
   - For a test claim, the failing direction is the red-green-revert pattern under Key Patterns
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
| Regression test works | Red-green cycle verified | Test passes once |
| Agent completed | VCS diff shows changes | Agent reports "success" |
| Requirements met | Line-by-line checklist | Tests passing |
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

## Rationalization Prevention

| Excuse | Reality |
|--------|---------|
| "Should work now" | Run the verification |
| "I'm confident" | Confidence ≠ evidence |
| "Just this once" | The skipped run is the one that would have caught it |
| "Linter passed" | Linter ≠ compiler |
| "Agent said success" | Verify independently |
| "I'm tired" | Exhaustion ≠ evidence |
| "Partial check is enough" | Partial proves nothing about the rest |
| "Different words so rule doesn't apply" | Spirit over letter |

## Key Patterns

**Tests:**
```
✅ [Run test command] [See: 34/34 pass] "All tests pass"
❌ "Should pass now" / "Looks correct"
```

**Regression tests (TDD red-green-revert):**
```
✅ Write → Run (pass) → Revert fix → Run (MUST FAIL) → Restore → Run (pass)
❌ "I've written a regression test" (without red-green verification)
```

**Build:**
```
✅ [Run build] [See: exit 0] "Build passes"
❌ "Linter passed" (linter doesn't check compilation)
```

**Requirements:**
```
✅ Re-read plan → Create checklist → Verify each → Report gaps or completion
❌ "Tests pass, phase complete"
```

**Agent delegation:**
```
✅ Agent reports success → Check VCS diff → Verify changes → Report actual state
❌ Trust agent report
```

## Why This Matters

From accumulated failure notes:
- The user said "I don't believe you": trust broken
- Undefined functions shipped and would crash
- Missing requirements shipped as incomplete features
- Time lost to false completion, then redirect, then rework
- An unverified claim is a false statement when it turns out wrong, and honesty is what the user relies on

## When To Apply

Before:
- any variation of a success or completion claim
- any expression of satisfaction
- any positive statement about the state of the work
- committing, opening a PR, or reporting a task complete
- moving to the next task
- handing work to a helper

The rule covers exact phrases, paraphrases and synonyms, implications of success, and any message that suggests the work is complete or correct.

## The Bottom Line

Run the command. Read the output. Then claim the result. Skipping this has no safe case, because the claim you skip checking is the one nobody else checks either.
