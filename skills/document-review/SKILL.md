---
name: document-review
description: "Trigger this skill when reviewing any written artifact — even if the user just says 'does this look good'. Trigger when the user says 'review this doc', 'review the spec', 'check the plan', 'feedback on this document', 'critique this', 'does this look right', 'proofread this', 'review the ADR', 'check the README', 'is this spec complete', or 'give me feedback on this write-up'. Trigger for specs, plans, ADRs, READMEs, design docs, RFCs, or any document that needs structured feedback for clarity, completeness, and accuracy. Uses a three-pass review process: accuracy, structure, then communication. DO NOT TRIGGER for code review — use requesting-code-review or review-swarm instead. DO NOT TRIGGER for changelog or release notes — use changelog-generation instead."
---

# Document Review

## Overview

Structured three-pass review process for documents. Each pass focuses on a different quality dimension, preventing the reviewer from getting distracted by surface issues while evaluating substance.

## When to Use

- Reviewing a feature spec before implementation
- Reviewing an implementation plan before execution
- Reviewing an ADR before locking a decision
- Reviewing a README or documentation for publication
- When someone asks "does this document look good?"

## Process

### Pass 1: Accuracy

Focus exclusively on whether the content is correct.

**Check for:**
- Factual errors (incorrect technical claims, wrong version numbers)
- Logical inconsistencies (conclusion doesn't follow from premises)
- Missing context (assumes knowledge the reader won't have)
- Outdated information (references to deprecated APIs, old patterns)
- Incorrect references (file paths that don't exist, broken links)

**For docs that name files, commands, endpoints, functions, or dependencies:** dispatch the `doc-claim-verifier` agent (via the Agent tool) to extract and verify every factual claim against the filesystem. Its PASS/FAIL/UNVERIFIABLE report becomes the authoritative input to Pass 1. Manual reading misses drift; the agent doesn't.

**Do NOT check for:** Grammar, formatting, tone, or completeness — those come later.

**Output after Pass 1:**
```markdown
### Accuracy Findings
| # | Location | Issue | Severity |
|---|----------|-------|----------|
| 1 | [section/line] | [what's wrong] | Error/Warning |
```

### Pass 2: Clarity

Focus exclusively on whether the content is understandable.

**Check for:**
- Ambiguous statements (could be interpreted multiple ways)
- Jargon without definition (terms the audience might not know)
- Unclear antecedents ("it," "this," "that" without clear reference)
- Missing examples (complex concepts without illustration)
- Wall-of-text sections (need breaking up or summarizing)
- Unclear structure (reader can't find what they need)

**Do NOT check for:** Accuracy (done) or completeness (next pass).

**Output after Pass 2:**
```markdown
### Clarity Findings
| # | Location | Issue | Suggestion |
|---|----------|-------|------------|
| 1 | [section/line] | [what's unclear] | [how to fix it] |
```

### Pass 3: Completeness

Focus exclusively on whether anything is missing.

**Check for:**
- Missing sections expected for this document type
- Unanswered questions the reader would have
- Edge cases not addressed
- Missing acceptance criteria (for specs)
- Missing rollback plan (for migration docs)
- Missing tradeoff analysis (for ADRs)
- Missing testing strategy (for implementation plans)

**Output after Pass 3:**
```markdown
### Completeness Findings
| # | Missing Item | Why It Matters | Priority |
|---|-------------|---------------|----------|
| 1 | [what's missing] | [impact of omission] | Must-have/Nice-to-have |
```

### Final Summary

After all three passes, present a consolidated review:

```markdown
## Document Review Summary

### Overall Assessment
[One sentence: ready for use / needs revisions / needs major rework]

### Key Issues (Must Fix)
1. [Most important issue and fix]
2. [Second most important]
3. [Third]

### Suggestions (Optional)
1. [Nice-to-have improvement]

### Verdict: APPROVED / REVISIONS NEEDED / REWORK NEEDED
```

## Quick Reference

| Pass | Focus | Ignore |
|------|-------|--------|
| 1. Accuracy | Is it correct? | Style, completeness |
| 2. Clarity | Is it understandable? | Accuracy (done), completeness |
| 3. Completeness | Is anything missing? | Accuracy, clarity (done) |

## Common Mistakes

**Mixing passes** — Don't flag a missing section while checking accuracy. Stay in the lane for each pass.

**Too many nits** — A review with 30 findings overwhelms the author. Prioritize the top 5-10 that matter most.

**No positive feedback** — If the document is well-written, say so. Positive reinforcement helps authors replicate good patterns.

**Reviewing without context** — Understand the document's purpose and audience before reviewing. A quick internal spec doesn't need the same rigor as a public API reference.
