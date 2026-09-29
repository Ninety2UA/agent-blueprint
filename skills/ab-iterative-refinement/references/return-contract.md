# Return contract

Loaded on demand from SKILL.md when the loop starts review or fix helpers.

## Return shape

Each review and fix helper started for this loop ends its response with this, so the loop can count results the same way whichever helper produced them:

```
## Return State
<DONE | BLOCKED | NEEDS_INPUT | INCONCLUSIVE>

## Summary (<= 2000 tokens)
- What was done
- Files touched
- Issues found (or "none")
- Path to detail artifacts if any
```

This bounds handoff cost. If a reviewer's full findings exceed 2K tokens, persist them to `.agent-blueprint/review-runs/<run_id>/<reviewer>.json` and quote only the summary in the response. The synthesizer reads detail files directly when needed; ab-iterative-refinement only needs the summary to drive the loop.

If a helper returns without this structure, re-prompt it once before counting it toward the iteration result.
