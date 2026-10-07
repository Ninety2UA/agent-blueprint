---
name: ab-build-pipeline
description: "Trigger this skill for any feature development, multi-step work, or when the user wants guided development with human checkpoints between stages. Trigger scenarios: 'build a feature', 'full pipeline', 'supervised', 'step by step', 'with checkpoints', 'guide me through building', 'build', 'supervised pipeline', 'I want to review between steps', 'walk me through this', 'let me approve each stage', or any multi-file change where the user implies they want oversight or involvement in the process. Even if the user doesn't explicitly ask for checkpoints, trigger this skill when they describe a non-trivial feature and seem to want collaboration or guidance rather than fire-and-forget execution. DO NOT TRIGGER when the user wants fully autonomous or fire-and-forget execution (e.g. 'ship it', 'just do it', 'no checkpoints') — use ab-ship-pipeline instead. DO NOT TRIGGER for trivial changes touching fewer than 3 files with an obvious approach — use ab-quick-fix instead."
argument-hint: "<feature description> [--quick] [--iterate N] [--deploy] [--team]"
---

# Build Pipeline — Full-Cycle Development

You are executing the full-cycle development pipeline. This chains together multiple skills into an autonomous workflow with review checkpoints between each stage.

**Announce at start:** "Starting the build pipeline — full-cycle development from requirements to verified code."

## When NOT to Use

- **Trivial change (< 3 files, obvious root cause)** — use `ab-quick-fix`; the pipeline is overhead.
- **Fully autonomous, no human checkpoints** — use `ab-ship-pipeline`; ab-build-pipeline exists *because* of the checkpoints.
- **Pure refactor without behavior change** — use `ab-iterative-refinement` directly against the diff.
- **You only need a plan, not execution** — use `ab-writing-plans` and stop there.
- **Deep research or feasibility check** — use `ab-deep-research` or `ab-spike-exploration` before entering the pipeline.

## Pipeline Stages

Execute these stages IN ORDER. Do not skip stages. Stop between stages for user feedback.

### Stage 1: Discuss (Decision Capture)

Invoke the ab-discuss skill. Capture user decisions BEFORE planning.

If the user has already provided clear, unambiguous requirements, summarize them as locked decisions and ask: "These are the locked decisions I'll plan around. Confirm or adjust?"

**Ambiguity Gate — score requirements before proceeding:**

| Dimension | Weight | Question |
|-----------|--------|----------|
| **Scope clarity** | 40% | Is it clear what's in and out of scope? Are boundaries explicit? |
| **Constraint clarity** | 30% | Are technical constraints, dependencies, and limitations stated? |
| **Success criteria clarity** | 30% | Are acceptance criteria specific and testable? |

Rate each dimension 0.0–1.0. Calculate: `clarity = (scope × 0.4) + (constraints × 0.3) + (criteria × 0.3)`

For **brownfield** tasks (modifying existing code), add **Context clarity (15%)** and adjust weights to 35%/25%/25%/15%.

- If clarity **≥ 0.8** → proceed to Stage 2
- If clarity **< 0.8** → use AskUserQuestion to clarify the weakest dimension before proceeding

### Stage 2: Brainstorm (Design)

Invoke the ab-brainstorming skill. Follow it exactly.

Explore 2-3 design alternatives. Present trade-offs. Get user approval before proceeding.

### Stage 3: Plan (Implementation Steps)

Before planning, use the Task tool to dispatch research agents in parallel:

```
Task("learnings-researcher: Search docs/solutions/ for relevant prior work related to: [feature]. Return findings as bullet points.")

Task("framework-docs-researcher: Gather current documentation for [frameworks involved]. Focus on API patterns, version constraints, and gotchas.")

Task("codebase-context-mapper: Map all files and dependencies affected by: [feature description]. Identify integration points and potential conflicts.")
```

Incorporate findings into the plan.

Invoke the ab-writing-plans skill. Convert the approved design into actionable steps.

After the plan is written, use the Task tool to dispatch the **plan-checker** agent:

```
Task("plan-checker: Verify the implementation plan at [plan file path]. Report BLOCKING issues only.")
```

Fix any BLOCKING issues (issues that prevent implementation: missing dependencies, architectural conflicts, unresolvable ambiguity) before proceeding.

Get user approval of the plan.

### Stage 4: Execute (Implementation)

Choose the execution method based on plan complexity:

**Default (< 4 tasks or all sequential):**
Invoke the ab-executing-plans skill. Execute the plan in batches with checkpoints.

**For complex plans (4+ tasks with mixed dependencies):**
Invoke the ab-orchestrate skill with `--no-review`. This dispatches a team-lead agent that coordinates wave-based parallel execution. Review is handled by Stage 5, not the team-lead.

**For collaborative work (user requests `--team`):**
Invoke the ab-team-execution skill with `--no-review`. This dispatches a team-lead agent that spawns teammates for collaborative implementation. Review is handled by Stage 5.

### Stage 5: Review (Quality Check)

Invoke the ab-review-swarm skill to dispatch the full review agent swarm in parallel. This dispatches all configured review agents (code-reviewer, security-sentinel, performance-oracle, code-simplicity-reviewer, convention-enforcer, test-coverage-reviewer, plus conditional agents based on changes), then synthesizes findings via the findings-synthesizer.

Address all P1 (critical) and P2 (important) findings before proceeding. Use ab-resolve-in-parallel to fix independent findings (different files, no shared state) concurrently.

### Stage 6: Verify (Completion)

Invoke the ab-verification-before-completion skill.

Run all tests. Verify all acceptance criteria from the plan are met. Confirm no regressions.

### Stage 7: Deploy Check (Optional)

If the user requested `--deploy`:

Invoke the ab-deployment-verification skill. Dispatch the **deployment-verifier** agent to check all 8 verification areas.

Only proceed with deployment if the verdict is GO or CONDITIONAL GO. If NO-GO, stop and report the blocking issues.

### Stage 8: Compound (Knowledge Capture)

If the implementation involved solving a non-trivial problem (debugging, framework gotcha, architectural decision) whose lesson the code and tests don't already preserve, invoke the ab-knowledge-compounding skill to document it in `docs/solutions/`. This makes the solution searchable for future planning.

Skip this stage if the work was straightforward with no novel insights. See the ab-knowledge-compounding skill for detailed guidance on what qualifies as non-trivial.

## Checkpoints

Between EVERY stage, report what was accomplished and ask: "Ready to proceed to [next stage]?"

The user can:
- **Approve** and continue to the next stage
- **Request changes** to the current stage's output
- **Skip** a stage (only if they explicitly say so)
- **Stop** the pipeline (work so far is preserved)

## Iterate Mode

If the user specifies `--iterate N` (where N is 1-10):
- Replace the single-pass Stage 5 (Review) with the ab-iterative-refinement skill
- Pass `max_iterations: N` and `convergence: fast` to the ab-iterative-refinement skill
- The review→fix→review cycle runs up to N times until P1 findings reach zero
- All other stages remain the same with normal checkpoints

Example: `--iterate 5` runs the standard pipeline but reviews and fixes up to 5 times.

This can be combined with other flags: `--quick --iterate 3`

## Quick Mode

If the user specifies `--quick` or the change is small (< 3 files, clarity ≥ 0.8 per the Ambiguity Gate):
- Skip Stage 1 (Discuss) and Stage 2 (Brainstorm)
- Go directly to Plan → Execute → Review → Verify

## When Things Go Wrong

- If a stage fails, do NOT skip to the next stage
- Use the ab-systematic-debugging skill if you encounter bugs during execution
- If blocked, stop and ask for help — don't guess
- Decide or ask per the decision boundary in ab-executing-plans: a must-ask category stops here (this pipeline has checkpoints), a decision you can detect and roll back is decided and recorded, and everything else is asked with two or three options
- If review finds critical issues, return to Stage 4 to fix them before Stage 6

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "Stage 5 review is overkill, the code looks right" | Review is the discipline; "looks right" is the heuristic that produced the bug. Run it. |
| "I'll skip the brainstorm — requirements are clear" | If requirements are clear AND the change is small, use `--quick`. Otherwise, brainstorm. Skipped brainstorms are how features ship the wrong shape. |
| "I'll batch through stages without checkpoints" | That's `ab-ship-pipeline`. `ab-build-pipeline` exists *because* checkpoints catch misalignment cheaply. Strip them and you've made the wrong tool. |
| "The user approved Stage 1, so Stage 4 changes are pre-approved" | Approval is per-stage. Plan changes mid-execution need a fresh checkpoint. |
| "Tests fail but the build is otherwise complete" | Stage 6 (Verify) blocks the pipeline. Failing tests at the gate means the previous stages weren't actually done. |
| "I'll defer the compound stage" | Stage 8 captures learnings while context is hot. Deferred to "later" means lost. 60 seconds now beats reconstructing it next sprint. |
