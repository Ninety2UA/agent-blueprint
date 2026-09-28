---
name: team-execution
description: "Trigger this skill when multiple Claude Code instances should coordinate through shared task lists and messaging. Trigger scenarios: 'team', 'agent team', 'teammates', 'collaborative', 'spawn workers', 'multi-agent implementation', 'collaborative execution', 'spawn teammates', 'use agent teams', 'work on this together', or when 4+ tasks touch different file areas and benefit from concurrent collaborative execution. Even if the user doesn't explicitly mention teams, trigger this skill when the work naturally divides into independent areas where multiple agents can collaborate without file conflicts. Requires CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS to be enabled. DO NOT TRIGGER for wave-based parallel execution of dependency-ordered tasks — use orchestrate instead. DO NOT TRIGGER for small changes touching fewer than 3 files — use quick-fix instead."
argument-hint: "<plan file or task description> [--no-review] [--iterations N] [--convergence fast|deep|perfect]"
---

# Team Execution — Collaborative Agent Team

Spawn a team of independent Claude Code instances that coordinate through a shared task list and messaging. A dedicated **team-lead agent** manages the entire lifecycle: designs the team structure, enforces plan approval before coding, monitors progress, resolves blockers, and (unless `--no-review`) reviews the combined output and signs off.

**Announce at start:** "Setting up Agent Team — dispatching team-lead agent."

## Activate Team State

Before dispatching the team-lead, create the state file so Agent Teams hooks (TeammateIdle, TaskCompleted) know a team is active:

```bash
mkdir -p .claude
echo "active: true" > .claude/team-active.local.md
```

**Prerequisite:** Agent Teams is an experimental feature. Ensure `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1"` is set in your Claude Code settings.json.

## Parse Arguments

- **Plan file or task description:** From arguments
- **`--no-review`:** Skip the team-lead's built-in review and sign-off (used when called from ship-pipeline or build-pipeline, which handle review themselves)
- **`--iterations N`:** Max review-improve iterations (default: 1 = single pass, max: 10). When > 1, team-lead uses iterative-refinement skill instead of single review-swarm pass.
- **`--convergence fast|deep|perfect`:** Review convergence mode (default: `fast`). `fast` = exit when P1=0, `deep` = exit when P1+P2=0, `perfect` = exit when all findings=0. Only applies when `--iterations` > 1.

## Dispatch Team Lead

Dispatch the **team-lead** agent with a full context prompt:

```
Task("team-lead: Execute this plan using TEAM mode (Agent Teams).

Plan file / task: [path or description]
Review mode: [with-review | no-review]
Review iterations: [N] (default 1)
Review convergence: [fast|deep|perfect] (default fast)
Autonomous mode: [autonomous if called from ship-pipeline, supervised otherwise]

Read the plan file completely. Design a team of 3-5 teammates.
Assign file ownership (NO overlap between teammates).
Break work into 5-6 tasks per teammate.
Spawn teammates, enforce plan approval gate, then monitor execution.
After all tasks complete, run tests + build + lint.
[If no-review: Report execution results only.]
[If with-review AND iterations=1: Run review-swarm skill, fix P1 findings, sign off.]
[If with-review AND iterations>1: Run iterative-refinement skill with max_iterations=[N] and convergence=[mode]. Sign off when converged.]

Follow the team-lead agent instructions and agent-teams skill exactly.

CRITICAL: You are the coordinator. Do NOT write code yourself.
If something needs fixing, assign it to a teammate.

Project conventions: docs/context/CONVENTIONS.md
Agent config: blueprint.local.md")
```

## Wait for Team Lead

The team-lead agent runs autonomously in its own 200K context window. When it returns:

1. Read the team-lead's report
2. Present the team performance summary to the user
3. If team-lead signed off (with-review mode): report the sign-off status
4. If team-lead reports blockers: present them and ask the user how to proceed

## Team Lead Responsibilities

The team-lead agent handles all the coordination that the main session previously did:

| Responsibility | What Team Lead Does |
|----------------|--------------------|
| **Team design** | Determines team size, responsibility domains, file ownership |
| **Spawn teammates** | Creates team, spawns each with detailed context prompts |
| **Plan approval gate** | Reviews each teammate's implementation plan before they code |
| **Monitor progress** | Watches task list, intervenes on blockers, relays info |
| **Delegate mode** | Never writes code — creates tasks and assigns to teammates |
| **Integration check** | Runs tests + build + lint after all teammates complete |
| **Review (if enabled)** | Dispatches review-swarm, evaluates findings, creates fix tasks |
| **Sign-off** | Reports APPROVED, APPROVED WITH NOTES, or NOT APPROVED |

## Standalone vs Pipeline Usage

| Context | --no-review | Review happens in |
|---------|-------------|-------------------|
| Team-execution (standalone) | No (default) | Team-lead: single review-swarm pass |
| Team-execution `--iterations 5` | No | Team-lead: iterative-refinement (up to 5 cycles) |
| Team-execution `--iterations 5 --convergence deep` | No | Team-lead: iterative-refinement (exit when P1+P2=0) |
| Called from ship-pipeline | Yes | ship-pipeline Stage 5 (iterative-refinement) |
| Called from ship-pipeline `--swarm` | Yes | ship-pipeline Stage 5 (parallel review + test) |
| Called from build-pipeline | Yes | build-pipeline Stage 5 (review-swarm) |

## When NOT to Use

- **Small changes (< 3 files):** Use direct implementation or quick-fix skill
- **Analysis/review tasks:** Use review-swarm or deep-research skill (swarm pattern)
- **Strictly sequential work:** Use orchestrate skill (wave pattern)
- **Single-layer changes:** A single subagent is sufficient
