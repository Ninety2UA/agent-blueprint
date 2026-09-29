# Dispatch notes

Loaded on demand from SKILL.md when preparing reviewer inputs (Step 3), starting the reviewers (Step 4), or validating and synthesizing their findings (Step 5).

## Reviewer inputs

For each reviewer, prepare focused inputs that include:
1. The diff or file list to review
2. Relevant project conventions from `docs/context/CONVENTIONS.md`
3. The reviewer's specific focus area
4. The shared calibration rubric: anchored confidence scoring (0/25/50/75/100), remediation tier (safe_auto/gated_auto/advisory/present), and the standard finding format (see `references/review-calibration.md`)
5. **The two-output contract** (see `references/output-contract.md`): each reviewer writes a full-detail JSON artifact to `.agent-blueprint/review-runs/{run_id}/{reviewer_name}.json` and returns a compact merge-tier object to the orchestrator. Detail-tier fields (`why_it_matters`, `evidence`) live in the artifact file only; the compact return omits them so the synthesizer's context stays lean.
6. The `run_id` and `reviewer_name` for the artifact path.

## Input hygiene

**Input hygiene — feed the artifact, not the author's verdict.** Each reviewer's prompt should carry the artifact (diff/files) and the contract it must meet — spec, plan, conventions — and nothing that asserts the work is already correct. Strip the author's own summary of correctness, self-assessment, and "this handles X" claims: they anchor the reviewer toward agreement and turn review into confirmation. Frame each reviewer's job as *disproof* — "find where this violates its contract," not "check whether this looks right." A reviewer who sets out to break the artifact and fails has produced far stronger evidence than one who set out to confirm it and succeeded. This sharpens the per-reviewer adversarial stance each reviewer's prompt file already carries (e.g. code-reviewer treats author claims as "not evidence"); it does not replace it.

## Helper limits

Start all reviewers at once where the host allows it: they are independent, and a parallel swarm finishes in the time of its slowest reviewer. If the host caps concurrent helpers below the swarm size, start them in batches of that size. Reviewers never start helpers of their own (their prompt files say so), so a swarm needs only one level of nesting.

For example, Claude Code no longer caps subagents per session (the 200-subagent total was removed in CLI 2.1.224). What applies now is a concurrency cap of 20 subagents by default (`CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`, 2.1.217) and a nesting depth of 3 by default (`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`, 2.1.219). A single swarm (6-10 reviewers plus the optional validator and synthesizer) stays within the concurrency cap, and running many swarms in one session no longer accumulates against a total.

## What the synthesizer does

The synthesizer will:
- De-duplicate overlapping findings (cross-reviewer fingerprint match)
- Collapse same-persona redundancy (one reviewer flooding with variants)
- Apply premise-dependency chain linking (root + dependents)
- Resolve contradictions (combined finding presenting both perspectives)
- Apply deterministic recommended-action tie-break (Skip > Defer > Apply)
- Read artifact files for detail-tier fields when surfaces need them
- Recommend fix order

## Validation details

The findings-validator re-checks each surviving finding with three questions: is it real in the current code, was it introduced by this diff, and is it not handled elsewhere? It returns validated, rejected or unresolved per finding, with a reason. Its bias is conservative (when in doubt, reject), except on protected subjects (auth, injection, data loss, secrets), where a rejection must quote the refuting line. It is a false-positive backstop, and it is skipped at five findings or fewer because its overhead then exceeds the benefit.
