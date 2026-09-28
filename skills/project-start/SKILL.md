---
name: project-start
description: "Trigger this skill when the user says 'start', 'init', 'initialize', 'set up', 'new project', 'scaffold', 'configure project', 'get started', 'bootstrap', or anything suggesting they want to begin working with the blueprint on a project. Trigger even when the user just says 'I'm starting a new project' or 'I want to use the blueprint' without explicitly asking for setup. Also trigger proactively when docs/context/ doesn't exist or CLAUDE.md still has template placeholders — the project needs initialization even if the user didn't ask for it. Scaffolds project files (CLAUDE.md, docs/) and walks through interactive setup of conventions, goals, and status. DO NOT TRIGGER when the project is already initialized and the user wants a status update — use project-status instead. DO NOT TRIGGER when the user wants to resume prior work — use resume-session instead."
---

# Project Initialization

Walk the user through setting up their project documentation interactively. This should feel like a conversation, not a form.

## Step 0: Scaffold Project Files

Check if this is a fresh project that needs scaffolding:

1. Check if `docs/context/` exists. If it does, skip to Step 1.
2. If it doesn't exist, this project needs scaffolding. Copy the template files from the plugin's `templates/` directory:
   - Read each template file from the plugin's templates/ directory (use Glob on `templates/**/*` relative to the plugin root)
   - Write each file to the corresponding location in the current project directory:
     - `templates/CLAUDE.md` → `./CLAUDE.md`
     - `templates/BACKLOG.md` → `./BACKLOG.md`
     - `templates/blueprint.local.md` → `./blueprint.local.md`
     - `templates/.gitignore` → `./.gitignore` (merge with existing if present)
     - `templates/docs/**` → `./docs/**`
   - Create empty directories: `src/`, `tests/`, `infra/` (with `.gitkeep` files)
   - Skip any files that already exist in the project (no-overwrite)
3. Create a `scripts/ship.sh` wrapper script that invokes the plugin's `ship.sh`:
   ```bash
   #!/bin/bash
   # Wrapper for blueprint's ship.sh from plugin
   # Search common plugin cache locations
   for CANDIDATE in \
     "$HOME/.claude/plugins/cache/agent-blueprint/agent-blueprint"/*/scripts/ship.sh \
     "$HOME/.claude/plugins/marketplaces/agent-blueprint/scripts/ship.sh"; do
     if [ -f "$CANDIDATE" ]; then
       PLUGIN_SHIP="$CANDIDATE"
       break
     fi
   done
   if [ -z "${PLUGIN_SHIP:-}" ]; then
     echo "Blueprint plugin not found. Install: claude plugin install github:Ninety2UA/agent-blueprint"
     exit 1
   fi
   exec "$PLUGIN_SHIP" "$@"
   ```
4. Report what was scaffolded: "Created project structure with [N] template files."

## Step 1: Orient

Check what already exists:
- Read `CLAUDE.md` to confirm the template is in place
- Read `docs/context/CONVENTIONS.md`, `docs/context/GOALS.md`, `docs/context/STATUS.md`
- Run `ls src/` to see if there's existing source code
- Run `git log --oneline -5 2>/dev/null` to check if there's git history
- Check for common config files: `package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, `Gemfile`, `pom.xml`, `docker-compose.yml`, `.env.example`

Use what you find to pre-fill answers. If `package.json` exists, you already know the language, runtime, and dependencies. Don't ask questions you can answer from the filesystem.

## Step 2: Gather Project Context

Ask the user conversationally. Group related questions — don't ask one at a time. Adapt based on what you already inferred from Step 1.

**If no existing code detected**, ask:
- What are you building? (one sentence is fine)
- What's your tech stack? (language, framework, database, infrastructure)
- What's your testing setup? (framework, coverage expectations)
- What are your top 2-3 goals for this project right now?

**If existing code detected**, confirm what you inferred:
- "I can see this is a [language/framework] project with [dependencies]. Is that right, or has anything changed?"
- "What are your current priorities — what are you working toward right now?"
- "Any conventions or patterns you've established that I should know about?"

**Always ask:**
- What's the lint command? Test command? Dev server command?
- Any files or directories I should never touch?
- Are you working solo or with a team?

## Step 3: Fill In docs/context/CONVENTIONS.md

Update `docs/context/CONVENTIONS.md` with the gathered information:
- Tech stack section with actual tools and versions
- Linting/formatting commands
- Testing setup and commands
- File organization description (infer from actual directory structure)
- Naming conventions (infer from existing code if possible)
- Git workflow (ask if team, default to simple solo workflow)
- Boundaries — Never Modify section

Preserve the template structure. Replace placeholder text with real content.

## Step 4: Fill In docs/context/GOALS.md

Update `docs/context/GOALS.md`:
- Add the user's stated objectives with measurable success criteria
- Assign priority levels (P0-P3) — ask user to confirm
- Add Non-Goals if the user mentioned anything out of scope
- Keep it concise — goals should fit on one screen

## Step 5: Fill In docs/context/STATUS.md

Update `docs/context/STATUS.md`:
- Set "Last updated" to today's date
- If existing code: summarize current state under "In Flight" or "Recently Completed"
- If new project: add first task under "Up Next"
- If git history exists: reference recent commits under "Recently Completed"
- Note any known issues from the conversation

## Step 6: Update CLAUDE.md

Make minimal, targeted updates to `CLAUDE.md`:
- Update Session Continuity block with initialization context
- Update "Start here" to point to the first task or goal
- Update build/test state if you ran any commands
- Do NOT rewrite the whole file — just update the dynamic sections

## Step 7: Update README.md

If README.md still has template placeholder text:
- Replace project name and description
- Fill in prerequisites based on actual tech stack
- Fill in setup commands based on package manager
- Fill in dev/test/lint commands
- Keep architecture section brief — link to docs/decisions/ for detail

## Step 8: Initialize Git (if needed)

If no `.git` directory exists:
- Run `git init`
- Create initial commit: `git add -A && git commit -m "chore: initialize project with Claude Code template"`

If git already exists, do NOT commit — just report what was changed.

## Step 9: Summary

Present what was set up:

```
✓ CONVENTIONS.md — [tech stack summary]
✓ GOALS.md — [N objectives defined]
✓ STATUS.md — [current state summary]
✓ CLAUDE.md — session continuity initialized
✓ README.md — updated with project details
✓ Git — [initialized / already existed]

You're ready to go. Try:
  /brainstorming — brainstorm before building
  /project-status  — see where things stand
  /session-wrap    — end-of-session documentation
```

## Constraints

- Do NOT install dependencies, create source files, or write application code
- Do NOT overwrite existing non-template content in any file
- If a doc file already has real content (not just template placeholders), preserve it and merge
- Ask before making assumptions — especially about goals and priorities
- Keep the conversation efficient — 2-3 exchanges max before all docs are filled
