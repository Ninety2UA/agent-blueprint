---
name: ab-team-execution
description: "Trigger this skill when multiple Claude Code instances should coordinate through shared task lists and messaging. Trigger scenarios: 'team', 'agent team', 'teammates', 'collaborative', 'spawn workers', 'multi-agent implementation', 'collaborative execution', 'spawn teammates', 'use agent teams', 'work on this together', or when 4+ tasks touch different file areas and benefit from concurrent collaborative execution. Even if the user doesn't explicitly mention teams, trigger this skill when the work naturally divides into independent areas where multiple agents can collaborate without file conflicts. Requires CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS to be enabled. DO NOT TRIGGER for wave-based parallel execution of dependency-ordered tasks — use ab-orchestrate instead. DO NOT TRIGGER for small changes touching fewer than 3 files — use ab-quick-fix instead."
argument-hint: "<plan file or task description> [--no-review] [--iterations N] [--convergence fast|deep|perfect]"
---

# Team Execution — Collaborative Agent Team

Spawn a team of independent Claude Code instances that coordinate through a shared task list and messaging. This session is the team lead and manages the entire lifecycle, following the coordinator instructions in the ab-orchestrate skill in team mode (the Claude Code Agent Teams option): it designs the team structure, enforces plan approval before coding, monitors progress, resolves blockers, and (unless `--no-review`) reviews the combined output and signs off. Only this session spawns teammates; teammates start no helpers of their own.

**Announce at start:** "Setting up Agent Team — coordinating from this session."

## Activate Team State

**Working folder.** Blueprint working files live under `.agent-blueprint/` in the project root. Before the first write there, create `.agent-blueprint/.gitignore` with the lines `run/`, `team/`, `review-runs/` and `cache/` if it does not exist yet, so run state stays out of commits while plans and notes stay tracked.

Before spawning teammates, create the state file so Agent Teams hooks (TeammateIdle, TaskCompleted) know a team is active:

```bash
mkdir -p .claude
echo "active: true" > .agent-blueprint/team/active.md
```

**Prerequisite:** Agent Teams is an experimental feature. Ensure `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1"` is set in your Claude Code settings.json.

## Parse Arguments

- **Plan file or task description:** From arguments
- **`--no-review`:** Skip the built-in review and sign-off (used when called from ab-ship-pipeline or ab-build-pipeline, which handle review themselves)
- **`--iterations N`:** Max review-improve iterations (default: 1 = single pass, max: 10). When > 1, the review uses the ab-iterative-refinement skill instead of a single ab-review-swarm pass.
- **`--convergence fast|deep|perfect`:** Review convergence mode (default: `fast`). `fast` = exit when P1=0, `deep` = exit when P1+P2=0, `perfect` = exit when all findings=0. Only applies when `--iterations` > 1.

## Coordinate

Follow the coordinator instructions in the ab-orchestrate skill, in team mode, with these settings (this skill's steps replace that skill's own wave-run steps):

- Execution mode: team (Agent Teams)
- Plan file / task: [path or description]
- Review mode: [with-review | no-review]
- Review iterations: [N] (default 1)
- Review convergence: [fast|deep|perfect] (default fast)
- Autonomous mode: [autonomous if called from ab-ship-pipeline, supervised otherwise]
- Project conventions: docs/context/CONVENTIONS.md; agent config: blueprint.local.md

The run: read the plan file completely. Design a team of 3-5 teammates. Assign file ownership (NO overlap between teammates). Break work into 5-6 tasks per teammate. Spawn teammates, enforce the plan approval gate, then monitor execution. After all tasks complete, run tests + build + lint. Then:
- If no-review: report execution results only.
- If with-review AND iterations=1: run the ab-review-swarm skill, fix P1 findings, sign off.
- If with-review AND iterations>1: run the ab-iterative-refinement skill with max_iterations=[N] and convergence=[mode]. Sign off when converged.

Follow the coordinator instructions and the ab-agent-teams skill exactly.

CRITICAL: You are the coordinator. Do NOT write code yourself.
If something needs fixing, assign it to a teammate.

## Finish

When the coordinator's report is ready:

1. Present the team performance summary to the user
2. If you signed off (with-review mode): report the sign-off status
3. If the report lists blockers: present them and ask the user how to proceed, as the coordinator instructions' report phase says

## Coordinator Responsibilities

As coordinator, this session handles:

| Responsibility | What the Coordinator Does |
|----------------|--------------------|
| **Team design** | Determines team size, responsibility domains, file ownership |
| **Spawn teammates** | Creates team, spawns each with detailed context prompts |
| **Plan approval gate** | Reviews each teammate's implementation plan before they code |
| **Monitor progress** | Watches task list, intervenes on blockers, relays info |
| **Delegate mode** | Never writes code — creates tasks and assigns to teammates |
| **Integration check** | Runs tests + build + lint after all teammates complete |
| **Review (if enabled)** | Runs ab-review-swarm, evaluates findings, creates fix tasks |
| **Sign-off** | Reports APPROVED, APPROVED WITH NOTES, or NOT APPROVED |

## Standalone vs Pipeline Usage

| Context | --no-review | Review happens in |
|---------|-------------|-------------------|
| Team-execution (standalone) | No (default) | This session: single ab-review-swarm pass |
| Team-execution `--iterations 5` | No | This session: ab-iterative-refinement (up to 5 cycles) |
| Team-execution `--iterations 5 --convergence deep` | No | This session: ab-iterative-refinement (exit when P1+P2=0) |
| Called from ab-ship-pipeline | Yes | ab-ship-pipeline Stage 5 (ab-iterative-refinement) |
| Called from ab-ship-pipeline `--swarm` | Yes | ab-ship-pipeline Stage 5 (parallel review + test) |
| Called from ab-build-pipeline | Yes | ab-build-pipeline Stage 5 (ab-review-swarm) |

## When NOT to Use

- **Small changes (< 3 files):** Use direct implementation or ab-quick-fix skill
- **Analysis/review tasks:** Use ab-review-swarm or ab-deep-research skill (swarm pattern)
- **Strictly sequential work:** Use ab-orchestrate skill (wave pattern)
- **Single-layer changes:** A single subagent is sufficient
