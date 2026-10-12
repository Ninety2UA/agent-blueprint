# Update routes

Use the route identified in Step 1. Replace quoted path placeholders with the original source path, keeping shell quoting. Commands run in order, stopping on an error. Never copy skills beside an existing plugin or into a shared skills folder as recovery.

## Claude Code plugin

From the project root, refresh the catalog, then upgrade the plugin:

```bash
claude plugin marketplace update agent-blueprint
claude plugin update agent-blueprint@agent-blueprint
```

Add `--scope project` or `--scope local` when the `claude plugin list --json` row shows it is installed for one project, and `--yes` when no terminal is attached. If the update command rejects the `plugin@marketplace` name, use `/plugin` and pick the update, or `/plugin install agent-blueprint@agent-blueprint`, which refreshes the marketplace first and installs the latest version. This is also the route for Cursor, Amp or Grok Build reading Claude Code's install; do not add a separate install for them.

## Codex plugin

Run `codex plugin list --json` and select `installed`'s `pluginId: agent-blueprint@agent-blueprint` entry. Its `marketplaceSource.sourceType` and `marketplaceSource.source` identify the original marketplace type and URL or path. The plugin's own `source` may say `local` even for a Git marketplace; do not use it to select the branch.

Read the agent-blueprint entry in `codex plugin marketplace list --json` when supported. Codex 0.160.0 instead provides `codex plugin marketplace list` as `NAME  ROOT` rows; use those alongside the installed entry's `marketplaceSource`. A Git marketplace's `ROOT` can be a snapshot under `CODEX_HOME/.tmp/marketplaces/agent-blueprint`, not the original local checkout. If the original source is unknown or conflicting, report it and stop rather than guessing from that root.

### Git marketplace

For a Git source, run:

```bash
codex plugin marketplace upgrade agent-blueprint
codex plugin add agent-blueprint@agent-blueprint
```

### Local marketplace

For a local source, verify that its original path is a git checkout. Apply the Checkout local-change check below to that source before running:

```bash
git -C "<source>" pull --ff-only
codex plugin add agent-blueprint@agent-blueprint
```

If it is not a git checkout, report the unsupported source and stop. Marketplace upgrade refreshes only Git marketplaces; it cannot refresh this local source.

### Verify either source

After either branch, re-read `codex plugin list --json`. Read `version` from `.codex-plugin/plugin.json` in the newest version folder under `CODEX_HOME/plugins/cache/agent-blueprint/agent-blueprint/` (default `~/.codex/plugins/cache/agent-blueprint/agent-blueprint/`). Order folders by version, not lexicographically or by modification time, and confirm that folder matches the refreshed installed entry's version. If they disagree, report it as unverified. Do not keep reading the old folder that loaded this skill.

If detection, pull/upgrade, plugin add or verification fails, report the failure and stop. Never use the copy-install route when a Codex plugin install exists. Codex caches by version; do not edit its cache or registration to force a same-version refresh.

## Antigravity

For a GitHub install, install again with the full URL (the owner/repo shorthand is rejected):

```bash
agy plugin install https://github.com/Ninety2UA/agent-blueprint
```

For a local install, identify the original checkout from the install metadata, follow Checkout below, then run `agy plugin install "<checkout>"`. Read the installed manifest under `~/.gemini/config/plugins/agent-blueprint/`, not just the source checkout. If the local source cannot be identified, report that and stop.

## Grok Build

Read `grok plugin list` for the `agent-blueprint` source (`git` or `local`). For a Git install, run `grok plugin update agent-blueprint`.

For a local install, first follow Checkout below on the original source. Only after that succeeds, run `grok plugin uninstall agent-blueprint`. Confirm with `grok plugin list` that the plugin was removed before running `grok plugin install "<checkout>" --trust`. If removal cannot be confirmed, stop before installing a duplicate. Read the refreshed installed manifest under `~/.grok/installed-plugins/<dir>-<hash>/`. A local install is a copy; pulling its source alone does not update it.

## Pi

For the Git package, run `pi update --extension git:github.com/Ninety2UA/agent-blueprint` (`pi update --extensions` also updates all extensions). Its checkout lives under `~/.pi/agent/git/github.com/Ninety2UA/agent-blueprint/`.

For a local package path in `~/.pi/agent/settings.json`, only the checkout needs a pull: follow Checkout below. Resolve relative package paths against `~/.pi/agent/`. Pi reads that path directly, so no additional install or copy is needed.

## Cursor

For Cursor's own marketplace install, run `cursor-agent plugin marketplace update agent-blueprint`. Then tell the user to update or reinstall agent-blueprint through `/plugin` in a Cursor session. Until that interactive step and the installed-version check finish, report the update as pending.

When this skill comes from Claude Code's plugin cache, use the Claude Code plugin route above. For a local session using `cursor-agent --plugin-dir "<checkout>"`, follow Checkout below and restart the session with that path.

## Hermes

The copy under `~/.hermes/skills` uses Copy install below. Let the installer replace its recorded skills and keep other skills intact.

## Amp

When this skill comes from Claude Code's plugin cache, use the Claude Code plugin route above. The Amp-only copy in `~/.config/amp/skills` uses Copy install below. Do not add an Amp copy next to a Claude Code plugin that Amp already reads.

## Copy install

Re-run the installer from a fresh checkout. It detects installed tools and follows each tool's own route. It removes only recorded legacy copies in `~/.agents/skills`, `~/.grok/skills` and `~/.pi/agent/skills`; it does not install a new shared copy. Hermes and standalone Amp keep their host-only copies. Run the dry run first and show its output:

```bash
CHECKOUT=$(mktemp -d)
git clone --depth 1 https://github.com/Ninety2UA/agent-blueprint.git "$CHECKOUT/agent-blueprint"
bash "$CHECKOUT/agent-blueprint/install.sh" --dry-run
```

For a recorded explicit custom copy, add `--copy-dir "<destination>"` to both installer runs, preserving that destination. Legacy shared locations above migrate through the default installer; do not pass them as `--copy-dir` destinations. If unrecorded legacy skills remain, report them and stop rather than deleting user-owned folders or claiming migration succeeded.

**Asking the user.** Ask with your question tool if you have one, offering at most three options; otherwise ask in plain text with a numbered list. In a headless or unattended run nobody will answer: take the default named below, say so in your output, and log it in the run state's decisions if there is a run state.

Ask whether to run it for real (`bash "$CHECKOUT/agent-blueprint/install.sh"`). Default when nobody answers: proceed, since the user started this skill to get the upgrade done.

Keep the checkout until Step 3 has read its version, then remove only that temporary folder. If the installer reports an unfinished interactive route, report it as pending and show the remaining command.

## Checkout

Before a pull, run `git -C "<checkout>" status --short`. Show any local changes and stop: they are the user's. Do not stash, reset or discard them. If clean, run `git -C "<checkout>" pull --ff-only`. If the pull fails, show the error and any local changes and stop. A direct checkout install needs only the pull; a host that caches or copies it also needs its local refresh above.
