---
name: ab-executing-plans
description: "Executes a written plan in this session in batches of three tasks: each task is followed step by step, verified, committed and ticked in a progress file; each batch ends with a report and a checkpoint for the user's feedback; a whole-branch review closes the run. Reads plans that use v3 skill names. Use when the user wants to work through a plan with human review between batches. Not for parallel or team work (ab-orchestrate) or fully autonomous runs (ab-autonomous-loop)."
metadata:
  version: "4.0.0"
---

# Executing Plans

Execute a written plan in batches, with the user reviewing between them, since small batches keep rework small. The run is done when every task is committed and ticked, the whole-branch review is clean, and the ab-finishing-a-development-branch skill has the branch.

Announce at start: "I'm using the ab-executing-plans skill to implement this plan." Hand off instead for team work (ab-orchestrate), runs with no reviewer (ab-autonomous-loop, ab-ship-pipeline), no plan yet (ab-writing-plans), or one trivial change (ab-quick-fix).

## Step 1: Load and review the plan

**Working folder.** Blueprint working files live under `.agent-blueprint/` in the project root. Before the first write there, make sure `.agent-blueprint/.gitignore` exists and lists `run/`, `team/`, `review-runs/`, `cache/` and `.gitignore`, so run state and the ignore file itself stay out of commits while plans and notes stay tracked.

**Provenance record.** When this skill starts, write `.agent-blueprint/run/provenance/<name>.json`, where `<name>` is the `name` in this skill's frontmatter: `skill` (that name), `version` (its `metadata.version`), `started_at` (the current UTC time, ISO 8601) and an empty `helper_steps` list, replacing any older record of that name. The Working folder step above has already made sure of `.agent-blueprint/.gitignore`. Each Helper step adds `{step, path: helper|inline}` to `helper_steps`. The record tells a run, and the smoke test, which skill ran and how; it is not a security control.

Read the plan and review it critically; raise concerns before starting (§ When to stop and ask). A skill named by its v3 name, with or without a leading slash (such as `executing-plans` or `writing-plans`), is the v4 skill in the second column of `references/v4-skill-names.tsv`.

For three or more new files, map existing patterns first so new code follows the codebase's structure; read the map before each task.

**Helper step.** Start a helper (subagent) for this step if you can, with the prompt file named below (its absolute path when the helper can read it, else its full text) and the listed inputs; leave its model and effort at the session's. If you cannot start one, follow the prompt file yourself. Either way, return its Output section, and note which path ran in the run's provenance record if there is one.

Prompt: `references/agents/pattern-mapper.md`. Inputs: the plan path, the codebase root, and the output path `.agent-blueprint/plans/PATTERNS.md`.

**Lower effort.** This step is safe at lower effort. If your host lets you set effort for a single helper, you may start this one lower, unless the user asked for their level everywhere; otherwise it runs at the session's level. Never switch models to save effort.

**Tracking tasks.** The plan file's checkboxes are the record of progress: tick each one when its task is done and verified, so another session or another tool can continue from there. A host task list, if you have one, may mirror them, but it never replaces them.

Here they live in `.agent-blueprint/plans/<plan-basename>.progress.md`, one box per task (`references/progress-file.md`); tick the plan's own boxes too if it has them. An existing file keeps its ticks; an interrupted run leaves it for the STATE.md handoff (ab-session-continuity).

## Step 2: Execute a batch

A batch is the next three tasks. Work in an isolated workspace (ab-using-git-worktrees); on main or master, branch first unless the user said to work there. For each task, from the first unticked box: follow its steps exactly, run its verifications, commit, tick the box (`- [ ]` → `- [x]`), and record interpretive choices (`references/assumption-tracking.md`).

**No-commit mode.** When the environment variable `AGENT_BLUEPRINT_GIT_WRITABLE` is `0`, or a commit fails because `.git` is read-only, make no commits: leave the changes in the working tree and add the commit message you would have used to `.agent-blueprint/run/commit-msg.md`, and the ship runner commits them after the session. A review step in this mode reviews the working tree and untracked files against the merge base instead of a commit range.

A task that touches a framework or library API (forms, routing, data fetching, hooks, ORM queries, config) uses the ab-source-driven-development skill: detect the version, fetch the docs page, follow its pattern, cite the URL.

## Step 3: Report

Scan the batch for stubs (`references/batch-report.md`). Show what was implemented and the verification output, with any Deferred Issues, Known Stubs and new Assumptions; say "Ready for feedback." and wait (§ When to stop and ask).

## Step 4: Continue

Apply the feedback and run the next batch until every box is ticked. Return to Step 1 when the user changes the plan or the approach needs rethinking.

## Step 5: Complete development

1. Run the ab-requesting-code-review skill once over the whole branch (base `git merge-base origin/main HEAD`, head `HEAD`; in no-commit mode, the working tree), with the plan as requirements and its Review Focus list as checklist (the ab-review-swarm skill instead for auth, money, data or a public contract). Fix Critical and Important findings until a review returns none.
2. Delete the progress file; nothing is left to resume.
3. Announce "I'm using the ab-finishing-a-development-branch skill to complete this work." and follow it, passing the plan path (`docs/plans/<plan-basename>.md`) for its plan audit.

## Decision Boundary

A decision in a must-ask category of the project instructions (new tables or schema changes, a framework switch, a public API contract, auth logic, new environment variables) stops here for the user. Outside those, a choice you can detect and roll back is decided, recorded under `### Assumptions` and continued; the rest is asked. Claims that something is impossible or blocked need evidence. The full rule, which other skills cite, and examples: `references/decision-boundary.md`.

Fix what the current task caused or needs; everything else goes to `BACKLOG.md`. After three failed fixes on one issue, list it under `### Deferred Issues` in the batch report and move on (`references/deviations.md`).

## When to stop and ask

Stop at a blocker (a missing dependency, a failing test, an unclear instruction), a gap that keeps the plan from starting, repeated verification failures, or a must-ask decision; a guess builds what nobody asked for. After five read-only steps in a row, act (`references/staying-on-course.md`).

**Asking the user.** Ask with your question tool if you have one, offering at most three options; otherwise ask in plain text with a numbered list. In a headless or unattended run nobody will answer: take the default named below, say so in your output, and log it in the run state's decisions if there is a run state.

Batch checkpoint: continue, apply changes first, or stop. Default when nobody answers: continue. A concern about the plan: proceed as written, revise it, or stop. Default when nobody answers: proceed and list it in the first report. A blocker or must-ask decision: options from the case. Default when nobody answers: stop, keep the progress file, report. Any other open choice: the conservative option, recorded under `### Assumptions`.
