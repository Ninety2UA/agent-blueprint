# Wave guide

Loaded on demand from SKILL.md when you build the waves, size them, write the report, or check a wave plan against common mistakes.

## The Wave Model

```
Wave 1: [Task A, Task B, Task C]  ← all independent, run in parallel
         │         │         │
         ▼         ▼         ▼
    ┌─────────────────────────────┐
    │   Integration Verification   │
    └─────────────────────────────┘
                  │
Wave 2: [Task D, Task E]         ← D depends on A, E depends on B
         │         │
         ▼         ▼
    ┌─────────────────────────────┐
    │   Integration Verification   │
    └─────────────────────────────┘
                  │
Wave 3: [Task F]                  ← depends on D and E
         │
         ▼
    ┌─────────────────────────────┐
    │   Final Verification         │
    └─────────────────────────────┘
```

## Example wave plan

```markdown
## Wave Plan

### Wave 1 (no dependencies)
- Task 1: Set up database schema
- Task 3: Create API route stubs
- Task 5: Add frontend page skeleton

### Wave 2 (depends on Wave 1)
- Task 2: Implement model logic (depends on Task 1)
- Task 4: Implement API handlers (depends on Task 3)

### Wave 3 (depends on Wave 2)
- Task 6: Wire frontend to API (depends on Tasks 4, 5)
- Task 7: Add integration tests (depends on Tasks 2, 4)
```

## Helper limits

A wave runs as many helpers at once as it has tasks, so the host's limit on concurrent helpers bounds how wide a wave can be. Keep each wave within that limit, and on a large plan keep waves reasonably sized rather than as wide as the dependencies allow: past a handful of helpers, integration gets harder and the time saved shrinks. Each implementer sits one level below this session and starts no helpers of its own, since many hosts forbid a helper from starting another.

Claude Code, for example, has no total per session (the 200-subagent total was removed in CLI 2.1.224); it caps concurrent subagents at 20 by default (`CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`, 2.1.217) and nesting at a depth of 3 (`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`, 2.1.219). Hosts with a lower limit need narrower waves.

## Report format

```markdown
## Wave Orchestration Complete

### Execution Summary
| Wave | Tasks | Status | Duration |
|------|-------|--------|----------|
| Wave 1 | Tasks 1, 3, 5 | Complete | [time] |
| Wave 2 | Tasks 2, 4 | Complete | [time] |
| Wave 3 | Tasks 6, 7 | Complete | [time] |

### Final Verification
- Tests: [X passing, Y failing]
- Build: [pass/fail]
- Lint: [pass/fail]

### Files Changed
[list of all files, grouped by task]

### Commits
[list of commits, one per task, or in no-commit mode the messages added to commit-msg.md]
```

## Comparison with Other Execution Skills

| Skill | Use When | Parallelism |
|-------|----------|-------------|
| **ab-wave-orchestration** | Mixed dependencies, 4+ tasks | Parallel within waves |
| **ab-orchestrate** | A whole plan as team work, with a task ledger | Parallel within waves |
| **ab-autonomous-loop** | Sequential tasks, retry needed | None (sequential) |
| **ab-resolve-in-parallel** | All tasks independent | Full parallel |
| **ab-subagent-driven-development** | Any plan, in-session | Sequential with review |
| **ab-executing-plans** | Cross-session execution | Human-paced batches |

## Common Mistakes

**Putting dependent tasks in the same wave** — If Task B reads from the table Task A creates, Task B waits for a later wave, because in the same wave it would run before the table exists.

**Ignoring file conflicts** — Two tasks that both modify `src/utils/helpers.ts` will conflict even if logically independent. Put them in different waves.

**Skipping integration verification** — Each wave passes its integration check before the next one starts, because the next wave builds on it: a break left in place spreads into every task that depends on it.

**Too many waves** — If your plan has 10 waves of 1 task each, it's just sequential execution with extra overhead. Restructure the plan for more parallelism.

**Too few waves** — If everything is in Wave 1, you're probably missing dependencies. Tasks that create schemas should precede tasks that use those schemas.
