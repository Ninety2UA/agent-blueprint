# Agent Blueprint on Amp

Binary `amp` (Sourcegraph); docs only (the skills page dated 2026-09-27, read on 2026-09-28): Amp is not installed on the maintainer's machine.

## Install

One route, with two starting points:

- If Claude Code with the Agent Blueprint plugin is on the machine, there is nothing to do: Amp loads `~/.claude/plugins/cache/`, so the skills are already there. `bash install.sh` sees the Claude Code install and skips Amp.
- Otherwise, one copy of `skills/` in `~/.agents/skills`, which Amp scans; the same copy serves Codex, Grok Build, Pi and Cursor CLI:

```bash
git clone https://github.com/Ninety2UA/agent-blueprint.git
bash agent-blueprint/install.sh --only amp
```

Amp's own installer, `amp skill add <repo or path>` (`--global` for `~/.config/agents/skills/`), writes skills into a project's `.agents/skills/`, which Codex, Antigravity, Pi, Cursor CLI and Hermes also read; whether a repository URL installs every `skills/*` folder or needs a per-skill path is not verified. Do not combine routes: Amp resolves a duplicate name to the first found, and the other hosts list it twice. To keep only the copy on a machine that also has Claude Code, set `amp.skills.disableClaudeCodeSkills`.

Trust step: none is documented.

Check: `amp skills list` (or `--json`), the `skills: list` palette entry, or the `reload_skills` tool after a change. Update: `claude plugin update agent-blueprint@agent-blueprint` when Claude Code provides the skills, otherwise re-run `bash install.sh`; the ab-plugin-update skill picks the route. Docs: <https://ampcode.com/docs/markdown/customize/skills>.

## Invoke a skill

- Explicit: none. Amp removed user-invoked skills in its May 2026 rebuild, so ask in prose: "use the ab-build-pipeline skill".
- By description: Amp picks a skill from its catalog, which is why every description leads with what the skill does.
- Manual-only: Amp has no manual-only key, so it cannot enforce it: `ab-plugin-update` and `ab-migrate` may be picked from a matching request. Both descriptions avoid broad trigger words, and `ab-migrate` asks before it removes anything.

## Model and effort

The Dial: the modes `low`, `medium`, `high` and `ultra` each set the model, the effort, the prompt and the tools, chosen before the first message and fixed for the thread; per-mode pins live in the dial editor. The SDK's `mode` and `effort` "map to CLI flags" per its docs; the flag names are not verified here. Helpers: no per-dispatch model or effort from a prompt (only a plugin's `amp.createAgent` takes them), so a step marked safe at lower effort runs as the mode dictates; whether helpers inherit the thread's mode is not verified. Docs: <https://ampcode.com/docs/markdown/the-dial>.

## What is missing or different

- Hooks: none. Amp has plugin events only (`session.start`, `tool.call` and others), and the blueprint ships no Amp plugin. The five hook effects are absent: the session-start pointer to `docs/context/STATUS.md`, the injection scanner on writes, the commit-message check, the ship-pipeline Stop guard and the Agent Teams gates. Nothing else depends on them.
- Helpers: the Task tool, plus `oracle` and `librarian`. Helpers run isolated, cannot talk to each other and cannot be steered mid-task.
- Team work: no cap in `host-limits.tsv`; isolation by file ownership, since a skill cannot ask Amp for a worktree per helper. Helpers report only to the parent.
- Questions: `ask_user_choice`, built in since September 2026; a headless run takes the documented default.
- Task tracking: the plan file's checkboxes; `todo_read` and `todo_write` may mirror them.
- Instructions: Amp reads `AGENTS.md` in the cwd and its parents; `CLAUDE.md` or `AGENT.md` only where no `AGENTS.md` exists.

## Unattended runs

Run from the project root, with the path to the skill folder as installed (a checkout is shown):

```bash
bash /path/to/agent-blueprint/skills/ab-ship-pipeline/scripts/run.sh --host amp --allow-unguarded "<feature>"
```

Posture: `amp -x "<prompt>"` (execute mode; also on when stdout is redirected). Amp has had no approvals by default since May 2026, so nothing blocks a destructive command unless you opt into `amp.permissions`, which loads a permissions plugin that also applies to `-x`. The runner therefore requires `--allow-unguarded`, which means: the agent holds your git and `gh` credentials for the whole run, and the runner's secret scan and publish checks cannot contain what it does before it publishes. Run it in a throwaway clone or a container. Exit codes are not documented; the runner judges a run from `state.json`. Per-iteration timeout: 3600 s. Preflight: `AMP_API_KEY` (an `sgamp_` access token) or `~/.config/amp`. This row of the adapter table is unverified, since Amp is not installed on the maintainer's machine. Docs: <https://ampcode.com/docs/markdown/cli/execute-mode>.

## Privacy

Headless threads are visible to your workspace by default: per the SDK docs a thread's `visibility` defaults to `workspace`, so a run started with `amp -x` is uploaded and readable by workspace members, prompt and diff included. Change the visibility before running a pipeline on code others should not see; the SDK option is `visibility`, and a CLI flag for it is not verified. Docs: <https://ampcode.com/docs/markdown/sdk/typescript>.

## Paths to avoid

- `.claude/` for working files: Amp reads `.claude/skills` and `~/.claude/skills`, so anything there is live in Amp too; v4 keeps its files under `.agent-blueprint/`.
- `.amp/plugins/` and `~/.config/amp/plugins/`: Amp's plugin folders (TypeScript); a directory plugin would have to register each skill as `<plugin>:<skill>`, so the blueprint ships none.
- `~/.config/agents/skills/`: Amp's global folder for `amp skill add --global`; a copy there next to `~/.agents/skills` doubles the catalog.
- `hooks/hooks.json`: never present in this plugin.

## Smoke status

Pending: the v4.0.0 smoke table (docs/releases/v4.0.0-smoke.md) fills this section.
