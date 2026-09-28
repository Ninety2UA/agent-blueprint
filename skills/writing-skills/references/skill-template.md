# writing-skills — SKILL.md skeleton

Loaded on demand from `SKILL.md`; nothing here is needed on every invocation.

## SKILL.md skeleton

```markdown
---
name: Skill-Name-With-Hyphens
description: Use when [specific triggering conditions and symptoms]
---

# Skill Name

## Overview
What is this? Core principle in 1-2 sentences.

## When to Use
[Small inline flowchart IF decision non-obvious]

Bullet list with SYMPTOMS and use cases.

## When NOT to Use
**Required section.** Bulleted list of cases that look like a match but aren't, plus the skill that *should* trigger instead. Symmetric to "When to Use" — readers compare the two before deciding to invoke.

## Core Pattern (for techniques/patterns)
Before/after code comparison

## Quick Reference
Table or bullets for scanning common operations

## Implementation
Inline code for simple patterns
Link to file for heavy reference or reusable tools

## Common Mistakes
What goes wrong + fixes

## Common Rationalizations
**Required section** for any skill that enforces a discipline (gates, mandatory hops, quality bars). Two-column table:

| Rationalization | Reality |
|---|---|
| "It's working, no need to touch it" | Working code that's hard to read will be hard to fix when it breaks. |
| "I'll just quickly skip the test for this one" | Skipped tests become permanent. The convention is the value. |

Anticipate 5–7 excuses an agent might use to bypass the skill, with a one-line direct counter. Keep entries punchy — multi-line prose dilutes the format. Tables are denser and harder to skim past than prose lists, which is the point.

## Real-World Impact (optional)
Concrete results
```

**Why these sections are required:**

- **When NOT to Use** prevents skill mis-triggering. Every skill has near-neighbors; without explicit boundaries, the wrong skill fires.
- **Common Rationalizations** is the loophole patch. Every discipline-enforcing skill that ships without one accumulates skip patterns. Catalog them in the table so the next agent reads its own excuse refuted before it speaks.

## Skill Creation Checklist

**RED Phase - Write Failing Test:**
- [ ] Create pressure scenarios (3+ combined pressures for discipline skills)
- [ ] Run scenarios WITHOUT skill - document baseline behavior verbatim
- [ ] Identify patterns in rationalizations/failures

**GREEN Phase - Write Minimal Skill:**
- [ ] Name uses only letters, numbers, hyphens (no parentheses/special chars)
- [ ] YAML frontmatter with required name and description (max 1024 chars); optional `allowed-tools`/`disallowed-tools` only if scoping tools
- [ ] Description starts with "Use when..." and includes specific triggers/symptoms
- [ ] Description written in third person
- [ ] Keywords throughout for search (errors, symptoms, tools)
- [ ] Clear overview with core principle
- [ ] Address specific baseline failures identified in RED
- [ ] Code inline OR link to separate file
- [ ] One excellent example (not multi-language)
- [ ] Run scenarios WITH skill - verify agents now comply

**REFACTOR Phase - Close Loopholes:**
- [ ] Identify NEW rationalizations from testing
- [ ] Add explicit counters (if discipline skill)
- [ ] Build rationalization table from all test iterations
- [ ] Create red flags list
- [ ] Re-test until bulletproof

**Quality Checks:**
- [ ] Small flowchart only if decision non-obvious
- [ ] Quick reference table
- [ ] Common mistakes section
- [ ] No narrative storytelling
- [ ] Supporting files only for tools or heavy reference

**Deployment:**
- [ ] Commit skill to git and push to your fork (if configured)
- [ ] Consider contributing back via PR (if broadly useful)
