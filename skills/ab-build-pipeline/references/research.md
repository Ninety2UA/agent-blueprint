# Research helpers

Loaded on demand from SKILL.md at Stage 3, before the plan is written, so the plan starts from prior work, current framework docs and a map of the code it touches.

Start only the helpers whose question is still open, all at the same time; each one reads the code afresh, so on a change you can already see whole it costs more than reading the files yourself:

- learnings researcher: when `docs/solutions/` has entries. An empty or missing folder has nothing to find.
- framework docs researcher: when the work adds or upgrades a dependency, or uses a framework API the code does not use yet. A change that follows patterns already in the code needs no fresh docs.
- codebase context mapper: when the change crosses modules or reaches code you have not read. For a few files you have read, map them yourself.

Note each helper you skip, with its reason ("no prior solutions", "no new dependency", "two files, both read"), in the plan's research notes, so the plan shows it was considered.

Bring the findings into the plan.

**Helper step.** Start a fresh helper (subagent, not a fork of this conversation) for this step if you can, with the prompt file named below (its absolute path if it can read it, else its full text) and the listed inputs; keep the session's model and effort, and wait for it. If you cannot, follow the prompt file yourself. Either way, return its Output section, and note which path ran in any provenance record.

Prompt files and inputs:
- `references/agents/learnings-researcher.md`: Search docs/solutions/ for relevant prior work related to: [feature]. Return findings as bullet points.
- `references/agents/framework-docs-researcher.md`: Gather current documentation for [frameworks involved]. Focus on API patterns, version constraints, and gotchas.
- `references/agents/codebase-context-mapper.md`: Map all files and dependencies affected by: [feature description]. Identify integration points and potential conflicts.

**Lower effort.** This step is safe at lower effort. If your host lets you set effort for a single helper, you may start this one lower, unless the user asked for their level everywhere; otherwise it runs at the session's level. Never switch models to save effort.
