---
name: ab-wave-orchestration
description: "Groups dependent tasks into waves and runs them: tasks with no unmet dependency and no shared file run as parallel helpers within a wave, an integration verifier checks each wave before the next, and this session commits each task. Use when four or more tasks mix independent and dependent work and you want the wave pattern itself, for example inside another skill. Not for a whole plan run as team work with a task ledger (ab-orchestrate), all-sequential tasks (ab-autonomous-loop), all-independent items (ab-resolve-in-parallel), or three tasks or fewer."
---

# Wave Orchestration

Run tasks in dependency-ordered waves, one helper per task within a wave. The run is done when every wave has passed its integration check and been committed, the final verification is green, and the report is written. This session is the lead: it alone starts helpers and commits, because many hosts forbid a helper from starting another, and one committer keeps the history in task order.

To run a whole plan as team work with a task ledger, use the ab-orchestrate skill, which builds on this pattern. The wave model and a comparison with the other execution skills: `references/wave-guide.md` § The Wave Model and `references/wave-guide.md` § Comparison with Other Execution Skills.

## Step 1: Load the plan

Read the plan file. For each task, note its ID, description, dependencies, and the files it will modify. Where the plan states no dependencies, infer them: a task that creates something a later task uses comes first.

## Step 2: Build the waves

Put each task in the earliest wave where all its dependencies are done. Two tasks in one wave never modify the same file, since parallel edits to one file overwrite each other; when two independent tasks share a file, move one to a later wave. Keep waves within the host's helper limits: `references/wave-guide.md` § Helper limits. Write the wave plan as in `references/wave-guide.md` § Example wave plan, and check it against `references/wave-guide.md` § Common Mistakes.

## Step 3: Confirm the wave plan

Show the number of waves, the tasks in each, which run in parallel, and the estimated time saved against running them one by one.

**Asking the user.** Ask with your question tool if you have one, offering at most three options; otherwise ask in plain text with a numbered list. In a headless or unattended run nobody will answer: take the default named below, say so in your output, and log it in the run state's decisions if there is a run state.

Options: approve and run Wave 1 first, checking each wave before the next; change the waves; stop. Default when nobody answers: run the plan as built.

## Step 4: Run each wave

### 4a. Start the wave's helpers

Start one implementer per task, all at once, in the ab-subagent-driven-development skill's implementer pattern. Give each its own worktree (an isolated copy of the repository) where the host offers one, so parallel tasks cannot overwrite each other's changes; otherwise each touches only the files its task owns.

**Helper step.** Start a helper (subagent) for this step if you can, with the prompt file named below (its absolute path when the helper can read it, else its full text) and the listed inputs; leave its model and effort at the session's. If you cannot start one, follow the prompt file yourself. Either way, return its Output section, and note which path ran in the run's provenance record if there is one.

Prompt: the task packet below, one per task; no prompt file applies. Inputs: the packet's fields.

```
Implement Task [N]: [full task description].
Context: [relevant project context, file paths, conventions].
Constraints: Only modify [specific files]. Follow TDD. Run every verification
command inside your worktree; never point it at the main checkout or another path.
Start no helpers of your own, and do not commit on the main checkout.
Return: Summary of changes, files modified, test results.
```

### 4b. Collect results

When all helpers return, read each summary, note the files each modified, and check for unexpected overlaps.

### 4c. Integration check

**Helper step.** Start a helper (subagent) for this step if you can, with the prompt file named below (its absolute path when the helper can read it, else its full text) and the listed inputs; leave its model and effort at the session's. If you cannot start one, follow the prompt file yourself. Either way, return its Output section, and note which path ran in the run's provenance record if there is one.

Prompt: `references/agents/integration-verifier.md`. Inputs: the wave number and the tasks completed, with their summaries; it runs the full test suite and checks for conflicts between task implementations.

**Lower effort.** This step is safe at lower effort. If your host lets you set effort for a single helper, you may start this one lower, unless the user asked for their level everywhere; otherwise it runs at the session's level. Never switch models to save effort.

### 4d. Act on the result

- **PASS:** go to 4e.
- **ISSUES FOUND:** fix each with a targeted helper as in 4a, the issue as its task packet, then check again.
- **FAIL:** stop and report to the user; the next wave would build on a broken one.

### 4e. Commit the wave

Bring each task's changes onto the working branch, one commit per task: merge its worktree, or commit its owned files by name so another task's work stays out of that commit. Then start the next wave.

**Working folder.** Blueprint working files live under `.agent-blueprint/` in the project root. Before the first write there, make sure `.agent-blueprint/.gitignore` exists and lists `run/`, `team/`, `review-runs/`, `cache/` and `.gitignore`, so run state and the ignore file itself stay out of commits while plans and notes stay tracked.

**No-commit mode.** When the environment variable `AGENT_BLUEPRINT_GIT_WRITABLE` is `0`, or a commit fails because `.git` is read-only, make no commits: leave the changes in the working tree and add the commit message you would have used to `.agent-blueprint/run/commit-msg.md`, and the ship runner commits them after the session. A review step in this mode reviews the working tree and untracked files against the merge base instead of a commit range.

In this mode helpers use file ownership, not worktrees, since creating a worktree writes to `.git` as well.

## Step 5: Final verification

After the last wave, run the full test suite, the build and the lint, then an overall code review.

**Helper step.** Start a helper (subagent) for this step if you can, with the prompt file named below (its absolute path when the helper can read it, else its full text) and the listed inputs; leave its model and effort at the session's. If you cannot start one, follow the prompt file yourself. Either way, return its Output section, and note which path ran in the run's provenance record if there is one.

Prompt: `references/agents/code-reviewer.md`. Inputs: the plan file and the review range, from the commit before Wave 1 to `HEAD`.

**No-commit mode.** When the environment variable `AGENT_BLUEPRINT_GIT_WRITABLE` is `0`, or a commit fails because `.git` is read-only, make no commits: leave the changes in the working tree and add the commit message you would have used to `.agent-blueprint/run/commit-msg.md`, and the ship runner commits them after the session. A review step in this mode reviews the working tree and untracked files against the merge base instead of a commit range.

Here the range is the working tree and untracked files against the commit before Wave 1.

## Step 6: Report

Report in the format of `references/wave-guide.md` § Report format.
