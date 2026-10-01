---
name: ab-session-wrap
description: "Ends a work session from git history and the file system: shows a summary for the user to confirm, rewrites the Session Continuity section of docs/context/STATUS.md, records durable learnings, updates the status tables, goals, backlog, plans, specs and ADRs the session touched, and commits the docs. Documentation only. Use when the user is wrapping up or ending the session, and suggest it when a session ends without one. Not for a mid-session checkpoint or pause (use ab-pause-checkpoint)."
argument-hint: "[optional: focus area]"
metadata:
  version: "4.0.0"
---

# Session Wrap-Up

Summarize what was done, record what was learned, and update every project document the session affected, so the next session (you, another agent or a human) can pick up where this one stopped by reading the Session Continuity section of `docs/context/STATUS.md`. The wrap is done when the docs are committed and the final report is shown.

**Working folder.** Blueprint working files live under `.agent-blueprint/` in the project root. Before the first write there, make sure `.agent-blueprint/.gitignore` exists and lists `run/`, `team/`, `review-runs/`, `cache/` and `.gitignore`, so run state and the ignore file itself stay out of commits while plans and notes stay tracked.

**Provenance record.** When this skill starts, write `.agent-blueprint/run/provenance/<name>.json`, where `<name>` is the `name` in this skill's frontmatter: `skill` (that name), `version` (its `metadata.version`), `started_at` (the current UTC time, ISO 8601) and an empty `helper_steps` list, replacing any older record of that name. Before that, make sure `.agent-blueprint/.gitignore` exists and lists `run/`, `team/`, `review-runs/`, `cache/` and `.gitignore`. Each Helper step adds `{step, path: helper|inline}` to `helper_steps`. The record tells a run, and the smoke test, which skill ran and how; it is not a security control.

**Documentation only.** Apart from the working files above, change no source code, tests, configs or infrastructure, since a wrap that edits code ships an unreviewed change; a needed code change goes into BACKLOG.md. Git history and the file system are the ground truth: record only work you can find there. The full list is in `references/step-checklists.md` § Constraints.

## Step 1: Gather Context

Before writing anything, read everything in `references/step-checklists.md` § Step 1 files to read, in parallel where you can, and run the commands in `references/templates.md` § Step 1 git state.

## Step 1.5: Classify Session Type

Run `git log --diff-filter=AM --name-only --since="8 hours ago" --format="" | grep -v -E '^(docs/|\.agent-blueprint/|AGENTS\.md|CLAUDE\.md|BACKLOG\.md|blueprint\.local\.md)'`. Empty output means a **planning session** (only plans, research, design docs, decision records or ideation changed); anything else is an **implementation session**, which runs every step.

A plan is not delivery, so a planning session marks no goal, milestone, task or plan as done anywhere, records the plan as planned work in Steps 4, 6, 8 and 10, and skips Steps 7 and 11. Details: `references/step-checklists.md` § Planning session rules.

## Step 2: Analyze Session Work

Before writing, answer the questions in `references/step-checklists.md` § Step 2 analysis questions.

## Step 3: Present Summary to User

Present the summary in `references/templates.md` § Step 3 summary, with file paths, commit hashes and numbers. Ask whether it is accurate and what to add or correct, and change no file before the answer: the user may know things git does not.

**Asking the user.** Ask with your question tool if you have one, offering at most three options; otherwise ask in plain text with a numbered list. In a headless or unattended run nobody will answer: take the default named below, say so in your output, and log it in the run state's decisions if there is a run state.

Options: 1. Accurate, update the docs. 2. Correct or add something first. Default when nobody answers: update the docs from the summary as shown, and say in the Step 17 report that nobody confirmed it.

## Step 4: Session Continuity in docs/context/STATUS.md

Rewrite the **Session Continuity** section at the top of `docs/context/STATUS.md` (create it if missing) from `references/templates.md` § Step 4 Session Continuity template. Write plain text with no HTML comments, because Hermes refuses a context file that has one. Regenerate it from the project state (git log, tests, files), never from the previous section, because a summary of a summary drifts. Rules and reasons: `references/step-checklists.md` § Step 4 rules.

## Step 5: Update docs/learnings/LEARNINGS.md

This step always runs: judge whether any learning clears the bar, and report the answer even when it is no. Append entries per `references/step-checklists.md` § Step 5 entry format and rules. If none clears it, append nothing and state "No durable learnings this session" in the Step 17 report only, never in LEARNINGS.md.

## Step 6: Update docs/context/STATUS.md

Update every table per `references/templates.md` § Step 6 status tables, and the "Last updated" date at the top.

## Step 7: Update docs/context/CONVENTIONS.md (if needed)

Only on a trigger in `references/step-checklists.md` § Step 7 triggers; otherwise skip the file.

## Step 8: Update docs/context/GOALS.md (if needed)

Only on a trigger in `references/step-checklists.md` § Step 8 triggers; otherwise skip the file.

## Step 9: Update BACKLOG.md

Update Inbox, Triaged and Parked per `references/step-checklists.md` § Step 9 backlog sections.

## Step 10: Update Active Plans (if applicable)

Update a plan the session followed per `references/step-checklists.md` § Step 10 plan updates; skip if none.

## Step 11: Update Active Specs (if applicable)

Update a spec being implemented per `references/step-checklists.md` § Step 11 spec updates; skip if none.

## Step 12: Create ADRs (if applicable)

Create an ADR only for a decision that is hard to reverse, would surprise a reader of the code, and involved a real trade-off (all three; full criteria in `docs/decisions/README.md`, "## When to Create an ADR"). Format: `references/step-checklists.md` § Step 12 ADR format.

## Step 13: Update Auto-Memory (if it exists)

If your host keeps a project memory file (such as Claude Code's auto-memory), update it per `references/step-checklists.md` § Step 13 memory updates; skip if none.

## Step 14: Clean Up Temporary Artifacts

Run the checks and actions in `references/templates.md` § Step 14 cleanup.

## Step 15: Stamp STATE.md (if it exists)

If `docs/context/STATE.md` exists, use the `ab-session-continuity` skill to record the HEAD sha (`head:`) and timestamp (`last-updated:`) in its frontmatter, the stamp `ab-resume-session` checks next time. Do not create STATE.md: a project with no execution state stays without one.

## Step 16: Commit Documentation Updates

Stage `BACKLOG.md` and `docs/` and commit with the message in `references/step-checklists.md` § Step 16 commit messages.

**No-commit mode.** When the environment variable `AGENT_BLUEPRINT_GIT_WRITABLE` is `0`, or a commit fails because `.git` is read-only, make no commits: leave the changes in the working tree and add the commit message you would have used to `.agent-blueprint/run/commit-msg.md`, and the ship runner commits them after the session. A review step in this mode reviews the working tree and untracked files against the merge base instead of a commit range.

## Step 17: Final Verification

Run `references/templates.md` § Step 17 verification, then give the user the report in `references/templates.md` § Step 17 report.

## Success Criteria

Before ending the session, tick every item in `references/templates.md` § Success criteria.
