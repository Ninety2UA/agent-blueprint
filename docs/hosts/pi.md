# Agent Blueprint on Pi

Binary `pi`; facts from the Pi docs at release v0.87.1, read on 2026-09-28, and the install checked against Pi 0.73.1 on 2026-10-12.

## Install

One route: Pi's package manager, straight from GitHub. `package.json` carries a `pi` key that points at `./skills`:

```bash
pi install git:github.com/Ninety2UA/agent-blueprint
```

`bash install.sh` runs the same command, or `pi install <checkout>` with the clone under `--local`, and on a re-run, once Pi's own install succeeds, removes the `~/.pi/agent/skills` copy that 4.0 recorded, since Pi keeps the first skill of a name it finds and warns about the rest. A project-level install (`-l`) is written to `.pi/settings.json` and loads only after you trust the project; the global install needs no trust step.

Recommended add-ons, both from npm: `pi install npm:pi-subagents` gives Pi a `subagent` tool, without which every Helper step runs inline, and `pi install npm:pi-ask-user` gives it a blocking question tool.

What covers what: an `amp skill add` into a project writes `.agents/skills/`, which Pi also reads. A Claude Code install covers nothing here: Pi reads neither `.claude/skills` nor the Claude Code plugin cache.

Check: `pi list` shows one agent-blueprint package. Update: `pi update --extensions`, or the ab-plugin-update skill. Docs: <https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/skills.md>.

Set up a project: `/skill:ab-project-start` in a session. The README's [Set up your project](../../README.md#set-up-your-project) says what it creates and when to run it.

## Invoke a skill

- Explicit: `/skill:ab-name`, with any arguments after it.
- By description: only each skill's name, description and path go into the system prompt; Pi reads the SKILL.md when the description matches.
- Manual-only: `ab-plugin-update` and `ab-migrate` carry `disable-model-invocation: true`, which Pi honors.

## Model and effort

`--model <pattern>[:thinking]`, `--provider` and `--thinking off|minimal|low|medium|high|xhigh|max` on the command line (clamped to what the model supports), or `/model` and `/thinking` in the session. Helpers, with `pi-subagents`: a dispatch may name a `provider/id:thinking` model of its own, and a `:high`-style suffix overrides the thinking level, so a step marked safe at lower effort can run lower here; whether a helper without such a setting inherits the session's model and thinking level is not verified. Docs: <https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/cli.md>.

## What is missing or different

- Hooks: none. Pi has no hooks file; its equivalents are TypeScript extensions that run in-process with full user permissions, which the blueprint does not ship. The five hook effects are absent: the session-start pointer to `docs/context/STATUS.md`, the injection scanner on writes, the commit-message check, the ship-pipeline Stop guard and the Agent Teams gates. Nothing else depends on them.
- Helpers: none in Pi core. With `pi-subagents`, the `subagent` tool (its full schema appears after a `subagents_enable` step); without it, the skill follows the prompt file itself, and the pipelines still complete.
- Team work: 4 helpers per wave with `pi-subagents` (`parallel.concurrency`), each in its own worktree; without the package, tasks run one after another through the same ledger.
- Questions: `ask_user` from `pi-ask-user`; otherwise a plain-text numbered list, and the documented default in a headless run.
- Task tracking: the plan file's checkboxes; Pi has no todo tool in core.
- Instructions: Pi loads `AGENTS.md` (or `AGENTS.override.md`, which replaces it) from the agent directory, the cwd and its parents, regardless of project trust; `CLAUDE.md` is listed after `AGENTS.md`, and whether both load from one directory is not verified.

## Unattended runs

Run from the project root, with the path to the skill folder as installed (a checkout is shown):

```bash
bash /path/to/agent-blueprint/skills/ab-ship-pipeline/scripts/run.sh --host pi --allow-unguarded "<feature>"
```

Posture: `pi -p --approve`. `-p` prints the final assistant text and exits non-zero on an error or abort; `--approve` trusts the project's resources, since headless mode cannot prompt. Pi has no permission system and no sandbox (it "does not ask for approval before every tool call"), so nothing blocks a destructive command; the docs advise a container. The runner therefore requires `--allow-unguarded`, which means: the agent holds your git and `gh` credentials for the whole run, and the runner's secret scan and publish checks cannot contain what it does before it publishes. Run it in a throwaway clone or a container. Per-iteration timeout: 3600 s. Preflight: Pi has no auth status command; a provider key must be configured (run `pi` once). This row of the adapter table follows the vendor docs. Docs: <https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/security.md>.

## Privacy

Nothing beyond the host's own terms is known.

## Paths to avoid

- `.claude/`: Pi does not read it, and v4 keeps working files under `.agent-blueprint/`.
- `.pi/` in a project: Pi's own settings and extensions; the blueprint writes nothing there.
- `.pi/extensions/*.ts`: the only way to give Pi hooks, running with full user permissions; the blueprint ships none.
- `hooks/hooks.json`: never present in this plugin.

## Smoke status

Install: the v4.1.0 install record ([docs/releases/v4.1.0-installs.md](../releases/v4.1.0-installs.md)) shows this tool installing Agent Blueprint by its own route and listing each skill once.

From the v4.1.0 smoke table ([docs/releases/v4.1.0-smoke.md](../releases/v4.1.0-smoke.md)), host version unknown, last cell 2026-10-12.

| Cell | State | Time | Reason |
|------|-------|------|--------|
| `hooks` | n/a | 0s | no hook path on this host |
