# Gardening checklist

Loaded on demand from SKILL.md when running a gardening pass over the knowledge base.

## Checks

- **Orphans** — solution docs nothing links to and nothing would search for; fold the insight into a doc that gets found, or drop the orphan.
- **Stale content** — a solution describing a version, API, or pattern the codebase no longer uses; update it for what is used now, or remove it.
- **Retirement conditions met** — a doc whose `retire_when:` condition now holds; remove it, or rewrite it for what is true now.
- **Broken cross-references** — links to ADRs, other solutions, or CONVENTIONS.md entries that were renamed, merged, or deleted since.
- **Oversized pages** — a solution that grew past a research paper; split it or trim it back toward the 50-100 line target.
- **Contradictions** — two solutions, or a solution and a learning in the project instructions file, that recommend opposite approaches to the same problem.
- **Learnings vs. guidance** — compare each learning against the guidance it names (a skill, a convention, an ADR); if that guidance changed and the learning is now wrong, fix or remove it.
- **Regressions** — when a regression is fixed, check whether it reintroduces something an existing solution already covered, and keep that guidance rather than letting the fix silently drop it.
