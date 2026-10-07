# Refinement reports

Loaded on demand from SKILL.md when the loop starts, converges, finishes an iteration, ends, or escalates.

## Start

Record the start:
```markdown
## Iterative Refinement — Starting
- Max iterations: [N]
- Convergence mode: [fast|deep|perfect]
- Scope: [description]
```

## Converged

```markdown
## Refinement Converged — Iteration [i]/[max]
- P1: 0 | P2: [n] | P3: [n]
- Convergence mode: [mode] — criteria met
- Total iterations used: [i]
```

## Iteration progress

After each iteration, report:
```markdown
## Iteration [i]/[max] Complete

### Findings This Round
- P1 (critical): [count] found, [count] fixed, [count] deferred
- P2 (important): [count] found, [count] fixed, [count] deferred
- P3 (suggestions): [count] found, [count] noted
- By tier: [safe_auto count] auto-applied, [gated_auto count] fixed, [advisory count] noted, [present count] decided
- Filtered (below confidence gate): [count]

### Cumulative Progress
| Iteration | P1 | P2 | P3 | Auto-applied | Decisions | Action |
|-----------|----|----|-----|-------------|-----------|--------|
| 1 | [n] | [n] | [n] | [n] | [n] | Fixed [n] findings |
| 2 | [n] | [n] | [n] | [n] | [n] | Fixed [n] findings |
| ... | | | | | | |

### Next
- [Continuing to iteration i+1] OR [Converged — exiting loop]
```

## Final report

```markdown
## Iterative Refinement Complete

### Summary
- Iterations used: [i] of [max]
- Exit reason: [Converged (P1=0) | Max iterations reached | Stopped: <stop condition>]
- Convergence mode: [fast|deep|perfect]

### Quality Trajectory
| Iteration | P1 | P2 | P3 | Fixes Applied |
|-----------|----|----|-----|---------------|
| 1 | [n] | [n] | [n] | [n] |
| 2 | [n] | [n] | [n] | [n] |
| 3 | [n] | [n] | [n] | [n] |

### Remaining Findings (if max reached without convergence)
- P1: [list any remaining critical issues]
- P2: [list any remaining important issues]

### Deferred Findings (fixes that caused regressions)
- [list any findings that were reverted]
```

## Escalation

```markdown
## Escalation — Refinement Did Not Converge

### Unresolved Issues
- [list each remaining P1/P2 with file:line and description]

### Reviewer Perspectives
- **[Agent A]** recommends: [approach]
- **[Agent B]** recommends: [approach]
- [Include all reviewers who weighed in on the unresolved issues]

### My Recommendation
[Which approach to take and why, based on project conventions and architectural context]

### Options
A. [Fix approach 1] — [tradeoff]
B. [Fix approach 2] — [tradeoff]
C. Merge as-is with known issues tracked in BACKLOG.md
```

Give both the reviewers' perspectives and your recommendation: a bare findings list leaves the user to do the analysis.
