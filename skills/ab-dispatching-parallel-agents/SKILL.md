---
name: ab-dispatching-parallel-agents
description: "Splits two or more independent problems into one focused helper each, all started at once, each with its own scope, goal, constraints and expected output, then reviews and integrates what they return. Use when several unrelated failures (different test files, subsystems or bugs), independent code changes or separate analyses can proceed at the same time, usually as a step inside another skill. Not for work that touches shared state or a whole plan run as team work (ab-orchestrate), or for a single task, which is quicker done directly."
---

# Dispatching Parallel Agents

Investigating unrelated problems one after another wastes time when none needs the others' context. Give each independent problem domain its own helper and let them run at the same time. The dispatch is done when every helper has returned, their changes do not conflict, and the full test suite passes with all of them in place.

## When to use

Use it when three or more test files fail with different root causes, when several subsystems are broken independently, and in general when each problem can be understood without the others and the investigations share no state. A decision graph: `references/dispatch-examples.md` § Decision graph.

Not when the failures are related (fixing one might fix the others, so investigate them together first), when understanding them needs the whole system's state, when the debugging is exploratory and you do not yet know what is broken, or when helpers would interfere by editing the same files or using the same resources.

## 1. Identify the independent domains

Group the failures by what is broken, for example: file A's tests cover the tool approval flow, file B's the batch completion behavior, file C's abort handling. Domains are independent when fixing one does not affect the others, as fixing tool approval does not affect the abort tests.

## 2. Write one focused task per domain

Each task gives its helper:
- **Specific scope:** one test file or subsystem
- **Clear goal:** make these tests pass
- **Constraints:** change no other code, start no helpers of its own, and make no commits, since this session integrates the results
- **Expected output:** a summary of what it found and fixed

A good task is focused on one domain, self-contained (it carries the error messages and test names the helper needs), and specific about what to return. A full example: `references/dispatch-examples.md` § Example prompt. Common mistakes: `references/dispatch-examples.md` § Common Mistakes.

## 3. Start the helpers at once

Start one helper per domain, all at once, so they run at the same time.

**Helper step.** Start a helper (subagent) for this step if you can, with the prompt file named below (its absolute path when the helper can read it, else its full text) and the listed inputs; leave its model and effort at the session's. If you cannot start one, follow the prompt file yourself. Either way, return its Output section, and note which path ran in the run's provenance record if there is one.

Prompt: each domain's task from step 2 (scope, goal, constraints, expected output), as that helper's whole prompt; no prompt file applies. Inputs: the task itself, for example:

```text
Fix agent-tool-abort.test.ts failures
Fix batch-completion-behavior.test.ts failures
Fix tool-approval-race-conditions.test.ts failures
```

## 4. Review and integrate

When the helpers return:
1. **Review each summary** to understand what changed.
2. **Check for conflicts:** did two helpers edit the same code?
3. **Run the full suite** to confirm the fixes work together.
4. **Spot-check** the changes, since helpers can make the same systematic error.

Then integrate all the changes. A worked example from a session: `references/dispatch-examples.md` § Real Example from Session.
