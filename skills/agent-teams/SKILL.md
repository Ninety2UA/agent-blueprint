---
name: agent-teams
description: "Trigger this skill when spawning collaborative Claude Code instances with shared task lists and messaging — for complex multi-file implementations where teammates need to discuss, divide work, and maintain file ownership. Trigger when 3+ files need coordinated changes across different system layers, when teammates would benefit from discussing design decisions mid-implementation, or when work naturally divides into ownership domains (frontend, backend, tests, infra). Usually invoked internally by team-execution skill — not typically called directly by users. Requires CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS enabled. DO NOT TRIGGER for read-only parallel analysis — use swarm-orchestration instead. DO NOT TRIGGER for dependency-ordered tasks — use wave-orchestration instead."
---

# Agent Teams

## Overview

Agent Teams are fully independent Claude Code instances that collaborate through a shared task list and messaging system. Unlike swarms (which are read-only subagents reporting back to a controller), agent teams are peers that can discuss, divide work, and coordinate in real time.

**Requires:** `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1"` in settings.json (experimental feature).

## When to Use Agent Teams vs Swarms vs Waves

| Pattern | Best For | Communication | File Modification |
|---------|----------|---------------|-------------------|
| **Agent Teams** | Collaborative implementation requiring discussion | Multi-directional (teammates message each other) | Each teammate owns specific files |
| **Swarms** | Parallel analysis of the same code | One-way (agents report back to controller) | None (read-only analysis) |
| **Waves** | Dependency-ordered implementation | Sequential (controller dispatches, verifier gates) | Isolated per wave via worktrees |

### Use Agent Teams when
- 3+ files need coordinated changes across different system layers
- Teammates would benefit from discussing design decisions mid-implementation
- Work naturally divides into ownership domains (frontend, backend, tests, infra)
- The task is large enough that a single session would exhaust its context window

### Use Swarms when
- You need multiple perspectives on the same code (reviews, research)
- Agents don't need to communicate with each other
- Output is analysis/reports, not code changes

### Use Waves when
- Tasks have strict dependency ordering
- You need integration verification between groups
- File isolation is critical (each wave gets a clean state)

## Team Setup

### Recommended Team Sizes

| Task Complexity | Team Size | Example |
|----------------|-----------|---------|
| Cross-layer feature | 3-4 | Frontend + backend + tests |
| Full-stack with infra | 4-5 | Frontend + backend + tests + migration + config |
| Large system change | 5-6 | Split by module ownership |

**Rule of thumb:** 5-6 tasks per teammate keeps everyone productive without overloading.

### File Ownership

**Critical:** Each teammate MUST own specific files. Concurrent modification of the same file causes conflicts.

Assign ownership explicitly in the spawn prompt:
```
You own: src/api/routes.ts, src/api/handlers/*.ts
DO NOT modify: src/models/*, src/frontend/*, tests/*
```

### Spawn Prompt Template

Each teammate needs full context because they do NOT inherit the lead's conversation history:

```
Implement [specific responsibility].

Context:
- Project uses [framework] with [conventions reference]
- Read docs/context/CONVENTIONS.md before writing code
- Related work by other teammates: [brief description]

Your files (you own these exclusively):
- [file list]

Do NOT modify these files (owned by other teammates):
- [file list]

When done, mark your tasks complete and message the team lead.
```

## Coordination Mechanisms

### Shared Task List

Tasks have states: `pending` → `in_progress` → `completed`

- Break work into 5-6 tasks per teammate
- Tasks can have dependencies (teammate B waits for teammate A's task)
- Teammates self-claim pending tasks
- Lead monitors progress and intervenes if blocked

### Messaging

- **Direct message:** Send to one specific teammate (use for coordination)
- **Broadcast:** Send to all teammates (use sparingly — costs scale with team size)
- **Idle notifications:** Automatic when a teammate finishes all tasks; the teammate's final answer arrives inside that notification (CLI 2.1.251), so the lead reads the result there instead of polling
- **Teammate model:** Teammates run on the leader's model unless the spawn names one (CLI 2.1.234); the former `/config` "Default teammate model" setting is gone
- **Live roster:** `ListAgents` lists the live teammates (CLI 2.1.239) — check it before broadcasting or waiting on a teammate

### Quality Gates

Agent Teams hooks enforce quality automatically:

**TeammateIdle hook** (`teammate-idle.js`):
When a teammate is about to go idle, the hook checks if their work passes basic quality:
- Tests pass for modified files
- No lint errors introduced
- Exit code 2 sends the teammate back to fix issues

**TaskCompleted hook** (`task-completed.js`):
When a task is being marked complete, the hook verifies:
- Related tests pass
- No obvious regressions
- Exit code 2 prevents premature completion with feedback

## Integration with Existing Workflows

Agent Teams integrate with the blueprint's existing patterns:

1. **Before team work:** Run `/deep-research` to gather context (swarm pattern)
2. **During team work:** Teammates implement with file ownership boundaries
3. **After team work:** Run `/review-swarm` on the combined changes (swarm pattern)
4. **Quality loop:** findings-synthesizer → fix issues → re-review

This means Agent Teams replace only the **execution** phase, while research and review still use the proven swarm pattern.

## Common Mistakes

**Not giving enough context in spawn prompts** — Teammates start with a blank conversation. Include project conventions, file paths, and what other teammates are doing.

**Letting teammates modify shared files** — Assign clear file ownership. If two teammates need to modify the same file, have one teammate do it and the other send a message requesting the change.

**Too many teammates** — Start with 3-5. More teammates means more coordination overhead and token cost.

**No quality gates** — Without TeammateIdle and TaskCompleted hooks, teammates may mark work as done prematurely. Enable the hooks.

**Running unattended too long** — Check in regularly. Teammates can go down wrong paths. Steer early.
