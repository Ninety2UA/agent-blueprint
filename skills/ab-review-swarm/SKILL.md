---
name: ab-review-swarm
description: "Reviews a change with specialized reviewers in parallel (quality, simplicity and tests always; security, performance, conventions, frontend, architecture, data and schema as the diff calls for), validates the findings and merges them into one prioritized P1/P2/P3 report. Use when a change is large (5+ files, several concerns, crossing modules) or consequential at any size (auth, money, data, a public contract, silent failures), before a production ship or major merge, or when asked for a full or multi-perspective review. Not for a quick single-perspective review of a small change (use ab-requesting-code-review)."
argument-hint: "[optional: files or path to review] [--pr] [--full]"
metadata:
  version: "4.0.0"
---

# Review Swarm — Multi-Agent Parallel Review

Start specialized review helpers in parallel on one change, validate their findings, and merge them into one prioritized report (P1 must fix before merge, P2 should fix, P3 suggestion). Narrow reviewers, each out to disprove the change, miss less than one broad one. Done when the report is presented and the offer to act on it is answered or defaulted.

**Announce at start:** "Starting review swarm — dispatching specialized reviewers in parallel."

**Working folder.** Blueprint working files live under `.agent-blueprint/` in the project root. Before the first write there, make sure `.agent-blueprint/.gitignore` exists and lists `run/`, `team/`, `review-runs/`, `cache/` and `.gitignore`, so run state and the ignore file itself stay out of commits while plans and notes stay tracked.

**Provenance record.** When this skill starts, write `.agent-blueprint/run/provenance/<name>.json`, where `<name>` is the `name` in this skill's frontmatter: `skill` (that name), `version` (its `metadata.version`), `started_at` (the current UTC time, ISO 8601) and an empty `helper_steps` list, replacing any older record of that name. The Working folder step above has already made sure of `.agent-blueprint/.gitignore`. Each Helper step adds `{step, path: helper|inline}` to `helper_steps`. The record tells a run, and the smoke test, which skill ran and how; it is not a security control.

## Step 1: Determine Scope

- **Files or a path** in the request (such as `src/auth/`): only those.
- **`--pr`, a PR or a branch:** diff from the merge base, `git diff $(git merge-base origin/main HEAD)..HEAD` (same as three-dot `origin/main...HEAD`). Never use a two-dot range against bare `origin/main`: it shows main's newer files as phantom deletions.
- **Otherwise:** uncommitted changes (`git diff` plus untracked files from `git ls-files --others --exclude-standard`), or, if none, the last commit (`git diff HEAD~1`).

If the range is empty or the base is not an ancestor of HEAD, stop and report the range instead of reviewing nothing.

**No-commit mode.** When the environment variable `AGENT_BLUEPRINT_GIT_WRITABLE` is `0`, or a commit fails because `.git` is read-only, make no commits: leave the changes in the working tree and add the commit message you would have used to `.agent-blueprint/run/commit-msg.md`, and the ship runner commits them after the session. A review step in this mode reviews the working tree and untracked files against the merge base instead of a commit range.

Here: review `git diff $(git merge-base origin/main HEAD)` plus the untracked files, whatever range was named, since the work has no commits yet.

## Step 2: Select Reviewers

A `review-agents` list in the YAML frontmatter of `blueprint.local.md` (project root) is the dispatch list. Otherwise follow `references/reviewer-selection.md`: always code-reviewer, code-simplicity-reviewer and test-coverage-reviewer, plus each of security-sentinel, performance-oracle, convention-enforcer, frontend-reviewer, architecture-strategist, data-integrity-guardian and schema-drift-detector whose signals the diff shows. Log each start or skip with its reason. `--full` starts every reviewer.

## Step 3: Prepare Review Context

Create `.agent-blueprint/review-runs/{run_id}/`, where `run_id` is `review-YYYYMMDD-HHMMSS` or a short UUID. Build each reviewer's inputs per `references/dispatch-notes.md` § Reviewer inputs: the rubric in `references/review-calibration.md`, the two-output contract in `references/output-contract.md`, and the artifact with the contract it must meet, never the author's claims that the work is correct, which anchor a reviewer toward agreement (§ Input hygiene there).

## Step 4: Dispatch All Helpers in Parallel

**Helper step.** Start a helper (subagent) for this step if you can, with the prompt file named below (its absolute path when the helper can read it, else its full text) and the listed inputs; leave its model and effort at the session's. If you cannot start one, follow the prompt file yourself. Either way, return its Output section, and note which path ran in the run's provenance record if there is one.

Prompts: `references/agents/<reviewer>.md` for each selected reviewer. Inputs for each: the scope, `run_id={run_id}`, the diff/files, the Step 3 context and its focus; code-reviewer also gets the plan and standards.

Start them all at once, since they are independent; under a host cap on concurrent helpers, see `references/dispatch-notes.md` § Helper limits.

## Step 5: Collect, Validate, Synthesize

### 5a: Validation (above 5 findings)

The findings-validator re-checks each finding against the code and the diff (`references/dispatch-notes.md` § Validation details). Skip it at five or fewer, where its overhead exceeds the benefit.

**Helper step.** Start a helper (subagent) for this step if you can, with the prompt file named below (its absolute path when the helper can read it, else its full text) and the listed inputs; leave its model and effort at the session's. If you cannot start one, follow the prompt file yourself. Either way, return its Output section, and note which path ran in the run's provenance record if there is one.

Prompt: `references/agents/findings-validator.md`. Inputs: the merged finding list from the compact returns, numbered `F1`, `F2`, … in list order (its verdicts come back by that id), the diff, and `run_id={run_id}`.

Drop rejected findings. Keep each **unresolved** one (a protected subject neither confirmed nor refuted), marked unresolved: it reaches the report as advisory with a human owner, because a wrong dismissal there costs more than a false alarm.

### 5b: Synthesis

**Helper step.** Start a helper (subagent) for this step if you can, with the prompt file named below (its absolute path when the helper can read it, else its full text) and the listed inputs; leave its model and effort at the session's. If you cannot start one, follow the prompt file yourself. Either way, return its Output section, and note which path ran in the run's provenance record if there is one.

Prompt: `references/agents/findings-synthesizer.md`. Inputs: the validated finding list, `run_id={run_id}`, and the artifacts in `.agent-blueprint/review-runs/{run_id}/`.

## Step 6: Present Results

Present the report with its P1, P2 and P3 counts, then offer to act on the actionable findings (present, gated_auto, advisory). With none, the report ends the run.

**Asking the user.** Ask with your question tool if you have one, offering at most three options; otherwise ask in plain text with a numbered list. In a headless or unattended run nobody will answer: take the default named below, say so in your output, and log it in the run state's decisions if there is a run state.

Five or fewer: fix them now with the ab-resolve-in-parallel skill (independent fixes in parallel), or leave them. More than five: decide each in turn following `references/walkthrough.md`, since a bulk list does not fit per-item decisions at that volume, or leave them. Default when nobody answers: fix nothing and return the report for the calling pipeline or the user to act on.
