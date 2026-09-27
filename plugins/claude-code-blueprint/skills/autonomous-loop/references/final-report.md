# autonomous-loop — final report and native /loop note

Loaded on demand from `SKILL.md`: the report shape at Step 7, and the rationale for keeping this skill next to native `/loop`.

## Final report

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
- Commits made: [list]
```

## Native /loop

**Native `/loop` does not replace this machinery.** Claude Code's native `/loop` and ScheduleWakeup provide interval and scheduled *recurring invocation*, but `/loop` is session-scoped: it does not reset context, circuit-break, or detect degradation between runs. The circuit breaker (Step 5) and the degradation signals (rising difficulty, hot files, WTF score) are what keep autonomous multi-task execution safe — so this skill stays necessary and complementary even when a native loop schedules the run.
