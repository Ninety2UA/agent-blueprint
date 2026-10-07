# ab-requesting-code-review — worked example

Loaded on demand from SKILL.md when you want to see one review request end to end: choosing the range, filling the template, and acting on the result.

## Example

```
[Just completed Task 2: Add verification function]

You: Let me request code review before proceeding.

BASE_SHA=$(git log --oneline | grep "Task 1" | head -1 | awk '{print $1}')
HEAD_SHA=$(git rev-parse HEAD)

[Dispatch code-reviewer helper]
  WHAT_WAS_IMPLEMENTED: Verification and repair functions for conversation index
  PLAN_OR_REQUIREMENTS: Task 2 from docs/plans/deployment-plan.md
  BASE_SHA: a7981ec
  HEAD_SHA: 3df7661
  DESCRIPTION: Added verifyIndex() and repairIndex() with 4 issue types

[Helper returns]:
  - Important: No progress indicator on long repairs — src/index.ts:88 — Confidence: 75
    Impact: a repair of a large index looks hung. Fix: report progress every 100 entries.
  - Suggestion: Magic number (100) for reporting interval — src/index.ts:91 — Confidence: 50
    Impact: the interval is hard to tune. Fix: name it REPORT_INTERVAL.
  Verdict: ready with fixes

You: [Fix progress indicators]
[Continue to Task 3]
```

In no-commit mode the same request carries `BASE_SHA` from `git merge-base origin/main HEAD` and `HEAD_SHA: working tree`, and the reviewer diffs the working tree and reads the untracked files instead of a commit range.
