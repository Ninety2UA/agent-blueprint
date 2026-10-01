---
name: ab-migrate
description: "Cleans an old Agent Blueprint install out of a project so v4 runs alone: finds the v3 plugin and the v2/v3 copies (.claude/skills, agents, commands and hooks copied by install.sh --legacy, scripts/ship.sh, the old manifest, ship state files), shows the list, asks once, removes only the blueprint's own files, renames CLAUDE.md to AGENTS.md with a one-line CLAUDE.md that imports it, and prints the uninstall command for the v3 plugin. Use when the user asks to migrate a project from claude-code-blueprint or an in-project blueprint copy to Agent Blueprint v4. Not for a project's own dependencies or for anything the blueprint did not install."
disable-model-invocation: true
argument-hint: "[project directory, default: the current one]"
---

# Migrate a project to v4

The project ends up with one blueprint: the v4 skills from the tool's own install, none of the v3 copies, and an `AGENTS.md` that every tool reads. Files the blueprint did not install are never touched, so a project's own skills, agents, hooks and scripts stay where they are.

Say at the start: "Checking this project for Agent Blueprint v3 traces."

## Step 1: Find the traces

**Bundled scripts.** Paths such as `scripts/run.sh` are relative to this skill's own folder, the one holding its SKILL.md, not to the project. Run a script through its interpreter (`bash` for `.sh`; `python3`, or `python` if that is missing, for `.py`) instead of relying on its executable bit, and if the interpreter is missing, say so and stop that step.

Run `scripts/detect-v3.sh <project directory>`. It reports one line per trace and changes nothing:

- `remove` lines: the blueprint's own copies (v3 skill names from `references/v4-skill-names.tsv`, the v3 agent and hook file names, the blueprint's `scripts/ship.sh`, a `.claude-plugin/plugin.json` named `claude-code-blueprint`);
- `unsure` lines: files with a v3 name in a project that shows no other sign of a blueprint install. Other skill packs use some of the same names, so the script leaves these alone; show them to the user and remove one only when they confirm it is the blueprint's;
- `aside` lines: v3 run state files (`.claude/ship-*.local.md`, `team-active.local.md`) that move to `.agent-blueprint/run/v3/`;
- a `rename` line when `CLAUDE.md` is a regular file and no `AGENTS.md` exists;
- a `plugin` line when the v3 plugin is still installed in Claude Code.

If it prints `nothing to migrate`, say so and stop: there is nothing to do.

## Step 2: Show the list and ask once

Show the report as it is. Then check that v4 is installed (the ab-project-start skill answers to its name, or the tool's plugin list shows `agent-blueprint`); if it is not, say the project would be left with no blueprint, name the installer (`install.sh` from a checkout, or the tool's own plugin command) and stop.

**Asking the user.** Ask with your question tool if you have one, offering at most three options; otherwise ask in plain text with a numbered list. In a headless or unattended run nobody will answer: take the default named below, say so in your output, and log it in the run state's decisions if there is a run state.

Options: apply the list, apply it but keep `CLAUDE.md` as it is, or stop. Default when nobody answers: stop, change nothing, and set the run state to `needs-human` if there is one, because deleting files is the user's call and a wrong deletion cannot be undone.

## Step 3: Back up, then apply

If the project is a git repository with uncommitted changes, ask the user to commit or stash them first and stop; the backup below only protects committed work. If it is not a git repository there is no backup at all: say so when you ask, and treat an unanswered question as stop. Otherwise create the branch `blueprint-v3-backup` at the current commit when it does not exist yet, so every removed file stays one checkout away.

Run `scripts/detect-v3.sh --apply <project directory>`; the script removes only what its report listed. When the user chose to keep `CLAUDE.md`, add `--keep-instructions`, which leaves `CLAUDE.md` and any `AGENTS.md` exactly as they are.

## Step 4: Finish

- If the report had a `plugin` line, print its uninstall command; the skill never uninstalls a plugin itself.
- Suggest the ab-project-start skill next: its scaffold merges the v4 sections into the renamed `AGENTS.md` and adds `docs/context/` files the project lacks, without overwriting anything.
- Report what was removed, moved and renamed, the backup branch, and the commit the user should now make (`chore: migrate to Agent Blueprint v4`); the skill makes no commit, since the change is the user's to review.
