# Per-Finding Walkthrough Mode

Loaded on demand from SKILL.md when the synthesizer returns more than 5 actionable findings (present + gated_auto + advisory) and the user wants per-item judgment rather than bulk action.

Walkthrough is a **decision loop, not a pair-programming surface**. The user picks one of three preset actions per finding, or hands the rest over to auto-resolve; freeform fix authoring belongs outside the flow.

## When to use vs. bulk action

| Finding count | Surface |
|--------------|---------|
| **0 actionable** | Skip routing question; emit completion report directly |
| **1-5 actionable** | Bulk preview grouped by action class + Proceed/Cancel gate |
| **>5 actionable** | Walkthrough (this mode) — per-item decisions don't fit bulk preview |

Mixing the two — a numbered list with per-row options — looks dense and efficient until volume hits, then breaks. Pick a modality and commit.

## Entry

The walkthrough receives, from the synthesizer:

- The merged findings list in severity order (P1 → P2 → P3), filtered to present and gated_auto findings that survived the synthesis confidence gate. Advisory findings are included when surfaced for acknowledgment.
- The recommended_action per finding (already normalized by the synthesizer's tie-break — see `references/agents/findings-synthesizer.md` Step 2.8).
- The run_id for artifact lookups at `.agent-blueprint/review-runs/{run_id}/{reviewer}.json`.

Each finding's recommended action has been pre-computed by synthesis. The walkthrough surfaces it but does not recompute.

## Per-finding presentation

Each finding presents in two parts: a **terminal output block** (markdown) and a **question**. Keep them apart: the terminal block carries the explanation and the question carries the decision, and a question stuffed with explanation is hard to answer.

### Terminal output block (print before firing the question)

Render as markdown. Labels on their own line, blank lines between sections:

```
## Finding {N} of {M} — {severity} {plain-English title}

{file}:{line}

**What's wrong**

{plain-English problem statement from why_it_matters in artifact file}

**Proposed fix**

{suggested_fix — rendered per substitution rules below: prose-first, intent language}

**Why it works**

{short reasoning, grounded in a codebase pattern when available}

{Conflict context line, when reviewers disagreed}
```

### suggested_fix substitution rules

The walkthrough renders intent, not syntax. The fixer subagent owns the exact code; the walkthrough just needs enough for the user to trust or reject the action.

- **Default — one sentence describing the effect.** What does the fix achieve, and where does it live? Prefer intent language over quoted code.
  - ✅ `Throw on non-2xx response before parsing JSON.`
  - ✅ `` Replace `==` with `===` on line 42. ``
  - ✅ `Extract the request-building logic into a helper and call it from both sites.`
  - ❌ `` Add `if (!response.ok) throw new Error(`HTTP ${response.status}`);` after the `await fetch(...)` call. `` — multiple code spans, full statement quoted; renders broken.
- **Code-span budget: at most 2 inline backtick spans per sentence**, each a single identifier, operator, or short phrase. Full statements, template literals and code needing nested backticks render broken, so leave them out.
- **Leave a space before and after every backtick span.** Without it, the terminal's markdown renderer eats the delimiters.
- **Raw code block — only for short (≤5 line) genuinely additive new code** where no before-state exists.
- **Summary + artifact pointer** — when prose can't capture the fix: one-sentence transformation + key symbol/location + `Full fix: .agent-blueprint/review-runs/{run_id}/{reviewer}.json → findings[].suggested_fix`.
- **No diff blocks.** Modifications to existing code render as prose.

### Conflict context line

When reviewers implied different actions and synthesis broke the tie (Step 2.8), surface that briefly:

```
{Reviewer A} recommends Apply; {Reviewer B} recommends Skip. Agent's recommendation: Skip.
```

The agent's recommendation — the post-tie-break value — is what the menu marks `(recommended)`.

### Question stem (short, decision-focused)

After the terminal block renders, ask the question.

**Asking the user.** Ask with your question tool if you have one, offering at most three options; otherwise ask in plain text with a numbered list. In a headless or unattended run nobody will answer: take the default named below, say so in your output, and log it in the run state's decisions if there is a run state.

Default when nobody answers: Skip this finding and every one still undecided, with the reason "no answer", so nothing is changed or filed without a decision.

Use a compact two-line stem:

```
Finding {N} of {M} — {severity} {short handle}.
{Action framing as a yes/no}?
```

Examples:
- `Apply the format-validation guard?`
- `Skip the fix since the fixture is being deleted?`
- `Defer and file an issue?`

Keep alternatives out of the stem: it frames one recommendation as a yes/no, and the option list carries the alternatives.

### Options (three, fixed order)

```
1. Apply the proposed fix
2. Defer — file an issue
3. Skip — don't apply, don't track
```

Keep the order the same on every finding, so the user can answer by position without rereading. **Mark the post-tie-break recommendation with `(recommended)`** on its option label, on every finding, so the user always sees the synthesis's pick.

**Auto-resolve with best judgment on the rest** is the fourth action. It is not a menu slot, because question tools offer at most three options: accept it as a typed answer (the question tool's free-text answer, or a plain-text reply such as "auto-resolve the rest"), and name it once, as a third line of the first finding's stem.

### Adaptations

| Condition | Adaptation |
|-----------|-----------|
| **No `suggested_fix`** (a present or gated_auto finding without a proposed fix) | Option 1 (Apply) is **omitted**. Synthesis already maps these to Defer recommendation. Menu shows Defer / Skip; Auto-resolve stays a typed answer. |
| **Advisory-only finding** | Option 1 becomes `Acknowledge — mark as reviewed`. The other two options remain. |
| **N=1 (exactly one pending finding)** | Heading omits position counter. Auto-resolve is not offered. Menu shows Apply / Defer / Skip (or Acknowledge). |
| **No tracker sink available** | Option 2 (Defer) is omitted. Stem appends one line explaining no tracker is configured. Menu shows Apply / Skip; Auto-resolve stays a typed answer. |
| **Combined N=1 + no sink** | Two options: Apply / Skip (or Acknowledge / Skip). |

### Confirmation between findings

After the user answers, before printing the next finding's terminal block, emit a one-line confirmation:

```
→ Applied. Fix staged at src/utils/api-client.ts:36-37.
→ Deferred. Issue filed: <url>.
→ Skipped.
→ Acknowledged.
```

## Per-finding routing

| User pick | Action |
|-----------|--------|
| **Apply** | Add the finding to an in-memory Apply set. Advance. Do not dispatch the fixer inline — Apply accumulates for end-of-walkthrough batch dispatch. |
| **Acknowledge** (advisory variant) | Record in decision list. Advance. No side effects. |
| **Defer** | Append the finding (title, `file:line`, the fix) as an open item to `BACKLOG.md` in the project root, creating the file if needed; that is the only tracker the walkthrough writes to. File a GitHub issue instead only when the user asks for one in that answer. Record the item and advance. |
| **Skip** | Record in decision list. Advance. No side effects. |
| **Auto-resolve with best judgment on the rest** | Exit walkthrough loop and dispatch fixer immediately on (current finding + everything not yet decided). Apply findings already chosen during walkthrough are dispatched in the same fixer pass. |

## Override rule

"Override" means the user picks a different preset action. **No inline freeform custom-fix authoring** — the walkthrough is a decision loop, not a pair-programming surface. A user who wants a variant of the proposed fix picks Skip and hand-edits outside the flow; if they also want the finding tracked, they file an issue manually.

## State

Walkthrough state is **in-memory only**. The orchestrator maintains:
- An Apply set (finding ids the user picked Apply on)
- A decision list (every answered finding with its action and metadata)
- The current position in the findings list

Nothing is written to disk per-decision. An interrupted walkthrough (user cancels, session compacts, network dies) discards all in-memory state. Defer actions that already executed remain in the tracker — those are external side effects and cannot be rolled back. Apply decisions have not been dispatched yet (they batch at end-of-walkthrough), so they are cleanly lost with no code changes.

## End-of-walkthrough dispatch

When the loop runs to completion (every finding answered):

1. **Apply set:** hand the full accumulated Apply set to one fixer (the ab-iterative-refinement skill, or a dedicated fixer helper where the host can start one). The fixer receives the set as its input queue and applies all changes in one pass against the current working tree.
2. **Defer set:** already executed inline during walkthrough. Nothing to dispatch.
3. **Skip / Acknowledge:** no-op.

The Auto-resolve path exits earlier and dispatches its own fixer pass on the union of (accumulated Apply set ∪ remaining undecided findings). There is no second dispatch in that branch.

## Unified completion report

After dispatch completes, every terminal path emits the same report structure:

### Required fields

- **Per-finding entries:** for every finding the flow touched, a line with title, severity, action taken (Applied / Deferred / Skipped / Acknowledged), tracker URL for Deferred entries, one-line reason for Skipped entries.
- **Summary counts by action:** totals per bucket (e.g., `4 applied, 2 deferred, 2 skipped`).
- **Failures called out explicitly** above the per-finding list: any fix that failed to apply, any ticket creation that failed (with the reason).
- **End-of-review verdict:** Ready to merge / Ready with fixes / Not ready, computed from the residual state after all actions.

### Report ordering

Failures first (above the per-finding list), then per-finding entries grouped by action bucket in the order `Applied / Deferred / Skipped / Acknowledged`, then summary counts, then verdict.

## Execution posture

The walkthrough is operationally read-only **except** for two permitted writes: the in-memory Apply set / decision list (managed by the orchestrator) and the tracker-defer dispatch (external ticket creation). Reviewer agents remain strictly read-only. The end-of-walkthrough fixer dispatch is the single point where file modifications happen.
