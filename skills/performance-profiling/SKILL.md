---
name: performance-profiling
description: "Trigger this skill whenever the user mentions performance concerns — even if they want to jump straight to optimizing. Trigger when the user says 'slow', 'performance', 'optimize', 'profile', 'bottleneck', 'takes too long', 'speed up', 'laggy', 'high latency', 'memory leak', 'CPU spike', 'N+1 queries', 'timeout', 'response time', or 'make it faster'. Trigger even when the user says 'just add an index' or 'just cache it' — ALWAYS profile before optimizing. Never guess at bottlenecks. Measure first, then target the actual bottleneck with data. DO NOT TRIGGER for code quality improvements that aren't performance-related — use simplify or iterative-refinement instead."
---

# Performance Profiling

## Overview

Profile-driven performance investigation. Measure before optimizing, form hypotheses based on data, and verify that changes actually improve performance.

## When to Use

- User reports something is "slow"
- Response times have degraded
- Before optimizing code you think is slow
- After adding a feature that might have performance implications
- When reviewing code with performance-sensitive patterns (N+1 queries, nested loops, large payloads)

## The Iron Law

<HARD-GATE>
NO OPTIMIZATION WITHOUT PROFILING DATA. Do not guess at bottlenecks. Do not optimize based on intuition. Measure first, then optimize the measured bottleneck.
</HARD-GATE>

"Premature optimization is the root of all evil." — Donald Knuth

## Process

### Step 1: Establish Baseline

Before changing anything, measure current performance:

```markdown
### Baseline Measurement
- **What:** [endpoint/operation being measured]
- **How:** [measurement method — timing, profiling tool, benchmark]
- **Result:** [specific numbers — ms, ops/sec, memory MB]
- **Conditions:** [load level, data size, environment]
- **Variance:** [spread across repeated runs — the noise floor Step 4 compares against]
```

**Measurement approaches by context:**

| Context | Tool/Approach |
|---------|--------------|
| API endpoint | `time curl`, load testing tool, APM dashboard |
| Database query | `EXPLAIN ANALYZE`, query log timing |
| Frontend render | Browser DevTools Performance tab, Lighthouse |
| Algorithm | Benchmark suite with representative data sizes |
| Memory | Heap snapshots, memory profiler |
| Build time | `time [build command]`, build tool profiling |

### Step 2: Profile

Identify where time is actually spent:

**Backend profiling:**
- Instrument the slow path with timing logs
- Use language profiler (pprof, py-spy, node --prof, etc.)
- Check database query logs for slow queries
- Check for N+1 query patterns

**Frontend profiling:**
- Browser DevTools → Performance tab → Record
- Check for layout thrashing (forced reflows)
- Check bundle size (webpack-bundle-analyzer, etc.)
- Check network waterfall for blocking requests

**Focus on the critical path** — the sequence of operations that determines total latency.

### Step 3: Hypothesize

Based on profiling data, form specific hypotheses:

```markdown
### Hypothesis
- **Bottleneck:** [specific operation/query/function]
- **Evidence:** [profiling data showing this is the bottleneck]
- **Expected improvement:** [how much faster, with reasoning]
- **Proposed fix:** [specific change to make]
```

### Step 4: Optimize

Make ONE change at a time. For each change:
1. Implement the optimization
2. Measure performance again (same conditions and run count as the baseline)
3. Compare: Did it actually improve? An improvement smaller than the baseline's run-to-run variance is within measurement noise — treat it as no improvement
4. If yes, keep it. If no, or if the improvement is within measurement noise, revert it and record the attempt (see Reverted Attempts below)

**Common optimization patterns:**

| Pattern | Fix |
|---------|-----|
| N+1 queries | Eager loading, batch queries |
| Missing index | Add database index |
| Large payload | Pagination, field selection |
| Redundant computation | Memoization, caching |
| Synchronous I/O | Async/parallel execution |
| Memory allocation | Object pooling, streaming |

### Step 5: Verify

After optimization:

```markdown
### Performance Comparison
| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| [metric] | [value] | [value] | [% change] |

### Regression Check
- [ ] All tests still pass
- [ ] No new warnings
- [ ] Memory usage hasn't increased
- [ ] Other endpoints not affected
```

### Reverted Attempts

Every reverted optimization is recorded so it is not retried. When a plan is executing, append one line per revert to the plan's progress ledger (`.claude/plans/<plan-basename>.progress.local.md`, the file `executing-plans` creates); with no plan running, put the line under the Performance Comparison block in Step 5 so it travels with the report.

```markdown
- Reverted: [change tried] — [before → after, variance] — [no improvement / within noise / regression]
```

Before trying an optimization, read the ledger: an entry for the same change ends the attempt.

## Quick Reference

| Symptom | Likely Cause | First Step |
|---------|-------------|------------|
| Slow API response | DB query or N+1 | Check query logs |
| Slow page load | Large bundle or blocking request | Lighthouse audit |
| High memory usage | Memory leak or large cache | Heap snapshot |
| Slow build | Unoptimized bundler config | Build profiling |
| Degradation over time | Data growth + missing indexes | EXPLAIN ANALYZE on slow queries |

## Common Mistakes

**Optimizing without measuring** — The #1 mistake. Your intuition about what's slow is usually wrong. Measure first.

**Optimizing the wrong thing** — A function that takes 1ms but is called once doesn't matter. A function that takes 0.1ms but is called 10,000 times does. Profile to find the actual bottleneck.

**Not re-measuring after optimization** — "I added caching so it's faster now." Is it? Measure. Sometimes caching makes things slower (cache miss overhead, stale data).

**Micro-optimizing** — Saving 50 microseconds in a function that runs inside a 200ms database query is meaningless. Focus on the critical path.
