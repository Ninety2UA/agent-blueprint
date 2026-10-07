# Feature Specs

Store feature specifications as: `feature-name.md`

A spec describes *what* to build and *why*. It captures requirements, acceptance criteria, and scope boundaries. Specs inform plans (which describe *how* to build).

## When to Write a Spec

- Before any feature that touches more than 2-3 files
- When requirements are ambiguous and need to be pinned down
- When multiple approaches exist and constraints need documenting
- When the feature has acceptance criteria that need sign-off

For trivial changes, skip the spec and go straight to implementation.

## Template

```markdown
# Feature: [Name]

**Date:** YYYY-MM-DD
**Status:** [draft / approved / implementing / complete / abandoned]
**Priority:** [P0 / P1 / P2 / P3]
**Goal:** [which GOALS.md objective this supports]

## Problem

What user problem or business need does this address? Who is affected? What happens if we don't build this?

## Proposed Solution

High-level description of the solution. Not implementation details — those go in the plan.

## Requirements

### Functional
- [ ] [requirement 1]
- [ ] [requirement 2]

### Non-Functional
- [ ] Performance: [target, e.g., "< 200ms response time"]
- [ ] Security: [requirements]
- [ ] Accessibility: [requirements]

## Acceptance Criteria

- Given [context], when [action], then [outcome]
- Given [context], when [action], then [outcome]

## Out of Scope

What this feature explicitly does NOT cover. Be specific — this prevents scope creep during implementation.

- Not handling [edge case] — will address in [future spec]
- Not supporting [platform/format] — see Non-Goals in GOALS.md

## Open Questions

- [ ] [Unresolved question 1] — [who needs to answer, deadline]
- [ ] [Unresolved question 2]

## Dependencies

- Requires [other feature/service/data]
- Blocked by [external dependency]
```

## Updating During Implementation

- Check off requirements and acceptance criteria as they're implemented
- Move open questions to the spec body as they're answered
- Note scope changes inline with date: `> **Scope change (YYYY-MM-DD):** Added X because [reason]`
