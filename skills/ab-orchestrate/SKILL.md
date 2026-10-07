---
name: ab-orchestrate
description: "Runs a plan as team work: a task ledger, dependency-ordered waves of parallel helpers with file ownership or worktrees, integration checks between waves, lead-only commits, then review and sign-off. Use when a plan has four or more tasks, some of them independent, or when the user asks for parallel, team, wave or collaborative execution. Not for a sequential plan with review checkpoints between batches (ab-executing-plans) or a change under three files (ab-quick-fix)."
argument-hint: "[path to plan file] [--no-review] [--wave-size N] [--iterations N] [--convergence fast|deep|perfect]"
metadata:
  version: "4.0.0"
---

# Orchestrate — Team Work in Waves

Execute a plan as a team, with this session as the lead. The lead follows `references/coordinator.md`: it keeps the run's task ledger (`references/team-ledger.md`), groups tasks into waves so no two tasks in a wave share a file, starts one worker per task, integrates and commits each finished task itself, verifies every wave, and (unless `--no-review`) reviews the combined output and signs off. Only the lead starts helpers; workers never start their own, because many hosts forbid a helper from starting another.

The same run works everywhere. Where the tool can start helpers, a wave's workers run in parallel. Where it cannot, the lead does each task itself, one after another, through the same ledger, so the result has the same shape. Where the user has switched on a native team feature, the lead uses it on top of the ledger (`references/native-extras.md`).

**Announce at start:** "Starting team run — coordinating from this session."

**Working folder.** Blueprint working files live under `.agent-blueprint/` in the project root. Before the first write there, make sure `.agent-blueprint/.gitignore` exists and lists `run/`, `team/`, `review-runs/`, `cache/` and `.gitignore`, so run state and the ignore file itself stay out of commits while plans and notes stay tracked.

**Provenance record.** Before any other work, run this as written from the project root: `mkdir -p .agent-blueprint/run/provenance && date -u +'{"skill": "ab-orchestrate", "version": "4.0.0", "started_at": "%Y-%m-%dT%H:%M:%SZ", "helper_steps": []}' > .agent-blueprint/run/provenance/ab-orchestrate.json`. It replaces any older record, and the Working folder step above has already made sure of `.agent-blueprint/.gitignore`. Each Helper step adds `{step, path: helper|inline}` to `helper_steps`. The record tells a run, and the smoke test, which skill ran and how; it is not a security control.

## Parse Arguments

- **Plan file:** Path from arguments; otherwise the newest file in `docs/plans/`, named in the strategy announcement so a supervised user can redirect. If there is none, stop and say the ab-writing-plans skill comes first.
- **`--no-review`:** Skip the built-in review and sign-off (used when called from ab-ship-pipeline or ab-build-pipeline, which handle review themselves)
- **`--wave-size N`:** Most workers per wave (default 4). The host's limit in `references/host-limits.tsv` can lower it, never raise it.
- **`--iterations N`:** Max review-improve iterations (default 1, max 10). At 1 the review is one ab-review-swarm pass plus up to three fix-and-recheck rounds (coordinator § 4c); above 1 it runs through the ab-iterative-refinement skill instead.
- **`--convergence fast|deep|perfect`:** Review convergence mode (default: `fast`). `fast` = exit when P1=0, `deep` = exit when P1+P2=0, `perfect` = exit when all findings=0. Only applies when `--iterations` > 1.

## Coordinate

The ledger lives in `.agent-blueprint/team/<run>/ledger.md`.

Read `references/coordinator.md` and follow it with these settings:

- Plan file: [path to plan file]
- Wave size: [N] (default 4)
- Review mode: [with-review | no-review]
- Review iterations: [N] (default 1)
- Review convergence: [fast|deep|perfect] (default fast)
- Autonomous mode: [autonomous when the calling skill says so (ab-ship-pipeline does) or `AGENT_BLUEPRINT_RUNNER` is `1`; supervised otherwise]
- Project conventions: docs/context/CONVENTIONS.md; agent config: blueprint.local.md

The run: read the plan completely, open the ledger, and build the first wave. For each wave, start the workers, integrate each finished task (checks, commit, ledger), and run the integration verifier (prompt: `references/agents/integration-verifier.md`, through the coordinator's Helper step). After the last wave, run tests + build + lint. Then:
- If no-review: report execution results only.
- If with-review AND iterations=1: run the ab-review-swarm skill, fix P1 findings, sign off.
- If with-review AND iterations>1: run the ab-iterative-refinement skill with max_iterations=[N] and convergence=[mode]. Sign off when converged.

If a ledger for the same plan is still `running`, the run resumes from it rather than starting over.

## Finish

When the coordinator's report is ready:

1. Present the execution summary to the user, with the ledger's path
2. If you signed off (with-review mode): report the sign-off status
3. If the report lists blockers: present them and ask the user how to proceed, with the options and the headless default in `references/coordinator.md` § Phase 5

## Native workflows

On Claude Code a user may opt into a native dynamic workflow for a large autonomous fan-out instead of waves; `references/native-workflow.md` has the facts that decide between the two. Waves stay the ungated, portable default, and no pipeline depends on the Workflow tool.
