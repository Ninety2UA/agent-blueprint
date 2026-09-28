# Reviewer Output Contract — Two-Tier Schema

When a review swarm runs with many reviewers and findings, the orchestrator's context budget bloats fast. To keep synthesis cheap while preserving full detail for downstream surfaces, every reviewer produces two outputs.

## Two outputs per reviewer

### 1. Artifact file (full detail) — written to disk

Each reviewer writes the **full finding set** as JSON to a workspace path supplied by the orchestrator:

```
.claude/review-runs/{run_id}/{reviewer_name}.json
```

This file contains every required field — the long prose fields (`why_it_matters`, `evidence`) live here, not in the orchestrator's context. If the write fails, continue: the compact return below still provides everything synthesis needs to merge and route.

### 2. Compact return (merge-tier fields only) — returned to the orchestrator

The agent's normal return value carries only the fields synthesis needs to merge, dedupe, and route. Detail-tier fields are **omitted from the return** even though they are required in the artifact file.

| Tier | Fields | Where it goes |
|------|--------|---------------|
| **Merge tier** (always returned) | `title`, `severity`, `file`, `line`, `confidence`, `tier`, `pre_existing`, `suggested_fix` (optional), `requires_verification` | Compact return to orchestrator |
| **Detail tier** (artifact only) | `why_it_matters`, `evidence` | Written to `.claude/review-runs/{run_id}/{reviewer_name}.json` |
| **Top-level** (always returned) | `reviewer`, `residual_risks`, `testing_gaps` | Compact return to orchestrator |

The synthesizer reads the compact return for routing decisions. Walkthrough/headless surfaces that need the long prose fields read the artifact file on demand by `(file, line_bucket(line, ±3), normalize(title))` matching.

## Why the split is load-bearing

With 6+ reviewers × 5+ findings each × full prose, the orchestrator's context can absorb tens of thousands of tokens just to hold the merge state. The split keeps the orchestrator's working set small (routing decisions only) and pushes detail to disk where it can be retrieved by surface-specific lookups.

## Finding schema (full)

```json
{
  "reviewer": "code-reviewer",
  "findings": [
    {
      "title": "User-supplied ID in account lookup without ownership check",
      "severity": "P1",
      "file": "src/api/orders.ts",
      "line": 42,
      "why_it_matters": "Any signed-in user can read another user's orders... [DETAIL TIER — artifact only]",
      "tier": "gated_auto",
      "suggested_fix": "Add current_user.owns?(account) guard before lookup, matching the pattern in shipments controller",
      "confidence": 100,
      "evidence": [
        "src/api/orders.ts:42 -- account = Account.find(params[:account_id])",
        "src/api/shipments.ts:38 -- raise NotAuthorized unless current_user.owns?(account)"
      ],
      "pre_existing": false,
      "requires_verification": true
    }
  ],
  "residual_risks": ["No rate limiting on export endpoint"],
  "testing_gaps": ["No test for concurrent export requests"]
}
```

## Schema constraints — hard

These are validation failures; synthesis rejects non-conforming output:

- `severity`: exactly one of `"P1"`, `"P2"`, `"P3"`. Do NOT use `"high"`, `"medium"`, `"low"`, `"critical"`, even if your prose discusses priorities that way conceptually. If your reasoning uses qualitative priority, translate at emit time.
- `tier`: exactly one of `"safe_auto"`, `"gated_auto"`, `"advisory"`, `"present"`.
- `confidence`: exactly one of `0`, `25`, `50`, `75`, `100`. Float values (e.g. `0.85`) are validation failures.
- `evidence`: an ARRAY of strings with at least one element. A single string value is a validation failure — wrap every quote in `["..."]` even when there is only one.
- `pre_existing`: boolean, never null.
- `requires_verification`: boolean, never null.

## Reviewer rules

- You are operationally read-only. The one permitted write is the artifact file at `.claude/review-runs/{run_id}/{reviewer_name}.json`. Do not edit project files, change branches, commit, push, create PRs, or otherwise mutate the checkout.
- You are a leaf reviewer inside an already-running review-swarm. Do not invoke other skills or agents. Perform your analysis directly and return findings in the required format only.
- If the run id is empty or absent, skip the artifact write entirely — the compact return is sufficient.
- If you find no issues, return an empty `findings` array. Still populate `residual_risks` and `testing_gaps` if applicable.

## Variable substitution at dispatch

The orchestrator passes these variables when spawning each reviewer:

| Variable | Description |
|----------|-------------|
| `{run_id}` | Unique review-run identifier (filename stem for the artifact directory) |
| `{reviewer_name}` | Persona name used as the artifact filename stem |
| `{intent}` | 2-3 line description of what the change is trying to accomplish |
| `{file_list}` | List of changed files |
| `{diff}` | The actual diff content to review |
