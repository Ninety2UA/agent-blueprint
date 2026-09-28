---
name: swarm-orchestration
description: "Trigger this skill when coordinating multiple specialized agents on different aspects of the same problem — even if the user just wants a thorough review or analysis. Trigger when the user says 'swarm', 'parallel agents', 'dispatch agents', 'multi-agent review', 'get multiple perspectives', or 'thorough analysis'. Trigger for review swarms (multiple reviewers checking different quality dimensions), research swarms (multiple researchers investigating different aspects), analysis swarms, and audit swarms. Dispatches agents simultaneously and synthesizes their combined outputs into one result. Usually invoked internally by review-swarm and deep-research — not typically called directly by users. DO NOT TRIGGER when tasks modify shared state — use wave-orchestration instead. DO NOT TRIGGER when only one perspective is needed — dispatch a single agent."
---

# Swarm Orchestration

## Overview

A swarm is a group of specialized agents dispatched simultaneously to analyze or work on different aspects of the same problem. Unlike wave-orchestration (which handles task dependencies), swarm-orchestration is for cases where multiple independent perspectives are needed on the same input.

**Core principle:** Many focused eyes catch more than one broad scan.

## When to Use

- **Review swarms:** Multiple reviewers each checking different quality dimensions
- **Research swarms:** Multiple researchers each investigating different aspects
- **Analysis swarms:** Multiple analysts each evaluating different risk areas
- **Audit swarms:** Multiple auditors each checking different compliance areas

**Don't use when:**
- Tasks modify shared state (use wave-orchestration instead)
- Tasks are sequential (use autonomous-loop)
- Only one perspective is needed (dispatch a single agent)

## Swarm Architecture

```
Controller (you)
    │
    ├── Agent A (specialist focus)  ─┐
    ├── Agent B (specialist focus)   ├── All run in parallel
    ├── Agent C (specialist focus)   │
    └── Agent D (specialist focus)  ─┘
              │
              ▼
    Synthesizer Agent
              │
              ▼
    Unified Output
```

## Pre-Built Swarm Configurations

### Review Swarm

Used by `/review-swarm`. Dispatches:
- code-reviewer
- security-sentinel
- performance-oracle
- code-simplicity-reviewer
- convention-enforcer
- test-coverage-reviewer

Synthesized by: **findings-synthesizer**

### Research Swarm

Used by `/deep-research`. Dispatches:
- learnings-researcher
- framework-docs-researcher
- best-practices-researcher
- git-history-analyzer
- codebase-context-mapper

Synthesized by: **research-synthesizer**

### Custom Swarms

You can compose custom swarms for specific needs:

**Migration Swarm:**
- data-integrity-guardian (migration safety)
- schema-drift-detector (unrelated schema changes)
- performance-oracle (query performance impact)
- deployment-verifier (deployment safety)

**Architecture Swarm:**
- architecture-strategist (pattern compliance)
- code-simplicity-reviewer (complexity assessment)
- performance-oracle (scalability)
- integration-checker (wiring correctness)

## Process

### Step 1: Select Agents

Choose agents based on the task:
1. What perspectives are needed?
2. Which agents provide those perspectives?
3. Are there project-specific agent overrides in `blueprint.local.md`?

### Step 2: Prepare Shared Context

All agents in a swarm need the same base context:
- The code/diff/files to analyze
- Project conventions and standards
- Specific focus area for each agent
- Output format requirements (consistent across all agents for synthesis)

### Step 3: Dispatch All Simultaneously

```
// All in a single message for maximum parallelism
Task("agent-A: [focus]. Context: [shared context]. Report findings as P1/P2/P3 with file:line locations.")
Task("agent-B: [focus]. Context: [shared context]. Report findings as P1/P2/P3 with file:line locations.")
Task("agent-C: [focus]. Context: [shared context]. Report findings as P1/P2/P3 with file:line locations.")
Task("agent-D: [focus]. Context: [shared context]. Report findings as P1/P2/P3 with file:line locations.")
```

**Critical:** Dispatch ALL in one message. Sequential dispatch negates the benefit.

### Step 4: Collect Results

Wait for all agents to return. Do not act on partial results — the synthesizer needs all outputs.

### Step 5: Synthesize

Dispatch the appropriate synthesizer agent with ALL outputs:
- For review swarms → **findings-synthesizer**
- For research swarms → **research-synthesizer**

The synthesizer de-duplicates, resolves contradictions, and produces one unified report.

### Step 6: Act on Results

Present the synthesized report and offer next steps:
- For review findings: offer to fix via resolve-in-parallel
- For research findings: offer to proceed to `/writing-plans`

## Scaling Guidelines

| Swarm Size | Recommendation |
|-----------|----------------|
| 2-3 agents | Always fine. Low overhead. |
| 4-6 agents | Sweet spot. Good coverage without excessive token cost. |
| 7-10 agents | Use when comprehensive coverage needed (full review swarm). |
| 10+ agents | Diminishing returns. Split into focused sub-swarms. |

## Cost Awareness

Each agent in a swarm gets its own 200K context window. A 6-agent review swarm uses ~6x the tokens of a single reviewer. The trade-off is:
- **Breadth:** 6 specialists catch issues a generalist misses
- **Speed:** Parallel execution is faster than 6 sequential reviews
- **Cost:** 6x token usage

For small changes (< 50 lines), a single code-reviewer is usually sufficient. Reserve full swarms for significant changes (new features, refactors, pre-release).

## Common Mistakes

**Sequential dispatch** — Dispatching agents one at a time defeats the purpose. Use a single message with all Task() calls.

**Missing synthesizer** — Raw outputs from 6 agents are noisy and duplicative. Always synthesize.

**Wrong swarm for the job** — If agents need to build on each other's work, use wave-orchestration, not a swarm. If they need to discuss and coordinate in real time, use Agent Teams (`/team-execution`).

**No shared output format** — If each agent reports in a different format, synthesis is much harder. Specify the format in the dispatch prompt.

## Swarms vs Agent Teams

Swarms and Agent Teams serve different purposes and complement each other:

| Aspect | Swarms | Agent Teams |
|--------|--------|-------------|
| **Communication** | One-way (report to controller) | Multi-directional (teammates message each other) |
| **Best for** | Parallel analysis (review, research) | Collaborative implementation |
| **File access** | Read-only (analysis agents) | Read-write (each teammate owns files) |
| **Coordination** | Synthesizer merges outputs | Shared task list + messaging |
| **When to use** | Multiple perspectives on same code | Complex multi-file implementation |

**Typical workflow:** `/deep-research` (swarm) → `/writing-plans` → `/team-execution` (agent teams) → `/review-swarm` (swarm)
