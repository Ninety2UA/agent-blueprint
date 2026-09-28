---
name: ab-review-swarm
description: "Trigger this skill when the user says 'review swarm', 'full review', 'multi-agent review', 'comprehensive review', 'review everything', 'thorough review', or wants code reviewed from multiple perspectives simultaneously. Trigger even when the user just says 'review' if the changes are significant (touching 5+ files, multiple concerns like security + performance + quality, or crossing module boundaries) or consequential regardless of size (auth, money, data, a public contract, anything that would fail silently rather than at the change site) — a single reviewer cannot catch everything in large changesets. Also trigger when shipping a feature to production or before a major merge where missing issues would be costly. Dispatches 6-10 specialized review agents in parallel (security, performance, simplicity, conventions, tests, code quality), then synthesizes findings into one prioritized P1/P2/P3 report. DO NOT TRIGGER for a quick single-perspective review of small changes — use ab-requesting-code-review instead."
argument-hint: "[optional: specific files or scope to review]"
---

# Review Swarm — Multi-Agent Parallel Review

Dispatch a swarm of specialized review helpers in parallel, then synthesize their findings into one prioritized report.

**Announce at start:** "Starting review swarm — dispatching specialized reviewers in parallel."

## Step 1: Determine Scope

Identify what to review:
- If arguments specify files or scope, use that
- Otherwise, review uncommitted changes (`git diff` plus untracked files from `git ls-files --others --exclude-standard`) or the last commit (`git diff HEAD~1`)
- For a PR or branch review, diff from the merge base: `git diff $(git merge-base origin/main HEAD)..HEAD` (the three-dot `origin/main...HEAD` is the same range), never a two-dot range against bare `origin/main`, which shows main's newer files as phantom deletions. If the range is empty or the base is not an ancestor of HEAD, stop and report the range instead of reviewing nothing

## Step 2: Select Reviewers (Conditional Activation)

Check if `blueprint.local.md` exists in the project root. If it does, read the `review-agents` list from its YAML frontmatter to determine which helpers to dispatch. If it doesn't exist, use the default activation rules below.

### Always-On Reviewers (dispatched every time)

| Helper | Focus |
|-------|-------|
| **code-reviewer** | Plan alignment, code quality, architecture |
| **code-simplicity-reviewer** | YAGNI, over-engineering, unnecessary complexity |
| **test-coverage-reviewer** | Test quality and behavioral coverage |

### Conditional Reviewers (activated by content signals)

Scan the diff/files to determine which conditional reviewers to activate. A reviewer activates when ANY of its signals are present.

| Helper | Activation Signals | Skip When |
|-------|-------------------|-----------|
| **security-sentinel** | Diff touches auth, sessions, tokens, passwords, API keys, user input handling, SQL/ORM queries, file uploads, CORS config, or environment variables | Pure styling/docs changes |
| **performance-oracle** | Diff touches database queries, loops over collections, API endpoints, caching logic, or file I/O; OR diff is 200+ lines (large changes have hidden perf implications) | < 50 lines touching only UI/tests |
| **convention-enforcer** | Diff introduces new files, new patterns, or touches config/build files; OR diff modifies 5+ files (cross-cutting changes need convention checks) | Single-file bug fix following existing patterns |
| **frontend-reviewer** | Diff contains CSS, HTML templates, JSX/TSX components, style imports, responsive/a11y attributes, or browser API usage | No frontend files in diff |
| **architecture-strategist** | Diff adds new services, modules, or API endpoints; modifies dependency injection; changes directory structure; OR introduces new abstractions | Bug fix within existing architecture |
| **data-integrity-guardian** | Diff contains migration files, schema changes, model validations, data transformation logic, or bulk operations | No data layer changes |
| **schema-drift-detector** | Diff modifies schema.rb, migration files, or ORM model definitions | No schema-related files |

### Activation Process

1. Read the diff (from Step 1)
2. For each conditional reviewer, check its activation signals against the diff
3. Log which conditional reviewers are activated and why: "Activating security-sentinel: diff touches `src/auth/`"
4. Log which conditional reviewers are skipped: "Skipping frontend-reviewer: no frontend files in diff"
5. Combine always-on + activated conditional reviewers = final dispatch list

**Override:** `--full` flag dispatches ALL helpers regardless of activation signals.

## Step 3: Prepare Review Context

Generate a `run_id` for this review (timestamp-based or short UUID): `review-YYYYMMDD-HHMMSS`. Create `.claude/review-runs/{run_id}/` if it does not exist.

For each helper, prepare focused inputs that include:
1. The diff or file list to review
2. Relevant project conventions from `docs/context/CONVENTIONS.md`
3. The helper's specific focus area
4. The shared calibration rubric: anchored confidence scoring (0/25/50/75/100), remediation tier (safe_auto/gated_auto/advisory/present), and the standard finding format (see `references/review-calibration.md`)
5. **The two-output contract** (see `references/output-contract.md`): each reviewer writes a full-detail JSON artifact to `.claude/review-runs/{run_id}/{reviewer_name}.json` AND returns a compact merge-tier object to the orchestrator. Detail-tier fields (`why_it_matters`, `evidence`) live in the artifact file only; the compact return omits them so the synthesizer's context stays lean.
6. The `run_id` and `reviewer_name` for the artifact path.

**Input hygiene — feed the artifact, not the author's verdict.** Each reviewer's prompt should carry the artifact (diff/files) and the contract it must meet — spec, plan, conventions — and nothing that asserts the work is already correct. Strip the author's own summary of correctness, self-assessment, and "this handles X" claims: they anchor the reviewer toward agreement and turn review into confirmation. Frame each reviewer's job as *disproof* — "find where this violates its contract," not "check whether this looks right." A reviewer who sets out to break the artifact and fails has produced far stronger evidence than one who set out to confirm it and succeeded. This sharpens the per-reviewer adversarial stance each reviewer's prompt file already carries (e.g. code-reviewer treats author claims as "not evidence"); it does not replace it.

## Step 4: Dispatch All Helpers in Parallel

Dispatch all selected helpers simultaneously.

**Helper step.** Start a helper (subagent) for this step if you can, with the prompt file named below (its absolute path when the helper can read it, else its full text) and the listed inputs; leave its model and effort at the session's. If you cannot start one, follow the prompt file yourself. Either way, return its Output section, and note which path ran in the run's provenance record if there is one.

Prompts: `references/agents/<reviewer>.md` for each selected reviewer. Inputs for each: the scope, `run_id={run_id}`, the diff/files, the Step 3 context, its focus (security-sentinel: security issues; performance-oracle: performance issues; code-reviewer: the plan and standards; and so on), and, per `references/output-contract.md`, to write full findings to `.claude/review-runs/{run_id}/<reviewer>.json` and return the compact merge-tier object.

**Important:** Dispatch ALL helpers at once to maximize parallelism.

**Session cap:** Claude Code no longer caps subagents per session (the 200-subagent total was removed in CLI 2.1.224). What applies now is a concurrency cap of 20 subagents by default (`CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`, 2.1.217) and a nesting depth of 3 by default (`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`, 2.1.219). A single swarm (6-10 reviewers plus the optional validator/synthesizer) stays within the concurrency cap; a reviewer that spawns its own helpers counts against the depth-3 default, and running many swarms in one session no longer accumulates against a total.

## Step 5: Collect, Validate, Synthesize

When all reviewers return, the flow has two synthesis stages:

### 5a: Independent validation (optional, recommended for >5 findings)

Dispatch the **findings-validator** helper with the merged compact returns. The validator does an independent re-verification per surviving finding (3 questions: real in current code? introduced by this diff? not handled elsewhere?) and returns validated, rejected, or unresolved per finding with a reason. Conservative bias — when in doubt, reject — except on protected subjects (auth, injection, data loss, secrets), where a rejection must quote the refuting line.

**Helper step.** Start a helper (subagent) for this step if you can, with the prompt file named below (its absolute path when the helper can read it, else its full text) and the listed inputs; leave its model and effort at the session's. If you cannot start one, follow the prompt file yourself. Either way, return its Output section, and note which path ran in the run's provenance record if there is one.

Prompt: `references/agents/findings-validator.md`. Inputs: the merged finding list, the diff, and `run_id={run_id}`; it validates these findings against the diff.

This step is an FP backstop. Rejected findings are dropped before synthesis. **Unresolved** findings (a protected subject the validator could neither confirm nor refute) are never dropped: pass them to the synthesizer marked unresolved, and they reach the report as advisory with a human owner. Skip when the swarm produced ≤5 findings (validator overhead exceeds the benefit on small sets).

### 5b: Synthesis

Dispatch the **findings-synthesizer** helper with the validated outputs.

**Helper step.** Start a helper (subagent) for this step if you can, with the prompt file named below (its absolute path when the helper can read it, else its full text) and the listed inputs; leave its model and effort at the session's. If you cannot start one, follow the prompt file yourself. Either way, return its Output section, and note which path ran in the run's provenance record if there is one.

Prompt: `references/agents/findings-synthesizer.md`. Inputs: the validated finding list, `run_id={run_id}`, and the artifacts at `.claude/review-runs/{run_id}/`; it synthesizes them into one prioritized report.

The synthesizer will:
- De-duplicate overlapping findings (cross-reviewer fingerprint match)
- Collapse same-persona redundancy (one reviewer flooding with variants)
- Apply premise-dependency chain linking (root + dependents)
- Resolve contradictions (combined finding presenting both perspectives)
- Apply deterministic recommended-action tie-break (Skip > Defer > Apply)
- Read artifact files for detail-tier fields when surfaces need them
- Recommend fix order

## Step 6: Present Results

Present the synthesized report to the user. Highlight:
- P1 count (must fix before merge)
- P2 count (should fix)
- P3 count (suggestions)

**If actionable findings (gated_auto + manual + advisory) exceed 5**, load `references/walkthrough.md` and offer per-finding walkthrough mode instead of a bulk fix dispatch — per-item decisions don't fit a numbered list at high volume.

For ≤5 findings, ask: **"Would you like me to resolve these findings? I can dispatch helpers in parallel to fix independent issues."**

If the user says yes (and finding count ≤5), read and invoke the ab-resolve-in-parallel skill to fix independent findings concurrently. For >5 findings, route through the walkthrough.

## Quick Reference

| Usage | Behavior |
|-------|----------|
| Default | Review uncommitted changes or last commit |
| `--pr` | Review all changes on current branch vs main |
| `src/auth/` | Review only files in src/auth/ |
| `--full` | Dispatch ALL helpers including optional ones |
