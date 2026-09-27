---
name: ship-pipeline
description: "Trigger this skill whenever the user wants autonomous end-to-end development with zero checkpoints. Trigger scenarios: 'ship it', 'fire and forget', 'autonomous', 'just build it', 'no checkpoints', 'don't ask me anything, just do it', 'ship', 'autonomous pipeline', 'handle everything yourself', 'I don't want to be involved', 'go end to end', 'build and open a PR', or any request where the user signals they want hands-off execution without review gates. Even if the user doesn't explicitly say 'ship', trigger this skill when they clearly want to hand off a well-defined feature and not be consulted during development. DO NOT TRIGGER when the user wants human oversight or approval between stages (e.g. 'step by step', 'guide me', 'with checkpoints') — use build-pipeline instead. DO NOT TRIGGER for trivial changes touching fewer than 3 files with an obvious approach — use quick-fix instead."
argument-hint: "<feature description> [--swarm] [--iterations N] [--convergence fast|deep|perfect] [--deploy] [--external]"
---

# Ship Pipeline — Autonomous End-to-End

You are executing the fully autonomous development pipeline. Unlike the build-pipeline skill (which stops for user approval between stages), this runs to completion with NO checkpoints. Every decision is made autonomously.

**Announce at start:** "Starting ship pipeline — fully autonomous. No checkpoints. Will deliver a PR when done."

## Parse Arguments

Extract from arguments:
- **Feature description:** Everything that isn't a flag
- **`--swarm`:** Enable parallel work execution via team-execution skill with swarm-style task dispatch (default: off, use orchestrate skill)
- **`--iterations N`:** Max review-improve iterations (default: 3, max: 10)
- **`--convergence fast|deep|perfect`:** Review convergence mode (default: fast)
- **`--external`:** Set by `scripts/ship.sh` — signals this session is managed by the external loop (skip Stop hook activation)

## Intake — route before shipping

Ship only what is a feature. A bug report (something broke, an error to explain) goes to systematic-debugging first; ship the fix only once the root cause is known. A question (how does X work, should we do Y) gets an answer and the run stops: no branch, no PR.

## Pipeline Stages

Execute ALL stages sequentially. Do NOT stop for user input. Make all decisions autonomously.

Decisions follow the decision boundary in executing-plans with one difference: this contract cannot stop, so a CLAUDE.md must-ask category is decided conservatively and appended to `docs/context/DECISIONS.md` under Stage 1's locked-decision rule (the hard stop applies to build-pipeline and autonomous-loop runs).

---

### Stage 0: Initialize Loop & Detect Continuation

Two loop mechanisms exist — the external bash loop (`scripts/ship.sh`) and the internal Stop hook (`ship-loop.sh`). Stage 0 handles both.

#### Continuation detection (both modes)

Check if this is a continuation of a previous ship pipeline run:

1. Check git log on current branch for prior commits from this pipeline
2. Check if a plan file already exists in `docs/plans/` for this feature. A plan found on disk is never run unverified: confirm it describes this feature, then run it through Stage 2c's plan-checker loop before skipping ahead
3. Check for uncommitted changes
4. Check if `.claude/ship-progress.local.md` exists (external loop progress file). If it does:
   - Read its `Feature:` line. Another feature's name means a stale file: delete it and count from zero (no `Feature:` line means this feature).
   - Count its `## Iteration` blocks — `scripts/ship.sh` appends one per pass that ends without `<promise>DONE</promise>`, so the count survives fresh processes and `ship.sh` restarts.
   - **At 20 or more, STOP before Stage 1 regardless of `--max`.** Report what was completed and what failed (Error Recovery format), but keep this file — it is the counter — and name it as the file to delete for a deliberate restart. The ceiling is fixed; `--max` is the user's knob below it.

If continuation detected, **skip to the stage that needs work** — don't redo requirements, planning, or deepening if those artifacts already exist on disk.

#### External mode (`--external` flag is set)

The external `scripts/ship.sh` bash loop manages context-exhaustion restarts by spawning fresh Claude processes. Do NOT create the Stop hook state file — the external loop handles iteration.

Continue to Stage 1 (or resume from detected progress).

#### Interactive mode (`--external` flag is NOT set)

Create the Stop hook state file to guard against premature exit within this session. Write `.claude/ship-loop.local.md`:

```yaml
---
active: true
session_id: "<current-branch-name>"
iteration: 1
max_iterations: 5
completion_promise: "DONE"
---
<paste the full original feature description here, including all flags>
```

- `max_iterations: 5` caps inner restarts to prevent infinite blocking if context is exhausted
- The session_id uses the branch name so other sessions aren't blocked
- If this file already exists with `iteration` > 1, you are in a **continuation session** from a prior Stop hook restart

#### Optional: native `/goal` completion (interactive only, CLI v2.1.139+)

An opt-in overlay only: the `ship-loop.sh` Stop hook remains the guarantee, so continue the pipeline immediately and never wait for a paste. The prompt to emit, the `CLAUDE_CODE_GOAL_CHECKIN_MINUTES=0` opt-out (which also turns off the goal's automatic retries), and the CLI-version notes are in `references/modes-and-reports.md` § Native /goal completion.

---

### Stage 1: Requirements (Auto-Discuss)

Analyze the feature description. If requirements are clear and unambiguous:
- Lock them as decisions
- Skip to Stage 2

If requirements are ambiguous:
- Make reasonable assumptions based on project context (read `docs/context/CONVENTIONS.md`, `docs/context/GOALS.md`)
- Document assumptions as locked decisions
- Proceed — do NOT ask the user

Write locked decisions to `docs/context/DECISIONS.md` (append, don't overwrite).

**Ambiguity Gate — score requirements before proceeding:**

| Dimension | Weight | Question |
|-----------|--------|----------|
| **Scope clarity** | 40% | Is it clear what's in and out of scope? Are boundaries explicit? |
| **Constraint clarity** | 30% | Are technical constraints, dependencies, and limitations stated? |
| **Success criteria clarity** | 30% | Are acceptance criteria specific and testable? |

Rate each dimension 0.0–1.0. Calculate: `clarity = (scope × 0.4) + (constraints × 0.3) + (criteria × 0.3)`

For **brownfield** tasks (modifying existing code), add a 4th dimension — **Context clarity (15%)**: is existing codebase behavior understood? Adjust weights to 35%/25%/25%/15%.

- If clarity **≥ 0.8** → proceed to Stage 2
- If clarity **< 0.8** → make reasonable assumptions for the weakest dimension, append them as locked decisions to `docs/context/DECISIONS.md`, then re-score. If still < 0.8, proceed anyway with assumptions documented (autonomous mode — no user questions).

---

### Stage 2: Plan

#### 2a. Parallel Research

Use the Task tool to dispatch these agents simultaneously:

```
Task("learnings-researcher: Search docs/solutions/ for relevant prior work related to: [feature]. Return findings as bullet points.")

Task("framework-docs-researcher: Gather current documentation for [frameworks involved]. Focus on API patterns, version constraints, and gotchas.")

Task("codebase-context-mapper: Map all files and dependencies affected by: [feature description]. Identify integration points and potential conflicts.")
```

Collect all research results.

#### 2b. Write Plan

Invoke the writing-plans skill and follow it. Incorporate all research findings into the plan. Write the plan to `docs/plans/YYYY-MM-DD-<topic>.md`.

#### 2c. Plan Verification Loop

Use the Task tool to dispatch the **plan-checker** agent to verify the plan. BLOCKING issues are those that prevent implementation (missing dependencies, architectural conflicts, unresolvable ambiguity). If the plan-checker reports BLOCKING issues:

```
for pass in 1..3:
    Fix blocking issues in the plan
    Re-dispatch plan-checker
    if no BLOCKING issues: break
```

If blocking issues persist after 3 passes, STOP the pipeline and report: "Plan verification failed after 3 passes. Remaining blockers: [list]. Use the build-pipeline skill for supervised planning."

#### 2d. Pre-flight danger scan (advisory)

Before execution, scan the verified plan for irreversible operations (deleting data, migrations on shared databases, force-push or history rewrite, publishing or sending anything outside the repo), pushes to a protected branch, and deleting or skipping tests. Route each hit through the decision boundary and record it; the scan never stops the run by itself.

---

### Stage 3: Deepen Plan

Invoke the deepen-plan skill on the plan file. This enriches the plan with parallel research from all configured research agents.

---

### Stage 4: Execute

Both modes dispatch a dedicated **team-lead agent** that coordinates all execution in its own 200K context. The team-lead delegates all implementation to workers, monitors progress, runs integration checks, and reports back. Review is handled by Stage 5 (not the team-lead), so both modes pass `--no-review`.

**Default mode (no `--swarm` flag):**
Invoke the orchestrate skill with the plan file and `--no-review` flag. The team-lead agent groups tasks into dependency-ordered waves and dispatches parallel workers with worktree isolation.

**Swarm mode (`--swarm` flag):**
Invoke the team-execution skill with the plan file and `--no-review` flag. The team-lead agent designs the team structure, spawns teammates, and coordinates execution autonomously (no user approval needed — plan is already verified by plan-checker).

After the team-lead reports execution complete, proceed to Stage 5.

---

### Stage 5: Iterative Review

**Default mode:** Run iterative refinement sequentially.

**Swarm mode (`--swarm` flag):** review and browser testing run as parallel background tasks and their results merge before the convergence check — see `references/modes-and-reports.md` § Swarm-mode review.

**Both modes — iterative refinement parameters:**

Invoke the iterative-refinement skill.

Pass the configured parameters:
- `max_iterations`: from `--iterations` flag (default 3)
- `convergence`: from `--convergence` flag (default `fast`)
- `scope`: all changes on this branch vs main (`git diff main...HEAD`)
- earlier rounds' Skip and Defer decisions, so declined findings are not raised again (iterative-refinement § Declined findings)

If iterative refinement exits without converging per the specified mode (P1 > 0 for `fast`, P1+P2 > 0 for `deep`, any findings > 0 for `perfect`):
- STOP the pipeline
- Report: "Review found unresolved critical issues after [N] iterations. Use the build-pipeline skill to address manually."
- Do NOT create a PR with known critical issues

---

### Stage 6: Compound (Knowledge Capture)

If the implementation involved solving a non-trivial problem:
- Invoke the knowledge-compounding skill to document it in `docs/solutions/`

Skip if the work was straightforward.

---

### Stage 7: Ship It

1. **Final commit** with conventional format:
   ```
   feat(<scope>): <description>
   ```

2. **Create PR** by invoking the pr-workflow skill. The PR description should include:
   - Summary of the feature
   - Plan file reference
   - Review iterations completed and convergence status
   - Test results

   If pr-workflow's plan audit blocks the PR (a NOT DONE or PARTIAL row): STOP the pipeline, report the blocking rows per Error Recovery, clean up loop state, and open no PR — steps 3-6 do not run and no completion signal is emitted.

3. **Deploy check** (if `--deploy` flag): Use the Task tool to dispatch the **deployment-verifier** agent to verify deployment readiness. Report the go/no-go checklist in the completion report.

   ```
   Task("deployment-verifier: Verify deployment readiness for this PR. Check build, tests, security, migrations, configuration, dependencies, rollback plan, and monitoring.")
   ```

4. **Report completion** with the Pipeline Summary table and Quality block from `references/modes-and-reports.md` § Completion report.

5. **Clean up loop state:**
   - Remove `.claude/ship-loop.local.md` if it exists (Stop hook state)
   - Remove `.claude/ship-progress.local.md` if it exists (external loop progress)

6. Output the completion signal (detected by both the Stop hook and `scripts/ship.sh`):
   ```
   <promise>DONE</promise>
   ```

---

## Flags, Running Modes, Comparison

`references/modes-and-reports.md` carries the flags table, the two running modes (interactive `/ship-pipeline` guarded by the Stop hook versus `scripts/ship.sh` with a fresh process per iteration), and the build-pipeline / ship-pipeline / ship.sh comparison table.

## When NOT to Use

- **Unclear requirements** — if you can't describe the feature in one sentence, use build-pipeline with human checkpoints
- **Architectural decisions needed** — if the feature requires choosing between fundamentally different approaches, use discuss + build-pipeline
- **First feature in a new codebase** — conventions aren't established yet; use build-pipeline to set patterns with human oversight
- **Database migrations** — always review migrations manually before applying; use build-pipeline with `--deploy`

## Error Recovery

- If ANY stage fails fatally, STOP immediately and report what was completed and what failed
- **Clean up loop state** — remove `.claude/ship-loop.local.md` and `.claude/ship-progress.local.md` so neither loop mechanism restarts a broken pipeline
- Do NOT try to skip stages or work around failures
- Partial work (plan, branch, code) is preserved for the user to continue with the build-pipeline skill
- If the execution stage fails, do NOT enter the review stage — there's nothing to review

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "The change is well-defined enough — no need for autonomous review iterations" | If the change is *that* well-defined and small, use `/quick-fix`. Ship-pipeline exists for autonomous quality, not autonomous skipping. |
| "I'll prompt for approval mid-pipeline if something feels off" | That's `/build-pipeline`. Adding checkpoints to `/ship-pipeline` defeats the point — fire-and-forget is the contract. |
| "Iteration cap reached, ship it anyway" | Cap-reached without convergence is a NO-GO signal, not a permission slip. Surface findings to the user. |
| "I'll auto-merge after a green review" | Ship-pipeline reviews; the user merges. The pipeline finishes by handing off, not by pushing main. |
| "Reviews are duplicating work between iterations" | Iterations exist *because* fixes introduce regressions. Two passes catch what one missed; you'd find this with measurement, not intuition. |
| "Database migration is small, autonomous is fine" | Never. Migrations always go through `/build-pipeline --deploy` with human review of the migration file. |
