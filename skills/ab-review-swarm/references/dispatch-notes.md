# Dispatch notes

Loaded on demand from SKILL.md when preparing reviewer inputs (Step 3), starting the reviewers (Step 4), or validating their findings (Step 5).

## Reviewer inputs

For each reviewer, prepare focused inputs that include:
1. The diff or file list to review
2. Relevant project conventions from `docs/context/CONVENTIONS.md`
3. The reviewer's specific focus area
4. The shared calibration rubric: anchored confidence scoring (0/25/50/75/100), remediation tier (safe_auto/gated_auto/advisory/present), and the standard finding format (see `references/review-calibration.md`)
5. **The two-output contract** (see `references/output-contract.md`): each reviewer writes a full-detail JSON artifact to `.agent-blueprint/review-runs/{run_id}/{reviewer_name}.json` and returns a compact merge-tier object to the orchestrator. Detail-tier fields (`why_it_matters`, `evidence`) live in the artifact file only; the compact return omits them so the synthesizer's context stays lean.
6. The `run_id` and `reviewer_name` for the artifact path.

## Before the reviewers start

- **Clear what you already know first.** When the change is this session's own work in progress, fix the problems you already know about in it (a failing check the project declares, a lint error, a TODO you left), and run the declared checks, so the reviewers spend their findings on what you could not see. In a commit range, commit the fixes, then take the range again from the new `HEAD` and rebuild the reviewers' inputs before the check below; in no-commit mode or an uncommitted-changes scope, leave them in the tree, where the review reads them. Skip this for a pull request or a range the session did not write, and for code the user plans to discard: there the swarm reports and edits nothing.
- **Review a clean tree at the reviewed head.** In commit-range mode, before any reviewer reads a file or runs a command, check that `HEAD` is the head of the range under review and that no file the range touches, plans under `docs/plans/` aside, has uncommitted changes (from the repository root, `git diff --name-only -z <base> <head> -- . ':(exclude)docs/plans' | xargs -0 -r git status --short --` prints nothing), and name that commit in the report. Reviewers and the validator read files on disk, so uncommitted edits from another session, or a checkout of another branch, would make them confirm or reject findings against code the range does not contain. Other files may stay dirty (a plan's ticks, `.agent-blueprint/`). If the check fails, stop and say which. No-commit mode reviews the working tree on purpose and skips this check.
- **Change nothing while they read.** Make no edit to the working tree from the moment the first reviewer starts until the last one returns: a finding must point at the code the reviewer saw.

## Input hygiene

**Input hygiene — feed the artifact, not the author's verdict.** Each reviewer's prompt should carry the artifact (diff/files) and the contract it must meet — spec, plan, conventions — and nothing that asserts the work is already correct. Strip the author's own summary of correctness, self-assessment, and "this handles X" claims: they anchor the reviewer toward agreement and turn review into confirmation. Frame each reviewer's job as *disproof* — "find where this violates its contract," not "check whether this looks right." A reviewer who sets out to break the artifact and fails has produced far stronger evidence than one who set out to confirm it and succeeded. This sharpens the per-reviewer adversarial stance each reviewer's prompt file already carries (e.g. code-reviewer treats author claims as "not evidence"); it does not replace it.

## Helper limits

Start all reviewers at once where the host allows it: they are independent, and a parallel swarm finishes in the time of its slowest reviewer. If the host caps concurrent helpers below the swarm size, start them in batches of that size. Reviewers never start helpers of their own (their prompt files say so), so a swarm needs only one level of nesting.

For example, Claude Code no longer caps subagents per session (the 200-subagent total was removed in CLI 2.1.224). What applies now is a concurrency cap of 20 subagents by default (`CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`, 2.1.217) and a nesting depth of 3 by default (`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`, 2.1.219). A single swarm (6-10 reviewers plus the optional validator and synthesizer) stays within the concurrency cap, and running many swarms in one session no longer accumulates against a total.

## Missing or failed reviewers

Before validation, check every reviewer you started against its compact return. A reviewer whose return is missing, does not parse, or lacks `reviewed: true` has not covered its focus: an empty list from a reviewer that never saw the diff is not a clean result. Any findings it did return still go to validation. Start each such reviewer once more with the same inputs. Pass the names that still fail to the synthesizer as the "not reviewed" list, with the reason each gave.

A loop that runs the swarm (ab-iterative-refinement, the ship pipeline's review stage) cannot count a round as converged while any reviewer is on that list. When one of them was selected for a protected subject (security-sentinel, data-integrity-guardian), the report also lists it under Unresolved with a human owner.

## Validation details

The findings-validator re-checks each surviving finding with three questions: is it real in the current code, was it introduced by this diff, and is it not handled elsewhere? It returns validated, rejected or unresolved per finding, with a reason. Its bias is conservative (when in doubt, reject), except on protected subjects (auth, injection, data loss, secrets), where a rejection must quote the refuting line. It is a false-positive backstop.
