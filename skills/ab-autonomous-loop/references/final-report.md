# ab-autonomous-loop — reports and native loop note

Loaded on demand from `SKILL.md` when a step reports: the final report at Step 5, the progress report after each task (Step 3), the structured escalation when the loop stops (Step 4), and the reason this skill stays next to a host's native loop scheduler.

## Final report

Step 5 reports the final state in this shape: verification results, the run's numbers (tasks done, retries, escalations, blocked tasks with reasons), and the changes made.

```markdown
## Loop Complete: [total/total] tasks done

### Final Verification
- Tests: [X passing, Y failing]
- Build: [pass/fail]
- Lint: [pass/fail]

### Run numbers
- Tasks done: [N]/[total] · Retries: [N] · Escalations: [N] · Blocked: [N], each listed with its reason

### Summary of Changes
- Files created: [count]
- Files modified: [count]
- Tests added: [count]
- Commits made: [list] (in no-commit mode, the messages recorded in `.agent-blueprint/run/commit-msg.md`)
```

## Native /loop

**A native loop scheduler does not replace this machinery.** Claude Code's native `/loop` and ScheduleWakeup, for example, provide interval and scheduled *recurring invocation*, but `/loop` is session-scoped: it does not reset context, circuit-break, or detect degradation between runs. The circuit breaker and the degradation signals (rising difficulty, hot files, WTF score) in SKILL.md Step 3 are what keep autonomous multi-task execution safe, so this skill stays necessary and complementary even when a native loop schedules the run.

## Progress report

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

## Structured escalation

```markdown
## Loop Stopped — [reason: circuit-breaker trigger, fatal error, retries exhausted, risk score or hard cap]

### What I was trying to do
[Current task and its goal]

### What I've tried
[List of approaches attempted, with outcomes]

### What I think the issue is
[Root cause hypothesis — be specific]

### What I need from you
[Specific question or decision needed to unblock]
```

This structured escalation gives the user actionable information, not a wall of debug output. In a run nobody is watching, it is the run's final output: the loop stops rather than waiting for the answer.
