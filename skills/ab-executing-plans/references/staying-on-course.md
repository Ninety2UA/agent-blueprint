# Staying on course

Loaded on demand from SKILL.md when you catch yourself reading without acting, or reasoning your way around the plan.

## Analysis Paralysis Guard

If you make five or more read-only operations in a row (reading files, searching) without an action that changes state (an edit, a new file, a command that modifies something), stop: you are in analysis paralysis. Do one of:

1. **Write code** — you have enough information, start implementing
2. **Report a blocker** — explain what's preventing you from writing code
3. **Ask for help** — if the plan is unclear, ask rather than endlessly reading

Reading code is preparation. Writing code is progress. Don't confuse the two.

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "The plan says X but Y is obviously better, I'll just do Y" | If Y is better, surface it. Silent deviations break the spec contract and corrupt the next reviewer's mental model. |
| "I'll skip verification — the code is obviously correct" | Verification catches what "obvious" misses. Skipping is the failure mode every postmortem cites. |
| "Three tasks done, I'll do six before reporting" | Bigger batches mean more rework when feedback finally arrives. Default 3 exists for a reason. |
| "I'll fix this adjacent thing while I'm here" | Scope creep. Note it for the assumption log or BACKLOG; don't expand the diff. |
| "The plan is wrong, I'll rewrite it" | If the plan is wrong, stop and report. Rewriting silently creates a phantom plan no one reviewed. |
| "Verification failed but the code looks right" | Trust the verification. "Looks right" is exactly the heuristic that produced the failure. |
| "I'll add a stub now and fill it in later" | Stubs ship. Track them explicitly in Known Stubs and resolve them before the batch is complete, so none is carried forward unrecorded. |
