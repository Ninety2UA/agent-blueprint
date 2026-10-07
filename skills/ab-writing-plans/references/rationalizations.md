# Rationalizations

Loaded on demand from SKILL.md when you are tempted to cut a corner in the plan, or someone argues for it.

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "The plan is obvious, I'll just describe the steps" | Vague plans become vague code. Exact file paths, exact commands, named tests with their assertions, and signatures keep the executor from improvising. |
| "I'll write the code into the plan to save the executor time" | The executor rewrites it against the real code anyway, and pasted code goes stale at the first deviation. Planning in code also drifts into building the project during planning. Record the decision. |
| "I'll skip verification commands and figure them out at run-time" | The executor will skip verification too. If the plan-author can't articulate "Expected: PASS," neither will the implementer. |
| "Interface contracts are implementation details" | When parallel executors share a contract, the contract is the spec. Skipping the interface section creates Wave-N integration breakage. |
| "Plans are overhead — let me start coding" | Planning is the task. Implementation without a plan is typing, not engineering. The cost of the plan is paid back many times over in fewer wrong turns. |
| "I'll write the plan after the design — they're the same thing" | Brainstorming produces a *what*; the plan produces a *how with file paths and commands*. Conflating them loses the executable detail. |
| "Boundaries are for big projects" | Boundaries are cheapest to declare on small plans (3 lines per list) and most expensive to recover from when missing. |
