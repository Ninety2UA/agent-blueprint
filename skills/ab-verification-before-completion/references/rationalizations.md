# Rationalizations

Loaded on demand from SKILL.md when you are tempted to claim a result without running its verification, or to argue that this case is the exception.

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

## Why This Matters

From accumulated failure notes:
- The user said "I don't believe you": trust broken
- Undefined functions shipped and would crash
- Missing requirements shipped as incomplete features
- Time lost to false completion, then redirect, then rework
- An unverified claim is a false statement when it turns out wrong, and honesty is what the user relies on

Skipping the run has no safe case, because the claim you skip checking is the one nobody else checks either.
