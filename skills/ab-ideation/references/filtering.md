# Filtering criteria

Loaded on demand from SKILL.md in Phase 3, when rejecting, scoring and tagging candidates.

## Rejection criteria

Reject an idea, with a one-line reason, when it is:

- Too vague to act on
- Not actionable without major prerequisite work
- A duplicate of a stronger idea
- Not grounded in the current codebase
- Too expensive relative to likely value
- Already covered by existing workflows, tools, or docs
- Interesting but trivial (not worth a brainstorm session)

## Scoring

Score survivors on groundedness, expected value, novelty, pragmatism, leverage on future work, and implementation burden.

## Reversibility

Tag each survivor as a *two-way door* (easily reversed: ship it, learn, back it out cheaply) or a *one-way door* (hard or impossible to undo: a data migration, a public API shape, a foundational dependency). Decide two-way doors fast on thin evidence, since being wrong is cheap. Give one-way doors deeper scrutiny: demand stronger grounding, surface more alternatives, and record the irreversibility in the idea's downsides, so the user can see which choices lock the project in.
