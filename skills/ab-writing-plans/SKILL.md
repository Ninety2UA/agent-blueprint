---
name: ab-writing-plans
description: "Turns an approved design or a clear spec into an implementation plan that records decisions, not code: exact file paths, each test and what it asserts, signatures and spec values, dependency order, verification commands, boundaries and a review focus, saved for review before anything runs. Use when an approved design or spec needs breaking into bite-sized executable tasks, when the user asks for a plan or implementation steps, or once ab-brainstorming has an approved design. Not for work with no design yet (ab-brainstorming), executing a plan (ab-executing-plans) or enriching one with research (ab-deepen-plan)."
metadata:
  version: "3.8.0"
---

# Writing Plans

A plan records decisions, not a transcript of the code. For each task it names the files, the test and what it asserts, the signatures and spec values the code must honor, the order, and the command that proves it done. The executor is a skilled engineer who knows little of this codebase, toolset or domain, so supply the context (paths, conventions, contracts, commands) and leave out the code those decisions already determine. Test design is where executors drift most, so the plan settles it: every test is named with the behavior it asserts. DRY, YAGNI, TDD, frequent commits.

**Not for:** no design yet (ab-brainstorming first: a vague idea makes a vague plan); a quick fix under three files with an obvious root cause (ab-quick-fix, no plan); triaging open work (ab-backlog-triage); feasibility research (ab-spike-exploration or ab-deep-research), including a costly-to-reverse choice still open, such as a storage engine, public API shape or vendor, which ab-spike-exploration compares first; a regression (ab-systematic-debugging, then a plan if the fix is non-trivial).

**Working folder.** Blueprint working files live under `.agent-blueprint/` in the project root. Before the first write there, create `.agent-blueprint/.gitignore` with the lines `run/`, `team/`, `review-runs/` and `cache/` if it does not exist yet, so run state stays out of commits while plans and notes stay tracked.

**Provenance record.** When this skill starts, write `.agent-blueprint/run/provenance/<name>.json`, where `<name>` is the `name` in this skill's frontmatter: `skill` (that name), `version` (its `metadata.version`), `started_at` (the current UTC time, ISO 8601) and an empty `helper_steps` list, replacing any older record of that name. If `.agent-blueprint/.gitignore` is missing, create it first with the lines `run/`, `team/`, `review-runs/` and `cache/`. Each Helper step adds its entry to `helper_steps`. The record tells a run, and the smoke test, which skill ran and how; it is not a security control.

Announce at start: "I'm using the ab-writing-plans skill to create the implementation plan." Work in a dedicated worktree where the project uses them, and save the plan to `docs/plans/YYYY-MM-DD-<feature-name>.md`.

## 1. Check the requirements (rigor probes)

Requirements from a probed brainstorming session skip this. Otherwise scan them for five gaps (evidence, specificity, counterfactual, attachment, durability) and ask at most two or three of those questions, in prose rather than as a checklist, skipping any the requirements already answer. The probe table and rules: `references/rigor-probes.md`.

**Asking the user.** Ask with your question tool if you have one, offering at most three options; otherwise ask in plain text with a numbered list. In a headless or unattended run nobody will answer: take the default named below, say so in your output, and log it in the run state's decisions if there is a run state.

Options: answer the probe, refine the requirements first, or plan with the gap open. A real gap pauses planning and sends the user back to the requirements. Default when nobody answers: plan, and write each unanswered probe into the plan as an assumption so its reviewer sees it.

## 2. Write the tasks

Each step is one action with a checkable result: write the failing test `test_x` asserting Y; run it and see it fail for the expected reason; implement `f(a) -> B` in `path/file.py` until it passes; run the project suite and see it green; commit. A step's detail is the decision it pins: the test and its assertions, or the signature, file and spec values. Write a code body only for an algorithm those leave open (a tricky parse, a non-obvious formula); the executor writes the rest against the real code.

Follow `references/plan-format.md` for the header every plan starts with, the task template, verification commands (each testable step gets a runnable command and its expected result, or says plainly that none exists) and the three boundaries lists: Always do, Ask first, Never do.

For each new data flow, trace the shadow paths; give each new service call, external API or database operation an error map, and turn every unhandled path into a task: `references/failure-paths.md`.

When the plan will run in parallel waves (the ab-orchestrate skill), embed the contracts executors need (key types, exports, signatures), and add a "Task 0: Define contracts" when later tasks consume new interfaces: `references/interface-context.md`.

End the plan with `## Review Focus`: at most five inputs or failure modes the spec implies but no task's test exercises yet (the shadow paths and error maps surface them). Give each a test in the task that owns it, and list it so the final reviewer checks it on purpose rather than by luck.

## 3. Review before handoff

- **Step scan**: every step is one action with a checkable result; no step body repeats what its test and signature already determine.
- **Proportion check**: a plan much longer than its spec is usually transcribing code; cut it back to decisions.
- **Review Focus**: present, five items or fewer, each pinned by a test in its owning task.

Tempted to cut a corner? `references/rationalizations.md`.

## 4. Hand off

The user reviews the saved plan before anything runs: approving the design approved the scope, not this plan. Under the ab-ship-pipeline skill, skip the review request and the question, because its plan-checker loop is the review and it chooses execution itself. Otherwise recommend one option with a one-line reason and its cost (for example "Subagent-driven: 4 sequential tasks, one review per task"), and end with "Plan saved to `docs/plans/<filename>.md`; please review it before anything runs. I recommend <option> because <reason>. Which approach?"

**Asking the user.** Ask with your question tool if you have one, offering at most three options; otherwise ask in plain text with a numbered list. In a headless or unattended run nobody will answer: take the default named below, say so in your output, and log it in the run state's decisions if there is a run state.

Options:

1. **Deepen the plan** with the ab-deepen-plan skill: parallel research helpers add best practices, prior solutions and framework docs to each section. Afterwards, offer options 2 and 3 again.
2. **Subagent-driven, in this session**, with the ab-subagent-driven-development skill: a fresh helper per task and a code review between tasks. Good for hands-on oversight.
3. **Team work** with the ab-orchestrate skill and the plan path: from the main session it runs dependency-ordered waves through a task ledger, each helper owning its files and the lead committing, with a native team feature (such as Claude Code Agent Teams) where one is switched on. Fastest for plans with concurrent tasks.

Default when nobody answers: stop with the plan saved and your recommendation stated, and start nothing, since no one has reviewed the plan; a pipeline that called this skill goes on to its own plan check.
