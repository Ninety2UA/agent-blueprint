---
name: ab-plugin-update
description: "Upgrades the Agent Blueprint plugin itself to its latest release: finds how Agent Blueprint was installed in the current tool, runs or shows that tool's own plugin manager command (Claude Code, Codex and the other supported tools), re-runs install.sh for copy installs, then checks the installed version against the latest release. Use when the user asks to upgrade, refresh or reinstall Agent Blueprint itself. Not for a project's own dependencies (ab-dependency-management) or for cleaning an old in-project v2 copy out of a repository."
disable-model-invocation: true
---

# Agent Blueprint Upgrade

Brings the installed Agent Blueprint up to its latest release through the tool's own installer, or through `install.sh` for copy installs. Done means: the installed version equals the version on the repository's `main` branch, and the user knows to reload.

The skill copies nothing into a plugin cache and writes no tool's registry files by hand: those formats belong to each tool and change between releases, and a hand-written entry can leave the tool loading a stale copy. It never pipes a download into a shell either; it runs an installer only from a checkout it has just cloned, so the user and the tool's own guard can see what runs.

Say at the start: "Upgrading Agent Blueprint..."

## Step 1: Find the install route

Look at where this skill's own folder (the one holding this SKILL.md) lives, and which tool is running it:

| This skill's folder is in | Route |
|---|---|
| Claude Code's plugin cache, under `~/.claude/plugins/cache/` | Claude Code plugin |
| a plugin another tool installed from its marketplace or a git URL (Codex, Antigravity, Grok Build, Pi, Cursor CLI, Amp) | that tool's plugin or skill manager |
| a plain skills folder that `install.sh` filled, such as `~/.agents/skills/` or Hermes's skills folder | copy install |
| a git checkout of Agent Blueprint (a local development install, or a folder the tool reads directly) | checkout |
| a project's `.claude/skills/`, `.claude/agents/` or `.claude/commands/` | old in-project copy |

Note the installed version: in Claude Code from `claude plugin list --json` (the `agent-blueprint@agent-blueprint` row, with its scope); elsewhere from `.claude-plugin/plugin.json` at the root of the installed plugin (walk up from this skill's folder); otherwise "unknown".

If the folder fits no row, ask which route applies.

**Asking the user.** Ask with your question tool if you have one, offering at most three options; otherwise ask in plain text with a numbered list. In a headless or unattended run nobody will answer: take the default named below, say so in your output, and log it in the run state's decisions if there is a run state.

Options: 1. the tool's plugin or skill manager; 2. a copy install, so re-run `install.sh`; 3. show the command for every route and change nothing. Default when nobody answers: option 3.

## Step 2: Run the route's command

The user started this skill to get the upgrade done, so run a command yourself when it is a shell command you can run. Show interactive commands, such as Claude Code's `/plugin`, for the user to type.

- **Claude Code plugin.** From the project root, refresh the catalog, then upgrade the plugin:

  ```bash
  claude plugin marketplace update agent-blueprint
  claude plugin update agent-blueprint@agent-blueprint
  ```

  Add `--scope project` or `--scope local` when the `claude plugin list --json` row shows it is installed for one project, and `--yes` when no terminal is attached. If the update command rejects the `plugin@marketplace` name, use `/plugin` and pick the update, or `/plugin install agent-blueprint@agent-blueprint`, which refreshes the marketplace first and installs the latest version.
- **Codex.** Upgrade it through Codex's plugin command (`codex plugin`; its `--help` lists the subcommands), from the marketplace it was added from. If that command has no update subcommand, use the copy-install route.
- **Another tool's plugin or skill manager** (Antigravity's `agy plugin`, Grok Build's plugin command, Pi's `pi`, Cursor CLI's `cursor-agent plugin`, Amp's `amp skill`): tell the user to run that manager's update for agent-blueprint. Where you are not sure the manager has an update, use the copy-install route instead.
- **Copy install.** Re-run the installer from a fresh checkout. It detects the installed tools and installs into each, replacing the copied skills. Run the dry run first and show its output.

  ```bash
  CHECKOUT=$(mktemp -d)
  git clone --depth 1 https://github.com/Ninety2UA/agent-blueprint.git "$CHECKOUT/agent-blueprint"
  bash "$CHECKOUT/agent-blueprint/install.sh" --dry-run
  ```

  **Asking the user.** Ask with your question tool if you have one, offering at most three options; otherwise ask in plain text with a numbered list. In a headless or unattended run nobody will answer: take the default named below, say so in your output, and log it in the run state's decisions if there is a run state.

  Ask whether to run it for real (`bash "$CHECKOUT/agent-blueprint/install.sh"`). Default when nobody answers: proceed, since the user started this skill to get the upgrade done.

  Keep the checkout until Step 3 has read its version, then remove that temporary folder.
- **Checkout.** Pull it with `git -C <checkout> pull --ff-only`. If the pull stops because the checkout has local changes, show them and stop: they are the user's.
- **Old in-project copy.** Agent Blueprint v4 has no in-project install, so there is nothing to upgrade in place. Tell the user to install the plugin with their tool's installer or `install.sh`, then clear out the old copy with the Agent Blueprint migration skill, and stop here.

## Step 3: Check the version

Read the latest release's version from `.claude-plugin/plugin.json` on `main`: in the fresh checkout if Step 2 made one, otherwise from `https://raw.githubusercontent.com/Ninety2UA/agent-blueprint/main/.claude-plugin/plugin.json` with a web fetch tool or a plain `curl -fsSL`. Then read the installed version again, as in Step 1.

- Equal: the upgrade worked, or it was already current.
- Installed still older: say which route did not take and give the next one to try, `/plugin install agent-blueprint@agent-blueprint` in Claude Code or a re-run of `install.sh` elsewhere.
- Either version unreadable: report what you could read and say the check was not possible.

## Step 4: Report

```
✓ Agent Blueprint at v[VERSION] (was v[OLD VERSION]; or "already up to date")
  Route: [Claude Code plugin, scope user|project|local | Codex plugin | copy install | checkout | ...]
  Verified: installed version matches .claude-plugin/plugin.json on main

  Reload plugins or start a new session to use it (Claude Code: /reload-plugins).
```

## Notes

- A tool's plugin cache is shared across projects, so every project on that install gets the new version. The previous version's folder may stay in the cache, which is harmless.
- Tools load skills at session start, so the new version runs only after the user reloads plugins or restarts.
