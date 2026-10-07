---
name: ab-deep-research
description: "Researches a topic before planning: five helpers run in parallel (past learnings in docs/solutions/ and docs/research/, framework docs for the installed versions, industry best practices, git history, and a map of the code the change touches), and a synthesizer merges them into one brief in docs/research/ with consensus, unique insights, contradictions, gaps and a recommended approach. Use when planning or building in unfamiliar code or technology, before an architectural decision, major refactor or migration, when onboarding to an area of the codebase, or when the user asks to research, investigate or learn best practices before building. Not for a small, well-understood change (ab-quick-fix), debugging a failure (ab-systematic-debugging) or enriching an existing plan (ab-deepen-plan)."
argument-hint: "<topic or feature to research>"
metadata:
  version: "4.0.1"
---

# Deep Research — Multi-Agent Parallel Research

Five research helpers work in parallel, a synthesizer merges what they find, and the run ends with one research brief in `docs/research/` that feeds planning. This is not Claude Code's bundled deep-research workflow; see `references/host-notes.md` § Not the bundled workflow.

**Announce at start:** "Starting deep research on: [topic]"

**Working folder.** Blueprint working files live under `.agent-blueprint/` in the project root. Before the first write there, make sure `.agent-blueprint/.gitignore` exists and lists `run/`, `team/`, `review-runs/`, `cache/` and `.gitignore`, so run state and the ignore file itself stay out of commits while plans and notes stay tracked.

**Provenance record.** Before any other work, run this as written from the project root: `mkdir -p .agent-blueprint/run/provenance && date -u +'{"skill": "ab-deep-research", "version": "4.0.1", "started_at": "%Y-%m-%dT%H:%M:%SZ", "helper_steps": []}' > .agent-blueprint/run/provenance/ab-deep-research.json`. It replaces any older record, and the Working folder step above has already made sure of `.agent-blueprint/.gitignore`. Each Helper step adds `{step, path: helper|inline}` to `helper_steps`. The record tells a run, and the smoke test, which skill ran and how; it is not a security control.

## Step 0: Load Project Configuration

Check `blueprint.local.md` for configured research helpers. If it names none, use the five below.

## Step 1: Define Research Questions

Based on the topic, formulate specific research questions for each helper:

1. **What has been done before?** (learnings-researcher)
2. **What do the frameworks/libraries recommend?** (framework-docs-researcher)
3. **What are industry best practices?** (best-practices-researcher)
4. **Why does the current code look this way?** (git-history-analyzer)
5. **What files and dependencies will this change touch?** (codebase-context-mapper)

## Step 2: Dispatch Research Helpers in Parallel

Start all the research helpers at once. They do not depend on each other, so the step takes only as long as the slowest one.

**Helper step.** Start a helper (subagent) for this step if you can, with the prompt file named below (its absolute path when the helper can read it, else its full text) and the listed inputs; leave its model and effort at the session's. If you cannot start one, follow the prompt file yourself. Either way, return its Output section, and note which path ran in the run's provenance record if there is one.

Prompt files and inputs:
- `references/agents/learnings-researcher.md`: Search docs/solutions/ and docs/research/ for past work related to [topic]. Report findings with file references.
- `references/agents/framework-docs-researcher.md`: Research the documentation and best practices for [relevant frameworks] related to [topic]. Check installed versions in dependency files.
- `references/agents/best-practices-researcher.md`: Research industry best practices and common patterns for implementing [topic]. Focus on practical, proven approaches.
- `references/agents/git-history-analyzer.md`: Analyze git history for files related to [topic]. Understand why the current code structure exists and what changes have been made previously.
- `references/agents/codebase-context-mapper.md`: Map all files, functions, and integration points that would be affected by implementing [topic]. Produce a focused impact map.

**Lower effort.** This step is safe at lower effort. If your host lets you set effort for a single helper, you may start this one lower, unless the user asked for their level everywhere; otherwise it runs at the session's level. Never switch models to save effort.

Helper and search limits on Claude Code: `references/host-notes.md` § Session caps.

## Step 3: Synthesize

When all helpers return, start the research-synthesizer. It keeps the session's effort: weighing the findings against each other is the judgment this run is for.

**Helper step.** Start a helper (subagent) for this step if you can, with the prompt file named below (its absolute path when the helper can read it, else its full text) and the listed inputs; leave its model and effort at the session's. If you cannot start one, follow the prompt file yourself. Either way, return its Output section, and note which path ran in the run's provenance record if there is one.

Prompt: `references/agents/research-synthesizer.md`. Inputs: Synthesize these research outputs into one unified brief: [all helper outputs]. Focus on: consensus findings, unique insights, contradictions, and gaps.

## Step 4: Save and Present

Save the synthesized brief to `docs/research/YYYY-MM-DD-[topic-slug].md`.

Present to the user:
- **Key findings** (consensus across helpers)
- **Unique insights** (from individual helpers)
- **Contradictions** (where helpers disagreed)
- **Gaps** (what needs further investigation)
- **Recommended approach** (based on all evidence)

**Asking the user.** Ask with your question tool if you have one, offering at most three options; otherwise ask in plain text with a numbered list. In a headless or unattended run nobody will answer: take the default named below, say so in your output, and log it in the run state's decisions if there is a run state.

Ask "Research complete. Ready to start brainstorming based on these findings?" Options: start brainstorming (the ab-brainstorming skill picks up the brief from `docs/research/`), or stop here. Default when nobody answers: stop here, with the brief's path in the output.
