---
name: ab-wave-orchestration
description: "Trigger this skill when executing dependency-ordered task groups — tasks that have a mix of independent and dependent relationships. Groups tasks into waves: independent tasks run in parallel within each wave, dependent tasks wait for prior waves. Verifies integration between waves before proceeding. Usually followed by the main session inside the ab-orchestrate skill — not typically called directly by users. DO NOT TRIGGER when all tasks are sequential (use ab-autonomous-loop instead). DO NOT TRIGGER when all tasks are independent with no dependencies (use ab-resolve-in-parallel instead). DO NOT TRIGGER for plans with fewer than 4 tasks (overhead not worth it)."
---

# Wave Orchestration

## Overview

Execute a plan by grouping tasks into dependency-ordered waves. Within each wave, independent tasks run in parallel (one subagent per task). Between waves, an integration verifier ensures all tasks work together before the next wave begins.

**Core principle:** Maximize parallelism within dependency constraints. Independent tasks run concurrently; dependent tasks wait.

## When to Use

- Plan has 4+ tasks with mixed dependencies
- Some tasks are independent (can run in parallel)
- Some tasks depend on others (must wait)
- You want maximum speed without sacrificing correctness

**Don't use when:**
- All tasks are sequential (use ab-autonomous-loop instead)
- All tasks are independent (use ab-resolve-in-parallel instead)
- Plan has 1-3 tasks (overhead not worth it)

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

## Process

### Step 1: Load and Parse the Plan

Read the plan file. For each task, identify:
- Task ID or number
- Description
- Dependencies (which tasks must complete first)
- Files it will modify (for conflict detection)

If the plan doesn't specify dependencies explicitly, infer them:
- Tasks that create something used by later tasks → dependency
- Tasks modifying the same file → same wave or sequential
- Tasks with no overlap → independent

### Step 2: Build the Dependency Graph

Organize tasks into waves:

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

**Rules for wave assignment:**
- A task goes in the earliest wave where ALL its dependencies are satisfied
- Tasks in the same wave MUST NOT modify the same files
- If two independent tasks touch the same file, put one in a later wave

### Step 3: Present Wave Plan for Approval

Show the user the wave breakdown:
- How many waves
- Which tasks in each wave
- Which tasks run in parallel
- Estimated time savings vs sequential execution

Ask: **"Approve this wave plan? I'll execute Wave 1 first, verify, then Wave 2, etc."**

### Step 4: Execute Each Wave

For each wave:

#### 4a. Start Parallel Helpers

For each task in the wave, start an implementer helper using the ab-subagent-driven-development pattern. **Give each implementer its own worktree**, an isolated copy of the repo, preventing file conflicts between parallel tasks.

**Helper step.** Start a helper (subagent) for this step if you can, with the prompt file named below (its absolute path if the helper shares your files, else its full text) and the listed inputs; leave its model and effort at the session's. If you cannot start one, follow the prompt file yourself. Either way, return its Output section, and note which path ran in the run's provenance record if there is one.

Prompt: the task packet below, one per task; no prompt file applies. Inputs: the packet's fields.

```
Implement Task [N]: [full task description].
Context: [relevant project context, file paths, conventions].
Constraints: Only modify [specific files]. Follow TDD. Run every verification
command inside your worktree; never point it at the main checkout or another path.
Return: Summary of changes, files modified, test results.
```

Start ALL of the wave's helpers at once for maximum parallelism.

**Session cap:** Claude Code no longer caps subagents per session (the 200-subagent total was removed in CLI 2.1.224). What applies now is a concurrency cap of 20 subagents by default (`CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`, 2.1.217) and a nesting depth of 3 by default (`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`, 2.1.219). Very wide waves are bounded by the concurrency cap rather than by a session total, so keep individual waves reasonably sized on large plans; and each implementer sits one spawn level deep (session → implementer) and starts no helpers of its own.

**Why worktree isolation matters:** Without isolation, parallel implementers can overwrite each other's changes to the same files. Worktrees give each implementer a clean copy. Changes are merged back after the wave completes.

#### 4b. Collect Results

When all subagents return:
1. Read each summary
2. Note files modified by each
3. Check for unexpected overlaps

#### 4c. Integration Verification

**Helper step.** Start a helper (subagent) for this step if you can, with the prompt file named below (its absolute path if the helper shares your files, else its full text) and the listed inputs; leave its model and effort at the session's. If you cannot start one, follow the prompt file yourself. Either way, return its Output section, and note which path ran in the run's provenance record if there is one.

Prompt: `references/agents/integration-verifier.md`. Inputs: the wave number and the tasks completed, with their summaries; it runs the full test suite and checks for conflicts between task implementations.

**Lower effort.** This step is safe at lower effort. If your host lets you set effort for a single helper, you may start this one lower, unless the user asked for their level everywhere; otherwise it runs at the session's level. Never switch models to save effort.

#### 4d. Handle Verification Results

- **PASS:** Proceed to next wave
- **ISSUES FOUND:** Fix issues before proceeding. Start a targeted fix helper for each issue as in 4a, with the issue as its task packet.
- **FAIL:** Stop. Report failure to user. Do not proceed to next wave.

### Step 5: Final Verification

After all waves complete:

1. Run full test suite
2. Run build
3. Run lint
4. Run an overall code review

**Helper step.** Start a helper (subagent) for this step if you can, with the prompt file named below (its absolute path if the helper shares your files, else its full text) and the listed inputs; leave its model and effort at the session's. If you cannot start one, follow the prompt file yourself. Either way, return its Output section, and note which path ran in the run's provenance record if there is one.

Prompt: `references/agents/code-reviewer.md`. Inputs: the plan file and the review range, from the commit before Wave 1 to `HEAD`.

### Step 6: Report

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
[list of commits from all tasks]
```

## Comparison with Other Execution Skills

| Skill | Use When | Parallelism |
|-------|----------|-------------|
| **ab-wave-orchestration** | Mixed dependencies, 4+ tasks | Parallel within waves |
| **ab-autonomous-loop** | Sequential tasks, retry needed | None (sequential) |
| **ab-resolve-in-parallel** | All tasks independent | Full parallel |
| **ab-subagent-driven-development** | Any plan, in-session | Sequential with review |
| **ab-executing-plans** | Cross-session execution | Human-paced batches |

## Common Mistakes

**Putting dependent tasks in the same wave** — If Task B reads from the table Task A creates, they CANNOT be in the same wave. Task B must wait for Task A.

**Ignoring file conflicts** — Two tasks that both modify `src/utils/helpers.ts` will conflict even if logically independent. Put them in different waves.

**Skipping integration verification** — Each wave must pass integration before the next wave starts. Skipping creates cascading failures.

**Too many waves** — If your plan has 10 waves of 1 task each, it's just sequential execution with extra overhead. Restructure the plan for more parallelism.

**Too few waves** — If everything is in Wave 1, you're probably missing dependencies. Tasks that create schemas should precede tasks that use those schemas.
