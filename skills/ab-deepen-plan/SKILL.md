---
name: ab-deepen-plan
description: "Enriches an existing plan with research: five read-only helpers run in parallel (prior solutions, best practices, current framework docs, the files and dependencies the change touches, git history), their findings go under each plan section as Research Notes without changing its tasks or order, and a plan-checker flags conflicts with the plan's approach. Use when a plan exists but is thin on framework detail, prior art or constraints (suggest it before execution starts), or when the user asks to deepen, enrich, research or flesh out a plan. Not for writing a plan when none exists (ab-writing-plans) or research without a plan (ab-deep-research)."
argument-hint: "[path to plan file]"
---

# Deepen Plan — Parallel Plan Enrichment

Research helpers run in parallel to enrich an existing plan with deeper context, best practices, prior solutions and framework-specific guidance. The run is done when the plan file carries research notes under the sections the research informed, any conflict is flagged in the plan, and the report is out. Deepening adds context to a plan; it never re-plans it.

**Announce at start:** "Deepening plan with parallel research helpers."

## Step 1: Load the Plan

If the request names a plan file, read it. Otherwise, find the most recent plan in `docs/plans/` (sort by date prefix, pick latest).

If no plan file is found, report "No plan file found. Write a plan first with the ab-brainstorming skill or specify a path." and stop.

Read the full plan file. Identify:
- Each section/task in the plan
- Technologies, frameworks, and libraries referenced
- Files and modules that will be modified
- The overall feature being built

## Step 2: Load Project Configuration

Check `blueprint.local.md` for configured research helpers. If it names none, use the five defaults: learnings-researcher (past solutions in `docs/solutions/`), best-practices-researcher (industry standards for the approach), framework-docs-researcher (current docs for the libraries used), codebase-context-mapper (files and dependencies the change affects) and git-history-analyzer (history of the files being modified).

## Step 3: Dispatch All Researchers in Parallel

Start every selected helper at once: they do not depend on each other, so the step takes only as long as the slowest one.

**Helper step.** Start a helper (subagent) for this step if you can, with the prompt file named below (its absolute path when the helper can read it, else its full text) and the listed inputs; leave its model and effort at the session's. If you cannot start one, follow the prompt file yourself. Either way, return its Output section, and note which path ran in the run's provenance record if there is one.

Prompt files and inputs. Each helper also gets the plan content and returns its findings organized by plan section:
- `references/agents/learnings-researcher.md`: prior work in docs/solutions/ related to [feature], with [plan summary] as context; findings as bullet points.
- `references/agents/best-practices-researcher.md`: industry best practices for [technologies/patterns in plan].
- `references/agents/framework-docs-researcher.md`: current documentation for [frameworks referenced in plan], focused on API patterns, version constraints and gotchas.
- `references/agents/codebase-context-mapper.md`: all files and dependencies affected by [feature description], with integration points, shared utilities and potential conflicts.
- `references/agents/git-history-analyzer.md`: git history of the files the plan references ([file list]): patterns, past refactors and contributors.

**Lower effort.** This step is safe at lower effort. If your host lets you set effort for a single helper, you may start this one lower, unless the user asked for their level everywhere; otherwise it runs at the session's level. Never switch models to save effort.

## Step 4: Collect and Merge

When all helpers return, add a `### Research Notes` subsection to each plan section with what the helpers found for it: prior solutions, best practices and recommendations, framework constraints and API notes, file dependencies and integration points, and historical context and patterns.

**Merge rules.** The plan's structure, tasks and order are decisions already made, and the executor follows them task by task, so research informs the plan without re-planning it:
- Keep the plan's structure, tasks and ordering as they are
- Add no new tasks; add research context to existing ones only
- Remove nothing from the original plan
- Add findings as supplementary notes that inform implementation: constraints, citations, gotchas. Don't paste implementation code into the plan; a plan records decisions, and the executor writes the code
- If researchers contradict each other, note both perspectives and flag for the implementer
- If a researcher found nothing relevant for a section, omit that section's entry (no empty notes)

## Step 5: Re-verify

After enrichment, run the plan-checker on the updated plan to verify the research notes don't conflict with the plan's approach. It runs at the session's effort, because its judgment is the point of the step.

**Helper step.** Start a helper (subagent) for this step if you can, with the prompt file named below (its absolute path when the helper can read it, else its full text) and the listed inputs; leave its model and effort at the session's. If you cannot start one, follow the prompt file yourself. Either way, return its Output section, and note which path ran in the run's provenance record if there is one.

Prompt: `references/agents/plan-checker.md`. Inputs: Verify the enriched plan at [plan file path]. Check for conflicts between research notes and the plan's approach. Report BLOCKING issues only.

If the plan-checker finds new issues introduced by research (for example, a best practice contradicts the plan's approach), flag the conflict clearly in the plan and leave the approach as it is: that choice belongs to the implementer or the calling workflow.

## Step 6: Report

Update the plan file with enriched content, then report in the format in `references/report.md`.

**Called from a pipeline** (ab-build-pipeline or ab-ship-pipeline): skip the execution options and return to the calling workflow. The pipeline controls execution in its next stage.

**Called standalone** (the user asked for it directly): offer execution, ending with "Ready to execute. Which approach?"

**Asking the user.** Ask with your question tool if you have one, offering at most three options; otherwise ask in plain text with a numbered list. In a headless or unattended run nobody will answer: take the default named below, say so in your output, and log it in the run state's decisions if there is a run state.

Default when nobody answers: stop here (option 3), with the plan path and the report in the output, and start nothing, because the run was asked to deepen the plan and executing it is a separate decision. Options:
1. **Subagent-driven, in this session**, with the ab-subagent-driven-development skill: a fresh helper per task and a review between tasks. Good for hands-on oversight.
2. **Team work** with the ab-orchestrate skill: waves through a task ledger, independent tasks in parallel within a wave, each helper owning its files, the lead committing, and a native team feature (such as Claude Code Agent Teams or Codex multi_agent_v2) when one is switched on. Faster for plans with concurrent tasks.
3. **Stop here**, with the deepened plan saved.
