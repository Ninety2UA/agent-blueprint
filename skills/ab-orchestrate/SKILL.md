---
name: ab-orchestrate
description: "Trigger this skill when executing plans with parallelizable tasks using dependency-ordered waves. Trigger scenarios: 'parallel', 'waves', 'orchestrate', 'run tasks in parallel', 'speed up execution', 'parallel execution', 'wave execution', 'execute this plan fast', 'run these concurrently', or any request where the user has a plan with independent tasks and wants faster execution. Even if the user doesn't explicitly ask for parallelism, trigger this skill when a plan contains tasks that can clearly run concurrently in dependency-ordered waves. The main session groups tasks into waves and dispatches worktree-isolated workers. DO NOT TRIGGER for collaborative multi-file work needing shared task lists and inter-agent messaging — use ab-team-execution instead. DO NOT TRIGGER for sequential single-task execution with human review checkpoints between batches — use ab-executing-plans instead."
argument-hint: "[path to plan file] [--no-review] [--iterations N] [--convergence fast|deep|perfect]"
---

# Orchestrate — Wave-Based Parallel Execution

Execute a plan using dependency-aware wave orchestration. This session coordinates the whole run by following `references/coordinator.md`: it groups tasks into waves, dispatches parallel workers, each in its own worktree, runs integration verification between waves, and (unless `--no-review`) reviews the combined output and signs off. Only this session starts helpers; workers never start their own.

**Announce at start:** "Starting wave orchestration — coordinating from this session."

## Parse Arguments

- **Plan file:** Path from arguments (if not provided, look for the most recent plan in `docs/plans/`)
- **`--no-review`:** Skip the built-in review and sign-off (used when called from ab-ship-pipeline or ab-build-pipeline, which handle review themselves)
- **`--iterations N`:** Max review-improve iterations (default: 1 = single pass, max: 10). When > 1, the review uses the ab-iterative-refinement skill instead of a single ab-review-swarm pass.
- **`--convergence fast|deep|perfect`:** Review convergence mode (default: `fast`). `fast` = exit when P1=0, `deep` = exit when P1+P2=0, `perfect` = exit when all findings=0. Only applies when `--iterations` > 1.

## Coordinate

Read `references/coordinator.md` and follow it with these settings:

- Execution mode: wave
- Plan file: [path to plan file]
- Review mode: [with-review | no-review]
- Review iterations: [N] (default 1)
- Review convergence: [fast|deep|perfect] (default fast)
- Autonomous mode: [autonomous if called from ab-ship-pipeline, supervised otherwise]
- Project conventions: docs/context/CONVENTIONS.md; agent config: blueprint.local.md

The run: read the plan file completely and group tasks into dependency-ordered waves. For each wave, start parallel workers with worktree isolation, and run the integration verifier between waves. After all waves complete, run tests + build + lint. Then:
- If no-review: report execution results only.
- If with-review AND iterations=1: run the ab-review-swarm skill, fix P1 findings, sign off.
- If with-review AND iterations>1: run the ab-iterative-refinement skill with max_iterations=[N] and convergence=[mode]. Sign off when converged.

Follow the coordinator instructions and the ab-wave-orchestration skill exactly.

## Finish

When the coordinator's report is ready:

1. Present the execution summary to the user
2. If you signed off (with-review mode): report the sign-off status
3. If the report lists blockers: present them and ask the user how to proceed (`references/coordinator.md` § Phase 5)

## Standalone vs Pipeline Usage

| Context | --no-review | Review happens in |
|---------|-------------|-------------------|
| Orchestrate (standalone) | No (default) | This session: single ab-review-swarm pass |
| Orchestrate `--iterations 5` | No | This session: ab-iterative-refinement (up to 5 cycles) |
| Orchestrate `--iterations 5 --convergence deep` | No | This session: ab-iterative-refinement (exit when P1+P2=0) |
| Called from ab-ship-pipeline | Yes | ab-ship-pipeline Stage 5 (ab-iterative-refinement) |
| Called from ab-build-pipeline | Yes | ab-build-pipeline Stage 5 (ab-review-swarm) |

When called standalone, orchestrate is **self-contained**: execution + review + sign-off, all handled by this session following the coordinator instructions. When called from a pipeline, the pipeline handles review to avoid double work.

## When to reach for a native workflow instead

For large autonomous fan-outs, users can opt into a native dynamic workflow ("use a workflow" / ultracode) instead of wave orchestration. The facts that decide between the two: the Workflow tool is available on all paid plans, the API, and Bedrock/Vertex/Foundry, with Pro enabling it in `/config`; it runs in `claude -p` and the Agent SDK when a `Workflow` allow rule, auto or bypass mode, or a PreToolUse hook approves it; it can be disabled per user (`disableWorkflows`, `CLAUDE_CODE_DISABLE_WORKFLOWS=1`) and org-wide; its default size guideline is `medium` (under 10 agents from CLI 2.1.271, `workflowSizeGuideline`), and Pro defaults to `small` (under 5); it runs 16 agents concurrently by default, adjustable from 1 to 256 with `CLAUDE_CODE_WORKFLOW_MAX_CONCURRENT_AGENTS`, and up to 1,000 per run; in interactive subscription sessions a run pauses at a usage limit and resumes after the reset (not in `-p`, the SDK, or teammates); ultracode sessions also exempt Agent-tool subagents from the 20-concurrent subagent cap; and it takes no mid-run user input, so any sign-off between stages means one workflow per stage. Wave orchestration stays the ungated, portable default: it assumes no specific CLI floor, no paid plan, and keeps working where the Workflow tool is disabled per-user or org-wide. No core pipeline depends on the Workflow tool, so reaching for a native workflow is a deliberate opt-in for scale — not a replacement.
