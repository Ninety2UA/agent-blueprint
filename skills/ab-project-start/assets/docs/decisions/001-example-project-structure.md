# ADR-001: Project Structure and Documentation Strategy

**Date:** 2026-03-04
**Status:** accepted
**Deciders:** Project team

## Context

Starting a new project with a coding agent. Need to decide how to structure documentation and project files to maximize AI-assisted development productivity.

The key tension: too little structure means the AI reinvents conventions every session; too much structure means overhead for simple changes.

## Options Considered

### Option A: Minimal — Just AGENTS.md
- **Pros:** Low overhead, fast to set up
- **Cons:** No session continuity, no institutional memory, conventions drift
- **Estimated effort:** Low

### Option B: Full template — AGENTS.md + docs/ + skills
- **Pros:** Session continuity, quality gates, specialized helpers, documentation compounds over time
- **Cons:** Initial setup overhead, more files to maintain
- **Estimated effort:** Medium

### Option C: Custom framework — Build our own from scratch
- **Pros:** Tailored exactly to our needs
- **Cons:** High effort, untested patterns, maintenance burden
- **Estimated effort:** High

## Decision

Option B — use the full project template. The initial overhead is a one-time cost (about 15 minutes with the ab-project-start skill), while the benefits compound across every session. Quality gates prevent regressions. Session continuity eliminates re-orientation time.

## Consequences

### Positive
- Every session starts with full context from the previous one
- Quality gates catch issues before they reach production
- Documentation stays up-to-date through the ab-session-wrap skill

### Negative
- New team members need to learn the skill system
- Template files add to repo size

### Risks
- Risk of "template fatigue" — mitigated by making most structure optional
- Risk of outdated docs — mitigated by ab-session-wrap skill enforcing updates

## Follow-Up Actions

- [x] Run the ab-project-start skill to configure project-specific values
- [ ] Review and customize quality gate strictness in skill files
- [ ] Add project-specific skills if needed
