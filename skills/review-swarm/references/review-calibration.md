# Review Calibration — Shared Rubric

All review agents in the review swarm use this shared calibration for consistent scoring and classification.

## Confidence-Anchored Scoring

Score each finding using these discrete anchors — do NOT use continuous values (no 0.6, 0.85, etc.).

| Score | Meaning | Operational Question |
|-------|---------|---------------------|
| **0** | False positive or pre-existing issue | "Does this issue actually exist in the current code?" → No |
| **25** | Might be real but couldn't verify | "Can I confirm this by reading the code?" → Not confidently |
| **50** | Verified real but nitpick / low importance | "Would a competent developer hit this?" → Unlikely, but it's real |
| **75** | Double-checked, will hit in practice | "Would a competent developer hit this?" → Yes, in normal use |
| **100** | Confirmed, will happen frequently | "Will users encounter this regularly?" → Yes, reliably |

**Why discrete anchors:** Continuous confidence scales (0.0–1.0) produce false precision — models cluster on round numbers (0.60, 0.72, 0.85) regardless of true certainty. Anchored integers force operational calibration through concrete questions.

**Anchored on BEHAVIOR, not certainty.** Each anchor has a behavioral criterion you must honestly self-apply. If you cannot truthfully attach the behavioral claim to the finding, step down to the next anchor.

- **Anchor 75 requires naming a concrete observable consequence** — a wrong result, an unhandled error path, a contract mismatch, a security exposure, missing coverage that a real test scenario would surface. "This could be cleaner" or "I would have written this differently" do NOT meet this bar — they are advisory observations and land at anchor 50.
- **Disambiguator between 50 and 75:** Ask "will a user, caller, or operator concretely encounter this in normal usage, or is this my opinion about the code's quality?" The former is 75; the latter is 50.
- **Anchor 100 requires verifiability from the code alone** — compile error, type mismatch, definitive logic bug (off-by-one in a tested algorithm, swapped arguments), or an explicit project-standards violation with a quotable rule. No interpretation required.

**Cross-reference with evidence hierarchy:** Findings backed only by Tier 5-6 evidence (code-path inference, speculation) should score 0 or 25. Findings backed by Tier 1-2 evidence (reproduction, automated test) can score 75 or 100.

**Anchor and severity are independent axes.** A P2 finding can be anchor 100 if the evidence is airtight; a P0 finding can be anchor 50 if it is an important concern you could not fully verify. Anchor gates where the finding surfaces (drop / soft bucket / actionable); severity orders it within the actionable surface.

## Remediation Tier Classification

Classify each finding into exactly one remediation tier:

| Tier | When to Use | Examples |
|------|-------------|---------|
| **safe_auto** | Mechanical fix, zero ambiguity, no behavior change possible | Missing import, typo in string literal, formatting issue, obvious dead code removal, redundant null check guaranteed by type system |
| **gated_auto** | Concrete fix exists but needs human confirmation before applying | Error handling addition, missing validation, test gap, security hardening, performance fix |
| **advisory** | FYI observation, no action required | Performance note for future scale, style preference, documentation suggestion, pattern the team should be aware of |
| **present** | Strategic decision with multiple valid approaches — requires user choice | Architecture choice, API design tradeoff, scope boundary decision, conflicting reviewer recommendations |

**Classification rules:**
- When uncertain between safe_auto and gated_auto → choose gated_auto (conservative)
- When uncertain between gated_auto and advisory → choose gated_auto (actionable beats informational)
- Findings that touch auth, payments, or data mutations are NEVER safe_auto — minimum gated_auto
- **No straw-man alternatives:** Do not pad `present` findings with weak alternatives to make one option look better. If one approach is clearly superior, classify as gated_auto with that fix, not present with a fake choice.

## Finding Output Format

Each finding MUST include all five fields:

```markdown
- **[Title]** — `file:line` — Confidence: [0/25/50/75/100] — Tier: [safe_auto|gated_auto|advisory|present]
  - Impact: [what goes wrong — describe observable behavior, not internal structure]
  - Fix: [specific recommendation]
```

**Framing guidance:**
- **Observable-behavior-first:** Describe what users/callers SEE, not structural code changes. "Users will see a 500 error when submitting empty form" not "The code has a missing null check on line 42."
- **Why-the-fix-works:** Briefly explain WHY the recommended fix addresses the root cause, not just what to change.
- **2-4 sentence budget** per finding description. Be concise.

## Per-Severity Confidence Gates

The findings-synthesizer applies these gates — reviewers should score honestly and not inflate:

| Severity | Minimum Confidence to Include | Rationale |
|----------|-------------------------------|-----------|
| **P1 (Critical)** | >= 50 | Missing a critical issue is expensive — low bar |
| **P2 (Important)** | >= 65 | Balance signal vs noise |
| **P3 (Suggestion)** | >= 75 | Nit noise is cheap to generate, expensive to review — high bar |

Findings below these thresholds are filtered by the synthesizer. Score honestly — the gates do the filtering.
