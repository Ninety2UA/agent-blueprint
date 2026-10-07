# Swarm guide

Loaded on demand from SKILL.md when you choose a swarm's members, size it, weigh its cost, or check it against common mistakes.

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

Run by the ab-review-swarm skill, which carries these reviewers' prompt files:
- code-reviewer
- security-sentinel
- performance-oracle
- code-simplicity-reviewer
- convention-enforcer
- test-coverage-reviewer

Synthesized by: **findings-synthesizer**

### Research Swarm

Run by the ab-deep-research skill, which carries these researchers' prompt files:
- learnings-researcher
- framework-docs-researcher
- best-practices-researcher
- git-history-analyzer
- codebase-context-mapper

Synthesized by: **research-synthesizer**

### Custom Swarms

You can compose custom swarms for specific needs. Each member runs from this skill with the prompt file its own skill carries (this skill carries only `references/agents/integration-checker.md`), all with the same output format, and one synthesizer merges the results.

**Migration Swarm** (the ab-review-swarm skill's reviewers, plus the ab-deployment-verification skill's verifier):
- data-integrity-guardian (migration safety)
- schema-drift-detector (unrelated schema changes)
- performance-oracle (query performance impact)
- deployment-verifier (deployment safety)

**Architecture Swarm** (the ab-review-swarm skill's reviewers, plus this skill's integration checker):
- architecture-strategist (pattern compliance)
- code-simplicity-reviewer (complexity assessment)
- performance-oracle (scalability)
- integration-checker (wiring correctness)

## Scaling Guidelines

| Swarm Size | Recommendation |
|-----------|----------------|
| 2-3 agents | Always fine. Low overhead. |
| 4-6 agents | Sweet spot. Good coverage without excessive token cost. |
| 7-10 agents | Use when comprehensive coverage needed (full review swarm). |
| 10+ agents | Diminishing returns. Split into focused sub-swarms. |

## Cost Awareness

Each agent in a swarm gets its own context window (200K tokens in Claude Code, for example). A 6-agent review swarm uses ~6x the tokens of a single reviewer. The trade-off is:
- **Breadth:** 6 specialists catch issues a generalist misses
- **Speed:** Parallel execution is faster than 6 sequential reviews
- **Cost:** 6x token usage

For small changes (< 50 lines), a single code-reviewer is usually sufficient. Reserve full swarms for significant changes (new features, refactors, pre-release).

## Common Mistakes

**Sequential dispatch** — Dispatching agents one at a time defeats the purpose. Start every helper at once.

**Missing synthesizer** — Raw outputs from 6 agents are noisy and duplicative, so every swarm ends in a synthesis.

**Wrong swarm for the job** — If agents need to build on each other's work, use ab-wave-orchestration, not a swarm. If they implement related changes together, use team work (`ab-orchestrate`).

**No shared output format** — If each agent reports in a different format, synthesis is much harder. Specify the format in the dispatch prompt.

## Swarms vs Team Work

| Aspect | Swarms | Team work (ab-orchestrate) |
|--------|--------|-------------|
| **Best for** | Parallel analysis (review, research) | Implementing a plan's tasks |
| **File access** | Read-only | Read-write, each helper owns its files |
| **Coordination** | Synthesizer merges outputs | Task ledger and waves; the lead commits |

**Typical workflow:** `ab-deep-research` (swarm) → `ab-writing-plans` → `ab-orchestrate` (team work) → `ab-review-swarm` (swarm)
