# ab-autonomous-loop — loop details

Loaded on demand from SKILL.md when a step points here: when not to use the skill, the pre-flight danger scan, the loop diagram, task classes, circuit-breaker and risk-score mechanics, limits, and integration with other skills.

## When Not to Use

- Tasks require human decisions between steps: use the ab-executing-plans skill, which has checkpoints.
- Tasks are independent and can run in parallel: use the ab-resolve-in-parallel skill (or the ab-orchestrate skill for a whole plan as team work).
- You are exploring or unsure of the approach: use the ab-brainstorming or ab-writing-plans skill first.

It fits a multi-step implementation plan, a PRD or task list worked end to end, or five or more sequential tasks that need no human input between them.

## Pre-flight danger scan

Advisory, once before the first task. Scan the plan for irreversible operations (deleting data, shared-database migrations, force-push, publishing outside the repo), protected-branch pushes, and deleting or skipping tests. Route each hit through the decision boundary in the ab-executing-plans skill; the scan never stops the loop by itself.

## Loop diagram

```
┌─────────────────────────────────────────┐
│              AUTONOMOUS LOOP            │
│                                         │
│  ┌──► Pick next uncompleted task        │
│  │         │                            │
│  │    Attempt task                      │
│  │         │                            │
│  │    Verify (tests, build, evidence)   │
│  │         │                            │
│  │    ┌────┴────┐                       │
│  │    │ Pass?   │                       │
│  │    └────┬────┘                       │
│  │     yes │  no                        │
│  │         │   │                        │
│  │   Mark [x]  Classify error           │
│  │         │   │                        │
│  │         │   ┌────┴────┐              │
│  │         │   │ Fatal?  │              │
│  │         │   └────┬────┘              │
│  │         │  no    │  yes              │
│  │         │  Retry │  STOP & REPORT    │
│  │         │  (backoff)                 │
│  │         │                            │
│  │    More tasks?                       │
│  │     yes │  no                        │
│  └────────┘   │                         │
│          ALL DONE                       │
└─────────────────────────────────────────┘
```

## Task classes

| Classification | Meaning | Example |
|---------------|---------|---------|
| **Independent** | Can be done in any order | Adding unrelated tests |
| **Sequential** | Must follow previous task | Migration before code that uses new schema |
| **Parallelizable** | Can run concurrently | Independent module implementations |

## Circuit breaker

Besides the per-task retry limit, track the health of the whole loop to detect stalls.

**Tracking state (kept across iterations):**
```
consecutive_no_progress = 0    # increments when no task completes in a full loop pass
consecutive_same_error = 0     # increments when the same error message appears
last_error_signature = ""      # normalized error message for comparison
attempts_per_task = []         # track retry count for each completed task (for trend detection)
files_modified_count = {}      # track how many tasks touch each file path
```

**Thresholds (configurable):**

| Threshold | Default | What It Detects |
|-----------|---------|-----------------|
| `NO_PROGRESS_THRESHOLD` | 3 | Loop is spinning without completing any task |
| `SAME_ERROR_THRESHOLD` | 5 | Same error repeating — root cause needs human input |
| `RISING_DIFFICULTY_THRESHOLD` | 3 consecutive tasks with increasing retry count | Complexity compounding — approach is degrading |
| `HOT_FILE_THRESHOLD` | Same file modified by 4+ different tasks | God object emerging — one file absorbing too much responsibility |

**After each loop iteration:**

1. If a task was completed this iteration, reset `consecutive_no_progress` to 0.
2. If no task was completed, increment `consecutive_no_progress`.
3. If the error message matches `last_error_signature`, increment `consecutive_same_error`.
4. If the error message is different, reset `consecutive_same_error` to 0 and update `last_error_signature`.

**Circuit breaker triggers:**

```
if consecutive_no_progress >= NO_PROGRESS_THRESHOLD:
    stop: "Circuit breaker: No progress in [N] consecutive iterations."

if consecutive_same_error >= SAME_ERROR_THRESHOLD:
    stop: "Circuit breaker: Same error repeated [N] times."

if last 3 tasks each required more retries than the previous:
    stop: "Circuit breaker: Rising difficulty — tasks are getting harder, not easier."

if any file has been modified by 4+ different tasks:
    stop: "Circuit breaker: Hot file detected — [file] modified by [N] tasks."
```

A tripped breaker is not retried: the loop stops and escalates (SKILL.md Step 4), because the signal means more attempts of the same kind will not help.

**Error signature normalization:** Strip line numbers, timestamps, and variable values from error messages before comparison. Compare the structural pattern, not the exact string. Example: `"TypeError: Cannot read property 'foo' of undefined at line 42"` → `"TypeError: Cannot read property of undefined"`.

## Risk score

Besides the circuit-breaker thresholds, keep an additive risk score (the WTF-likelihood score) across the whole loop run. It catches gradual degradation that no single threshold trips on.

**Tracking (kept across all iterations):**
```
wtf_score = 0%
```

**Risk accumulation:**

| Event | Score Added | Rationale |
|-------|-----------|-----------|
| Each revert (`git revert`, or undoing a task's working-tree changes in no-commit mode) | +15% | Reverts mean changes made things worse |
| Each fix touching >3 files | +5% | Multi-file changes are riskier |
| After fix 15 | +1% per additional fix | Volume itself is a risk signal |
| Touching files unrelated to the current task | +20% | Scope creep is the biggest risk |

**Threshold:** when `wtf_score` passes 20%, stop and escalate (SKILL.md Step 4): show what the run has done so far and ask whether to continue. With nobody to answer, the run stops.

**Hard cap:** 50 total changes across the entire loop run, regardless of wtf_score.

**Note:** test-only changes (regression tests, new test files) add nothing to wtf_score; only production code changes accumulate risk.

## Quick Reference

| Parameter | Default | Override |
|-----------|---------|----------|
| Hard iteration ceiling | 20 loop passes | Fixed, no override. Count loop passes (SKILL.md Step 2) in context; at 20, stop with the Step 4 escalation. The same ceiling the ab-ship-pipeline skill applies across fresh sessions, counted there by the run state's `iteration`. It sits above every configurable cap: 3 retries per task, 50 total changes, and the ship runner's iteration cap (10). |
| Max retries per task | 3 | User can specify |
| No-progress circuit breaker | 3 iterations | User can specify |
| Same-error circuit breaker | 5 occurrences | User can specify |
| Rising difficulty circuit breaker | 3 consecutive tasks with increasing retries | User can specify |
| Hot file circuit breaker | 4+ tasks touching same file | User can specify |
| Batch size before checkpoint | All (autonomous) | User can request checkpoints every N tasks; with nobody to answer, a checkpoint continues |
| Backoff timing | 5s → 15s → 45s | Adjust for rate limits |
| Parallelizable tasks | Sequential | Dispatch via ab-resolve-in-parallel |

## Integration with Other Skills

| Situation | Skill to Use |
|-----------|-------------|
| Task requires writing code | Follow ab-test-driven-development (red-green-refactor) |
| Task fails and needs debugging | Use ab-systematic-debugging to find root cause |
| Multiple independent tasks ready | Dispatch via ab-resolve-in-parallel |
| Task requires a plan change | Stop loop, use ab-writing-plans to revise |
| All tasks done, ready to merge | Use ab-finishing-a-development-branch |
| Loop complete, end of session | Use ab-session-wrap to document |
