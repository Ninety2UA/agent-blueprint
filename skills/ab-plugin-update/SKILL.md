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

Look at where this skill's own folder (the one holding this SKILL.md) lives, and which tool is running it. The locations below use default homes; honor the host's configured home when it differs.

When running in Codex, first run `codex plugin list --json`. Find the entry in `installed` whose `pluginId` is `agent-blueprint@agent-blueprint`. If present, use the Codex plugin route even if this skill was loaded from an older copy. If the listing fails or cannot be read, report it and stop; that is not evidence of a copy install.

| This skill's folder is in | Route |
|---|---|
| Claude Code's plugin cache, under `~/.claude/plugins/cache/`, also read by Cursor and Amp | Claude Code plugin |
| Codex's `plugins/cache/agent-blueprint/agent-blueprint/<version>/` under `CODEX_HOME` (default `~/.codex`) | Codex plugin |
| `~/.gemini/config/plugins/agent-blueprint/` | Antigravity |
| `~/.grok/installed-plugins/<dir>-<hash>/` | Grok Build |
| `~/.pi/agent/git/github.com/Ninety2UA/agent-blueprint/`, or a local package path in `~/.pi/agent/settings.json` | Pi |
| `~/.cursor/plugins/cache/<marketplace>/agent-blueprint/<sha>/` | Cursor |
| `~/.hermes/skills/` | Hermes |
| `~/.config/amp/skills/` | Amp |
| a recorded legacy copy in `~/.agents/skills/`, `~/.grok/skills/` or `~/.pi/agent/skills/` | Copy install, to migrate to each tool's own route |
| another skills folder recorded by `install.sh --copy-dir` | Copy install, preserving that explicit destination |
| a git checkout of Agent Blueprint (local development or a folder the tool reads directly) | Checkout, followed by the host's local refresh if it keeps a cache or copy |
| a project's `.claude/skills/`, `.claude/agents/` or `.claude/commands/` | old in-project copy |

A checkout path does not override an identified host registration. Where a route distinguishes Git and local sources, read that distinction and the original checkout path from the host's install metadata; a cache directory alone does not establish the source. If that source is unknown, report it and stop before updating.

Note the installed version: for Claude Code use `claude plugin list --json` (the `agent-blueprint@agent-blueprint` row, with its scope); for Codex use the cached `.codex-plugin/plugin.json` as described in Step 2's route notes; for copies read `version` in the containing skills folder's `.agent-blueprint-install.json`; otherwise read `.claude-plugin/plugin.json` at the installed plugin or checkout root. If unreadable, record "unknown".

If the folder fits no row, ask which route applies.

**Asking the user.** Ask with your question tool if you have one, offering at most three options; otherwise ask in plain text with a numbered list. In a headless or unattended run nobody will answer: take the default named below, say so in your output, and log it in the run state's decisions if there is a run state.

Options: 1. the tool's plugin or skill manager; 2. a copy install, so re-run `install.sh`; 3. show the command for every route and change nothing. Default when nobody answers: option 3.

## Step 2: Run the route's command

The user started this skill to get the upgrade done, so run a command yourself when it is a shell command you can run. Show interactive commands, such as Claude Code's `/plugin`, for the user to type. If unavailable here, show the exact command and report the update as pending.

Read `references/update-routes.md` at this step and follow the matching route. Run each command only after the preceding one succeeds. If an update fails, report the command and error and stop; never fall back to a copy install or create a shared `~/.agents/skills` copy. An existing plugin stays on its plugin route, including during version recovery.

**Old in-project copy.** Agent Blueprint v4 has no in-project install, so there is nothing to upgrade in place. Tell the user to install the plugin with their tool's installer or `install.sh`, then clear out the old copy with the Agent Blueprint migration skill, and stop here.

## Step 3: Check the version

Read the latest release's version from `.claude-plugin/plugin.json` on `main`: in the fresh checkout if Step 2 made one, otherwise from `https://raw.githubusercontent.com/Ninety2UA/agent-blueprint/main/.claude-plugin/plugin.json` with a web fetch tool or a plain `curl -fsSL`. Then resolve the updated install location through its manager and read the installed version again as in Step 1; the folder this session loaded may still be the old cache. For a migrated copy, re-detect its new route. The fresh checkout's version alone does not prove the install succeeded.

- Equal: the upgrade worked, or it was already current.
- Installed still older: report the mismatch and the same route's next step; do not switch to a copy install. A Codex cache is keyed by version, so report a stale same-version cache rather than rewriting it by hand.
- Either version unreadable: report what you could read and say the check was not possible.

## Step 4: Report

Use the success report only after verification; otherwise report failed, pending or unverified with the observed version and the remaining step.

```text
✓ Agent Blueprint at v[VERSION] (was v[OLD VERSION]; or "already up to date")
  Route: [Claude Code plugin, scope user|project|local | Codex plugin | copy install | checkout | ...]
  Verified: installed version matches .claude-plugin/plugin.json on main

  Reload plugins or start a new session to use it (Claude Code: /reload-plugins).
```

## Notes

- A tool's plugin cache is shared across projects, so every project on that install gets the new version. The previous version's folder may stay in the cache, which is harmless.
- Tools load skills at session start, so the new version runs only after the user reloads plugins or restarts.
