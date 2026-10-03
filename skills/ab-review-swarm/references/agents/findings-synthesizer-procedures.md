# Findings synthesizer procedures

Loaded from `references/agents/findings-synthesizer.md` at the point of use: Step 2.3 when one reviewer filed three or more findings sharing a root premise, Step 2.9 when a surviving P1/P2 finding at tier `present` challenges a foundational premise, and the Output Format when the report is flattened into one list with severity prefixes.

## Same-reviewer redundancy collapse

A single reviewer sometimes files multiple findings sharing one root premise expressed at different sections or wrapped in different framing (e.g., one reviewer firing five variants of "module is over-coupled" attached to five different files). Cross-reviewer dedup does not catch this: fingerprints differ even when the underlying concern is the same. Surfacing all N variants over-weights one reviewer's perspective relative to the others and inflates the finding list with near-duplicate signal.

For each reviewer, cluster that reviewer's surviving findings by shared root premise. A cluster forms when **3 or more findings from the same reviewer** share:

- The same general concern (substantially overlapping `Impact` phrasing: same key nouns/verbs signaling the same root)
- Fixes that would all be obviated by the same upstream decision (e.g., "split this module" would moot all five over-coupling findings)

For each cluster of size N ≥ 3:

- Keep the single finding with the strongest evidence (highest confidence anchor; if tied, the one citing the most concrete file:line).
- **Demote the remaining N-1 findings to advisory tier (confidence 50)**, regardless of their original anchor.
- On the kept finding, note in the Reviewer column that the reviewer raised N-1 related variants (e.g., `code-simplicity-reviewer (+4 related variants demoted to advisory)`).

This runs per reviewer before the Step 2.6 cross-reviewer agreement boost. Cross-reviewer agreement on the *kept* finding still qualifies for the anchor-step promotion in Step 2.6; demoted variants do not participate. Do NOT collapse across reviewers at this step: different reviewers surfacing the same concern is exactly the independence signal cross-reviewer agreement rewards.

## Premise-dependency chain linking

Reviews often fan out: one P1/P2 finding challenges a foundational premise ("is this approach justified?") and downstream findings ("alias unjustified", "abstraction overkill", "migration lacks rollback") all evaporate if the premise is rejected. Surfacing each as an independent decision forces the user to re-litigate the same root question N times. Linking dependents to their root lets a single decision cascade.

### 1. Identify roots

A finding is a candidate root when ALL hold:

- Severity P1 or P2 (premise-level issues carry high priority by nature; no P3 roots).
- Tier is `present` (the root requires judgment; a safe/gated root is acted on, not cascaded).
- Title or Impact challenges a foundational premise. Signal phrases (shape, not vocabulary): "premise unsupported", "is X justified", "is the proposed solution the right approach", "scope is wrong".
- The finding's location is a framing-level surface (Overview, Plan, top-level module, primary entry point) OR it explicitly questions whether a named component should exist.

If multiple candidates match, elevate ALL of them; the criteria above are restrictive enough without a numerical cap.

**Peer vs nested test.** Two candidate roots are **peers** when accepting root A's fix would not resolve root B's concern (and vice versa). They are **nested** when one root's fix would moot the other: the subsumed candidate becomes a dependent of the surviving root. Apply symmetrically, checking both directions.

**Surviving root under nested:** the surviving root is the one whose fix moots the other, NOT the one with higher confidence. Confidence is for tie-breaking among peers, not for deciding which of two nested candidates dominates.

### 2. Identify dependents

For each root, scan the remaining findings. A finding is a dependent of a root when:

- The root challenges a foundational premise about a named component.
- The candidate's `suggested_fix` modifies, adds detail to, or constrains that same component.
- The candidate's concern would dissolve if the root's premise is rejected.

**Substitution test:** "If the user rejects the root (Skip/Defer), does the dependent's finding still describe an actionable concern?" If no, it is a dependent. If yes (the finding identifies a problem that survives root rejection), it is not.

### 3. Independence safeguard

Even when a finding's component is addressed by the root, do NOT link if:

- The dependent identifies a problem that exists regardless of root resolution (rollback plans, error handling, test coverage: operational obligations that don't evaporate when the premise changes).
- The dependent's Impact cites evidence (codebase fact, framework convention) that stands on its own.
- The dependent is `safe_auto`: one clear correct fix, applies regardless of root resolution.

When uncertain, default to NOT linking. A mis-linked chain hides a real issue; leaving a finding unlinked only costs one extra decision.

### 4. Annotate

On each dependent, record `depends_on: <root_id>` (use file + normalized title as the id). On each root, record `dependents: [<dependent_ids>]`. Cap `dependents` at 6 entries per root: if more than 6 candidates link, keep the top 6 by severity, then confidence anchor (descending), then input order, and leave the rest unlinked.

Linking is purely annotative. Do NOT reclassify, re-route, or change the confidence anchor of any finding in this step. In the report, a chain root renders as a tree at its severity position with its dependents nested as a sub-block, and a dependent must NOT also appear at its own severity position (count invariant).

## Severity prefixes

When the synthesized report is posted as inline review comments (PR comments, chat output, or any context where authors will scan a long list), prefix each finding line with the appropriate label so authors can triage at a glance:

| Prefix | Used for | Maps to |
|--------|---------|---------|
| `Critical:` | Must fix before merge — security, data loss, broken behavior | P1 + safe_auto/gated_auto blockers |
| *(no prefix)* | Required change — bugs, missing tests, wrong abstraction | P1 / P2 in default tiers |
| `Important:` | Should fix unless deferred | P2 |
| `Consider:` / `Optional:` | Worth thinking about, not required | P3 / advisory |
| `Nit:` | Minor stylistic — formatting, naming preference | P3 nit-class |
| `FYI:` | Informational only — context for future readers | advisory tier |

The prefix is in addition to the structured `severity` and `Tier` fields, never a replacement. In the structured Markdown report, keep the P1/P2/P3 sections; the prefix convention applies only when findings are flattened into a single bulleted list (e.g. when a downstream tool posts each one as a separate PR comment).
