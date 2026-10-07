---
name: ab-subagent-driven-development
description: "Runs a written plan in this session one task at a time: a fresh helper implements each task from its full text, a spec-compliance reviewer and then a code-quality reviewer check it, fix rounds repeat until both pass, and a final review covers the whole implementation. Use when a plan's tasks are mostly independent and you want clean context per task without leaving this session; usually invoked by another skill. Not for tightly coupled tasks that share state (execute those in order yourself), a separate session with human checkpoints (ab-executing-plans), or parallel team work (ab-orchestrate)."
metadata:
  version: "3.8.0"
---

# Subagent-Driven Development

Run a plan in this session one task at a time: a fresh helper implements each task, a spec-compliance reviewer checks it built what the task asked (nothing missing, nothing extra), and only then a code-quality reviewer checks how well it is built. The run is done when every task's box is ticked, the final review approves, and the ab-finishing-a-development-branch skill has the branch. A fresh helper per task keeps its context clean; the review order keeps quality review off code that may still change for the spec.

Diagrams: `references/flowcharts.md`. Comparison with ab-executing-plans: `references/advantages.md`. A worked run: `references/example-workflow.md`. What never to do: `references/red-flags.md`.

## 1. Start

**Working folder.** Blueprint working files live under `.agent-blueprint/` in the project root. Before the first write there, make sure `.agent-blueprint/.gitignore` exists and lists `run/`, `team/`, `review-runs/`, `cache/` and `.gitignore`, so run state and the ignore file itself stay out of commits while plans and notes stay tracked.

**Provenance record.** When this skill starts, write `.agent-blueprint/run/provenance/<name>.json`, where `<name>` is the `name` in this skill's frontmatter: `skill` (that name), `version` (its `metadata.version`), `started_at` (the current UTC time, ISO 8601) and an empty `helper_steps` list, replacing any older record of that name. Before that, make sure `.agent-blueprint/.gitignore` exists and lists `run/`, `team/`, `review-runs/`, `cache/` and `.gitignore`. Each Helper step adds its entry to `helper_steps`. The record tells a run, and the smoke test, which skill ran and how; it is not a security control.

Work in an isolated workspace (the ab-using-git-worktrees skill). On main or master, branch first unless the user said to work there, since every task commits.

## 2. Load the plan

Read the plan once and extract each task's full text with its context (where it fits, what it depends on). Helpers get that text, not the plan path, so none spends its context reading the plan.

**Tracking tasks.** The plan file's checkboxes are the record of progress: tick each one when its task is done and verified, so another session or another tool can continue from there. A host task list, if you have one, may mirror them, but it never replaces them.

Here they live in the progress file `.agent-blueprint/plans/<plan-basename>.progress.md`, one box per task (format and setup: `references/progress-file.md`); tick the plan's own task boxes too if it has them. An existing file keeps its ticks: resume at the first unticked task. An interrupted run leaves it in place for the STATE.md handoff (ab-session-continuity).

## 3. Run each task

One task at a time, since two implementers would edit the same files. Record BASE, the commit the task starts from, and keep it through fix rounds so each re-review reads the whole task. The implementer commits; reviewers read BASE..HEAD.

**No-commit mode.** When the environment variable `AGENT_BLUEPRINT_GIT_WRITABLE` is `0`, or a commit fails because `.git` is read-only, make no commits: leave the changes in the working tree and add the commit message you would have used to `.agent-blueprint/run/commit-msg.md`, and the ship runner commits them after the session. A review step in this mode reviews the working tree and untracked files against the merge base instead of a commit range.

In that mode, tell the implementer: it reports its commit message instead of committing, and you add the message there. Reviewers get `working tree` as HEAD, and the implementer's list of changed files marks the task's part.

**Helper step.** Start a helper (subagent) for this step if you can, with the prompt file named below (its absolute path when the helper can read it, else its full text) and the listed inputs; leave its model and effort at the session's. If you cannot start one, follow the prompt file yourself. Either way, return its Output section, and note which path ran in the run's provenance record if there is one.

Three helpers, in order, each starting once the one before is done and passing:

1. Implementer. Prompt: `references/agents/implementer.md`. Inputs: the task's full text and context, the working directory, and whether no-commit mode is on. Name it (say `implementer-task-3`) if your host can message a running helper. Answer its questions before it proceeds; one you cannot answer goes through the decision boundary in the ab-executing-plans skill, then to § When you need the user if that says ask.
2. Spec reviewer. Prompt: `references/agents/spec-reviewer.md`. Inputs: the task text, the implementer's report, BASE, HEAD.
3. Code-quality reviewer, only after the spec review passes. Prompt: `references/agents/code-reviewer.md`. Inputs: what was implemented (from the implementer's report), the task from the plan, BASE, HEAD, and a one-line description.

**Fix rounds.** Send a reviewer's findings to the same implementer in one message, same-shape ones batched, then have that reviewer check BASE..HEAD again; if you cannot reach it, start a fresh one with its report and the findings. Fix through a helper, never by hand, also when an implementer fails a task, so your context stays clean. An open finding means not done; self-review replaces neither review. After five rounds in one stage, mark the task `— BLOCKED: <reason>` in the progress file and ask the user.

When the code-quality reviewer approves, tick the box and take the next task.

## 4. Final review

**Helper step.** Start a helper (subagent) for this step if you can, with the prompt file named below (its absolute path when the helper can read it, else its full text) and the listed inputs; leave its model and effort at the session's. If you cannot start one, follow the prompt file yourself. Either way, return its Output section, and note which path ran in the run's provenance record if there is one.

Prompt: `references/agents/code-reviewer.md`. Inputs: the plan path and the range from the commit before the first task to HEAD (in no-commit mode, the working tree, as in step 3).

Fix its findings as in the fix rounds until it approves. Then delete the progress file and use the ab-finishing-a-development-branch skill, passing the plan path (`docs/plans/<plan-basename>.md`) for its plan audit.

## When you need the user

**Asking the user.** Ask with your question tool if you have one, offering at most three options; otherwise ask in plain text with a numbered list. In a headless or unattended run nobody will answer: take the default named below, say so in your output, and log it in the run state's decisions if there is a run state.

An implementer's question: its options. Default when nobody answers: the conservative one, recorded under the plan's `### Assumptions` and sent back. A blocked task: guidance and retry, skip it and go on with tasks that do not need it, or stop. Default when nobody answers: stop and report the task with its open findings.

ab-writing-plans writes the plan; implementers follow ab-test-driven-development; reviewers follow ab-requesting-code-review.
