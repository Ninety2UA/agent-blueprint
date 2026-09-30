---
name: ab-build-pipeline
description: "Runs a feature through eight supervised stages (discuss, brainstorm, plan, execute, review, verify, optional deploy check, knowledge capture) with a checkpoint after each where the user approves, changes or stops; research and plan-check helpers feed the plan, and complex plans run as team waves. Use when building a non-trivial feature or multi-file change with oversight or approval between steps. Not for hands-off runs with no checkpoints (ab-ship-pipeline) or a change under three files with an obvious approach (ab-quick-fix)."
argument-hint: "<feature description> [--quick] [--iterate N] [--deploy] [--team]"
metadata:
  version: "4.0.0"
---

# Build Pipeline — Full-Cycle Development

This skill runs a feature from requirements to verified code one stage at a time, with a checkpoint after each, because a checkpoint catches a wrong direction while it is still cheap to change. It is done when Stage 6 passes, Stages 7 and 8 have run where they apply, and the user has the report.

**Announce at start:** "Starting the build pipeline — full-cycle development from requirements to verified code."

**Working folder.** Blueprint working files live under `.agent-blueprint/` in the project root. Before the first write there, make sure `.agent-blueprint/.gitignore` exists and lists `run/`, `team/`, `review-runs/`, `cache/` and `.gitignore`, so run state and the ignore file itself stay out of commits while plans and notes stay tracked.

**Provenance record.** When this skill starts, write `.agent-blueprint/run/provenance/<name>.json`, where `<name>` is the `name` in this skill's frontmatter: `skill` (that name), `version` (its `metadata.version`), `started_at` (the current UTC time, ISO 8601) and an empty `helper_steps` list, replacing any older record of that name. Before that, make sure `.agent-blueprint/.gitignore` exists and lists `run/`, `team/`, `review-runs/`, `cache/` and `.gitignore`. Each Helper step adds its entry to `helper_steps`. The record tells a run, and the smoke test, which skill ran and how; it is not a security control.

Not for a refactor with no behavior change (ab-iterative-refinement), a plan only (ab-writing-plans), or research first (ab-deep-research, ab-spike-exploration).

`--quick` (or a small change) skips Stages 1 and 2, and `--iterate N` turns Stage 5 into a review-fix loop: follow `references/modes.md` for both.

## Checkpoints

After every stage, report what it produced and stop at a checkpoint before the next one. Approval covers one stage only, so a plan change during Stage 4 needs a fresh checkpoint.

**Asking the user.** Ask with your question tool if you have one, offering at most three options; otherwise ask in plain text with a numbered list. In a headless or unattended run nobody will answer: take the default named below, say so in your output, and log it in the run state's decisions if there is a run state.

Options: continue with the stage's recommendation, request changes to this stage's output, or stop and keep the work so far. Skip a stage only when the user says so. Default when nobody answers: continue with the recommendation and log it.

## Pipeline Stages

Run the stages in order; each one builds on the one before.

### Stage 1: Discuss (Decision Capture)

Invoke the ab-discuss skill to capture the user's decisions before planning; if the requirements are already clear, summarize them as locked decisions. Score them with the gate in `references/ambiguity-gate.md`: below 0.8, the checkpoint first asks about the weakest dimension.

Checkpoint: "These are the locked decisions I'll plan around. Confirm or adjust?" Default when nobody answers: confirm them, settling a weak dimension by its most conservative reading, marked as assumed.

### Stage 2: Brainstorm (Design)

Invoke the ab-brainstorming skill: two or three design alternatives with their trade-offs.

Checkpoint: the user picks a design. Default when nobody answers: the design you recommend.

### Stage 3: Plan (Implementation Steps)

First start the research helpers as `references/research.md` says. Then invoke the ab-writing-plans skill to turn the design and the findings into steps, and check the plan.

**Helper step.** Start a helper (subagent) for this step if you can, with the prompt file named below (its absolute path when the helper can read it, else its full text) and the listed inputs; leave its model and effort at the session's. If you cannot start one, follow the prompt file yourself. Either way, return its Output section, and note which path ran in the run's provenance record if there is one.

Prompt: `references/agents/plan-checker.md`. Inputs: the plan file's path; report BLOCKING issues only.

Fix every BLOCKING issue (one that prevents implementation: a missing dependency, an architectural conflict, an unresolvable ambiguity) before the checkpoint.

Checkpoint: the user approves the plan. Default when nobody answers: the plan as checked.

### Stage 4: Execute (Implementation)

- **Under four tasks, or all sequential:** invoke the ab-executing-plans skill.
- **Four or more tasks with mixed dependencies, or `--team`:** invoke the ab-orchestrate skill with `--no-review`. Stage 5, not that skill, does the review.

**No-commit mode.** When the environment variable `AGENT_BLUEPRINT_GIT_WRITABLE` is `0`, or a commit fails because `.git` is read-only, make no commits: leave the changes in the working tree and add the commit message you would have used to `.agent-blueprint/run/commit-msg.md`, and the ship runner commits them after the session. A review step in this mode reviews the working tree and untracked files against the merge base instead of a commit range.

No-commit mode covers the skill Stage 4 runs, the Stage 5 fixes and the Stage 5 review.

### Stage 5: Review (Quality Check)

Invoke the ab-review-swarm skill. Fix every P1 (critical) and P2 (important) finding before Stage 6, using the ab-resolve-in-parallel skill for independent findings (different files, no shared state). With `--iterate N`, follow `references/modes.md` § Iterate Mode instead.

### Stage 6: Verify (Completion)

Invoke the ab-verification-before-completion skill: run all tests, confirm every acceptance criterion in the plan is met, and confirm there are no regressions. Failing tests stop the pipeline here, because they mean an earlier stage was not done.

### Stage 7: Deploy Check (Optional)

Only with `--deploy`: invoke the ab-deployment-verification skill. Deploy only on GO or CONDITIONAL GO; on NO-GO, stop and report the blocking issues.

### Stage 8: Compound (Knowledge Capture)

If the work solved a non-trivial problem (a hard bug, a framework gotcha, an architectural decision) whose lesson the code and tests don't preserve, invoke the ab-knowledge-compounding skill to record it in `docs/solutions/` now, while the context is fresh, so future planning finds it. Otherwise skip this stage; that skill says what qualifies.

## When Things Go Wrong

- Fix or report a failed stage; never move past it, since later stages build on it.
- Use the ab-systematic-debugging skill for bugs during execution.
- If a review finding needs a plan change, return to Stage 4 and take a fresh checkpoint; otherwise Stage 5 fixes it in place before Stage 6.
- Decide or ask per the decision boundary in ab-executing-plans: a must-ask category is a blocker here (this pipeline has checkpoints), a decision you can detect and roll back is decided and recorded, and everything else is asked at a checkpoint with two or three options, the recommended one as its default.
- When blocked, stop at a checkpoint with the blocker instead of guessing. Default when nobody answers: stop, with the work so far and the blocker in the report.

Tempted to skip a stage or a checkpoint? Read `references/rationalizations.md` first.
