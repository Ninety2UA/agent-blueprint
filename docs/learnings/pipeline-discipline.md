---
title: "Pipeline discipline: each stage catches a different class of issue"
date: 2026-05-08
category: best-practices
applies_when:
  - Running /build-pipeline, /ship-pipeline, or /quick-fix on any non-trivial feature
  - Deciding whether to skip review-swarm because earlier stages "looked fine"
  - Any feature that introduces a new user-facing flow with bulk actions or single-keystroke commitments
  - Any time a research agent returns a confident architectural recommendation
tags: [pipeline, build, ship, review-swarm, hitl, pipeline-discipline]
---

# Pipeline Discipline

Our pipelines (`/build`, `/ship`, `/quick`, `/review-swarm`, `/deep-research`, `/orchestrate`, `/team`) compound only when run in full. Skipping a stage because the previous one "looked fine" defeats the compounding effect — each stage catches a different class of issue, and each cheaper stage eliminates issues before they become expensive ones downstream.

## 1. Sample actual evidence before accepting research-agent claims

Research agents (`research-synthesizer`, `best-practices-researcher`, `framework-docs-researcher`) return confident conclusions. Treat those conclusions as **hypotheses, not facts**, whenever an architectural decision rides on them. "Did you check?" is the correct response to any recommendation framed as "our analysis shows..." when the downstream cost of being wrong is a new module, a new schema, or a new pipeline stage.

The concrete practice:

- When a research agent recommends a structural intervention (new agent, new field, new module), name the specific artifacts the claim is derived from.
- Sample 10-20 real artifacts across the relevant axes.
- Compare what the sampled evidence actually shows to what the research claim asserts.
- Update the intervention to match the evidence, not the claim.

Sampled evidence is often directionally correct but mechanistically wrong — and the mechanism is what determines the fix.

## 2. Each pipeline stage catches a different class of issue

Don't skip stages because "the previous one looked fine." Value distribution across stages:

| Stage | Catches | Relative cost to fix |
|-------|---------|----------------------|
| **Brainstorming** | Wrong problem, wrong framing | Cheapest |
| **Document review (requirements)** | Incoherent requirements, missing constraints | Cheap |
| **Plan / Writing-plans** | Wrong design | Medium |
| **Document review (plan)** | Self-contradicting plan, scope violations | Medium |
| **Build / Executing-plans** | Execution bugs | Expensive |
| **Review-swarm / iterative-refinement** | Scope drift in implementation | Expensive |
| **PR review** | Subtle semantic conflations (flags, schema, contracts) | Most expensive |

Stages are **not redundant**. Each catches things the others structurally cannot.

## 3. Treat "trust the agent" UX as rubber-stamp vectors

Any feature offering a single-keystroke commit-a-lot action is a rubber-stamping risk, regardless of how well it is labeled. If the goal is **reducing** rubber-stamping, any such action needs a visible plan the user can inspect before executing.

The pattern:
- Compact preview grouped by action class (Applying / Filing / Skipping).
- Proceed / Cancel gate before execution.
- Preview is cheap to render and hard to misuse.

This is the right surface for *reviewing a pre-computed plan*. It is the wrong surface for *per-item decisions* — a numbered list with per-row options looks efficient at low volume and collapses working memory at high volume.

## 4. Distinguish bulk-preview from per-item walk-through

Two different review modalities with different affordances:

| Modality | Good for | Bad for |
|----------|----------|---------|
| Bulk preview grouped by action | Reviewing a pre-computed plan | Making per-item decisions |
| Per-item walk-through | Making per-item decisions | Reviewing dozens of items at once |

Mixing the two — a numbered list with per-row options — feels dense and efficient until volume hits. Then it breaks. Decide which modality each surface is, and commit.

## 5. Treat tool/platform caps as structural constraints

Cross-platform tool limits (e.g., `AskUserQuestion`'s 4-option cap) are not annoyances to route around — they force design decisions. Collapsing a 5-option set into 4 + a follow-up question is architecturally different from a 5-option set. Accept the cap early and design for it; do not fight it in implementation and pay for it later.

## 6. Never conflate two semantic meanings in one flag

Flag names that read sensibly in one callsite can be silently wrong in another. The symptom: a flag whose definition ("is X available?") is consistent, but whose *use* answers two different questions ("can we invoke X?" vs. "should we offer X as an option?"). One flag cannot answer both correctly.

When a flag's meaning depends on the caller, **split it** into two flags with one meaning each. Example: `sink_available` (is the named tracker invokable?) vs `any_sink_available` (does any tier in the fallback chain work?) — the same flag was being used for both questions, with the bug appearing only at one of the call sites.

## 7. Contract tests assert structure, not prose

A contract test that pins exact wording becomes a tax on future copy improvement. Every wording refinement breaks the test even though the contract is intact. The philosophy is **regression guard, not authoring ossification**.

**Assert:** file existence, required section headings, required tokens, regex on distinguishing words.
**Do not assert:** sentence-level wording, punctuation, or phrasing copy editors will legitimately touch.

```python
# Bad — every rewording breaks the test
assert "only when one or more fixes landed" in doc

# Good — structural landmarks survive copy edits
assert "## Fixes applied" in doc
assert re.search(r"\bfix(es)?\b.*\bland", doc, re.I)
```

## 8. Don't cite external plugins or tools in durable artifacts

External references may be useful **in dialogue** during brainstorming — "plugin X's review flow does Y, what if we did Z?" — but should not appear in requirements docs, plan docs, PR descriptions, or commit messages. Artifacts need to stand on their own.

- Dialogue: "X's design is interesting because..."
- Artifact: re-frame the same insight in self-contained terms that do not depend on the reader knowing X.

The cost of violating this is low-visibility: the artifact reads fine today, but a future reader (or re-user of the pattern) hits an unexplained proper noun with no resolution path.

## 9. Skill bodies are product code — author them accordingly

Skills are the instruction substrate for future dispatch. Violations in a skill being shipped propagate into every future invocation. The authoring rules that apply to agent definitions apply equally to skill bodies:

- Third-person agent voice ("What should the agent do?", not "What should I do?").
- Front-load distinguishing words so truncated labels remain differentiable.
- Rationale discipline: conditional and late-sequence blocks must explain *why*, not just *what*, because agents landing mid-skill need the reasoning to route correctly.
- Load-bearing rules belong inline (see `writing-skills/SKILL.md`).

## 10. Skill body size is multiplicative

`total_token_cost ~ skill_body_lines × tokens_per_line × num_tool_calls`

Reducing tool calls helps **linearly**. Reducing skill body size helps **multiplicatively** because it affects every remaining tool call for the entire session. A skill body that grows by 50 lines costs 50 × tokens-per-line × tool-calls-this-session for every invocation.

**Threshold rule:** Move content to a reference file if it exceeds ~50 lines AND is only used in a minority of invocations. Keep always-needed content in the body.

## Why This Matters

- **Cheaper stages eliminate expensive bugs.** Catching a flag-conflation bug at plan-review time costs minutes; catching it in PR review costs hours; missing it ships a user-visible bug.
- **Document review finds contradictions authors miss.** Plan drafts often contain a unit that adds a new field the plan's own scope boundary forbade — adversarial reviewers consistently catch this.
- **Rubber-stamping risk is invisible without a preview gate.** A compact preview is cheap to implement and hard to misuse. Its absence is invisible until an interactive flow has been rubber-stamped in production.
- **Contract tests that ossify prose become a hidden tax on iteration.** Every future wording improvement triggers a false-positive test break, training contributors to either skip wording improvements or mechanically update tests without thinking.
- **Pipelines compound only if run in full.** Running brainstorm-then-build and skipping the rest is ad-hoc engineering with extra syntax. The compounding effect comes from stages catching each other's misses.

## When to Apply

- Running `/brainstorming` → `/writing-plans` → `/build-pipeline` (or `/ship-pipeline`) → `/review-swarm` on any non-trivial feature.
- Any feature that introduces a new user-facing flow, especially one with bulk actions, routing decisions, or single-keystroke commitments.
- Any time a research agent returns a confident architectural recommendation that would add a stage, schema field, or module.
- Any plan whose scope boundary is explicitly stated ("no changes to X schema", "no new agents") — review both the requirements and the plan before implementation starts.
- Any contract test or snapshot test being written against generated documentation.
- Any flag whose name could plausibly answer more than one question.
- Any skill body being authored or revised — apply the threshold rule.

## Related

- `plugins/claude-code-blueprint/skills/writing-plans/` — plan structure and scope boundary discipline
- `plugins/claude-code-blueprint/skills/writing-skills/SKILL.md` — load-bearing rules belong inline
- `plugins/claude-code-blueprint/skills/iterative-refinement/SKILL.md` — convergence modes
- `plugins/claude-code-blueprint/skills/review-swarm/references/output-contract.md` — two-output contract for context efficiency
