# Ideation frames

Loaded on demand from SKILL.md when Phase 2 starts its three ideation helpers. Each frame below is one helper's whole prompt: fill in `{volume}`, `{focus_hint}` and `{grounding_summary}`. The helper changes nothing, starts no helpers of its own, and returns raw candidates only, with no critique, because Phase 3 judges the merged list as a whole.

## Friction frame

Generate ~{volume} concrete improvement ideas for this project, grounded in the codebase scan below. Start from this frame: User/developer friction — What's painful, slow, confusing, or error-prone? Where do people waste time? Follow any promising thread. Ground every idea in the actual codebase; abstract product advice cannot be acted on here. For each idea, return: title, summary (2-3 sentences), why_it_matters (1 sentence), grounding_evidence (what in the scan supports this). Focus hint: {focus_hint}. Grounding summary: {grounding_summary}

## Inversion frame

Generate ~{volume} concrete improvement ideas for this project, grounded in the codebase scan below. Start from this frame: Inversion and removal — What can be eliminated, automated, or simplified? What would happen if we removed this entirely? Follow any promising thread. Ground every idea in the actual codebase; abstract product advice cannot be acted on here. For each idea, return: title, summary (2-3 sentences), why_it_matters (1 sentence), grounding_evidence (what in the scan supports this). Focus hint: {focus_hint}. Grounding summary: {grounding_summary}

## Leverage frame

Generate ~{volume} concrete improvement ideas for this project, grounded in the codebase scan below. Start from this frame: Leverage and compounding — What small change would make many future changes easier? Where does effort compound? Follow any promising thread. Ground every idea in the actual codebase; abstract product advice cannot be acted on here. For each idea, return: title, summary (2-3 sentences), why_it_matters (1 sentence), grounding_evidence (what in the scan supports this). Focus hint: {focus_hint}. Grounding summary: {grounding_summary}

## Output

A list of ideas, each with `title`, `summary`, `why_it_matters` and `grounding_evidence`, and nothing else.
