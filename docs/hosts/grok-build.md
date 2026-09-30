# Agent Blueprint on Grok Build

Binary `grok`; facts checked against Grok Build 1.0.34 on 2026-09-30.

## Install

One route: one copy of `skills/` in `~/.agents/skills`, which Grok scans. `bash install.sh` writes it, and the same copy serves Codex, Pi, Cursor CLI and Amp:

```bash
git clone https://github.com/Ninety2UA/agent-blueprint.git
bash agent-blueprint/install.sh --only grok
```

Leave out `--only` to install for every tool on the machine. The installer keeps a record at `~/.agents/skills/.agent-blueprint-install.json`, so a re-run removes skills that were renamed or deleted since and leaves every other skill in that folder alone.

Grok's plugin manager also accepts this repository (`grok plugin install Ninety2UA/agent-blueprint` after the rename, a local path, or `grok --plugin-dir <checkout>` for one session), because Grok 1.0.34 reads the root `plugin.json` and discovers `skills/` by convention. Do not combine it with the copy: Grok would list every skill twice. Grok also reads `~/.claude/skills`, a project's `.claude/skills` and the marketplaces Claude Code has registered, so a Claude Code user looks at `grok plugin marketplace list` and `grok plugin list` before adding a route here.

Trust step: none for skills. Project hooks need `/hooks-trust` or `--trust`, and this plugin ships no Grok hooks.

Check: not verified for a copy install (Grok's listing commands, `grok plugin list` and `grok plugin details <name>`, cover plugins); `grok plugin validate <checkout>` prints the name, version and components of a checkout. Update: re-run `bash install.sh`, or the ab-plugin-update skill. Docs: <https://docs.x.ai/build/features/skills-plugins-marketplaces>.

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
- Questions: `ask_user_question`, a blocking question tool (per the compound-engineering tests); a headless run takes the documented default.
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

Pending: the v4.0.0 smoke table (docs/releases/v4.0.0-smoke.md) fills this section.
