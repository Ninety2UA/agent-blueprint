# Loop guidance

Loaded on demand from SKILL.md when choosing a configuration, checking how callers use the loop, or tempted to cut a step.

## Convergence modes

| Mode | Exit When | Best For |
|------|-----------|----------|
| **fast** (default) | P1 count = 0 | Most features — catches critical issues |
| **deep** | P1 + P2 count = 0 | Important features — catches all significant issues |
| **perfect** | P1 + P2 + P3 = 0 | High-stakes (auth, payments, data migrations) |

## Loop diagram

```
┌──────────────────────────────────────────────────┐
│           ITERATIVE REFINEMENT LOOP              │
│                                                  │
│  ┌──► Dispatch ab-review-swarm                     │
│  │         │                                     │
│  │    Collect findings (P1/P2/P3 counts)         │
│  │         │                                     │
│  │    ┌────┴──────────┐                          │
│  │    │ Converged?    │                          │
│  │    │ (per mode)    │                          │
│  │    └────┬──────────┘                          │
│  │   yes   │   no                                │
│  │         │    │                                │
│  │   EXIT  │    Dispatch ab-resolve-in-parallel     │
│  │  (done) │    for qualifying findings          │
│  │         │         │                           │
│  │         │    Run tests + build                │
│  │         │         │                           │
│  │         │    ┌────┴─────┐                     │
│  │         │    │ Tests OK? │                    │
│  │         │    └────┬─────┘                     │
│  │         │   yes   │   no                      │
│  │         │         │   Debug + fix             │
│  │         │         │                           │
│  │         │    Commit fixes                     │
│  │         │         │                           │
│  │         │    iteration++                      │
│  │         │         │                           │
│  │         │    ┌────┴────────────┐              │
│  │         │    │ < max_iterations? │            │
│  │         │    └────┬────────────┘              │
│  │         │   yes   │   no                      │
│  │         │         │                           │
│  └─────────┘    MAX REACHED                      │
│                 (report remaining findings)       │
└──────────────────────────────────────────────────┘
```

## Integration with Other Skills

| Situation | What Happens |
|-----------|-------------|
| Called by `ab-ship-pipeline` | Runs after execution, default 3 iterations, fast convergence |
| Called by `ab-build-pipeline --iterate N` | Replaces single-pass review (Stage 5) with N-iteration loop |
| Called standalone | User invokes directly for iterative polish |
| Finding requires architecture change | EXIT loop, report blocker, escalate to user |
| All findings are P3 in fast mode | Converged — P3s are suggestions, not blockers |

## Quick Reference

| Scenario | Recommended Config |
|----------|-------------------|
| Standard feature | 3 iterations, fast convergence |
| Auth/security feature | 5 iterations, deep convergence |
| Data migration | 5 iterations, deep convergence |
| Payment/billing code | 10 iterations, perfect convergence |
| Quick bug fix | 1 iteration, fast convergence (essentially a single review) |

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "One review pass is enough — I'll skip iteration" | Single passes miss the bugs that fixes introduce. The second iteration catches the regressions you just authored. |
| "All findings are P3, let me bump to deep mode" | If P1+P2 are clean in fast mode, you've converged. Pushing deeper turns suggestions into churn without value. |
| "I'll fix everything in one big commit between iterations" | Large fix bundles re-introduce findings other reviewers already cleared. One finding, one fix, one verification. |
| "The reviewer is wrong, I'll override the finding" | Maybe. Document the override in the run log so the next iteration doesn't re-raise it. Silent overrides defeat convergence. |
| "Tests fail but the fix is correct" | If the fix is correct and tests fail, the test was wrong AND that's a separate finding. Don't turn a red test green by deleting it. |
| "Iteration 4 found new issues, let me run iteration 5" | Past 3 iterations with new findings every cycle, the underlying design is the issue. Escalate, don't loop. |
| "I'll skip the deslop pass — those are stylistic" | AI-generated text patterns survive review (reviewers have the same blind spots). Step 0.5 is cheap and catches what graders won't flag. |
