---
name: ab-deepen-plan
description: "Trigger this skill when a plan exists but lacks depth, research backing, or framework-specific details. Trigger when the user says 'deepen', 'enrich the plan', 'add more detail', 'research the plan', 'more context for the plan', 'flesh out the plan', 'the plan is too thin', or 'add best practices to the plan'. Even trigger when a plan seems thin on framework-specific guidance, prior art, or implementation details — proactively suggest deepening before execution begins. Dispatches all configured research agents in parallel to add best practices, prior solutions, and framework docs to each plan section. DO NOT TRIGGER when no plan exists yet — use ab-writing-plans first. DO NOT TRIGGER for general research unrelated to an existing plan — use ab-deep-research instead."
argument-hint: "[path to plan file]"
---

# Deepen Plan — Parallel Plan Enrichment

Dispatch multiple research agents in parallel to enrich an existing plan with deeper context, best practices, prior solutions, and framework-specific guidance.

**Announce at start:** "Deepening plan with parallel research agents."

## Step 1: Load the Plan

If arguments specify a plan file path, read it. Otherwise, find the most recent plan in `docs/plans/` (sort by date prefix, pick latest).

If no plan file found, report: "No plan file found. Write a plan first with the ab-brainstorming skill or specify a path."

Read the full plan file. Identify:
- Each section/task in the plan
- Technologies, frameworks, and libraries referenced
- Files and modules that will be modified
- The overall feature being built

## Step 2: Load Project Configuration

Check `blueprint.local.md` for configured research agents. If not found, use defaults.

**Default research agents:**
- **learnings-researcher** — search `docs/solutions/` for relevant past solutions
- **best-practices-researcher** — industry standards for the approach
- **framework-docs-researcher** — current docs for libraries being used
- **codebase-context-mapper** — files and dependencies affected by the change
- **git-history-analyzer** — historical context for files being modified

## Step 3: Dispatch All Researchers in Parallel

Use the Task tool to dispatch all selected agents simultaneously. Each agent gets the plan content plus a focused research prompt:

```
Task("learnings-researcher: Search docs/solutions/ for prior work related to: [feature]. Plan context: [plan summary]. Return findings as bullet points organized by plan section.")

Task("best-practices-researcher: Research industry best practices for: [technologies/patterns in plan]. Return recommendations organized by plan section.")

Task("framework-docs-researcher: Gather current documentation for: [frameworks referenced in plan]. Focus on API patterns, version constraints, and gotchas. Return findings organized by plan section.")

Task("codebase-context-mapper: Map all files and dependencies affected by: [feature description]. Identify integration points, shared utilities, and potential conflicts. Return file map organized by plan section.")

Task("git-history-analyzer: Analyze git history for files referenced in this plan: [file list]. Identify patterns, past refactors, and contributors. Return historical context organized by plan section.")
```

**Important:** Dispatch ALL agents in a single message to maximize parallelism.

## Step 4: Collect and Merge

When all agents return, integrate their findings into the plan:

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

After enrichment, use the Task tool to dispatch the **plan-checker** agent on the updated plan to verify the research notes don't conflict with the plan's approach.

```
Task("plan-checker: Verify the enriched plan at [plan file path]. Check for conflicts between research notes and the plan's approach. Report BLOCKING issues only.")
```

If the plan-checker finds new issues introduced by research (e.g., a best practice contradicts the plan's approach):
- Flag the conflict clearly in the plan
- Do NOT change the plan's approach — leave the decision to the implementer or the calling workflow

## Step 6: Report

Update the plan file with enriched content. Report:

```markdown
## Plan Deepened

- Research agents dispatched: [N]
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

**2. Parallel Orchestration (ab-orchestrate skill)** — Executes the wave plan: independent tasks run in parallel within each wave. Faster total time for plans with concurrent tasks.

**3. Agent Teams (ab-team-execution skill)** — Collaborative teammates with file ownership and shared task list. Best for 4+ tasks touching different areas. Requires `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`.

**Which approach?"**
