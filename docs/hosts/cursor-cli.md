# Agent Blueprint on Cursor CLI

Binary `cursor-agent`, never `agent` (see below); facts checked against Cursor CLI 2026.09.10 on 2026-09-30.

## Install

One route: one copy of `skills/` in `~/.agents/skills`, which Cursor scans. `bash install.sh` writes it, and the same copy serves Codex, Grok Build, Pi and Amp:

```bash
git clone https://github.com/Ninety2UA/agent-blueprint.git
bash agent-blueprint/install.sh --only cursor-agent
```

Cursor's plugin route also works, through `.cursor-plugin/plugin.json`: `cursor-agent plugin marketplace add https://github.com/Ninety2UA/agent-blueprint` (after the rename; `--git-ref` pins a ref), then `/plugin` in the session to install; `cursor-agent --plugin-dir <checkout>` loads a checkout for one session. There is no `plugin install` shell subcommand in 2026.09.10. Do not combine a plugin with the copy: Cursor would list every skill twice. Cursor also imports Claude Code plugins and shows them next to native ones, so a Claude Code user already sees the skills here; `bash install.sh` warns about that, and you keep one route.

Trust step: none is documented for skills or plugins; headless runs pass `--trust` for the workspace.

Check: `cursor-agent plugin marketplace list` for marketplaces and `/plugin` in the session for plugins; a listing command for skills copied into `~/.agents/skills` is not verified. Update: re-run `bash install.sh`, or the ab-plugin-update skill. Docs: <https://cursor.com/docs/skills>, <https://cursor.com/docs/reference/plugins>.

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
- Catalog cap: Cursor hands the model a list of about 210 skill names and tells it how many more were left out (128 of 339 on the build machine, which also holds `~/.claude/skills` and Cursor's own skills). On 2026-10-03 every `ab-` skill was among the omitted ones, so the model could not name or choose them from the catalog; whether naming the skill in the prompt still loads it is not verified. Keep the folders Cursor scans lean (`~/.agents/skills`, `~/.cursor/skills`, `~/.claude/skills`). The `manual-only` smoke cell reports `n/a` with the omitted count when this happens.
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
- `.cursor/skills` and `~/.cursor/skills`: Cursor's own folders; the copy route uses `~/.agents/skills`, and a second copy there doubles the catalog.
- `agent` on the PATH: it may be Grok's; call `cursor-agent`.
- `hooks/hooks.json`: never present in this plugin.

## Smoke status

From the v4.0.0 smoke table ([docs/releases/v4.0.0-smoke.md](../releases/v4.0.0-smoke.md)), host version 2026.10.01-14929f9, last cell 2026-10-03.

| Cell | State | Time | Reason |
|------|-------|------|--------|
| `discovery` | pass | 16s | 53 ab- skills once each in 8 location(s); the answer names ab-ship-pipeline |
| `canary` | pass | 16s | final message names HARBOR-19 |
| `hooks` | pass | 0s | no blueprint hook fired (from the canary run) |
| `manual-only` | pass | 31s | ab-plugin-update is not in the catalog the model sees; ab-pr-workflow and ab-project-start are |
| `build` | pass | 30m21s | acceptance test passes (deps: tabulate>=0.9.0,<0.10) · helper steps: helper,helper,helper,helper,inline |
| `helpers-off` | n/a | 0s | no helper switch on cursor-agent |
| `effort` | n/a | 0s | no per-dispatch effort metadata on cursor-agent |
| `review` | pass | 9m02s | the review names eval and cli.py · helper steps: helper |
| `debug` | pass | 7m49s | suite passes; store.py fixed; regression test present · helper steps: helper |
| `ship` | pass | 22m32s | published; pr create recorded; acceptance test passes (deps: tabulate) on the pushed branch |
| `team` | pass | 9m15s | ledger done; 3 commits; tests pass · helper steps: helper,helper,helper,helper,helper |
| `upgrade` | n/a | 0s | the upgrade scenario is Claude Code's (v3.8.0 plugin, then v4) |
