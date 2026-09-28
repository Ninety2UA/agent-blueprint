---
name: ab-autonomous-loop
description: "Trigger this skill when executing multi-task plans autonomously with retry logic and no human checkpoints. Trigger scenarios: 'run autonomously', 'keep going', 'don't stop until done', 'just do it all', 'run through the whole plan', 'execute everything without stopping', or when a plan needs continuous autonomous execution with built-in retry logic, completion tracking, circuit breaker, and degradation detection. Typically invoked internally by pipeline skills (ab-ship-pipeline, ab-build-pipeline) rather than directly by users. Even if the user doesn't explicitly ask for autonomous execution, trigger this skill when the context calls for looping through plan tasks without human intervention between each one. DO NOT TRIGGER when human review checkpoints are needed between batches — use ab-executing-plans instead. DO NOT TRIGGER when tasks should run in parallel — use ab-orchestrate instead."
---

# Autonomous Loop

## Overview

Execute a plan's tasks in an autonomous loop: pick a task, attempt it, verify it, mark it complete (or retry on failure), and move to the next one. Loop until all tasks are done. Inspired by the iterate-until-complete pattern where small, disciplined iterations compound into full plan completion.

**Core principle:** Loop until done. Retry on transient failures. Abort on fatal errors. Track progress via checkboxes.

## When to Use

- Executing a multi-step implementation plan autonomously
- Processing a PRD or task list end-to-end
- When the user says "just do it all" or "run through the whole plan"
- When you have 5+ sequential tasks to complete without needing human input between each one

**Don't use when:**
- Tasks require human decisions between steps (use ab-executing-plans with checkpoints instead)
- Tasks are independent and can run in parallel (use ab-resolve-in-parallel instead)
- You're exploring or unsure of the approach (use ab-brainstorming or ab-writing-plans first)

## The Iron Law

<HARD-GATE>
Run feedback loops INCREMENTALLY, not at project end. Verify after EACH task, not after all tasks. A chain of unverified changes is a chain of compounding bugs.
</HARD-GATE>

## Process

### Step 1: Load the Plan

Read the plan file and parse all tasks. Each task should have:
- A description of what to do
- A clear completion criteria (how to verify it's done)
- A checkbox status (`- [ ]` pending, `- [x]` complete)

**Pre-flight danger scan (advisory):** before the first task, scan the plan for irreversible operations (deleting data, shared-database migrations, force-push, publishing outside the repo), protected-branch pushes, and deleting or skipping tests. Route each hit through the decision boundary; the scan never stops the loop by itself.

If the plan doesn't have checkboxes, add them:
```markdown
- [ ] Task 1: Implement user model
- [ ] Task 2: Add validation middleware
- [ ] Task 3: Write integration tests
```

### Step 2: Classify Tasks

Before starting the loop, classify each task:

| Classification | Meaning | Example |
|---------------|---------|---------|
| **Independent** | Can be done in any order | Adding unrelated tests |
| **Sequential** | Must follow previous task | Migration before code that uses new schema |
| **Parallelizable** | Can run concurrently | Independent module implementations |

For parallelizable tasks, consider dispatching them via the ab-resolve-in-parallel skill instead of looping sequentially.

### Step 3: Enter the Loop

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

For each iteration of the loop:

#### 3a. Pick Next Task

Select the next uncompleted task (`- [ ]`) in order. Skip tasks blocked by incomplete dependencies.

#### 3b. Attempt the Task

Execute the task following these sub-steps:
1. Read any files the task references
2. Write the implementation (follow TDD if writing code — test first)
3. Run the task's verification (tests, build, lint, or specific check)

#### 3c. Verify

Run verification immediately after the task:

```bash
# Always run after code changes
[test command]
[build command]
```

Check the specific acceptance criteria for the task too.

#### 3d. Handle Result

**On success:**
- Mark the task complete: `- [x] Task N: description`
- Update the plan file with the checkbox
- Log: "✓ Task N complete. [N/total] done."
- Continue to next task

**On failure — classify the error:**

| Error Type | Examples | Action |
|-----------|----------|--------|
| **Transient** | Rate limit, network timeout, flaky test | Retry with backoff |
| **Fixable** | Test failure from implementation bug | Debug and fix, then retry |
| **Fatal** | Missing dependency, wrong architecture, unclear requirement | STOP and report |

An unclear requirement is Fatal only after the decision boundary in ab-executing-plans has been applied: a CLAUDE.md must-ask category stops here with the Step 5 structured escalation, and anything that rule lets an autonomous run decide is decided, recorded, and continued.

#### 3e. Reflection Gate (before every retry)

Before retrying, you MUST answer these three questions explicitly in your output:

1. **What failed?** — State the specific error, not just "it didn't work"
2. **What specific change will I make?** — Name the concrete difference from the last attempt
3. **Am I repeating the same approach?** — If yes, you MUST switch strategies entirely

<HARD-GATE>
Do NOT retry without writing out answers to all three questions. If the answer to question 3 is "yes", you must choose a fundamentally different approach before proceeding. Repeating the same strategy with minor tweaks is not allowed after the first retry.
</HARD-GATE>

#### 3f. Retry Logic

When retrying a failed task:

```
Attempt 1: Immediate
Attempt 2: Complete Reflection Gate, try different approach
Attempt 3: Complete Reflection Gate, try fundamentally different strategy
Attempt 4 (max): STOP — escalate to user
```

**Max retries per task: 3** (4 total attempts including the initial one).

Between retries:
- Complete the Reflection Gate above (mandatory)
- Re-read the failing test output or error message
- If the second retry fails, the third MUST use a fundamentally different approach
- If all retries exhausted, mark the task as blocked and move to the next independent task

**Exponential backoff for transient errors:**
- Attempt 1: immediate
- Attempt 2: 5 second pause
- Attempt 3: 15 second pause
- Attempt 4: 45 second pause, then abort

### Step 4: Progress Tracking

After each task (pass or fail), report progress:

```markdown
## Loop Progress: [N/total] tasks complete

### Completed
- [x] Task 1: Implement user model ✓
- [x] Task 2: Add validation middleware ✓

### Current
- [ ] Task 3: Write integration tests (attempt 2/4 — fixing assertion)

### Remaining
- [ ] Task 4: Add error handling
- [ ] Task 5: Update API docs

### Blocked
- [ ] Task 6: Deploy (blocked by Task 3)
```

### Step 5: Circuit Breaker

In addition to per-task retry limits, track global loop health to detect stalls:

**Tracking state (maintained across iterations):**
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

1. If a task was completed this iteration → reset `consecutive_no_progress` to 0
2. If NO task was completed → increment `consecutive_no_progress`
3. If the error message matches `last_error_signature` → increment `consecutive_same_error`
4. If the error message is different → reset `consecutive_same_error` to 0, update `last_error_signature`

**Circuit breaker triggers:**

```
if consecutive_no_progress >= NO_PROGRESS_THRESHOLD:
    STOP — "Circuit breaker: No progress in [N] consecutive iterations."

if consecutive_same_error >= SAME_ERROR_THRESHOLD:
    STOP — "Circuit breaker: Same error repeated [N] times."

if last 3 tasks each required more retries than the previous:
    STOP — "Circuit breaker: Rising difficulty — tasks are getting harder, not easier."

if any file has been modified by 4+ different tasks:
    STOP — "Circuit breaker: Hot file detected — [file] modified by [N] tasks."
```

When the circuit breaker triggers, do NOT retry. Stop immediately and report using this format:

```markdown
## Circuit Breaker — [trigger type]

### What I was trying to do
[Current task and its goal]

### What I've tried
[List of approaches attempted, with outcomes]

### What I think the issue is
[Root cause hypothesis — be specific]

### What I need from you
[Specific question or decision needed to unblock]
```

This structured escalation ensures the user gets actionable information, not a wall of debug output.

**Error signature normalization:** Strip line numbers, timestamps, and variable values from error messages before comparison. Compare the structural pattern, not the exact string. Example: `"TypeError: Cannot read property 'foo' of undefined at line 42"` → `"TypeError: Cannot read property of undefined"`.

### Step 5.5: WTF-Likelihood Risk Scoring

In addition to the circuit breaker thresholds above, maintain an additive risk score that accumulates across the entire loop run. This catches gradual degradation that individual circuit breaker thresholds might miss.

**Tracking (maintained across all iterations):**
```
wtf_score = 0%
```

**Risk accumulation:**

| Event | Score Added | Rationale |
|-------|-----------|-----------|
| Each revert (`git revert`) | +15% | Reverts mean changes made things worse |
| Each fix touching >3 files | +5% | Multi-file changes are riskier |
| After fix 15 | +1% per additional fix | Volume itself is a risk signal |
| Touching files unrelated to the current task | +20% | Scope creep is the biggest risk |

**Threshold:** If `wtf_score > 20%`, STOP immediately. Show the user what you've done so far and ask whether to continue.

**Hard cap:** 50 total changes across the entire loop run, regardless of wtf_score.

**Note:** Test commits (regression tests, new test files) do NOT count toward wtf_score. Only production code changes accumulate risk.

Native `/loop` schedules runs but does not circuit-break or detect degradation, so it complements this skill rather than replacing it (`references/final-report.md` § Native /loop).

### Step 6: Loop Termination

The loop ends when one of these conditions is met:

| Condition | Action |
|-----------|--------|
| **All tasks complete** | Run final verification, report success with the run's numbers (Step 7) |
| **Fatal error** | Stop, report using structured escalation format (trying/tried/think/need) |
| **Max retries exhausted** on a blocking task | Stop, report using structured escalation format |
| **Circuit breaker triggered** | Stop, report using structured escalation format |
| **User interrupts** | Stop, save progress, report current state |

### Step 7: Final Verification

When all tasks are complete, run a full verification pass:

```bash
# Full test suite
[test command]

# Full build
[build command]

# Lint
[lint command]
```

Report the final state in the shape in `references/final-report.md` § Final report: verification results, the run's numbers (tasks done, retries, escalations, blocked tasks with reasons), and the changes made.

**Deslop pass:** Before reporting completion, run a deslop pass on all files modified during this session — remove AI text patterns (over-hedged language, filler transitions, restating-the-obvious comments, redundant type annotations). See ab-iterative-refinement Step 0 for the full checklist. Verify tests still pass after deslop changes.

## Integration with Other Skills

| Situation | Skill to Use |
|-----------|-------------|
| Task requires writing code | Follow ab-test-driven-development (red-green-refactor) |
| Task fails and needs debugging | Use ab-systematic-debugging to find root cause |
| Multiple independent tasks ready | Dispatch via ab-resolve-in-parallel |
| Task requires a plan change | Stop loop, use ab-writing-plans to revise |
| All tasks done, ready to merge | Use ab-finishing-a-development-branch |
| Loop complete, end of session | Use ab-session-wrap to document |

## Quick Reference

| Parameter | Default | Override |
|-----------|---------|----------|
| Hard iteration ceiling | 20 loop passes | Fixed — no override. Count Step 3 passes in context; at 20, stop with the Step 5 structured escalation. Same ceiling as ab-ship-pipeline Stage 0, which counts `## Iteration` blocks across fresh processes. Sits above every configurable cap: retries 3 per task, 50 total changes, Stop hook 5, `ship.sh --max` 10. |
| Max retries per task | 3 | User can specify |
| No-progress circuit breaker | 3 iterations | User can specify |
| Same-error circuit breaker | 5 occurrences | User can specify |
| Rising difficulty circuit breaker | 3 consecutive tasks with increasing retries | User can specify |
| Hot file circuit breaker | 4+ tasks touching same file | User can specify |
| Batch size before checkpoint | All (autonomous) | User can request checkpoints every N tasks |
| Backoff timing | 5s → 15s → 45s | Adjust for rate limits |
| Parallelizable tasks | Sequential | Dispatch via ab-resolve-in-parallel |

## Common Mistakes

**Retrying the same approach** — The Reflection Gate (Step 3e) exists specifically to prevent this. If you can't articulate what's different about your next attempt, you haven't reflected enough. Never skip the gate.

**Skipping verification between tasks** — "I'll verify at the end" means 5 tasks of compounding bugs. Verify after EVERY task.

**Not updating the plan** — If you complete a task but don't mark it `[x]`, the loop will try it again. Always update the checkbox.

**Continuing past fatal errors** — Transient errors get retried. Fatal errors (missing dependency, wrong architecture) require human input. Don't retry what can't succeed.

**Giant tasks in the loop** — Each task should be completable in minutes, not hours. If a task is too large, break it into subtasks before entering the loop.

**Not committing between tasks** — Commit after each successful task. If a later task breaks something, you can revert to the last good state without losing earlier work.
