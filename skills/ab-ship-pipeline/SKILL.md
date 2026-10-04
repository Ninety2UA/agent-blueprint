---
name: ab-ship-pipeline
description: "Ships a feature end to end with no checkpoints: recorded assumptions, a verified and deepened plan, execution through ab-orchestrate, review until it converges, then commits and a PR body, tracked in .agent-blueprint/run/state.json. Use when the user wants a well-defined feature built hands-off, fire and forget, through to a pull request. Not for work the user approves stage by stage (ab-build-pipeline) or a change under three files (ab-quick-fix)."
argument-hint: "<feature description> [--swarm] [--iterations N] [--convergence fast|deep|perfect] [--deploy] [--external]"
metadata:
  version: "4.0.0"
---

# Ship Pipeline — Autonomous End-to-End

Run every stage below in order without stopping for the user, who asked not to be consulted: each decision is made here and recorded. The run ends when its state file (below) says `done`, or `blocked` or `needs-human` with a `reason`.

Announce at start: "Starting ship pipeline: autonomous, no checkpoints, a PR at the end."

**Working folder.** Blueprint working files live under `.agent-blueprint/` in the project root. Before the first write there, make sure `.agent-blueprint/.gitignore` exists and lists `run/`, `team/`, `review-runs/`, `cache/` and `.gitignore`, so run state and the ignore file itself stay out of commits while plans and notes stay tracked.

**Provenance record.** When this skill starts, write `.agent-blueprint/run/provenance/<name>.json`, where `<name>` is the `name` in this skill's frontmatter: `skill` (that name), `version` (its `metadata.version`), `started_at` (the current UTC time as a literal ISO 8601 value, e.g. `2026-10-04T13:59:00Z`) and an empty `helper_steps` list, replacing any older record of that name. The Working folder step above has already made sure of `.agent-blueprint/.gitignore`. Each Helper step adds `{step, path: helper|inline}` to `helper_steps`. The record tells a run, and the smoke test, which skill ran and how; it is not a security control.

## Run state

`references/run-state.md` is the contract for `.agent-blueprint/run/state.json`. Write the file whole (a temporary file in the same folder, renamed over the old one) at start, once Stage 0 has read any earlier one, and at every stage change, with every field: `status`, `stage`, `iteration`, `host`, `driver`, `session_id`, `decisions`, `provenance`, `reason`, `updated_at`.

- `driver`: `runner` when `AGENT_BLUEPRINT_RUNNER` is `1` or `--external` was passed, else `interactive`.
- `stage`: `continuation` (Stage 0), `plan` (1–3), `execute` (4), `review` (5–6), `verify` (7 to its plan audit), `ship` (the rest).
- `decisions`: each default taken without asking (assumptions, must-ask choices, danger-scan hits).
- `provenance`: `ab-ship-pipeline` and this file's `metadata.version`. `session_id`: the host's, else the branch name fitted to the pattern.

Leave every run file in place, on failure too, and set `status` instead: only the ship runner cleans up.

## Arguments

Everything that is not a flag is the feature description. The flags are in `references/modes-and-reports.md` § Flags Reference; `--external` equals `AGENT_BLUEPRINT_RUNNER=1`. The external loop is `scripts/run.sh` in this skill's folder (`references/modes-and-reports.md` § External loop): when a feature may outgrow one context window, print `bash <folder>/scripts/run.sh --host <host> "<feature>"` with its absolute path.

## Pipeline Stages

### Stage 0: Initialize Loop & Detect Continuation

Ship only a feature: route the request with `references/stages.md` § Intake, then run `references/stages.md` § Continuation checks, and skip to the stage that needs work. At an `iteration` of 20 or more, stop before Stage 1 as `blocked`, the ceiling as `reason`; state.json keeps the count; only the runner or the user clears `.agent-blueprint/run/` for a restart, never this skill.

### Stage 1: Requirements (Auto-Discuss)

Lock clear requirements as decisions; where they are ambiguous, lock reasonable assumptions from `docs/context/CONVENTIONS.md` and `docs/context/GOALS.md` instead of asking. Other decisions follow the ab-executing-plans skill's decision boundary, except that a must-ask category from the project instructions file is decided conservatively and locked the same way. Append decisions to `docs/context/DECISIONS.md` (append, don't overwrite) and score the requirements with `references/stages.md` § Ambiguity gate.

### Stage 2: Plan

- **2a.** Research: `references/stages.md` § Research.
- **2b.** Invoke the ab-writing-plans skill with the findings; the plan goes to `docs/plans/YYYY-MM-DD-<topic>.md`.
- **2c.** Verify it: `references/stages.md` § Plan check. Blockers left after 3 passes stop the run as `blocked`, reported as that section says.
- **2d.** Danger scan: `references/stages.md` § Danger scan.

### Stage 3: Deepen Plan

Invoke the ab-deepen-plan skill on the plan file.

### Stage 4: Execute

Invoke the ab-orchestrate skill with the plan file, the `--no-review` flag and autonomous mode, in both modes (with or without `--swarm`). Plan-checker verified the plan; review is Stage 5's job. If its report shows a task not done or a failed integration, stop as `blocked` naming them: partial work is not reviewed.

### Stage 5: Iterative Review

**No-commit mode.** When the environment variable `AGENT_BLUEPRINT_GIT_WRITABLE` is `0`, or a commit fails because `.git` is read-only, make no commits: leave the changes in the working tree and add the commit message you would have used to `.agent-blueprint/run/commit-msg.md`, and the ship runner commits them after the session. A review step in this mode reviews the working tree and untracked files against the merge base instead of a commit range.

Invoke the ab-iterative-refinement skill (with `--swarm`, alongside browser testing: `references/modes-and-reports.md` § Swarm-mode review), passing `max_iterations` (`--iterations`, default 3), `convergence` (`--convergence`, default `fast`), `scope` (this branch against its merge base with the default branch, or in no-commit mode the working tree) and earlier rounds' Skip and Defer decisions, so declined findings stay declined (ab-iterative-refinement Step 2a).

If it ends without converging (P1 > 0 for `fast`, P1+P2 > 0 for `deep`, any finding for `perfect`), stop as `blocked`: "Review found unresolved critical issues after [N] iterations. Use the ab-build-pipeline skill to address manually." Write no PR body: a PR claims the work is ready.

### Stage 6: Compound (Knowledge Capture)

If the work solved a non-trivial problem, invoke the ab-knowledge-compounding skill to document it in `docs/solutions/`.

### Stage 7: Ship It

1. **Commit** what is still uncommitted as `feat(<scope>): <description>` (in no-commit mode, into `commit-msg.md`).
2. **PR body.** Write it to `.agent-blueprint/run/pr-body.md`, the one path the runner publishes, per `references/stages.md` § PR body. A blocking plan audit stops the run as `blocked`, with nothing published.
3. **Deploy check** (with `--deploy`): `references/stages.md` § Deploy check.
4. **Finish.** Driver `runner`: with the commits (or `commit-msg.md`) and `pr-body.md` in place, set `done`; the runner scans for secrets, pushes and opens the PR. Driver `interactive`: scan the outgoing range and `pr-body.md` for secrets, then publish, per `references/stages.md` § Publish; set `done` after.
5. **Report** per `references/modes-and-reports.md` § Completion report, and stop.

## Error Recovery

If a stage fails fatally, stop at once: report what was completed and what failed, and set `blocked` (or `needs-human` when only a person can unblock it) with a `reason` saying what would, so neither the runner nor the Stop hook restarts a broken pipeline. Do not skip a stage or work around a failure, because the PR would then claim checks that never ran; partial work (plan, branch, code) stays for the ab-build-pipeline skill. After a failed execution there is nothing to review.
