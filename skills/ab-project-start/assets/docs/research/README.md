# Research

Store domain research, competitive analysis, technical explorations, and reference material here.

## What Goes Here

- **Technical explorations:** Spike results, proof-of-concept findings, API evaluation notes
- **Domain research:** Industry analysis, user research summaries, competitive landscape
- **Reference material:** Architecture patterns, best practices, relevant standards
- **Tool evaluations:** Comparing libraries, frameworks, services with pros/cons

## What Doesn't Go Here

- Implementation plans → `docs/plans/`
- Architecture decisions → `docs/decisions/`
- Feature requirements → `docs/specs/`
- Quick ideas or tasks → `BACKLOG.md`

## Naming

Name files descriptively: `topic-name.md`

Examples:
- `jwt-refresh-token-strategies.md`
- `cloud-run-vs-lambda-comparison.md`
- `skan-attribution-limitations.md`
- `bigquery-streaming-insert-costs.md`

## Structure

Keep research docs factual and reference-oriented. Suggested structure:

```markdown
# [Topic]

**Date:** YYYY-MM-DD
**Context:** [Why this research was needed]

## Summary

[2-3 sentence overview of findings]

## Findings

[Detailed findings organized by sub-topic]

## Recommendations

[What to do based on findings — link to ADR if a decision was made]

## Sources

[Links to documentation, articles, repos referenced]
```

## Relationship to Other Docs

Research often leads to decisions. When research results in a decision, create an ADR in `docs/decisions/` and link back to the research doc. The research doc captures the analysis; the ADR captures the conclusion.
