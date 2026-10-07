# Solution document

Loaded on demand from SKILL.md when writing a solution document or checking one against the bar.

## Template

Create `docs/solutions/YYYY-MM-DD-[slug].md`:

```markdown
---
title: [Descriptive title]
date: YYYY-MM-DD
tags: [technology, pattern, domain]
applies-to: [what part of the codebase or what type of work]
retire_when: [optional — the condition that makes this obsolete, e.g. "we drop Node 18" or "upstream fixes the bug"]
---

# [Title]

## Problem

[What went wrong or what needed to be built. Include error messages, symptoms, or requirements. Be specific enough that someone searching for this problem would find it.]

## Root Cause

[Why the problem occurred. The underlying mechanism, not just "it was broken."]

## Solution

[What was done to fix it. Include code snippets, configuration changes, or architectural decisions. Be specific and reproducible.]

## What Didn't Work

[Approaches that were tried and failed, and why. This prevents future developers from repeating dead ends.]

- **[Approach 1]:** [Why it failed]
- **[Approach 2]:** [Why it failed]

## Key Insight

[The one-sentence takeaway. What should someone remember from this?]

## Applicability

[When would this knowledge be relevant again? What search terms would someone use?]

- Relevant when: [conditions]
- Technology: [framework/library/tool]
- Pattern: [design pattern or architectural pattern]
```

## Quality Bar

A good solution document:
- Can be found by searching for the error message or technology name
- Explains why, not just what
- Includes failed approaches (saves the most time)
- Is specific enough to be actionable, not so specific it's a one-off
- Takes 2-5 minutes to write (not a research paper)

A bad solution document:
- Just says "fixed the bug by changing X to Y"
- Has no context about why the bug occurred
- Is so generic it's not actionable
- Duplicates framework documentation

## Common Mistakes

**Documenting too little** — "Fixed it" is not a solution document. Include the root cause and approach.

**Documenting too much** — This is not a blog post. 50-100 lines is ideal. If it's longer, you're writing a research doc.

**Missing search terms** — If the document doesn't include the error message or symptom, it won't be found when someone encounters the same problem.

**Skipping failed approaches** — The approaches that didn't work are often more valuable than the one that did. They prevent future time waste.

## How This Integrates with Other Skills

| Skill | How it uses solutions |
|-------|-----------------------|
| `ab-build-pipeline` (research in Stage 3, Plan) | learnings-researcher searches `docs/solutions/` before planning |
| `ab-deep-research`, `ab-deepen-plan`, `ab-ideation` | learnings-researcher includes solutions in the research brief or plan |
| `ab-build-pipeline` (Stage 8, Compound), `ab-ship-pipeline` | Run this skill when the work solved a non-trivial problem |
| `ab-session-wrap` (Step 5, learnings) | Runs this skill's gardening pass when a new learning contradicts or supersedes an existing one |
