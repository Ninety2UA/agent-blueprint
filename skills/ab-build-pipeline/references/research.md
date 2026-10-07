# Research helpers

Loaded on demand from SKILL.md at Stage 3, before the plan is written, so the plan starts from prior work, current framework docs and a map of the code it touches.

Start the three research helpers in parallel, then bring their findings into the plan.

**Helper step.** Start a helper (subagent) for this step if you can, with the prompt file named below (its absolute path when the helper can read it, else its full text) and the listed inputs; leave its model and effort at the session's. If you cannot start one, follow the prompt file yourself. Either way, return its Output section, and note which path ran in the run's provenance record if there is one.

Prompt files and inputs:
- `references/agents/learnings-researcher.md`: Search docs/solutions/ for relevant prior work related to: [feature]. Return findings as bullet points.
- `references/agents/framework-docs-researcher.md`: Gather current documentation for [frameworks involved]. Focus on API patterns, version constraints, and gotchas.
- `references/agents/codebase-context-mapper.md`: Map all files and dependencies affected by: [feature description]. Identify integration points and potential conflicts.

**Lower effort.** This step is safe at lower effort. If your host lets you set effort for a single helper, you may start this one lower, unless the user asked for their level everywhere; otherwise it runs at the session's level. Never switch models to save effort.
