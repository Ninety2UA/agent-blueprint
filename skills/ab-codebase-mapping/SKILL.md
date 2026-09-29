---
name: ab-codebase-mapping
description: "Maps an unfamiliar codebase, read-only, before anyone changes it: a helper (one per major module when the codebase is large) surveys the architecture, module responsibilities, data flow, conventions, tech stack and concerns, citing file paths, and the map is saved to docs/context/CODEBASE-MAP.md or a per-module map, with conventions and critical concerns carried into CONVENTIONS.md and BACKLOG.md. Use when joining a project, before modifying code nobody here has worked in, when onboarding someone, after a major refactor, or when the user asks how the code is structured, how it works or for an architecture overview. Not for tracking down a specific bug (use ab-systematic-debugging) or reviewing a document (use ab-document-review)."
argument-hint: "[optional: focus area or module name]"
---

# Codebase Mapping

Map an unfamiliar codebase, or one area of it, into structured documentation before making any changes. The map becomes the shared context for all subsequent development work. The run is done when the map is saved under `docs/context/` and its key findings are presented to the user.

## When to Use

- Joining a new project for the first time
- Before modifying a module you haven't worked in before
- When onboarding new team members who need codebase orientation
- After a major refactor to update the team's mental model

## The Iron Law

Change no source code, tests or configuration until the map is complete and saved. Mapping is read-only, because an edit made mid-map changes the thing being mapped and mixes two tasks that should be reviewed apart. When you find something that needs fixing, add it to the map's Concerns section instead of fixing it inline.

## Process

### Step 1: Dispatch the Mapper

Hand the mapping to the codebase-mapper helper, scoped to what the user asked for: the focus area or module they named, or the full project when they named none.

**Helper step.** Start a helper (subagent) for this step if you can, with the prompt file named below (its absolute path when the helper can read it, else its full text) and the listed inputs; leave its model and effort at the session's. If you cannot start one, follow the prompt file yourself. Either way, return its Output section, and note which path ran in the run's provenance record if there is one.

Prompt: `references/agents/codebase-mapper.md`. Inputs:

```
Task: Map the [project/module] codebase.
Focus area: [specific area if provided, or "full project"]
Save findings in the format specified by your output template.
```

**Lower effort.** This step is safe at lower effort. If your host lets you set effort for a single helper, you may start this one lower, unless the user asked for their level everywhere; otherwise it runs at the session's level. Never switch models to save effort.

If the codebase is large, start several mapper helpers in parallel, one per major module or directory, each with the same prompt file and its own focus area. Where helpers cannot run in parallel, map the modules one after another.

### Step 2: Review the Map

When the helper returns, review the map for:
- Completeness — are all major modules covered?
- Accuracy — do the descriptions match what you see in the code?
- Actionability — can a developer use this to navigate the codebase?

With several helpers, merge their maps into one before this review.

### Step 3: Save the Map

Save the map to `docs/context/CODEBASE-MAP.md` (or `docs/context/MAP-[module-name].md` for focused maps).

If `docs/context/CONVENTIONS.md` doesn't exist yet, extract the convention findings from the map into a new CONVENTIONS.md.

Add the critical concerns to `BACKLOG.md` as well, so they are not lost once the session ends.

### Step 4: Orient the Session

Present the key findings to the user:
- Architecture pattern and primary data flow
- Top concerns (ordered by severity)
- Recommended areas to investigate further

## Quick Reference

| Input | Output |
|-------|--------|
| Full project | `docs/context/CODEBASE-MAP.md` |
| Specific module | `docs/context/MAP-[module].md` |
| Conventions found | Update `docs/context/CONVENTIONS.md` |
| Concerns found | List in map + add critical ones to `BACKLOG.md` |

## Common Mistakes

**Mapping too deep too early** — Start with the top 3 directory levels. Go deeper only in areas the user needs to modify. A complete map of a large codebase is a project, not a task.

**Modifying code while mapping** — The map must be done before changes start. If you find a bug, note it. Don't fix it mid-map.

**Mapping without a focus** — If the user says "map the auth module," don't map the entire codebase. Stay focused on what's needed for the current task.
