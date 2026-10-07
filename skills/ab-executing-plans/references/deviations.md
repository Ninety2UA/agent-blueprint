# Deviations from the plan

Loaded on demand from SKILL.md when you find an issue the plan does not mention.

## Deviation Scope Boundary

When executing, you will discover issues not in the plan. Apply these rules:

**Fix without asking:**
- Bugs directly caused by the current task's changes (wrong logic, type errors, broken imports)
- Missing critical functionality for correctness or security (null checks, input validation, error handling)
- Blocking issues preventing task completion (missing dependency, wrong path)

**Scope boundary:** pre-existing warnings, linting errors in unrelated files, or tech debt you notice go to BACKLOG.md, not into this diff: fixing them inline widens a change nobody planned or reviewed.

**Fix attempt limit:** the three-attempt limit in SKILL.md § Decision Boundary exists because further retries spend context without progress; the deferred issue is the batch report's to show, not the task's to hide.

**Ask the user first** for the must-ask categories in SKILL.md § Decision Boundary, because they reach past the task and are the user's call.
