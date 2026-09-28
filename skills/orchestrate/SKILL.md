---
name: orchestrate
description: "Trigger this skill when executing plans with parallelizable tasks using dependency-ordered waves. Trigger scenarios: 'parallel', 'waves', 'orchestrate', 'run tasks in parallel', 'speed up execution', 'parallel execution', 'wave execution', 'execute this plan fast', 'run these concurrently', or any request where the user has a plan with independent tasks and wants faster execution. Even if the user doesn't explicitly ask for parallelism, trigger this skill when a plan contains tasks that can clearly run concurrently in dependency-ordered waves. Dispatches a team-lead agent that groups tasks into waves with worktree-isolated workers. DO NOT TRIGGER for collaborative multi-file work needing shared task lists and inter-agent messaging — use team-execution instead. DO NOT TRIGGER for sequential single-task execution with human review checkpoints between batches — use executing-plans instead."
argument-hint: "[path to plan file] [--no-review] [--iterations N] [--convergence fast|deep|perfect]"
---

# Orchestrate — Wave-Based Parallel Execution

Execute a plan using dependency-aware wave orchestration. A dedicated **team-lead agent** coordinates the entire process: groups tasks into waves, dispatches parallel workers in worktree-isolated subagents, runs integration verification between waves, and (unless `--no-review`) reviews the combined output and signs off.

**Announce at start:** "Starting wave orchestration — dispatching team-lead agent."

## Parse Arguments

- **Plan file:** Path from arguments (if not provided, look for the most recent plan in `docs/plans/`)
- **`--no-review`:** Skip the team-lead's built-in review and sign-off (used when called from ship-pipeline or build-pipeline, which handle review themselves)
- **`--iterations N`:** Max review-improve iterations (default: 1 = single pass, max: 10). When > 1, team-lead uses iterative-refinement skill instead of single review-swarm pass.
- **`--convergence fast|deep|perfect`:** Review convergence mode (default: `fast`). `fast` = exit when P1=0, `deep` = exit when P1+P2=0, `perfect` = exit when all findings=0. Only applies when `--iterations` > 1.

## Dispatch Team Lead

Dispatch the **team-lead** agent with a full context prompt:

```
Task("team-lead: Execute this plan using WAVE mode.

Plan file: [path to plan file]
Review mode: [with-review | no-review]
Review iterations: [N] (default 1)
Review convergence: [fast|deep|perfect] (default fast)
Autonomous mode: [autonomous if called from ship-pipeline, supervised otherwise]

Read the plan file completely. Group tasks into dependency-ordered waves.
For each wave, dispatch parallel subagents with worktree isolation.
Run integration-verifier between waves.
After all waves complete, run tests + build + lint.
[If no-review: Report execution results only.]
[If with-review AND iterations=1: Run review-swarm skill, fix P1 findings, sign off.]
[If with-review AND iterations>1: Run iterative-refinement skill with max_iterations=[N] and convergence=[mode]. Sign off when converged.]

Follow the team-lead agent instructions and wave-orchestration skill exactly.

Project conventions: docs/context/CONVENTIONS.md
Agent config: blueprint.local.md")
```

## Wait for Team Lead

The team-lead agent runs autonomously in its own 200K context window. When it returns:

1. Read the team-lead's report
2. Present the execution summary to the user
3. If team-lead signed off (with-review mode): report the sign-off status
4. If team-lead reports blockers: present them and ask the user how to proceed

## Standalone vs Pipeline Usage

| Context | --no-review | Review happens in |
|---------|-------------|-------------------|
| Orchestrate (standalone) | No (default) | Team-lead: single review-swarm pass |
| Orchestrate `--iterations 5` | No | Team-lead: iterative-refinement (up to 5 cycles) |
| Orchestrate `--iterations 5 --convergence deep` | No | Team-lead: iterative-refinement (exit when P1+P2=0) |
| Called from ship-pipeline | Yes | ship-pipeline Stage 5 (iterative-refinement) |
| Called from build-pipeline | Yes | build-pipeline Stage 5 (review-swarm) |

When called standalone, orchestrate is **self-contained**: execution + review + sign-off, all handled by the team-lead agent. When called from a pipeline, the pipeline handles review to avoid double work.

## When to reach for a native workflow instead

For large autonomous fan-outs, users can opt into a native dynamic workflow ("use a workflow" / ultracode) instead of wave orchestration. The facts that decide between the two: the Workflow tool is available on all paid plans, the API, and Bedrock/Vertex/Foundry, with Pro enabling it in `/config`; it runs in `claude -p` and the Agent SDK when a `Workflow` allow rule, auto or bypass mode, or a PreToolUse hook approves it; it can be disabled per user (`disableWorkflows`, `CLAUDE_CODE_DISABLE_WORKFLOWS=1`) and org-wide; its default size guideline is `medium` (under 10 agents from CLI 2.1.271, `workflowSizeGuideline`), and Pro defaults to `small` (under 5); it runs 16 agents concurrently by default, adjustable from 1 to 256 with `CLAUDE_CODE_WORKFLOW_MAX_CONCURRENT_AGENTS`, and up to 1,000 per run; in interactive subscription sessions a run pauses at a usage limit and resumes after the reset (not in `-p`, the SDK, or teammates); ultracode sessions also exempt Agent-tool subagents from the 20-concurrent subagent cap; and it takes no mid-run user input, so any sign-off between stages means one workflow per stage. Wave orchestration stays the ungated, portable default: it assumes no specific CLI floor, no paid plan, and keeps working where the Workflow tool is disabled per-user or org-wide. No core pipeline depends on the Workflow tool, so reaching for a native workflow is a deliberate opt-in for scale — not a replacement.
