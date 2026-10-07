---
description: "Execute a plan using wave-based parallel orchestration — groups tasks by dependencies, runs independent tasks in parallel per wave."
argument-hint: "[optional: path to plan file]"
---

# /orchestrate — Wave-Based Parallel Execution

Execute a plan using dependency-aware wave orchestration. Independent tasks run in parallel within each wave; waves execute sequentially.

**Announce at start:** "Starting wave orchestration."

Read and invoke the wave-orchestration skill in `.claude/skills/wave-orchestration/SKILL.md`. Follow it exactly.

Plan file (if specified): $ARGUMENTS
