---
name: ab-requesting-code-review
description: "Runs a fast single-reviewer code review: picks a guarded review range (one task's commit, a whole branch from its merge base, or the working tree in no-commit mode), hands it with the plan to the code-reviewer helper, and acts on the Critical, Important and Suggestion findings it returns. Use when a task or bug fix is finished, before committing or merging, when stuck, or when the user asks to review or check recent changes. Not for a multi-perspective or thorough review, or a change that could fail silently or touches auth, money, data or a public contract (ab-review-swarm)."
metadata:
  version: "4.0.0"
---

# Requesting Code Review

The outcome is one well-defined range of changes reviewed by the code-reviewer helper, with each finding fixed, noted for later, or answered with technical reasoning. Reviewing early and often catches an issue before later work builds on it.

**Working folder.** Blueprint working files live under `.agent-blueprint/` in the project root. Before the first write there, make sure `.agent-blueprint/.gitignore` exists and lists `run/`, `team/`, `review-runs/`, `cache/` and `.gitignore`, so run state and the ignore file itself stay out of commits while plans and notes stay tracked.

**Provenance record.** Before any other work, run this as written from the project root: `mkdir -p .agent-blueprint/run/provenance && date -u +'{"skill": "ab-requesting-code-review", "version": "4.0.0", "started_at": "%Y-%m-%dT%H:%M:%SZ", "helper_steps": []}' > .agent-blueprint/run/provenance/ab-requesting-code-review.json`. It replaces any older record, and the Working folder step above has already made sure of `.agent-blueprint/.gitignore`. Each Helper step adds `{step, path: helper|inline}` to `helper_steps`. The record tells a run, and the smoke test, which skill ran and how; it is not a security control.

## When to review

- After each task in subagent-driven development, after a major feature, and before a merge to main: past these points an unnoticed issue starts to compound.
- Optionally when stuck (a fresh perspective), before refactoring (a baseline check), or after fixing a complex bug.

**Size the review by consequence, not line count.** Ask whether a wrong change would fail loudly at the change site (a type error, a failing test) or silently somewhere else (a wrong total, a leaked record, a caller in another module). A change that fails silently, or touches auth, money, data, or a public contract, goes to the ab-review-swarm skill whatever its size; this single-reviewer pass is for changes that would fail loudly.

## 1. Choose the range

```bash
# Pick ONE base:
BASE_SHA=$(git rev-parse HEAD~1)                # one task's commit
# BASE_SHA=$(git merge-base origin/main HEAD)   # or: a whole branch
HEAD_SHA=$(git rev-parse HEAD)
git merge-base --is-ancestor "$BASE_SHA" "$HEAD_SHA" && [ -n "$(git rev-list "$BASE_SHA..$HEAD_SHA")" ] \
  || echo "Refusing: $BASE_SHA..$HEAD_SHA is empty or not a descendant range"
```

Use the merge base for a branch, not bare `origin/main`: once main moves past your branch point, its new files show up as phantom deletions in the diff. If the guard refuses, fix the range; an empty or unrelated diff produces a review of nothing.

**No-commit mode.** When the environment variable `AGENT_BLUEPRINT_GIT_WRITABLE` is `0`, or a commit fails because `.git` is read-only, make no commits: leave the changes in the working tree and add the commit message you would have used to `.agent-blueprint/run/commit-msg.md`, and the ship runner commits them after the session. A review step in this mode reviews the working tree and untracked files against the merge base instead of a commit range.

Here that means: set `BASE_SHA=$(git merge-base origin/main HEAD)` and `HEAD_SHA` to `working tree`, and skip the guard, since the changes have no commits yet. The request's Range section then has the reviewer diff the working tree against the base and read every untracked file, so nothing the session wrote is left out.

## 2. Hand the range to the code-reviewer helper

**Helper step.** Start a helper (subagent) for this step if you can, with the prompt file named below (its absolute path when the helper can read it, else its full text) and the listed inputs; leave its model and effort at the session's. If you cannot start one, follow the prompt file yourself. Either way, return its Output section, and note which path ran in the run's provenance record if there is one.

Prompt: `references/agents/code-reviewer.md` (the helper's instructions). Inputs: the review request, which is `assets/review-request.md` with its placeholders filled in:

- `{WHAT_WAS_IMPLEMENTED}`: what you just built
- `{PLAN_OR_REQUIREMENTS}` and `{PLAN_REFERENCE}`: what it should do (the plan task or the requirements)
- `{BASE_SHA}` and `{HEAD_SHA}`: the range from step 1
- `{DESCRIPTION}`: a brief summary

A worked example: `references/example.md` § Example.

## 3. Act on the findings

- Fix Critical issues immediately, and Important ones before proceeding: the next task builds on whatever is left unfixed.
- Note Suggestions for later.
- When the reviewer is wrong, push back with technical reasoning: show the code or tests that prove it works, or ask the reviewer to clarify. Valid technical feedback gets fixed, not argued with.
- Skip no review because the change "is simple"; simple changes are where unchecked assumptions hide.
