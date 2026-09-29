---
name: ab-orchestrate
description: "Runs a plan as team work: a task ledger, dependency-ordered waves of parallel helpers with file ownership or worktrees, integration checks between waves, lead-only commits, then review and sign-off. Works in every tool: helpers where the tool has them, one task after another where it does not, and Claude Code Agent Teams or Codex multi_agent_v2 when the user has switched them on. Use when a plan has four or more tasks, some of them independent, or when the user asks for parallel, team, wave or collaborative execution. Not for a sequential plan with review checkpoints between batches (ab-executing-plans) or a change under three files (ab-quick-fix)."
argument-hint: "[path to plan file] [--no-review] [--wave-size N] [--iterations N] [--convergence fast|deep|perfect]"
metadata:
  version: "3.8.0"
---

# Orchestrate — Team Work in Waves

Execute a plan as a team, with this session as the lead. The lead follows `references/coordinator.md`: it keeps the run's task ledger (`references/team-ledger.md`), groups tasks into waves so no two tasks in a wave share a file, starts one worker per task, integrates and commits each finished task itself, verifies every wave, and (unless `--no-review`) reviews the combined output and signs off. Only the lead starts helpers; workers never start their own, because many hosts forbid a helper from starting another.

The same run works everywhere. Where the tool can start helpers, a wave's workers run in parallel. Where it cannot, the lead does each task itself, one after another, through the same ledger, so the result has the same shape. Where the user has switched on a native team feature, the lead uses it on top of the ledger (`references/native-extras.md`).

**Announce at start:** "Starting team run — coordinating from this session."

**Working folder.** Blueprint working files live under `.agent-blueprint/` in the project root. Before the first write there, make sure `.agent-blueprint/.gitignore` exists and lists `run/`, `team/`, `review-runs/`, `cache/` and `.gitignore`, so run state and the ignore file itself stay out of commits while plans and notes stay tracked.

**Provenance record.** When this skill starts, write `.agent-blueprint/run/provenance/<name>.json`, where `<name>` is the `name` in this skill's frontmatter: `skill` (that name), `version` (its `metadata.version`), `started_at` (the current UTC time, ISO 8601) and an empty `helper_steps` list, replacing any older record of that name. Before that, make sure `.agent-blueprint/.gitignore` exists and lists `run/`, `team/`, `review-runs/`, `cache/` and `.gitignore`. Each Helper step adds its entry to `helper_steps`. The record tells a run, and the smoke test, which skill ran and how; it is not a security control.

## Parse Arguments

- **Plan file:** Path from arguments (if not provided, look for the most recent plan in `docs/plans/`)
- **`--no-review`:** Skip the built-in review and sign-off (used when called from ab-ship-pipeline or ab-build-pipeline, which handle review themselves)
- **`--wave-size N`:** Most workers per wave (default 4). The host's limit in `references/host-limits.tsv` can lower it, never raise it.
- **`--iterations N`:** Max review-improve iterations (default: 1 = single pass, max: 10). When > 1, the review uses the ab-iterative-refinement skill instead of a single ab-review-swarm pass.
- **`--convergence fast|deep|perfect`:** Review convergence mode (default: `fast`). `fast` = exit when P1=0, `deep` = exit when P1+P2=0, `perfect` = exit when all findings=0. Only applies when `--iterations` > 1.

## Coordinate

The ledger lives in `.agent-blueprint/team/<run>/ledger.md`.

Read `references/coordinator.md` and follow it with these settings:

- Plan file: [path to plan file]
- Wave size: [N] (default 4)
- Review mode: [with-review | no-review]
- Review iterations: [N] (default 1)
- Review convergence: [fast|deep|perfect] (default fast)
- Autonomous mode: [autonomous if called from ab-ship-pipeline, supervised otherwise]
- Project conventions: docs/context/CONVENTIONS.md; agent config: blueprint.local.md

The run: read the plan completely, open the ledger, and build the first wave. For each wave, start the workers, integrate each finished task (checks, commit, ledger), and run the integration verifier. After the last wave, run tests + build + lint. Then:
- If no-review: report execution results only.
- If with-review AND iterations=1: run the ab-review-swarm skill, fix P1 findings, sign off.
- If with-review AND iterations>1: run the ab-iterative-refinement skill with max_iterations=[N] and convergence=[mode]. Sign off when converged.

If a ledger for the same plan is still `running`, the run resumes from it rather than starting over.

## Finish

When the coordinator's report is ready:

1. Present the execution summary to the user, with the ledger's path
2. If you signed off (with-review mode): report the sign-off status
3. If the report lists blockers: present them and ask the user how to proceed, with the options and the headless default in `references/coordinator.md` § Phase 5

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
