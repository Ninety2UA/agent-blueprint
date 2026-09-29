---
name: ab-performance-profiling
description: "Makes slow code faster by measurement: a baseline with its run-to-run variance, a profile of the critical path, a hypothesis the data supports, one optimization at a time re-measured against that noise floor, and a record of reverted attempts so none is retried. Use when something is slow, laggy or timing out, latency, CPU or memory has regressed, N+1 queries or a bottleneck is suspected, or the user wants code sped up, including when they want to jump straight to a fix such as adding an index or a cache. Not for code quality changes unrelated to performance (ab-iterative-refinement, or a code simplification skill)."
---

# Performance Profiling

## Overview

Profile-driven performance investigation. Measure before optimizing, form hypotheses based on data, and verify that changes actually improve performance. The run is done when the Step 5 comparison shows each kept change beating the baseline's noise with the regression check passing, and every reverted attempt is on record.

## When to Use

- User reports something is "slow"
- Response times have degraded
- Before optimizing code you think is slow
- After adding a feature that might have performance implications
- When reviewing code with performance-sensitive patterns (N+1 queries, nested loops, large payloads)

## The Iron Law

**Hard gate.** Optimize only a bottleneck that profiling data shows, and measure before you change anything, even when the user asks for a specific fix such as an index or a cache. Intuition about where time goes is usually wrong, and an unmeasured change can make things slower while looking like progress. When the user's fix is the right one, the data will say so.

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

Make one change at a time, so each measured difference has a single cause. For each change:
1. Implement the optimization
2. Measure performance again (same conditions and run count as the baseline)
3. Compare: did it actually improve? An improvement smaller than the baseline's run-to-run variance is within measurement noise — treat it as no improvement
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

Every reverted optimization is recorded so it is not retried. When a plan is executing, append one line per revert to the plan's progress ledger (`.agent-blueprint/plans/<plan-basename>.progress.md`, the file the ab-executing-plans skill creates); with no plan running, put the line under the Performance Comparison block in Step 5 so it travels with the report.

```markdown
- Reverted: [change tried] — [before → after, variance] — [no improvement / within noise / regression]
```

Before trying an optimization, read the ledger: an entry for the same change ends the attempt.

**Working folder.** Blueprint working files live under `.agent-blueprint/` in the project root. Before the first write there, create `.agent-blueprint/.gitignore` with the lines `run/`, `team/`, `review-runs/` and `cache/` if it does not exist yet, so run state stays out of commits while plans and notes stay tracked.

## Quick Reference

| Symptom | Likely Cause | First Step |
|---------|-------------|------------|
| Slow API response | DB query or N+1 | Check query logs |
| Slow page load | Large bundle or blocking request | Lighthouse audit |
| High memory usage | Memory leak or large cache | Heap snapshot |
| Slow build | Unoptimized bundler config | Build profiling |
| Degradation over time | Data growth + missing indexes | EXPLAIN ANALYZE on slow queries |

## Common Mistakes

**Optimizing without measuring** — The most common mistake. Your intuition about what's slow is usually wrong. Measure first.

**Optimizing the wrong thing** — A function that takes 1ms but is called once doesn't matter. A function that takes 0.1ms but is called 10,000 times does. Profile to find the actual bottleneck.

**Not re-measuring after optimization** — "I added caching so it's faster now." Is it? Measure. Sometimes caching makes things slower (cache miss overhead, stale data).

**Micro-optimizing** — Saving 50 microseconds in a function that runs inside a 200ms database query is meaningless. Focus on the critical path.
