# Architecture Decision Records

Store architecture decisions as numbered markdown files: `NNN-kebab-case-title.md`

The value of ADRs is in capturing *why* a decision was made, not just what was decided. Code shows what. Commit messages show when. ADRs show why. This context is critical for agents and future contributors encountering the codebase months later.

## When to Create an ADR

Create one when:
- Choosing between technologies, libraries, or approaches
- Establishing a pattern that the rest of the codebase should follow
- Making a trade-off that isn't obvious from the code
- Deciding NOT to do something (non-decisions are valuable context)
- Reversing or superseding a previous decision

Don't create one for:
- Routine implementation choices
- Decisions that are obvious from the code
- Temporary workarounds (add to BACKLOG.md instead)

## Template

```markdown
# ADR-NNN: Title

**Date:** YYYY-MM-DD
**Status:** proposed | accepted | deprecated | superseded by ADR-NNN
**Deciders:** [who was involved in the decision]

## Context

What is the issue? What forces are at play? What constraints exist? What triggered this decision?

Include relevant numbers, benchmarks, or evidence that informed the discussion.

## Options Considered

### Option A: [Name]
- **Pros:** ...
- **Cons:** ...
- **Estimated effort:** [low / medium / high]

### Option B: [Name]
- **Pros:** ...
- **Cons:** ...
- **Estimated effort:** [low / medium / high]

### Option C: [Name] (if applicable)
- **Pros:** ...
- **Cons:** ...
- **Estimated effort:** [low / medium / high]

## Decision

What was decided and why. Be specific about the reasoning. Which option was chosen and what tipped the balance?

## Consequences

### Positive
- [what becomes easier]

### Negative
- [what becomes harder or what trade-offs we're accepting]

### Risks
- [what could go wrong and how we'd detect it]

## Follow-Up Actions

- [ ] [anything that needs to happen as a result of this decision]
```

## Numbering

Use sequential three-digit numbers: `001-initial-tech-stack.md`, `002-database-choice.md`, etc.

To find the next number:
```bash
ls docs/decisions/*.md 2>/dev/null | grep -oP '\d{3}' | sort -n | tail -1
```

## Lifecycle

- **Proposed:** Under discussion, not yet committed to
- **Accepted:** Decision made, implementation follows
- **Deprecated:** Decision was valid but circumstances changed
- **Superseded:** Replaced by a newer ADR (link to it)

When superseding, update the old ADR's status to point to the new one. Don't delete old ADRs — the reasoning history is valuable.
