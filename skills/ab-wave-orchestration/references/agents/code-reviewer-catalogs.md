# Code reviewer catalogs

Loaded from `references/agents/code-reviewer.md` at the point of use: the false-positive catalog before any finding is written; the quality-bar lens when the diff touches tests, CI or lint/coverage config, or adds a suppression, skip, weakened assertion or threshold change; the boundary cases when a fix sits on the safe_auto/gated_auto line; the fix shapes when a `suggested_fix` must be proposed on imperfect information; the severity prefixes when findings are rendered inline.

## False-positive catalog

Suppress entirely — do not emit even at low confidence. These are non-findings, not edge cases to route to soft buckets:

1. **Pre-existing issues unrelated to this diff.** Mark `pre_existing: true` only for unchanged code the diff does not interact with. If the diff makes a previously-dormant issue newly relevant, it is a secondary finding, not pre-existing.
2. **Pedantic style nitpicks a linter or formatter would catch.** Missing semicolons, indentation, import ordering, unused-variable warnings the project's tooling already catches. Style belongs to the toolchain.
3. **Code that looks wrong but is intentional.** Check comments, commit messages, PR description, or surrounding code for evidence of intent before flagging. A "missing null check" guarded by an upstream `.present?` call is a false positive.
4. **Issues already handled elsewhere.** Check callers, guards, middleware, framework defaults, and parallel handlers before flagging. If a controller's input is already validated by parent middleware, the controller-level check is redundant.
5. **Suggestions that restate what the code already does in different words.** "Consider extracting this into a helper" when the code is already a small helper.
6. **Generic "consider adding" advice without a concrete failure mode.** If you cannot name what breaks, the finding is not actionable. (A spec-silent input a user will reach has a failure mode: name it, and it is not this item.)
7. **Issues with a pre-existing lint-ignore comment.** Code carrying an explicit lint-disable comment for the rule you are about to flag (`eslint-disable-next-line no-unused-vars`, `# rubocop:disable`, `# noqa: E501`) — suppress unless the suppression itself violates a project-standards rule. The author already chose to suppress; re-flagging via a different reviewer creates noise. **Carve-out:** this covers only suppressions that predate the diff. A lint-ignore the diff itself adds is not a settled choice — it is a signal under the Quality-Bar Regression Lens below, on the same diff-introduced-versus-pre-existing line item 1 draws.
8. **General code-quality concerns not codified in CLAUDE.md / CONVENTIONS.md.** "This file is getting long," "this method has too many parameters" — without a project-standards rule to anchor the concern, suppress.
9. **Speculative future-work concerns with no current signal.** "This might break under load," "what if requirements change" — not findings unless the diff introduces concrete evidence the concern is reachable now. A reachable user input is current signal.
10. **Redundancy that aids readability** (e.g., `present?` alongside a length check).
11. **Harmless no-ops** (e.g., `.reject` on an element never in the array).
12. **Comments asking to explain thresholds** — thresholds change during tuning; comments rot.

**Advisory routing rule (precedence over FP catalog):** If the honest answer to "what actually breaks if we do not fix this?" is "nothing breaks, but...", the finding is advisory. Set `tier: advisory` and `confidence: 50` so synthesis routes to a soft bucket. Do not suppress — the observation may have value; it just does not warrant user judgment. Typical advisory shapes: design asymmetry the diff improves but does not fully resolve, opportunity to consolidate two similar helpers when neither is broken, residual risk worth noting.

**Precedence:** if a shape matches the FP catalog above, it is a non-finding and must be suppressed entirely. Do NOT route it to anchor 50 / advisory. The advisory rule applies only to shapes that are NOT in the FP catalog.

## Quality-Bar Regression Lens

**Scope:** shapes the diff introduces. A diff can pass every other check while lowering the bar the codebase held before it; this lens catches that. The same shapes already present before the diff stay under catalog item 1.

Each of the following is a finding when the diff adds it, carrying the same severity, confidence anchor, and `suggested_fix` discipline as any other finding:

- **A suppression the diff adds:** a new lint-ignore, type-check ignore, or warning filter (`# noqa`, `eslint-disable`, `@ts-ignore`, `# type: ignore`, `rubocop:disable`) on a line the diff touches. The default fix is the underlying issue; a suppression stands only with a comment stating why the rule does not apply here.
- **A test the diff skips or removes:** `.skip`, `xit`, `xdescribe`, `it.todo`, `@pytest.mark.skip`, a deleted test file, or a test case removed with no replacement covering the same behavior.
- **An assertion the diff strips or weakens:** an assertion deleted, an exact match loosened to a truthiness or existence check, an expected value edited to match new output with no stated reason, or an error expectation widened to "any error".
- **A stub the diff leaves unimplemented:** a body that is `pass`, `TODO`, `NotImplementedError`, `return null`, or a hardcoded return where the plan or a caller expects real behavior. Report it under Completeness gaps, not as a style note.
- **A threshold the diff loosens:** a coverage minimum, timeout budget, performance budget, complexity or size limit, retry count, or lint severity changed in a config file or CI script with no stated reason. Which way is looser depends on the kind of number. A minimum (coverage floor, lint severity, required approvals) loosens when lowered. A maximum (timeout, bundle or file size, complexity limit, allowed warnings) loosens when raised. A number with no clear direction (retry count, batch size) is reported whenever it changes.

**Stated intent lowers confidence, it does not suppress:** a threshold lowered with a reason the diff or PR body states and the reader can check, or a skip whose comment names a tracked issue, lands at 50 rather than 75. A reason that does not hold up leaves the finding where it was.

## Boundary cases

Shapes that often feel risky but are still safe_auto. Do not default to gated_auto when uncertain: the wrong-side cost is symmetric.

- **Nil/null guard turning a crash into a nil-return is `safe_auto`** when the function is internal and no public-API/error contract is documented. Adding a precondition check inside an internal function isn't a behavior change worth gating.
- **Off-by-one fix is `safe_auto`** when the corrected behavior is verifiable from a parallel pattern visible in surrounding code or explicit documentation. Matching an established pattern isn't a design decision.
- **Dead-code removal is `safe_auto`** when deadness is signaled in scope: no callers reachable from the diff, in-file comment says "superseded" / "unused" / "no callers", or the surrounding refactor obviously displaces it. "Someone might want this someday" isn't a design call.
- **Helper extraction is `safe_auto`** when duplication is identical, all callers update in lockstep within the same diff, and the consolidation point is mechanical (shared method on the same class, or a new helper named after the shared shape). The discriminator is whether **naming or placement requires a design conversation**: if yes, gated_auto; if the name follows mechanically from the body, safe_auto.

## Fixes under imperfect information

Findings that still get a `suggested_fix`, with the assumption named so the user can override it:

- Pagination strategy unclear → propose offset pagination matching the existing pattern at `file:line`, with assumption named.
- Rate limit value uncertain → propose the value matching existing rate limits in the project, with assumption named.
- Auth model unknown → propose authentication via the existing middleware pattern at `file:line`, with assumption named.

The right question is "what code change would I propose if I had to choose now?" Propose that. The genuinely-omit cases are rare: the finding is a question with no clear default ("What is the intended SLA here?"), or the resolution is purely organizational (legal sign-off, business policy decision, process change with no code component). A bad fix suggestion is still worse than none; the false-positive catalog and the grounding rule in the prompt prevent that, so the bias is toward proposing when you can.

## Severity prefixes

| Prefix | Meaning | Author action |
|--------|---------|---------------|
| `Critical:` | Blocks merge — security vulnerability, data-loss risk, broken functionality | Must address before merge |
| *(no prefix)* | Required change — bugs, missing tests, wrong abstraction | Must address before merge |
| `Important:` | Should fix before merge — poor error handling, structural issue | Address unless explicitly deferred |
| `Consider:` / `Optional:` | Suggestion — worth thinking about, not required | Author may take or leave |
| `Nit:` | Minor / stylistic — formatting, naming preference | Author may ignore without comment |
| `FYI:` | Informational only — context for future readers | No action expected |

Pair the prefix with the severity field in structured output, not as a substitute for it. The prefix is for fast human scanning; the severity field is for the synthesizer's gate logic.

## Declined to judge

On a final whole-branch review only: anchors 0 and 25 are suppressed, so also list, in one line each, what you declined to judge and why (needs runtime evidence, outside the diff's visible contract, spec ambiguous). The session rules on each; silence must not read as clean.
