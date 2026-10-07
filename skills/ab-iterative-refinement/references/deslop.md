# Deslop pass

Loaded on demand from SKILL.md at Step 0.5, before the first review.

Before dispatching reviewers, scan all changed files for AI-generated text patterns and clean them:

**Detect and remove:**
- Over-hedged language ("it's worth noting that", "it should be mentioned", "importantly")
- Filler transitions ("Let's", "Now let's", "Moving on to")
- Comments that restate what the code does (`// increment counter` above `counter++`)
- Docstrings that add no information beyond the function signature
- Unnecessary type annotations on variables with obvious types (where the language has inference)
- Over-verbose error messages that repeat the function name
- Redundant null checks already guaranteed by the type system

**Preserve:**
- Comments explaining WHY (business logic, edge case rationale, workarounds)
- Documentation on public APIs
- Type annotations that clarify non-obvious types
