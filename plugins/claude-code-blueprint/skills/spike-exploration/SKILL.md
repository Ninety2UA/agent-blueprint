---
name: spike-exploration
description: "Trigger this skill when there is significant technical uncertainty about whether an approach will work and hands-on code exploration is needed to answer the question. Trigger when the user says 'spike', 'explore', 'prototype', 'proof of concept', 'can we even do this', 'feasibility', 'experiment', 'try it out', 'will this work', or 'I'm not sure this is possible'. Trigger even when the user is about to commit to an approach without evidence — proactively suggest a spike when unknowns are large, the team is debating without data, or an estimate feels like pure guesswork. This is for timeboxed hands-on code exploration, not documentation research. DO NOT TRIGGER for general research or context gathering — use deep-research instead. DO NOT TRIGGER when the approach is clear and the only question is effort estimation. DO NOT TRIGGER when the question can be answered by reading docs — just read them or use deep-research."
---

# Spike / Exploration

## Overview

A spike is a timeboxed investigation to reduce uncertainty. The output is knowledge, not production code. Spikes answer questions like "can we do X?", "how does Y work?", and "which approach is better?"

**Core principle:** The deliverable of a spike is a decision, not a feature. Write throwaway code. Explore fast. Document what you learned.

## When to Use

- You don't know if an approach is feasible
- You need to choose between two or more technologies or architectures
- A costly-to-reverse choice (storage engine, public API shape, a vendor) is still open after research: compare the options here before a plan commits to one
- You're integrating with an unfamiliar API or system
- The team is debating an approach and no one has evidence
- A task estimate feels like a guess because the unknowns are too large
- You're about to build something you've never built before

**Don't use when:**
- The approach is clear and the question is just "how long will it take" (that's estimation, not a spike)
- You're procrastinating on implementation by over-researching (set a timebox and honor it)
- The question can be answered by reading documentation (just read it)

## The Iron Law

<HARD-GATE>
A spike has a QUESTION and a TIMEBOX. If you don't have both before starting, you're not doing a spike — you're wandering. Define both before writing any code.
</HARD-GATE>

## Process

### Step 1: Define the Spike

Write down exactly three things:

```markdown
## Spike: [descriptive title]

**Question:** [The specific question this spike will answer]
**Timebox:** [Maximum time to spend — 1-4 hours typical]
**Success criteria:** [What constitutes a sufficient answer — doesn't need to be "yes it works"]
```

Examples of good spike questions:
- "Can we render 10K rows in the table without virtual scrolling?"
- "Does the Stripe API support partial captures for our use case?"
- "Is SQLite fast enough for our expected write throughput?"
- "Can we run the ML model in the browser with acceptable latency?"

Examples of bad spike questions:
- "How should we build the payments system?" (too broad — narrow to a specific uncertainty)
- "Is React good?" (subjective — reframe as measurable: "Can React Server Components reduce our bundle by 40%?")

### Step 2: Explore

Rules for spike code:

1. **No tests required** — this code is throwaway
2. **No code review required** — it won't ship
3. **No style standards** — hack freely, hardcode values, skip error handling
4. **Branch or scratch directory** — keep spike code separate from main
5. **Focus on the question** — resist the urge to build the whole feature

```bash
# Create a spike branch
git checkout -b spike/[descriptive-name]

# Or use a scratch directory
mkdir -p docs/research/spikes/YYYY-MM-DD-[topic]
```

### Step 3: Gather Evidence

While exploring, collect evidence that answers the question:

- **Benchmarks** — timing data, memory usage, throughput numbers
- **API responses** — actual payloads, error codes, edge cases
- **Compatibility** — what works, what doesn't, what's undocumented
- **Prototype screenshots** — if visual, capture what you built
- **Code snippets** — the minimum code that proves/disproves feasibility

### Step 4: Write the Spike Report

When the timebox expires (or you have your answer), write a report:

```markdown
## Spike Report: [title]

**Question:** [the original question]
**Answer:** [YES/NO/PARTIALLY — one sentence]
**Timebox:** [planned] | **Actual:** [actual time spent]

### Findings

[2-5 bullet points of what you learned]

### Evidence

[Benchmarks, screenshots, code snippets, API responses]

### Recommendation

[What the team should do based on these findings]

### Risks Identified

[Anything surprising or concerning discovered during the spike]
```

Save the report to: `docs/research/spikes/YYYY-MM-DD-[topic].md`

### Step 5: Clean Up

1. **Don't merge spike code** — it's throwaway by definition
2. **Delete the spike branch** (or archive it with a `spike/` prefix)
3. **Keep the report** — the knowledge is the deliverable
4. **Create implementation tasks** — if the spike was successful, create plan tasks based on what you learned

## Spike Patterns

### A/B Comparison Spike

Comparing two approaches. Fix the criteria before building anything, then build one throwaway artifact per option to the same depth, so neither wins on polish. Score both against those criteria. The artifacts are deleted; the matrix and the reason go into the report and the plan.

```markdown
## Spike: PostgreSQL vs. SQLite for local-first sync

**Question:** Which database handles our offline-first sync requirements better?
**Timebox:** 3 hours

### Approach A: PostgreSQL + logical replication
- [findings]

### Approach B: SQLite + cr-sqlite
- [findings]

### Comparison Matrix
| Criterion | PostgreSQL | SQLite |
|-----------|-----------|--------|
| Offline support | ... | ... |
| Sync complexity | ... | ... |
| Query performance | ... | ... |

### Recommendation: [choice] because [evidence-based reasoning]
```

### Feasibility Spike

Can we do this at all?

```markdown
## Spike: Browser-based PDF generation

**Question:** Can we generate PDFs client-side without a server round-trip?
**Timebox:** 2 hours

### Tested Libraries
1. jsPDF — [result]
2. pdf-lib — [result]
3. Puppeteer in WASM — [result]

### Answer: YES, using pdf-lib. Limitations: [list]
```

### Integration Spike

How does this external system work?

```markdown
## Spike: Stripe Connect onboarding flow

**Question:** What's the minimum integration for marketplace seller onboarding?
**Timebox:** 2 hours

### API Endpoints Used
- [endpoint]: [what it does, gotchas]

### Auth Flow
- [sequence of calls]

### Undocumented Behavior
- [anything surprising]
```

## Timebox Discipline

When the timebox expires:

| Situation | Action |
|-----------|--------|
| **Question answered** | Write report, move on |
| **Partial answer** | Write what you know, note remaining unknowns, decide: extend or accept uncertainty |
| **No answer** | Write what you tried, why it didn't work, recommend next steps |
| **Found a bigger problem** | Document it, stop the spike, escalate to the team |

**Never extend a timebox by more than 50%.** If a 2-hour spike isn't answered in 3 hours, the question is probably too broad — split it into smaller spikes.

## Common Mistakes

**Spike becomes a prototype** — You found something that works and kept building. Stop. Write the report. Create implementation tasks. The spike code is throwaway.

**No timebox** — "I'll just explore for a bit" turns into a full day. Set a timer.

**No question** — "Let's spike on payments" is not a spike. "Can Stripe handle split payments to 3 parties?" is.

**Merging spike code** — Spike code is written fast with no tests, no error handling, and hardcoded values. It's evidence, not implementation. Rewrite it properly.

**Skipping the report** — The code will be deleted. If you don't write down what you learned, the spike was wasted time.

## Integration with Other Skills

| Situation | Skill |
|-----------|-------|
| Spike succeeded, need to plan implementation | writing-plans |
| Spike revealed the approach is too complex | brainstorming (re-explore alternatives) |
| Spike found a bug in existing code | systematic-debugging |
| Spike compared dependencies | dependency-management |
| Spike findings affect architecture | Document in docs/decisions/ as an ADR |
