---
name: ab-finishing-a-development-branch
description: "Finishes a development branch whose work is done: runs the tests, has a read-only helper audit each plan item against the diff, offers to merge locally, push and open a PR, or keep the branch, and carries out the choice; discarding needs an explicit request and typed confirmation. Use when implementation is complete and tests pass, or the user says the work is done or ready to merge, or asks what now. Not for creating a PR alone (use ab-pr-workflow), or while work is in progress or tests fail."
metadata:
  version: "3.8.0"
---

# Finishing a Development Branch

Bring finished work to a clean end: verify tests → audit the plan → present options → execute the choice → clean up.

**Announce at start:** "I'm using the ab-finishing-a-development-branch skill to complete this work."

**Working folder.** Blueprint working files live under `.agent-blueprint/` in the project root. Before the first write there, create `.agent-blueprint/.gitignore` with the lines `run/`, `team/`, `review-runs/` and `cache/` if it does not exist yet, so run state stays out of commits while plans and notes stay tracked.

**Provenance record.** When this skill starts, write `.agent-blueprint/run/provenance/<name>.json`, where `<name>` is the `name` in this skill's frontmatter: `skill` (that name), `version` (its `metadata.version`), `started_at` (the current UTC time, ISO 8601) and an empty `helper_steps` list, replacing any older record of that name. If `.agent-blueprint/.gitignore` is missing, create it first with the lines `run/`, `team/`, `review-runs/` and `cache/`. Each Helper step adds its entry to `helper_steps`. The record tells a run, and the smoke test, which skill ran and how; it is not a security control.

### Step 1: Verify Tests

Run the project's test suite (`npm test`, `cargo test`, `pytest`, `go test ./...`, or the one in `docs/context/CONVENTIONS.md`). A merge or PR on failing tests hands broken code on, so on any failure stop and report:

```
Tests failing (<N> failures). Must fix before completing:
[Show failures]
Cannot proceed with merge/PR until tests pass.
```

### Step 2: Determine Base Branch

```bash
git merge-base HEAD main 2>/dev/null || git merge-base HEAD master 2>/dev/null
```

With neither `main` nor `master`, use the remote's default branch (`git symbolic-ref --short refs/remotes/origin/HEAD`). Name the base in your report instead of asking.

### Step 3: Plan Audit

Before any option, a fresh read-only helper classifies every plan item against the branch diff. This step owns the audit procedure; `ab-pr-workflow` renders the result, and `ab-executing-plans` and `ab-subagent-driven-development` pass the plan path.

Find the plan per `references/plan-audit.md` § Plan path; its items are `### U<N>.` headings, `### Task N:` headings, or checklist lines. No plan file, or one with no items, reports `NO PLAN`: show that line, skip the table and go on to Step 4, since a missing plan never blocks.

**Helper step.** Start a helper (subagent) for this step if you can, with the prompt file named below (its absolute path when the helper can read it, else its full text) and the listed inputs; leave its model and effort at the session's. If you cannot start one, follow the prompt file yourself. Either way, return its Output section, and note which path ran in the run's provenance record if there is one.

Prompt: `references/agents/code-reviewer.md`, in a fresh helper. Inputs: the request in `references/plan-audit.md` § Audit request, filled in, and nothing else; its task and output rules replace the prompt file's review. The states are in `references/plan-audit.md` § States.

**The gate.** Any NOT DONE or PARTIAL row blocks Options 1 and 2, since merging or opening a PR would call the branch finished with planned work missing: show those rows and offer Option 3 only. DONE, CHANGED, DEFERRED, UNVERIFIABLE and NO PLAN never block. Keep the table and the unplanned-work list for Option 2.

**Autonomous runs** (ab-autonomous-loop, ab-ship-pipeline): a blocked gate stops the run. Report in ab-autonomous-loop's escalation format (what I was trying / what I tried / what I think / what I need), set the run state's `status` to `blocked` with that report as its `reason` if a run state exists, and open no PR.

### Step 4: Present Options

**Asking the user.** Ask with your question tool if you have one, offering at most three options; otherwise ask in plain text with a numbered list. In a headless or unattended run nobody will answer: take the default named below, say so in your output, and log it in the run state's decisions if there is a run state.

Offer exactly the three below, without explanation: a structured choice gets a clear answer where "what now?" does not. When Step 3 blocked, mark 1 and 2 `(blocked by plan audit)` and accept only 3. Default when nobody answers: 3, keep the branch; 2 when the calling pipeline asked for a PR and the audit did not block.

```
Implementation complete. What would you like to do?
1. Merge back to <base-branch> locally
2. Push and create a Pull Request
3. Keep the branch as-is (I'll handle it later)
```

Discarding the branch is not on the menu: it deletes commits and a worktree for good, and a menu slot invites an accidental pick. Run it only when the user explicitly asks, following `references/discarding-work.md`.

### Step 5: Execute Choice

**No-commit mode.** When the environment variable `AGENT_BLUEPRINT_GIT_WRITABLE` is `0`, or a commit fails because `.git` is read-only, make no commits: leave the changes in the working tree and add the commit message you would have used to `.agent-blueprint/run/commit-msg.md`, and the ship runner commits them after the session. A review step in this mode reviews the working tree and untracked files against the merge base instead of a commit range.

A merge is a commit, so in this mode Option 1 cannot run: say so and keep the branch (Option 3). Option 2 leaves uncommitted work and its message as above.

#### Option 1: Merge Locally

From the main checkout, merge `<feature-branch>` into an updated `<base-branch>` and rerun the tests on the result. Only if they pass, remove the worktree and then delete the branch (`git branch -d`), as `references/merge-locally.md` § Merge sequence lists. If `git worktree remove` refuses, keep the worktree and the branch and report the dirty state (Option 3 behaviour).

#### Option 2: Push and Create PR

Use the ab-pr-workflow skill, passing the Step 3 table and unplanned-work list (or the `NO PLAN` line) for its `## Plan audit` section; it audits itself only when it gets no table. Force-push only on the user's explicit request, since it rewrites history others may hold. Keep the worktree for review fixes.

In a runner-driven run (`AGENT_BLUEPRINT_RUNNER` is `1`), push nothing and open no PR: write the PR body, with that `## Plan audit` section, to `.agent-blueprint/run/pr-body.md`; the runner scans for secrets, pushes and opens the PR, because host sandboxes may block the network and one publish step is easier to trust.

#### Option 3: Keep As-Is

Report "Keeping branch <name>. Worktree preserved at <path>." and leave the worktree.

### Step 6: Cleanup Worktree

**For Option 1:** confirm nothing is left (`references/merge-locally.md` § Confirm the cleanup).

Leave out the force flag, because a forced removal deletes uncommitted work (the ab-using-git-worktrees skill's "Removing a Worktree" owns that rule). If git refuses, keep the branch and the worktree and report the dirty state (Option 3 behaviour).

**For Options 2 and 3:** keep the worktree. **Discard path:** its own Step 4 removes the worktree under the same rule.

Quick reference, common mistakes, red flags and callers: `references/summary.md`.
