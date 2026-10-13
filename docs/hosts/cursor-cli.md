# Agent Blueprint on Cursor CLI

Binary `cursor-agent`, never `agent` (see below); facts checked against Cursor CLI 2026.09.10 on 2026-09-30; on 2026-10-12, 2026.10.01 listed each skill once through Claude Code's plugin and through `--plugin-dir`.

## Install

Cursor reads Claude Code's plugin, so once Claude Code has Agent Blueprint there is nothing to do here. To add it in Claude Code:

```bash
claude plugin marketplace add Ninety2UA/agent-blueprint
claude plugin install agent-blueprint@agent-blueprint
```

Without Claude Code, add Cursor's own marketplace from GitHub (through `.cursor-plugin/plugin.json`; `--git-ref` pins a ref), then run `/plugin` in a session and install agent-blueprint:

```bash
cursor-agent plugin marketplace add https://github.com/Ninety2UA/agent-blueprint
```

There is no `plugin install` shell subcommand in 2026.09.10, so `/plugin` is a step you take in the session. When Claude Code has the plugin, `bash install.sh` runs no Cursor command; if this computer also has Cursor's own install, it says to uninstall agent-blueprint in `/plugin` and leaves the marketplace in place. Otherwise it adds the marketplace and lists `/plugin` as unfinished, and with `--local` it prints `cursor-agent --plugin-dir <checkout>`, which loads a checkout for one session. Do not combine Cursor's own install with Claude Code's plugin: Cursor would list every skill twice.

Cursor keeps marketplaces on your account, not on the computer: on 2026-10-13, with 2026.10.01, a marketplace added from one profile was listed in every profile signed in to the account. Removing it removes it for every computer signed in, including any that installs agent-blueprint from it, so the installer never removes it. Remove it yourself with `cursor-agent plugin marketplace remove agent-blueprint` once no computer uses it.

Cursor's import of Claude Code plugins includes plugins Claude Code installed for other projects: with the v3 `claude-code-blueprint` plugin still installed anywhere, Cursor sees its unprefixed skills (for example `systematic-debugging`) beside the v4 `ab-` skills and may follow the old one. Remove the v3 plugin as `docs/upgrade/v4.md` describes.

Trust step: none is documented for skills or plugins; headless runs pass `--trust` for the workspace.

Check: `cursor-agent plugin marketplace list` for marketplaces and `/plugin` in the session for plugins. Update: Claude Code's update when Cursor reads its plugin; for Cursor's own install, `cursor-agent plugin marketplace update agent-blueprint`, then update agent-blueprint through `/plugin` in a session. The ab-plugin-update skill picks the route. Docs: <https://cursor.com/docs/skills>, <https://cursor.com/docs/reference/plugins>.

Set up a project: `/ab-project-start` in a session. The README's [Set up your project](../../README.md#set-up-your-project) says what it creates and when to run it.

## Invoke a skill

- Explicit: `/ab-name`, attached to one message; it also works inside a `-p` prompt.
- By description: Cursor picks a skill whose description matches the request.
- Manual-only: `ab-plugin-update` and `ab-migrate` carry `disable-model-invocation: true`, which makes them slash-only in Cursor.

## Model and effort

`--model 'id[effort=high]'` on the command line (the bracket form sets the effort; there is no separate `--effort` flag), `/model` in the session, `--list-models` to see the choices. Helpers: Cursor sets a helper's effort only through an agent file's `model: id[effort=...]` frontmatter, which the blueprint does not ship, so a step marked safe at lower effort runs at the session's level; whether an ad hoc Task helper inherits the session's model and effort is not verified. Docs: <https://cursor.com/docs/cli/reference/parameters>.

## What is missing or different

- Hooks: none from the blueprint. The five hook effects are absent: the session-start pointer to `docs/context/STATUS.md`, the injection scanner on writes, the commit-message check, the ship-pipeline Stop guard and the Agent Teams gates. Nothing else depends on them. Cursor does run imported Claude Code plugins' hooks; the blueprint's handlers detect Cursor and exit without acting, so a Claude Code install adds no behavior here.
- Helpers: the Task tool (built-ins Explore, Bash, Browser); several Task calls in one message run in parallel, and "ask for isolation" gives each helper a worktree. No documented cap. Headless runs wait for helpers to finish.
- Team work: no cap in `host-limits.tsv`; worktree isolation on request. Helpers report only to the parent.
- Questions: Cursor's "Ask questions" tool; a headless run takes the documented default.
- Task tracking: the plan file's checkboxes; a Cursor todo tool is not verified.
- `.git` writes: the sandbox protects `.git/hooks`; the runner's preflight probe decides whether `.git` is writable, and a read-only answer puts the skills in no-commit mode, with the runner committing.
- Binary: Grok Build installs `~/.grok/bin/agent`, which can shadow Cursor's `agent` on the PATH; the blueprint and the runner always call `cursor-agent`.
- Catalog cap: Cursor hands the model a list of about 210 skill names and says how many more it left out (128 of 339 on the build machine, which also holds the skills of other tools, since the CLI reads `~/.claude/skills` and `~/.codex/skills` too; the app's "Include third-party Plugins, Skills, and other configs" setting does not reach the CLI). Where every `ab-` skill falls past the cap, the model cannot choose one on its own, but naming it (`/ab-pr-workflow`) still loads it. With only the blueprint installed every cell that applies passes, manual-only included: `ab-plugin-update` is absent from the list while `ab-pr-workflow` and `ab-project-start` are in it (verified 2026-10-07 on the release commit in a clean profile; `tests/smoke/README.md` § A clean profile for a capped catalog). A machine with both the Claude Code plugin and a 4.0 shared copy in `~/.agents/skills` shows Cursor every skill twice; the installer writes no shared copy, and a run without `--only` removes the one 4.0 recorded.
- Instructions: the CLI reads both `AGENTS.md` and `CLAUDE.md` at the project root, which is why the scaffold's `CLAUDE.md` is the single line `@AGENTS.md` rather than a copy.

## Unattended runs

Run from the project root, with the path to the skill folder as installed (a checkout is shown):

```bash
bash /path/to/agent-blueprint/skills/ab-ship-pipeline/scripts/run.sh --host cursor-agent "<feature>"
```

Posture: `cursor-agent -p --force --sandbox enabled --trust --output-format json`. Without `--force`, `-p` only proposes file edits; with it, commands run unless a deny rule blocks them (`permissions.deny`, for example `Shell(rm)`, in `~/.cursor/cli-config.json` or `.cursor/cli.json`), and the sandbox confines writes. That is a guard, so `--allow-unguarded` is not needed; if the sandboxed run fails the smoke test, the adapter falls back to an opt-in route. The final message is `.result` in the JSON; on failure the exit is non-zero with no JSON. Per-iteration timeout: 3600 s. Preflight: `CURSOR_API_KEY`, or `cursor-agent status` reporting a login. Docs: <https://cursor.com/docs/cli/headless>.

## Privacy

Nothing beyond the host's own terms is known.

## Paths to avoid

- `.claude/` for working files: Cursor reads `.claude/skills` and `.claude/agents`, so anything there is live in Cursor too; v4 keeps its files under `.agent-blueprint/`.
- `.cursor/skills`, `~/.cursor/skills` and `~/.agents/skills`: folders Cursor scans; a skills copy in any of them beside the plugin doubles the catalog.
- `agent` on the PATH: it may be Grok's; call `cursor-agent`.
- `hooks/hooks.json`: never present in this plugin.

## Smoke status

Install: the v4.1.0 install record ([docs/releases/v4.1.0-installs.md](../releases/v4.1.0-installs.md)) shows this tool installing Agent Blueprint by its own route and listing each skill once.

From the v4.1.0 smoke table ([docs/releases/v4.1.0-smoke.md](../releases/v4.1.0-smoke.md)), host version 2026.10.01-14929f9, last cell 2026-10-13.

| Cell | State | Time | Reason |
|------|-------|------|--------|
| `discovery` | pass | 11s | 53 ab- skills once each in 1 location(s); the answer names ab-ship-pipeline |
| `hooks` | pass | 11s | no blueprint hook fired (canary prompt run with the trace exported) |
| `manual-only` | pass | 26s | ab-plugin-update is not in the catalog the model sees; ab-pr-workflow and ab-project-start are |
| `debug` | pass | 1m17s | suite passes; store.py fixed; regression test present · helper steps: helper |
| `tdd-override` | pass | 3m15s | seeded functions retain their recorded behavior; count_words gives the recorded counts; a collected test calls count_words and passes; suite passes |
| `brainstorm-override` | pass | 1m52s | no design approval request; plan or code: docs/plans/2026-10-12-note-count-design.md, docs/plans/2026-10-12-note-count.md, src/notes/store.py |
