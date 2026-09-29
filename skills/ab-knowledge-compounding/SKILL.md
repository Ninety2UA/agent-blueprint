---
name: ab-knowledge-compounding
description: "Records a solved problem as a searchable solution document in docs/solutions/ (problem, root cause, solution, failed approaches, key insight, search terms), cross-links it to related solutions and decisions, and adds a one-line learning to the project instructions file when the lesson applies broadly. Also runs a gardening pass that prunes stale, orphaned or contradictory entries. Use after a non-trivial bug fix, a framework gotcha or version-specific behavior, a reusable pattern, or an architectural decision with real trade-offs, when the lesson is one the code, tests and commit message do not already carry; when the user asks to document, save or remember a solution so it is not hit again; or to tidy the knowledge base. Not for typos, import fixes, one-off config changes, or anything framework docs, a regression test or a code comment already covers."
argument-hint: "<brief description of what was solved>"
---

# Knowledge Compounding

Each solved problem should make the next one easier. This skill turns a solved problem into a structured document in `docs/solutions/`, a knowledge base that the learnings-researcher helper (in the ab-deep-research, ab-deepen-plan and pipeline skills) searches before new work starts. Solve a problem once; benefit every time a similar one comes up.

A run ends with a new or updated solution document and the Step 5 confirmation, or with a plain statement that nothing cleared the bar.

## When to Use

- After solving a non-trivial bug (not typos or config fixes)
- After implementing a pattern that could be reused
- After discovering a framework gotcha or version-specific behavior
- After a debugging session that uncovered a non-obvious root cause
- After making an architectural decision with significant trade-offs
- When the user asks for it, or says "document this for future reference"

Not for trivial fixes (typos, import corrections), one-off config changes, or changes framework docs already cover well.

For a pass over existing documents rather than a new one, go to the Gardening Checklist below.

## Process

### Step 1: Identify the Knowledge

Answer for yourself:
1. **What problem was solved?** The symptom and the root cause.
2. **What approach worked?** The solution, not just the fix.
3. **What did we try that didn't work?** Failed approaches save the next reader the most time.
4. **What would we do differently?** The retrospective insight.
5. **When would this apply again?** The search keywords.
6. **Do the code and tests already preserve this?** If a regression test fails when someone repeats the mistake, or a comment beside the fix explains it, a solution doc adds nothing. Capture only what a future reader couldn't recover from the code, the tests and the commit message.

If nothing clears the bar (the fix was trivial, or framework docs already cover it), say so, for example "nothing from this session is worth a solution doc", and stop there rather than ending silently. Being invoked doesn't oblige a new file.

### Step 2: Write the Solution Document

Create `docs/solutions/YYYY-MM-DD-[slug].md` from `references/solution-doc.md` § Template, and check it against § Quality Bar and § Common Mistakes in the same file. Aim for 50 to 100 lines: enough for the root cause and the failed approaches, short enough to read in a minute.

### Step 3: Cross-Reference

Check whether the solution relates to:
- Existing docs in `docs/solutions/`: add cross-references.
- Architecture decisions in `docs/decisions/`: link them if relevant.
- **Project instructions file:** if the learning applies broadly, a one-line entry in its Learnings section (Key Learnings in older projects). The file is AGENTS.md, or CLAUDE.md when only that one exists; this is the one step that writes it. Keep the entry to one line, because that file loads in every session.

### Step 4: Verify Searchability

The learnings-researcher finds documents by keyword, so check that:
- the title contains the key technology or pattern name;
- the tags cover the relevant domains;
- the Problem section includes the error message or symptom text;
- the `applies-to` field matches how a future planner would describe the area.

### Step 5: Confirm

Tell the user:
```
Knowledge compounded: docs/solutions/[filename]
Tags: [tags]
Future ab-deep-research and planning runs will find this automatically.
```

How other skills use these documents: `references/solution-doc.md` § How This Integrates with Other Skills.

## Gardening Checklist

Compounding isn't only additive: the knowledge base needs periodic weeding. A gardening pass runs when the user asks to tidy, prune or audit the knowledge base, or when the ab-session-wrap skill's learnings step (Step 5) finds a new learning that contradicts or supersedes an existing one.

Run the checks in `references/gardening.md` § Checks over the affected documents (all of `docs/solutions/` when the user asked for a full audit), fix or remove what fails as each check says, and tell the user what changed and why.
