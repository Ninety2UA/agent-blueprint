---
name: ab-deep-research
description: "Trigger this skill when the user needs comprehensive context gathering before planning or building. Trigger when the user says 'research', 'deep research', 'investigate', 'understand X before building', 'what are best practices for', 'how does this work', 'context gathering', 'I need to learn about', 'what's the state of the art', or 'explore the landscape'. Trigger before planning anything that touches unfamiliar code, before architectural decisions involving technologies the team hasn't used, or when onboarding to a new area of the codebase. Even if the user doesn't explicitly ask for research, proactively suggest it when they're about to plan or build in an area with significant unknowns. Runs 5 research helpers in parallel and synthesizes into a unified brief. DO NOT TRIGGER for small well-understood changes with obvious approaches — use ab-quick-fix instead. DO NOT TRIGGER for debugging production issues or test failures — use ab-systematic-debugging instead. DO NOT TRIGGER for enriching an existing plan — use ab-deepen-plan instead."
argument-hint: "<topic or feature to research>"
---

# Deep Research — Multi-Agent Parallel Research

Spawn a swarm of research helpers in parallel, then synthesize their findings into a unified research brief that feeds into planning.

**Announce at start:** "Starting deep research on: [topic]"

**Not the bundled workflow:** Claude Code ships its own deep-research workflow, a web-search fan-out that starts only when invoked manually (CLI 2.1.218). This skill is the five-helper research swarm below; its `ab-` name keeps the two apart in every tool's skill list.

## Step 0: Load Project Configuration

Check `blueprint.local.md` for configured research helpers. If not found, use defaults below.

## Step 1: Define Research Questions

Based on the topic, formulate specific research questions for each helper:

1. **What has been done before?** (learnings-researcher)
2. **What do the frameworks/libraries recommend?** (framework-docs-researcher)
3. **What are industry best practices?** (best-practices-researcher)
4. **Why does the current code look this way?** (git-history-analyzer)
5. **What files and dependencies will this change touch?** (codebase-context-mapper)

## Step 2: Dispatch Research Helpers in Parallel

Dispatch ALL research helpers simultaneously:

**Helper step.** Start a helper (subagent) for this step if you can, with the prompt file named below (its absolute path when the helper can read it, else its full text) and the listed inputs; leave its model and effort at the session's. If you cannot start one, follow the prompt file yourself. Either way, return its Output section, and note which path ran in the run's provenance record if there is one.

Prompt files and inputs:
- `references/agents/learnings-researcher.md`: Search docs/solutions/ and docs/research/ for past work related to [topic]. Report findings with file references.
- `references/agents/framework-docs-researcher.md`: Research the documentation and best practices for [relevant frameworks] related to [topic]. Check installed versions in dependency files.
- `references/agents/best-practices-researcher.md`: Research industry best practices and common patterns for implementing [topic]. Focus on practical, proven approaches.
- `references/agents/git-history-analyzer.md`: Analyze git history for files related to [topic]. Understand why the current code structure exists and what changes have been made previously.
- `references/agents/codebase-context-mapper.md`: Map all files, functions, and integration points that would be affected by implementing [topic]. Produce a focused impact map.

**Lower effort.** This step is safe at lower effort. If your host lets you set effort for a single helper, you may start this one lower, unless the user asked for their level everywhere; otherwise it runs at the session's level. Never switch models to save effort.

**Important:** Start ALL helpers at once to maximize parallelism.

**Session caps:** Claude Code no longer caps subagents per session (the 200-subagent total was removed in CLI 2.1.224). What applies now is a concurrency cap of 20 subagents by default (`CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`, 2.1.217) and a nesting depth of 3 by default (`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`, 2.1.219); WebSearch stays at 200 per session. A standard research swarm (5 helpers) stays well within all three, but any subagent a researcher spawns itself counts against the depth-3 default, and large or repeated sweeps in one session should still track cumulative search usage.

## Step 3: Synthesize

When all helpers return, dispatch the **research-synthesizer** helper:

**Helper step.** Start a helper (subagent) for this step if you can, with the prompt file named below (its absolute path when the helper can read it, else its full text) and the listed inputs; leave its model and effort at the session's. If you cannot start one, follow the prompt file yourself. Either way, return its Output section, and note which path ran in the run's provenance record if there is one.

Prompt: `references/agents/research-synthesizer.md`. Inputs: Synthesize these research outputs into one unified brief: [all helper outputs]. Focus on: consensus findings, unique insights, contradictions, and gaps.

## Step 4: Save and Present

Save the synthesized brief to `docs/research/YYYY-MM-DD-[topic-slug].md`.

Present to the user:
- **Key findings** (consensus across agents)
- **Unique insights** (from individual agents)
- **Contradictions** (where agents disagreed)
- **Gaps** (what needs further investigation)
- **Recommended approach** (based on all evidence)

Ask: **"Research complete. Ready to start brainstorming based on these findings?"**

If the user confirms, the ab-brainstorming skill will automatically pick up the research brief from `docs/research/`.

## When to Use

- Before planning any feature that touches unfamiliar code
- Before making architectural decisions
- When the user says "I want to understand X before building"
- When onboarding to a new area of the codebase
- Before a major refactor or migration

## When NOT to Use

- For small, well-understood changes (use ab-quick-fix skill instead)
- When you already have a clear plan (go straight to ab-brainstorming)
- For debugging (use ab-systematic-debugging skill instead)
