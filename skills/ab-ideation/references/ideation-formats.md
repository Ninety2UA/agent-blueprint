# Ideation formats

Loaded on demand from SKILL.md when presenting survivors (Phase 4) and writing the ideation doc (Phase 5).

## Presenting survivors

Present surviving ideas in structured form:

```markdown
### 1. [Title]
**Description:** [Concrete explanation]
**Rationale:** [Why this improves the project]
**Downsides:** [Tradeoffs or costs]
**Confidence:** [0-100%]
**Complexity:** [Low / Medium / High]
```

Then include a brief **rejection summary** table:

| # | Idea | Reason Rejected |
|---|------|-----------------|
| 1 | ... | ... |

## Ideation doc

Save to `docs/research/YYYY-MM-DD-<topic>-ideation.md` (`YYYY-MM-DD-open-ideation.md` when there is no focus). When continuing an earlier doc, update it in place and add a line to its Session Log.

```markdown
---
date: YYYY-MM-DD
topic: <kebab-case-topic>
focus: <optional focus hint>
---

# Ideation: <Title>

## Codebase Context
[Grounding summary from Phase 1]

## Ranked Ideas

### 1. <Idea Title>
**Description:** [Concrete explanation]
**Rationale:** [Why this improves the project]
**Downsides:** [Tradeoffs or costs]
**Confidence:** [0-100%]
**Complexity:** [Low / Medium / High]
**Status:** [Unexplored / Explored]

## Rejection Summary

| # | Idea | Reason Rejected |
|---|------|-----------------|
| 1 | <Idea> | <Reason> |

## Session Log
- YYYY-MM-DD: Initial ideation — <candidate count> generated, <survivor count> survived
```
