# Agent Blueprint on Grok Build

Binary `grok`; facts checked against Grok Build 1.0.34 on 2026-09-30, and the install against the same version on 2026-10-12.

## Install

One route: Grok's plugin manager, straight from GitHub. Grok asks you to confirm the install:

```bash
grok plugin install Ninety2UA/agent-blueprint
```

Grok 1.0.34 reads the root `plugin.json` and discovers `skills/` by convention. `bash install.sh` runs the same command with `--trust`, so it does not stop to ask, and takes the clone as the source with `--local`; `grok --plugin-dir <checkout>` loads a checkout for one session. On a re-run the installer first removes the `~/.grok/skills` copy that 4.0 recorded, since Grok would list a second set.

What covers what: Grok needs this command even when Claude Code has the plugin. It lists the marketplaces Claude Code has registered but loads no skills from Claude Code's installed plugin. It does read `~/.claude/skills` and a project's `.claude/skills`, so skills placed there show up in Grok too.

Trust step: none for skills beyond the confirmation. Project hooks need `/hooks-trust` or `--trust`, and this plugin ships no Grok hooks.

Check: `grok plugin list` shows one agent-blueprint install, and `grok plugin details agent-blueprint` lists its components; `grok plugin validate <checkout>` prints the name, version and components of a checkout. Update: `grok plugin update agent-blueprint`, or the ab-plugin-update skill. Docs: <https://docs.x.ai/build/features/skills-plugins-marketplaces>.

Set up a project: `/ab-project-start` in a session. The README's [Set up your project](../../README.md#set-up-your-project) says what it creates and when to run it.

## Invoke a skill

- Explicit: `/ab-name`.
- By description: Grok has no skill tool; the model reads a skill's SKILL.md from the catalog when the description matches the request.
- Manual-only: `ab-plugin-update` and `ab-migrate` carry `disable-model-invocation: true`, which Grok honors: the skill leaves the catalog and answers only to its slash command.

## Model and effort

`/model` in the session, `-m/--model` on the command line, or `[models] default` in `~/.grok/config.toml`; `--effort` sets the effort (the docs list the flag; the level names `none|minimal|low|medium|high|xhigh|max` come from a third-party reference). Helpers: Grok documents no per-dispatch model or effort override, so whether a helper inherits the session's setting is not verified, and a step marked safe at lower effort runs at the session's level. Docs: <https://docs.x.ai/build/cli/reference>.

## What is missing or different

- Hooks: none. The five hook effects are absent: the session-start pointer to `docs/context/STATUS.md`, the injection scanner on writes, the commit-message check, the ship-pipeline Stop guard and the Agent Teams gates. Nothing else depends on them. Grok loads a `hooks/hooks.json` from any plugin, which is why the blueprint's hook files carry other names; it also reads `.claude/settings.json` and `.cursor/hooks.json` hooks, none of which the blueprint writes.
- Helpers: built-in subagents (`general-purpose`, `explore`, `plan`); a helper can request worktree isolation (`~/.grok/worktrees/`). No documented cap (8 is a third-party claim).
- Team work: no cap in `host-limits.tsv`; worktree isolation. Helpers report only to the parent; the ledger under `.agent-blueprint/team/` carries everything else.
- Questions: `ask_user_question`, a blocking question tool (not in the vendor docs; not verified); a headless run takes the documented default.
- Task tracking: the plan file's checkboxes; a Grok todo tool is not verified.
- Manifest: Grok 1.0.34 reads the root `plugin.json` first and does not merge, so `.grok-plugin/plugin.json` in this repository is inert on that version and stays for versions that read it.
- Binary collision: Grok installs `~/.grok/bin/agent`, which can shadow Cursor's `agent`; the blueprint always calls Cursor as `cursor-agent`.
- Instructions: Grok loads both `AGENTS.md` and `CLAUDE.md` from one directory, which is why the scaffold's `CLAUDE.md` is the single line `@AGENTS.md` rather than a copy.

## Unattended runs

Run from the project root, with the path to the skill folder as installed (a checkout is shown):

```bash
bash /path/to/agent-blueprint/skills/ab-ship-pipeline/scripts/run.sh --host grok "<feature>"
```

Posture: `grok -p --always-approve --sandbox workspace --output-format json --cwd <project>`. `--always-approve` approves tool calls while deny rules and `PreToolUse` hooks still apply, and the `workspace` sandbox confines writes to the project; that is a guard, so `--allow-unguarded` is not needed. JSON output is required: on 1.0.34, plain output hangs after the answer. Exit codes are not documented, so the runner judges a run from `state.json`, never from the exit code or the printed text. Per-iteration timeout: 3600 s. Preflight: `grok models` must not report "not authenticated" (fix: `grok login`). Docs: <https://docs.x.ai/build/cli/headless-scripting>.

## Privacy

Nothing beyond the host's own terms is known.

## Paths to avoid

- `.claude/` for working files: Grok reads `.claude/skills` and `.claude/settings.json` hooks, so anything there is live in Grok too; v4 keeps its files under `.agent-blueprint/`.
- `.grok-plugin/`: inert on 1.0.34, where the root `plugin.json` wins; a change there has no effect on that version.
- `hooks/hooks.json`: never present in this plugin, because Grok would load it from any plugin and run the handlers with the wrong root variable.
- `~/.grok/bin/agent`: not Cursor; call `cursor-agent` for Cursor.

## Smoke status

Install: the v4.1.0 install record ([docs/releases/v4.1.0-installs.md](../releases/v4.1.0-installs.md)) shows this tool installing Agent Blueprint by its own route and listing each skill once.

From the v4.1.0 smoke table ([docs/releases/v4.1.0-smoke.md](../releases/v4.1.0-smoke.md)), host version grok 1.0.52 (0920c8169e27) [stable], last cell 2026-10-12.

| Cell | State | Time | Reason |
|------|-------|------|--------|
| `discovery` | pass | 7s | 53 ab- skills once each in 4 location(s); the answer names ab-ship-pipeline |
| `hooks` | pass | 9s | no blueprint hook fired (canary prompt run with the trace exported) |
| `manual-only` | pass | 10s | ab-plugin-update is not in the catalog the model sees; ab-pr-workflow and ab-project-start are |
| `debug` | pass | 3m16s | the host refused the run: usage or rate limit reached. suite passes; store.py fixed; regression test present (host exited 1) · helper steps: helper |
