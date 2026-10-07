# Deviations from the plan

Loaded on demand from SKILL.md when you find an issue the plan does not mention.

## Deviation Scope Boundary

When executing, you will discover issues not in the plan. Apply these rules:

**Fix without asking:**
- Bugs directly caused by the current task's changes (wrong logic, type errors, broken imports)
- Missing critical functionality for correctness or security (null checks, input validation, error handling)
- Blocking issues preventing task completion (missing dependency, wrong path)

**Scope boundary:** Only fix issues directly caused by the current task's changes. Pre-existing warnings, linting errors in unrelated files, or tech debt you notice go to BACKLOG.md, not into this diff: fixing them inline widens a change nobody planned or reviewed.

**Fix attempt limit:** After 3 fix attempts on a single issue within a task, stop trying. Document it under `### Deferred Issues` in the batch report and move to the next task, since further retries spend context without progress.

**Ask the user first** (SKILL.md § When to stop and ask), because these reach past the task and are the user's call:
- New database tables or major schema changes
- Switching frameworks or libraries
- Changing public API contracts
- Modifying auth logic
- Adding new environment variables
