# Rationalizations and red flags

Loaded on demand from SKILL.md when you catch yourself about to skip a fetch or a citation.

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "I'm confident about this API" | Confidence is not evidence. Training data contains outdated patterns that look correct but break against current versions. Verify. |
| "Fetching docs wastes tokens" | Hallucinating an API wastes more. The user debugs for an hour, then discovers the function signature changed. Where the `sdd-cache` hook runs, a repeat fetch costs one conditional request. |
| "The docs won't have what I need" | If the docs don't cover it, that's valuable information — the pattern may not be officially recommended. Flag as `UNVERIFIED:`. |
| "I'll just mention it might be outdated" | A vague disclaimer doesn't help. Either verify and cite, or clearly flag with `UNVERIFIED:`. Hedging without specificity is the worst option. |
| "This is a simple task, no need to check" | Simple tasks with wrong patterns become templates. The user copies your deprecated form handler into ten components before discovering the modern approach exists. |

## Red Flags

- Writing framework-specific code without checking the docs for the detected version
- Using "I believe" / "I think" about an API instead of citing the source
- Implementing a pattern without knowing which version it applies to
- Citing Stack Overflow or blog posts instead of official documentation
- Using deprecated APIs because they appear in training data
- Not reading the dependency file before implementing
- Delivering code without source citations for non-obvious framework decisions
- Fetching an entire docs site when only one page is relevant
