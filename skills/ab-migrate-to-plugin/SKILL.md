---
name: ab-migrate-to-plugin
description: "Moves a project from the v2.x install-script model to plugin mode: removes the blueprint engine files copied into the project (.claude/commands, skills, agents, hooks and settings, hooks/, .claude-plugin/) after a backup branch, and keeps project state (CLAUDE.md, BACKLOG.md, blueprint.local.md, docs/context, docs/plans, docs/solutions and the rest of docs/). Use when a project still carries v2.x blueprint engine files in .claude/, or when the user asks to migrate to the plugin, switch to plugin mode or clean up old blueprint files. Not for bringing an already-installed plugin to a newer version, which the tool's own plugin manager does."
---

# Migrate to Plugin — Blueprint v2.x to v3.0 Migration

This skill migrates a project from the v2.x install-script model (engine files copied into the project) to the v3.0 plugin model (engine files provided by the plugin, only project state in-project).

Say at the start: "Starting migration from blueprint v2.x to plugin mode."

## Step 1: Verify Plugin Is Installed

Check that the blueprint plugin is available by verifying you can access blueprint skills (for example the ab-brainstorming skill). If the plugin is not installed, stop, because removing the engine files without it would leave the project with no blueprint at all, and tell the user:

```
The blueprint plugin must be installed first.
Install it with your tool's own plugin or skill installer, or run install.sh
from a checkout of https://github.com/Ninety2UA/agent-blueprint (its README
lists the command for each tool).
Then re-run the ab-migrate-to-plugin skill.
```

## Step 2: Detect In-Project Engine Files

Check for v2.x engine files in the project:

```bash
ls .claude/commands/ 2>/dev/null | head -3
ls .claude/skills/ 2>/dev/null | head -3
ls .claude/agents/ 2>/dev/null | head -3
ls .claude/hooks/ 2>/dev/null | head -3
ls hooks/hooks.json 2>/dev/null
ls .claude-plugin/plugin.json 2>/dev/null
```

If none of these exist, report: "No v2.x engine files found. This project is already in plugin mode or was never installed." and stop.

## Step 3: Check for Local Modifications

For each engine file found, check if it has been modified from the template:

```bash
git status .claude/commands/ .claude/skills/ .claude/agents/ .claude/hooks/ hooks/ .claude-plugin/ 2>/dev/null
git diff --stat HEAD -- .claude/commands/ .claude/skills/ .claude/agents/ .claude/hooks/ 2>/dev/null
```

If any engine files have been locally modified, list them and ask before going on, because Step 5 removes them and the plugin's version is used instead.

**Asking the user.** Ask with your question tool if you have one, offering at most three options; otherwise ask in plain text with a numbered list. In a headless or unattended run nobody will answer: take the default named below, say so in your output, and log it in the run state's decisions if there is a run state.

Options: 1. back up the modified files to `.agent-blueprint/custom-overrides/` before removing them; 2. remove them (the plugin versions are identical to the template). Default when nobody answers: option 1, since a backup loses nothing.

**Working folder.** Blueprint working files live under `.agent-blueprint/` in the project root. Before the first write there, create `.agent-blueprint/.gitignore` with the lines `run/`, `team/`, `review-runs/` and `cache/` if it does not exist yet, so run state stays out of commits while plans and notes stay tracked.

For the backup, copy each modified file into `.agent-blueprint/custom-overrides/` under its original path (for example `.agent-blueprint/custom-overrides/.claude/skills/<name>/SKILL.md`).

## Step 4: Create Backup Branch

```bash
git stash push -m "pre-migration-stash" 2>/dev/null || true
git branch blueprint-v2-backup 2>/dev/null || true
```

Report: "Backup branch `blueprint-v2-backup` created at current HEAD." If `git branch` failed (the branch already exists, or `.git` is read-only), say so instead. If the stash saved anything, say that the user's uncommitted changes are in the stash `pre-migration-stash` and that `git stash pop` restores them.

## Step 5: Remove Engine Files

Remove the following directories/files that are now provided by the plugin:

```bash
# Engine directories
rm -rf .claude/commands/
rm -rf .claude/skills/
rm -rf .claude/agents/
rm -rf .claude/hooks/

# Plugin/hook config (now in plugin)
rm -rf .claude-plugin/
rm -rf hooks/

# Settings (now in plugin)
rm -f .claude/settings.json

# Clean up empty .claude/ if nothing remains
rmdir .claude/ 2>/dev/null || true
```

## Step 6: Keep Project State Files

Verify these files still exist (Step 5 does not touch them):
- `CLAUDE.md`
- `BACKLOG.md`
- `blueprint.local.md`
- `docs/context/CONVENTIONS.md`
- `docs/context/GOALS.md`
- `docs/context/STATUS.md`
- `docs/plans/`
- `docs/solutions/`
- `docs/learnings/`
- `docs/decisions/`
- `docs/research/`
- `docs/specs/`

If any are missing, report them as a warning.

## Step 7: Verify Plugin Skills Work

Quick verification: invoke the ab-brainstorming skill to confirm the plugin is providing engine files correctly.

## Step 8: Report

```
Migration complete! v2.x → v3.0 (plugin mode)

Removed:
  .claude/commands/    (files → now from plugin)
  .claude/skills/      (dirs → now from plugin)
  .claude/agents/      (files → now from plugin)
  .claude/hooks/       (files → now from plugin)
  .claude-plugin/      (plugin manifest → now from plugin)
  hooks/               (hook config → now from plugin)

Kept:
  CLAUDE.md, BACKLOG.md, blueprint.local.md
  docs/ (all project state)

Backup: branch `blueprint-v2-backup`
Stash:  `pre-migration-stash` (only if Step 4 stashed changes; restore with `git stash pop`)

Next: Commit this cleanup with `git add -A && git commit -m "chore: migrate to blueprint plugin v3.0"`
```
