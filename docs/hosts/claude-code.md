# Agent Blueprint on Claude Code

Binary `claude`; facts checked against Claude Code 2.1.284 on 2026-09-30.

## Install

One route: the plugin, through Claude Code's marketplace commands. Once the repository carries its v4 name:

```bash
claude plugin marketplace add Ninety2UA/agent-blueprint
claude plugin install agent-blueprint@agent-blueprint
```

Before the rename, or for a pre-release checkout, both commands take the local path:

```bash
git clone https://github.com/Ninety2UA/agent-blueprint.git
claude plugin marketplace add ./agent-blueprint
claude plugin install agent-blueprint@agent-blueprint
```

`bash install.sh` from the checkout runs the same two commands (`marketplace update` and `plugin update` instead, when the plugin is already there) and warns when the v3 plugin is still installed next to this one. There is no trust step: the plugin's hooks run as soon as it is enabled. Claude Code caches the plugin under `~/.claude/plugins/cache/`.

What covers what: no other host's install covers Claude Code, because it does not scan `~/.agents/skills`. The other way round, a Claude Code install already covers Amp, which loads that plugin cache, and Cursor CLI and Grok Build import Claude Code plugins and marketplaces; on those three, do not add a second route.

Check: `claude plugin list` shows `agent-blueprint@agent-blueprint`; `claude plugin validate --strict ./agent-blueprint` checks a checkout. Update: `claude plugin marketplace update agent-blueprint`, then `claude plugin update agent-blueprint@agent-blueprint`, or the ab-plugin-update skill. Remove v3 with `claude plugin uninstall claude-code-blueprint@claude-code-blueprint`; the ab-migrate skill cleans a project's old copies. Docs: <https://code.claude.com/docs/en/plugins-reference>.

## Invoke a skill

- Explicit: `/ab-name`, for example `/ab-build-pipeline`. The namespaced form `/agent-blueprint:ab-name` also works.
- By description: Claude Code picks a skill whose description matches the request.
- Manual-only: `ab-plugin-update` and `ab-migrate` carry `disable-model-invocation: true`, so Claude Code runs them only when you type them; the flag also keeps them out of helpers.

## Model and effort

Set both in the session: `/model` and `/effort` in the TUI, or `--model` and `--effort` on the command line, or `CLAUDE_CODE_EFFORT_LEVEL` in the environment. No skill or prompt file sets either. Helpers inherit the session's choice: a probe on 2.1.284 recorded `xhigh` in the helper's transcript under `--effort xhigh` and `low` under `--effort low`. The Agent tool takes a per-call model but no per-call effort, so a step marked safe at lower effort runs at the session's level here. Docs: <https://code.claude.com/docs/en/model-config>.

## What is missing or different

Nothing is missing; Claude Code is the reference host.

- Hooks: all ten handlers in `hooks/claude-code.json` run: the session-start pointer to `docs/context/STATUS.md`, the injection scanner on writes, the commit-message check, the ship-pipeline Stop guard and the Agent Teams gates (`TaskCompleted`, `TeammateIdle`, active only while `.agent-blueprint/team/active.md` says so), plus the context monitor, the read-injection scanner and the fetch cache.
- Helpers: the Agent tool. A Helper step runs as a subagent with the prompt file's path.
- Team work: up to 20 helpers per wave, each in its own worktree (`host-limits.tsv`). Agent Teams is an optional extra: it applies only with `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` in an interactive session, never under `claude -p`.
- Questions: the blocking question tool (`AskUserQuestion`); a headless run takes the documented default.
- Task tracking: the plan file's checkboxes; Claude Code's task list may mirror them.
- Instructions: Claude Code reads `AGENTS.md` only when no `CLAUDE.md` exists in the directory or above it, so the scaffold's `CLAUDE.md` holds the single line `@AGENTS.md`, and Claude Code reads the content once.

## Unattended runs

Run from the project root, with the path to the skill folder as installed (a checkout is shown):

```bash
bash /path/to/agent-blueprint/skills/ab-ship-pipeline/scripts/run.sh --host claude "<feature>"
```

Posture: `claude -p --permission-mode auto --output-format json`. It approves safe tools on its own and denies a dangerous `rm` outright where no prompt is possible (2.1.281 and later), so `--allow-unguarded` is not needed. Per-iteration timeout: 3600 s. `-p` skips the workspace trust dialog; the runner checks `claude auth status` first. The Stop hook stands down when the runner drives the session, so each iteration ends on its own. Docs: <https://code.claude.com/docs/en/headless>.

## Privacy

Nothing beyond the host's own terms is known.

## Paths to avoid

- `.claude/` in a project: v4 keeps its working files under `.agent-blueprint/`. The `.claude/skills`, `.claude/agents` and `.claude/commands` copies that `install.sh --legacy` made in v3 are removed by the ab-migrate skill.
- A `CLAUDE.md` with content of its own: keep it to `@AGENTS.md`, so one instructions file loads here and in every other host.
- `hooks/hooks.json`: never present in this plugin; the hook file is `hooks/claude-code.json`, declared in `.claude-plugin/plugin.json`.

## Smoke status

From the v4.0.0 smoke table ([docs/releases/v4.0.0-smoke.md](../releases/v4.0.0-smoke.md)), host version 2.1.288 (Claude Code), last cell 2026-10-03.

| Cell | State | Time | Reason |
|------|-------|------|--------|
| `discovery` | pass | 6s | 53 ab- skills once each in 7 location(s); the answer names ab-ship-pipeline |
| `canary` | pass | 7s | final message names HARBOR-19 |
| `hooks` | pass | 0s | handlers wrote the trace: session-start.js x1, ship-loop.sh x1 (from the canary run) |
| `manual-only` | pass | 13s | ab-plugin-update is not in the catalog the model sees; ab-pr-workflow and ab-project-start are |
| `build` | pass | 19m43s | acceptance test passes (deps: tabulate>=0.9) (host exited 1) · helper steps: helper,helper,helper,helper |
| `helpers-off` | degraded-pass (inline) | 14m44s | acceptance test passes (deps: tabulate>=0.9) · helper steps: inline,inline,inline,inline |
| `effort` | pass | 0s | session effort xhigh; 4 helper transcript(s) at the same effort |
| `review` | pass | 3m35s | the review names eval and cli.py · helper steps: helper |
| `debug` | pass | 6m07s | suite passes; store.py fixed; regression test present · helper steps: helper |
| `ship` | pass | 109m31s | published; pr create recorded; acceptance test passes (deps: tabulate>=0.9) on the pushed branch |
| `team` | pass | 10m11s | ledger done; 3 commits; tests pass · helper steps: helper,helper,helper,helper,helper |
| `upgrade` | pass | 3s | 14 checks passed: both plugin ids listed, detect-v3.sh reported and removed the v3 traces, the session-start warning names the v3 plugin |
