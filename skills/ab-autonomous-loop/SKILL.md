---
name: ab-autonomous-loop
description: "Runs a plan's tasks one after another with no human checkpoints: do the next unchecked task, verify it, tick it and commit, retry failures after a written reflection, and stop on a fatal error, a circuit breaker, a risk score or a hard cap. Often started by the pipeline skills. Use when a plan of mostly sequential tasks should run to the end unattended, or the user says to keep going until all of it is done. Not for review checkpoints between batches (ab-executing-plans) or tasks that can run in parallel (ab-orchestrate)."
metadata:
  version: "4.0.0"
---

# Autonomous Loop

The run ends with every plan task ticked, verified and committed plus a final report, or stopped with a structured escalation that says what blocked it.

**Working folder.** Blueprint working files live under `.agent-blueprint/` in the project root. Before the first write there, make sure `.agent-blueprint/.gitignore` exists and lists `run/`, `team/`, `review-runs/`, `cache/` and `.gitignore`, so run state and the ignore file itself stay out of commits while plans and notes stay tracked.

**Provenance record.** When this skill starts, write `.agent-blueprint/run/provenance/<name>.json`, where `<name>` is the `name` in this skill's frontmatter: `skill` (that name), `version` (its `metadata.version`), `started_at` (the current UTC time, ISO 8601) and an empty `helper_steps` list, replacing any older record of that name. Before that, make sure `.agent-blueprint/.gitignore` exists and lists `run/`, `team/`, `review-runs/`, `cache/` and `.gitignore`. Each Helper step adds `{step, path: helper|inline}` to `helper_steps`. The record tells a run, and the smoke test, which skill ran and how; it is not a security control.

**Verify after every task, not at the end.** A chain of unverified changes is a chain of compounding bugs, and the stop signals below mean something only when each task was checked on its own.

## Step 1: Load and classify the plan

Read the plan. Each task needs a description, a completion check and a checkbox (`- [ ]` pending, `- [x]` done); add missing checkboxes, and split a task that would take hours, since a giant task hides its failures. Classify each task as independent, sequential or parallelizable (`references/loop-details.md` § Task classes); hand parallelizable ones to the ab-resolve-in-parallel skill.

**Tracking tasks.** The plan file's checkboxes are the record of progress: tick each one when its task is done and verified, so another session or another tool can continue from there. A host task list, if you have one, may mirror them, but it never replaces them.

**Pre-flight danger scan (advisory):** before the first task, run the scan in `references/loop-details.md` § Pre-flight danger scan. It routes each hit through the ab-executing-plans decision boundary and never stops the loop by itself.

## Step 2: Run the loop

Each pass (diagram: `references/loop-details.md` § Loop diagram): **pick** the next unchecked task whose dependencies are done; **attempt** it, reading the files it names and testing first when writing code (the ab-test-driven-development skill); **verify** it at once with the project's tests, build and the task's own acceptance check.

**On success,** tick its checkbox, log "Task N complete. [N/total] done.", and commit, so a later failure can return to the last good state without losing earlier work. An unticked task gets attempted again.

**No-commit mode.** When the environment variable `AGENT_BLUEPRINT_GIT_WRITABLE` is `0`, or a commit fails because `.git` is read-only, make no commits: leave the changes in the working tree and add the commit message you would have used to `.agent-blueprint/run/commit-msg.md`, and the ship runner commits them after the session. A review step in this mode reviews the working tree and untracked files against the merge base instead of a commit range.

**On failure,** classify the error. Transient (rate limit, timeout, flaky test): retry with backoff. Fixable (an implementation bug): debug with the ab-systematic-debugging skill, fix, retry. Fatal (missing dependency, wrong architecture, unclear requirement): stop and escalate (Step 4). An unclear requirement is Fatal only when the ab-executing-plans decision boundary says to stop (a must-ask category in the project instructions file); anything else it lets an autonomous run decide is decided, recorded, and continued.

**Reflect before every retry.** Write out what failed (the specific error), what the next attempt changes, and whether it repeats the last approach; if it does, pick a fundamentally different one, since the same strategy with minor tweaks tends to fail the same way.

**Retries:** at most 3 per task (4 attempts); the second changes the approach, the third the whole strategy, each after re-reading the failing output. Transient errors back off 5 s, 15 s, then 45 s before the last attempt. When retries run out, mark the task blocked and move to the next independent task; if other tasks depend on it, stop and escalate.

## Step 3: Report progress, check stop signals

After each task, pass or fail, print the report in `references/final-report.md` § Progress report. Then stop the loop, with no retry, at the first of these (counters: `references/loop-details.md` § Circuit breaker, § Risk score):

- **No progress:** 3 passes in a row finish no task.
- **Same error:** the same normalized error 5 times running.
- **Rising difficulty:** each of the last 3 tasks needed more retries than the one before.
- **Hot file:** one file changed by 4 or more tasks.
- **Risk score over 20%:** +15% a revert, +5% a fix touching over 3 files, +1% each fix after the 15th, +20% touching files unrelated to the task; test-only changes add nothing.
- **Hard caps:** 50 changes in the run, or 20 loop passes; the 20-pass ceiling is fixed and sits above every limit the user may change.

## Step 4: Stop and escalate

Stop for a fatal error, retries run out on a task others depend on, or a Step 3 signal. Report in `references/final-report.md` § Structured escalation (what you were trying to do, what you tried, what you think the issue is, what you need), so the user gets a decision to make, not debug output. A checkpoint the user asked for every N tasks shows the progress report and asks the same way.

**Asking the user.** Ask with your question tool if you have one, offering at most three options; otherwise ask in plain text with a numbered list. In a headless or unattended run nobody will answer: take the default named below, say so in your output, and log it in the run state's decisions if there is a run state.

Options: answer or decide, and the loop resumes; revise the plan (the ab-writing-plans skill) and restart; or stop. Default when nobody answers: stop, with progress in the checkboxes and the escalation as the run's final output, because continuing past a stop signal compounds the damage it caught; at a checkpoint, continue, since the Step 3 signals still guard the run.

If the user interrupts, stop, save progress in the checkboxes and report where the run stands.

## Step 5: Finish

When every task is ticked:

1. Run the full test suite, the build and the lint.
2. Deslop every file this session changed (hedging, filler transitions, comments that restate the code, redundant type annotations; checklist: the deslop pass, Step 0.5, of the ab-iterative-refinement skill), then rerun the tests.
3. Report in `references/final-report.md` § Final report: verification results, the run's numbers (tasks, retries, escalations, blocked tasks and why) and the changes.

In `references/loop-details.md`: when not to use this skill (§ When Not to Use), limits and overrides (§ Quick Reference), next skills (§ Integration with Other Skills) and common mistakes (§ Common Mistakes).
