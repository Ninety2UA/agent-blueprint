---
name: ab-spike-exploration
description: "Runs a timeboxed, hands-on spike that answers one technical question with throwaway code: sets the question, timebox and success criteria, explores on a spike branch or scratch folder, gathers evidence, and writes a spike report with a recommendation to docs/research/spikes/. Use when it is unclear whether an approach will work, when choosing between technologies or a costly-to-reverse option, when integrating an unfamiliar API, when a debate has no data or an estimate is guesswork, or when the user asks for a spike or proof of concept; suggest one before the user commits to an approach without evidence. Not for documentation research or context gathering (ab-deep-research), questions the docs answer, or effort estimates for a clear approach."
---

# Spike / Exploration

A spike is a timeboxed investigation that reduces uncertainty. It is finished when a report in `docs/research/spikes/` answers its question (yes, no or partly) with evidence and a recommendation, and the spike code stays out of the main line. The output is knowledge, not production code: spikes answer questions like "can we do X?", "how does Y work?" and "which approach is better?"

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

## Question and Timebox First

A spike has a question and a timebox, both written down before any code. Without a question nothing tells you when you are done, and without a timebox exploration fills the day; a spike missing either is wandering.

## Process

### Step 1: Define the Spike

Write down exactly three things:

```markdown
## Spike: [descriptive title]

**Question:** [The specific question this spike will answer]
**Timebox:** [Maximum time to spend — 1-4 hours typical]
**Success criteria:** [What constitutes a sufficient answer — doesn't need to be "yes it works"]
```

A good question is specific and measurable: "Can we render 10K rows in the table without virtual scrolling?" A bad one is too broad ("How should we build the payments system?") or subjective ("Is React good?"): narrow it to one uncertainty with a measurable answer, such as "Can React Server Components reduce our bundle by 40%?"

### Step 2: Explore

Spike code is throwaway, so it skips what shipping code needs:

1. **No tests required** — this code is throwaway
2. **No code review required** — it won't ship
3. **No style standards** — hack freely, hardcode values, skip error handling
4. **Branch or scratch directory** — keep spike code separate from main
5. **Focus on the question** — resist the urge to build the whole feature

Use a scratch directory instead of a branch when you cannot switch branches, for example with uncommitted work in the tree or a read-only `.git`.

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

Save the report to `docs/research/spikes/YYYY-MM-DD-[topic].md` on the branch you started from, not the spike branch, so it survives when the spike branch goes.

### Step 5: Clean Up

1. **Don't merge spike code** — it's throwaway by definition
2. **Delete the spike branch** (or archive it with a `spike/` prefix)
3. **Keep the report** — the knowledge is the deliverable
4. **Create implementation tasks** — if the spike was successful, create plan tasks based on what you learned

## Spike Patterns

Three shapes, each with a template in `references/spike-patterns.md`: A/B Comparison Spike, Feasibility Spike and Integration Spike. Follow the one that fits.

## Timebox Discipline

When the timebox expires:

| Situation | Action |
|-----------|--------|
| **Question answered** | Write report, move on |
| **Partial answer** | Write what you know, note remaining unknowns, then extend or accept the uncertainty (below) |
| **No answer** | Write what you tried, why it didn't work, recommend next steps |
| **Found a bigger problem** | Document it, stop the spike, and report it to the user |

Extend a timebox by at most half its length. If a 2-hour spike isn't answered in 3 hours, the question is probably too broad: split it into smaller spikes.

**Asking the user.** Ask with your question tool if you have one, offering at most three options; otherwise ask in plain text with a numbered list. In a headless or unattended run nobody will answer: take the default named below, say so in your output, and log it in the run state's decisions if there is a run state.

For a partial answer, options: extend the timebox (by at most half), accept the partial answer, or split the unknowns into a new spike. Default when nobody answers: accept the partial answer and write the report with the remaining unknowns listed, since an extension spends time nobody approved.

## Common Mistakes

A spike that grows into a prototype, has no timebox or no question, gets merged, or ends without a report: `references/common-mistakes.md`.

## Integration with Other Skills

| Situation | Skill |
|-----------|-------|
| Spike succeeded, need to plan implementation | ab-writing-plans |
| Spike revealed the approach is too complex | ab-brainstorming (re-explore alternatives) |
| Spike found a bug in existing code | ab-systematic-debugging |
| Spike compared dependencies | ab-dependency-management |
| Spike findings affect architecture | Document in docs/decisions/ as an ADR |
