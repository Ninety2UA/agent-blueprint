---
name: ab-iterative-refinement
description: "Runs review-fix-review cycles on a change until quality converges: a deslop pass, then per iteration an ab-review-swarm review, findings routed by tier, fixes through ab-resolve-in-parallel, tests, build and a commit, until the convergence mode is met (fast: no P1, deep: no P1 or P2, perfect: none) or max_iterations (default 3) runs out. Use when ab-ship-pipeline or ab-build-pipeline reaches review, or when the user wants code polished past a single review pass. Not for a trivial change (one ab-review-swarm pass) or findings that need an architecture change (re-plan)."
metadata:
  version: "3.8.0"
---

# Iterative Refinement

This skill takes an implemented change through review→fix→review cycles and ends with a final report: converged under the chosen mode, or stopped with the findings that remain. One pass catches most issues, a second catches those the fixes introduced, a third confirms convergence; past that, returns diminish. Skip it for a trivial change (under 3 files, simple logic), where one ab-review-swarm pass is enough, or before anything is implemented.

**Working folder.** Blueprint working files live under `.agent-blueprint/` in the project root. Before the first write there, make sure `.agent-blueprint/.gitignore` exists and lists `run/`, `team/`, `review-runs/`, `cache/` and `.gitignore`, so run state and the ignore file itself stay out of commits while plans and notes stay tracked.

**Provenance record.** When this skill starts, write `.agent-blueprint/run/provenance/<name>.json`, where `<name>` is the `name` in this skill's frontmatter: `skill` (that name), `version` (its `metadata.version`), `started_at` (the current UTC time, ISO 8601) and an empty `helper_steps` list, replacing any older record of that name. Before that, make sure `.agent-blueprint/.gitignore` exists and lists `run/`, `team/`, `review-runs/`, `cache/` and `.gitignore`. Each Helper step adds its entry to `helper_steps`. The record tells a run, and the smoke test, which skill ran and how; it is not a security control.

## Configuration

`max_iterations` (default 3, range 1-10) and `convergence` (default `fast`) come from the caller or the user.

| Mode | Exit when | Continue when |
|------|-----------|---------------|
| `fast` | P1 = 0 | P1 > 0 |
| `deep` | P1 + P2 = 0 | P1 + P2 > 0 |
| `perfect` | P1 + P2 + P3 = 0 | Any findings remain |

Only P3s left in fast mode means converged: they are suggestions, not blockers. Which mode suits which change, how callers use the loop, and common rationalizations: `references/guidance.md`.

## Step 0: Initialize

Take the `scope` to review (a diff, a branch or specific files; ab-ship-pipeline passes the branch against main) and record the start with `references/reports.md` § Start.

**No-commit mode.** When the environment variable `AGENT_BLUEPRINT_GIT_WRITABLE` is `0`, or a commit fails because `.git` is read-only, make no commits: leave the changes in the working tree and add the commit message you would have used to `.agent-blueprint/run/commit-msg.md`, and the ship runner commits them after the session. A review step in this mode reviews the working tree and untracked files against the merge base instead of a commit range.

Here each 2a review covers the working tree and untracked files against the merge base, which holds the earlier iterations' uncommitted fixes, and 2f records its message instead of committing.

Review and fix helpers started for this loop return the shape in `references/return-contract.md`.

## Step 0.5: Deslop pass

Before the first review, clean AI-generated text patterns out of every changed file per `references/deslop.md`, run the tests, and revert any single change that breaks one. Reviewers share these blind spots, so this cheap pass catches what they miss.

## Step 1: The loop

Run Step 2 per iteration up to `max_iterations`, leaving at 2b when converged or at a stop condition (`references/guidance.md` § Loop diagram).

## Step 2: Each iteration

### 2a. Review

Announce "Refinement iteration [i]/[max] — dispatching review swarm." Run the ab-review-swarm skill on the scope and collect its synthesized P1/P2/P3 counts.

**Declined findings stay declined.** Keep a running list of findings already settled in earlier iterations: the user's Skip or Defer, a present-tier choice already made, a fix reverted as deferred in 2e. Pass the list to each new review round, and drop a re-raised finding that matches one by `file` + title fingerprint unless the code at that location changed since. Dropped re-raises don't count toward convergence.

### 2b. Check convergence

If the counts meet the mode's exit condition, report with `references/reports.md` § Converged and go to Step 3.

### 2c. Route by remediation tier

**Present tier (decisions required):** strategic choices with several valid approaches; the user decides before this iteration goes on.

**Asking the user.** Ask with your question tool if you have one, offering at most three options; otherwise ask in plain text with a numbered list. In a headless or unattended run nobody will answer: take the default named below, say so in your output, and log it in the run state's decisions if there is a run state.

Options: the finding's approaches, at most three. Default when nobody answers: the more conservative one. Under ab-ship-pipeline, take it without asking and log it.

**safe_auto:** mechanical fixes (typos, missing imports, formatting); apply them without asking and log them. **gated_auto:** resolve in 2d. **advisory:** list in the progress report, unfixed; fixing them adds churn.

### 2d. Resolve gated findings

Fix independent findings (different files, no shared state) concurrently with the ab-resolve-in-parallel skill, dependent ones (same file or shared state) in sequence. Each fix addresses only its finding: unrelated changes, new patterns or refactors create new findings and stall convergence. Fix an uncited or possibly deprecated framework pattern with the ab-source-driven-development skill: the installed version's current docs, URL cited. An `UNVERIFIED:` marker left in shipped code is always a fix target.

### 2e. Verify

Run the full test suite and build. On a failure, find the cause with the ab-systematic-debugging skill, fix it and re-run until green; after two failed attempts, revert that fix and mark its finding deferred. A fix that breaks tests is never committed, since the next review would chase the regression.

### 2f. Commit

Commit this iteration's fixes as `fix: address review findings (iteration [i]/[max])`, or in no-commit mode add that message to `.agent-blueprint/run/commit-msg.md`.

### 2g. Progress report

Report with `references/reports.md` § Iteration progress.

## Stop conditions

End the loop early and escalate (Step 3) when iteration N finds the same findings as N-1 with zero fixes applied (they need human input), when fixes oscillate (fixing A breaks B and fixing B breaks A: a design issue), or when a finding needs an architecture change (stop and re-plan).

## Step 3: Final report

Report with `references/reports.md` § Final report. Max iterations reached with P1 > 0 is a warning: critical issues remain, and the caller (this skill, when standalone) stops and escalates to the user with `references/reports.md` § Escalation, as after a stop condition.

**Asking the user.** Ask with your question tool if you have one, offering at most three options; otherwise ask in plain text with a numbered list. In a headless or unattended run nobody will answer: take the default named below, say so in your output, and log it in the run state's decisions if there is a run state.

Options: the escalation's A, B and C. Default when nobody answers: merge nothing and return the report to the caller.
