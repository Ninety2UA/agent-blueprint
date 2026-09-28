---
name: codebase-mapping
description: "Trigger this skill when the user needs to understand a codebase before modifying it — even if they don't explicitly ask for a map. Trigger when the user says 'map the code', 'understand this codebase', 'how is this structured', 'architecture overview', 'onboarding', 'what does this do', 'walk me through this', 'how does this work', 'explain the architecture', 'give me the lay of the land', or 'I'm new to this project'. Trigger before modifying unfamiliar code, when joining a new project, when onboarding new team members, or after a major refactor to update the team's mental model. This is a read-only analysis — no code changes. Produces structured documentation of architecture, dependencies, patterns, and concerns. DO NOT TRIGGER for targeted code investigation of a specific bug — use systematic-debugging instead. DO NOT TRIGGER for reviewing a specific document — use document-review instead."
argument-hint: "[optional: focus area or module name]"
---

# Codebase Mapping

## Overview

Map an unfamiliar codebase into structured documentation before making any changes. The map becomes the shared context for all subsequent development work.

## When to Use

- Joining a new project for the first time
- Before modifying a module you haven't worked in before
- When onboarding new team members who need codebase orientation
- After a major refactor to update the team's mental model

## The Iron Law

<HARD-GATE>
Do NOT modify any source code, tests, or configuration until the codebase map is complete and saved. Mapping is a read-only operation. If you discover something that needs fixing, add it to the map's Concerns section — not inline.
</HARD-GATE>

## Process

### Step 1: Dispatch the Mapper

Dispatch the **codebase-mapper** agent with the scope of the mapping:

```
Task: Map the [project/module] codebase.
Focus area: [specific area if provided, or "full project"]
Save findings in the format specified by your output template.
```

If the codebase is large, dispatch multiple mapper agents in parallel — one per major module or directory.

### Step 2: Review the Map

When the agent returns, review the map for:
- Completeness — are all major modules covered?
- Accuracy — do the descriptions match what you see in the code?
- Actionability — can a developer use this to navigate the codebase?

### Step 3: Save the Map

Save the map to `docs/context/CODEBASE-MAP.md` (or `docs/context/MAP-[module-name].md` for focused maps).

If `docs/context/CONVENTIONS.md` doesn't exist yet, extract the convention findings from the map into a new CONVENTIONS.md.

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
