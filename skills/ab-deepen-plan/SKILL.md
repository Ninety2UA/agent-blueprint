---
name: ab-deepen-plan
description: "Trigger this skill when a plan exists but lacks depth, research backing, or framework-specific details. Trigger when the user says 'deepen', 'enrich the plan', 'add more detail', 'research the plan', 'more context for the plan', 'flesh out the plan', 'the plan is too thin', or 'add best practices to the plan'. Even trigger when a plan seems thin on framework-specific guidance, prior art, or implementation details — proactively suggest deepening before execution begins. Dispatches all configured research helpers in parallel to add best practices, prior solutions, and framework docs to each plan section. DO NOT TRIGGER when no plan exists yet — use ab-writing-plans first. DO NOT TRIGGER for general research unrelated to an existing plan — use ab-deep-research instead."
argument-hint: "[path to plan file]"
---

# Deepen Plan — Parallel Plan Enrichment

Dispatch multiple research helpers in parallel to enrich an existing plan with deeper context, best practices, prior solutions, and framework-specific guidance.

**Announce at start:** "Deepening plan with parallel research helpers."

## Step 1: Load the Plan

If arguments specify a plan file path, read it. Otherwise, find the most recent plan in `docs/plans/` (sort by date prefix, pick latest).

If no plan file found, report: "No plan file found. Write a plan first with the ab-brainstorming skill or specify a path."

Read the full plan file. Identify:
- Each section/task in the plan
- Technologies, frameworks, and libraries referenced
- Files and modules that will be modified
- The overall feature being built

## Step 2: Load Project Configuration

Check `blueprint.local.md` for configured research helpers. If not found, use defaults.

**Default research helpers:**
- **learnings-researcher** — search `docs/solutions/` for relevant past solutions
- **best-practices-researcher** — industry standards for the approach
- **framework-docs-researcher** — current docs for libraries being used
- **codebase-context-mapper** — files and dependencies affected by the change
- **git-history-analyzer** — historical context for files being modified

## Step 3: Dispatch All Researchers in Parallel

Dispatch all selected helpers simultaneously.

**Helper step.** Start a helper (subagent) for this step if you can, with the prompt file named below (its absolute path when the helper can read it, else its full text) and the listed inputs; leave its model and effort at the session's. If you cannot start one, follow the prompt file yourself. Either way, return its Output section, and note which path ran in the run's provenance record if there is one.

Each helper gets the plan content plus a focused research prompt:
- `references/agents/learnings-researcher.md`: Search docs/solutions/ for prior work related to: [feature]. Plan context: [plan summary]. Return findings as bullet points organized by plan section.
- `references/agents/best-practices-researcher.md`: Research industry best practices for: [technologies/patterns in plan]. Return recommendations organized by plan section.
- `references/agents/framework-docs-researcher.md`: Gather current documentation for: [frameworks referenced in plan]. Focus on API patterns, version constraints, and gotchas. Return findings organized by plan section.
- `references/agents/codebase-context-mapper.md`: Map all files and dependencies affected by: [feature description]. Identify integration points, shared utilities, and potential conflicts. Return file map organized by plan section.
- `references/agents/git-history-analyzer.md`: Analyze git history for files referenced in this plan: [file list]. Identify patterns, past refactors, and contributors. Return historical context organized by plan section.

**Lower effort.** This step is safe at lower effort. If your host lets you set effort for a single helper, you may start this one lower, unless the user asked for their level everywhere; otherwise it runs at the session's level. Never switch models to save effort.

**Important:** Start ALL helpers at once to maximize parallelism.

## Step 4: Collect and Merge

When all helpers return, integrate their findings into the plan:

For each section of the plan, add a `### Research Notes` subsection containing:
- Relevant prior solutions (from learnings-researcher)
- Best practices and recommendations (from best-practices-researcher)
- Framework constraints and API notes (from framework-docs-researcher)
- File dependencies and integration points (from codebase-context-mapper)
- Historical context and patterns (from git-history-analyzer)

**Merge rules:**
- Do NOT change the plan's structure, tasks, or ordering
- Do NOT add new tasks — only add research context to existing ones
- Do NOT remove anything from the original plan
- Add findings as supplementary notes that inform implementation: constraints, citations, gotchas. Don't paste implementation code into the plan; a plan records decisions, and the executor writes the code
- If researchers contradict each other, note both perspectives and flag for the implementer
- If a researcher found nothing relevant for a section, omit that section's entry (no empty notes)

## Step 5: Re-verify

After enrichment, dispatch the **plan-checker** helper on the updated plan to verify the research notes don't conflict with the plan's approach.

**Helper step.** Start a helper (subagent) for this step if you can, with the prompt file named below (its absolute path when the helper can read it, else its full text) and the listed inputs; leave its model and effort at the session's. If you cannot start one, follow the prompt file yourself. Either way, return its Output section, and note which path ran in the run's provenance record if there is one.

Prompt: `references/agents/plan-checker.md`. Inputs: Verify the enriched plan at [plan file path]. Check for conflicts between research notes and the plan's approach. Report BLOCKING issues only.

If the plan-checker finds new issues introduced by research (e.g., a best practice contradicts the plan's approach):
- Flag the conflict clearly in the plan
- Do NOT change the plan's approach — leave the decision to the implementer or the calling workflow

## Step 6: Report

Update the plan file with enriched content. Report:

```markdown
## Plan Deepened

- Research helpers dispatched: [N]
- Sections enriched: [N] of [total]
- Prior solutions found: [N]
- Best practices added: [N]
- Framework notes added: [N]
- File dependencies mapped: [N]
- Historical patterns noted: [N]
- Conflicts flagged: [N]

Plan updated: [path to plan file]
```

**If called from a pipeline** (ab-build-pipeline or ab-ship-pipeline): skip execution options and return to the calling workflow. The pipeline controls execution in its next stage.

**If called standalone** (user invoked directly): offer execution options:

**"Ready to execute. Which approach?**

**1. Subagent-Driven (this session)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Good for hands-on oversight.

**2. Team work (ab-orchestrate skill)** — Runs the plan in waves through a task ledger: independent tasks run in parallel within each wave, each helper owns its files, and the lead commits. Uses Claude Code Agent Teams or Codex multi_agent_v2 when switched on. Faster total time for plans with concurrent tasks.

**Which approach?"**
