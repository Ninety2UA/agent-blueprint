---
name: ab-requesting-code-review
description: "Trigger this skill when the user says 'review', 'review my code', 'code review', 'check my changes', 'look at this', 'does this look right', or wants a quick quality check on recent work. Trigger after completing any task or before merging, even if the user doesn't explicitly ask for a review — quality gates matter and catching issues early prevents cascading problems. Also trigger before committing, after fixing a bug, after refactoring, or when the user seems done implementing but hasn't verified quality. Dispatches the code-reviewer helper against current changes for a fast, single-perspective review. DO NOT TRIGGER when the user wants multi-perspective review from multiple agents, says 'thorough review', 'comprehensive review', or 'review swarm' — use ab-review-swarm instead."
---

# Requesting Code Review

Dispatch the code-reviewer helper to catch issues before they cascade.

**Core principle:** Review early, review often.

## When to Request Review

**Mandatory:**
- After each task in subagent-driven development
- After completing major feature
- Before merge to main

**Size the review by consequence, not line count.** Ask whether a wrong change would fail loudly at the change site (a type error, a failing test) or silently somewhere else (a wrong total, a leaked record, a caller in another module). A change that fails silently, or touches auth, money, data, or a public contract, gets `ab-review-swarm` whatever its size; this single-reviewer pass is for changes that would fail loudly.

**Optional but valuable:**
- When stuck (fresh perspective)
- Before refactoring (baseline check)
- After fixing complex bug

## How to Request

**1. Get git SHAs:**
```bash
# Pick ONE base:
BASE_SHA=$(git rev-parse HEAD~1)                # one task's commit
# BASE_SHA=$(git merge-base origin/main HEAD)   # or: a whole branch
HEAD_SHA=$(git rev-parse HEAD)
git merge-base --is-ancestor "$BASE_SHA" "$HEAD_SHA" && [ -n "$(git rev-list "$BASE_SHA..$HEAD_SHA")" ] \
  || echo "Refusing: $BASE_SHA..$HEAD_SHA is empty or not a descendant range"
```

Never use bare `origin/main` as the base: once main moves past your branch point, its new files show up as phantom deletions in the diff. If the guard refuses, fix the range; don't review an empty or unrelated diff.

**2. Dispatch the code-reviewer helper:**

**Helper step.** Start a helper (subagent) for this step if you can, with the prompt file named below (its absolute path when the helper can read it, else its full text) and the listed inputs; leave its model and effort at the session's. If you cannot start one, follow the prompt file yourself. Either way, return its Output section, and note which path ran in the run's provenance record if there is one.

Prompt: `references/agents/code-reviewer.md` (the helper's instructions). Inputs: the review request, which is the template at `code-reviewer.md` with its placeholders filled in.

**Placeholders:**
- `{WHAT_WAS_IMPLEMENTED}` - What you just built
- `{PLAN_OR_REQUIREMENTS}` - What it should do
- `{BASE_SHA}` - Starting commit
- `{HEAD_SHA}` - Ending commit
- `{DESCRIPTION}` - Brief summary

**3. Act on feedback:**
- Fix Critical issues immediately
- Fix Important issues before proceeding
- Note Minor issues for later
- Push back if reviewer is wrong (with reasoning)

## Example

```
[Just completed Task 2: Add verification function]

You: Let me request code review before proceeding.

BASE_SHA=$(git log --oneline | grep "Task 1" | head -1 | awk '{print $1}')
HEAD_SHA=$(git rev-parse HEAD)

[Dispatch code-reviewer helper]
  WHAT_WAS_IMPLEMENTED: Verification and repair functions for conversation index
  PLAN_OR_REQUIREMENTS: Task 2 from docs/plans/deployment-plan.md
  BASE_SHA: a7981ec
  HEAD_SHA: 3df7661
  DESCRIPTION: Added verifyIndex() and repairIndex() with 4 issue types

[Helper returns]:
  Strengths: Clean architecture, real tests
  Issues:
    Important: Missing progress indicators
    Minor: Magic number (100) for reporting interval
  Assessment: Ready to proceed

You: [Fix progress indicators]
[Continue to Task 3]
```

## Integration with Workflows

**Subagent-Driven Development:**
- Review after EACH task
- Catch issues before they compound
- Fix before moving to next task

**Executing Plans:**
- Review after each batch (3 tasks)
- Get feedback, apply, continue

**Ad-Hoc Development:**
- Review before merge
- Review when stuck

## Red Flags

**Never:**
- Skip review because "it's simple"
- Ignore Critical issues
- Proceed with unfixed Important issues
- Argue with valid technical feedback

**If reviewer wrong:**
- Push back with technical reasoning
- Show code/tests that prove it works
- Request clarification

See template at: ab-requesting-code-review/code-reviewer.md
