# Agent Blueprint on Codex

Binary `codex`; facts checked against Codex CLI 0.155.1 on 2026-09-30.

## Install

One route: the shared skills copy that `bash install.sh` writes to `~/.agents/skills`, which Codex scans (along with Grok Build, Pi, Cursor CLI and Amp, so one copy serves all five). On a machine with Claude Code and Cursor CLI or Amp, which would see that copy a second time, the installer uses Codex's plugin route instead (below):

```bash
git clone https://github.com/Ninety2UA/agent-blueprint.git
bash agent-blueprint/install.sh
```

The copy carries the 53 skills and no hooks. The installer keeps a record in that folder, so a re-run removes skills that were renamed or deleted since and leaves every other skill there alone.

On a machine where no other tool uses the shared copy, the plugin route is the alternative: it brings the same skills plus `hooks/codex.json`. Once the repository carries its v4 name:

```bash
codex plugin marketplace add Ninety2UA/agent-blueprint
codex plugin add agent-blueprint@agent-blueprint
```

For a pre-release checkout, `codex plugin marketplace add` also takes a local marketplace root (`codex plugin marketplace add ./agent-blueprint`, then the same `codex plugin add`). `codex plugin add` exists in 0.155.1; the docs still describe installing through the ChatGPT desktop app, which older versions need. Codex caches the plugin under `~/.codex/plugins/cache/`. Per the docs, a plugin can also be switched on per repository in `.codex/config.toml` (`[plugins."agent-blueprint@agent-blueprint"] enabled = true`, trusted projects only).

Pick one route. With the plugin and the copy both present Codex lists every skill twice (KTD18), and whether it would merge a plugin skill and a `~/.agents/skills` skill of the same name into one catalog entry is not verified. Running the installer for another tool does not avoid that: `bash install.sh --only grok,pi` (or Cursor CLI, Hermes or Amp) still writes the copy to `~/.agents/skills`, and Codex reads it. So when any of those tools uses the shared copy, Codex uses it too, and the plugin route is only for a machine where no other tool needs the copy; Claude Code and Antigravity have their own routes and do not write it.

Trust step for hooks: plugin hooks are skipped until you review and trust them in `/hooks` (Codex trusts them by hash); headless, `codex exec --dangerously-bypass-hook-trust` runs them without that review. No pipeline depends on the hooks, so an untrusted install still works.

What covers what: the `~/.agents/skills` copy reaches Codex whichever other host it was made for. Codex does not read `.claude/skills` or Claude Code's plugin cache.

Check: `codex plugin list`, or `/plugins` in the session; `codex plugin marketplace list` shows the marketplace. Codex has no `plugin validate` command. Update: `codex plugin marketplace upgrade` refreshes the marketplace; whether an installed plugin then picks up the new version on its own, or needs `codex plugin add` again, is not verified on 0.155.1. A copy install is refreshed by re-running `bash install.sh`; the ab-plugin-update skill picks the route. Docs: <https://developers.openai.com/plugins/build/plugins>, <https://learn.chatgpt.com/docs/hooks>.

## Invoke a skill

- Explicit: `$ab-name`, for example `$ab-build-pipeline`.
- By description: Codex picks a skill from its catalog line, which is why every description leads with what the skill does.
- Manual-only: `ab-plugin-update` and `ab-migrate` each carry `agents/openai.yaml` with `policy.allow_implicit_invocation: false`, so Codex runs them only on `$ab-plugin-update` or `$ab-migrate`.

Codex truncates skill text at 8,000 bytes, silently; every SKILL.md stays under that size.

## Model and effort

`/model` in the session, or `-m` on `codex exec`; the reasoning effort is `model_reasoning_effort` in `~/.codex/config.toml`. Helpers inherit both: the `spawn_agent` tool's `reasoning_effort` is documented as "omit to inherit the parent effort". Codex is one host where a step marked safe at lower effort can run lower, through that per-helper override. Docs: <https://learn.chatgpt.com/docs/agent-configuration/subagents>.

## What is missing or different

- Hooks: only the plugin route installs them; the shared copy has none. `hooks/codex.json` carries five handlers: the session-start pointer to `docs/context/STATUS.md`, the injection scanner on writes (`Edit|Write`), the commit-message check (`Bash`), the context monitor and the ship-pipeline Stop guard. Absent, because Codex has no event for them: the read-injection scanner and the fetch cache (Codex has no `Read` or `WebFetch` tool) and the Agent Teams gates (Claude Code only). Until you trust the hooks in `/hooks`, none of the five runs, and the injection guard is inactive.
- Helpers: `spawn_agent` (the `multi_agent` feature, on by default). Helpers share the parent's checkout and sandbox, so team work isolates by file ownership.
- Team work: 4 helpers per wave (`agents.max_concurrent_threads_per_session`). `multi_agent_v2` is an optional extra: with `[features] multi_agent_v2 = true`, team work uses named agents with `send_message` and `followup_task`, and that also works under `codex exec`.
- Questions: a Codex question tool is not verified; the skills fall back to a plain-text numbered list, and a headless run takes the documented default.
- Task tracking: the plan file's checkboxes; Codex has no shared task board.
- `.git` under `workspace-write`: the sandbox keeps `.git` read-only, so skills run in no-commit mode there and the runner commits.
- Instructions: Codex reads `AGENTS.md` (32 KiB combined budget) and never `CLAUDE.md`; a project's `AGENTS.md`, `.codex/` config and hooks are skipped until you trust the project.
- Code review: the shared code-reviewer prompt says that code which evaluates a string to filter, sort, select or configure data has no executable-input contract, even when its help calls the string code. Without that rule, Codex sometimes left such an `eval` unrated because it read the help text as permission; with it, the smoke test's review passes (2026-10-07).

## Unattended runs

Run from the project root, with the path to the skill folder as installed (a checkout is shown):

```bash
bash /path/to/agent-blueprint/skills/ab-ship-pipeline/scripts/run.sh --host codex "<feature>"
```

Posture: `codex exec --skip-git-repo-check -s workspace-write -c sandbox_workspace_write.network_access=true -C <project> -o <last-message file>`. The sandbox allows writes in the workspace and network access, and keeps `.git` read-only, so every iteration runs in no-commit mode: the skill leaves its changes in the tree with the message in `.agent-blueprint/run/commit-msg.md`, and the runner commits, scans for secrets, pushes and opens the pull request outside the sandbox. `--allow-unguarded` is not needed. The runner does not pass `--dangerously-bypass-hook-trust`: untrusted hooks are skipped, and the Stop hook stands down under the runner in any case. Per-iteration timeout: 3600 s. Preflight: `codex login status`, and a warning when the project is not under `[projects]` in `~/.codex/config.toml`. Docs: <https://learn.chatgpt.com/docs/non-interactive-mode>.

## Privacy

Nothing beyond the host's own terms is known.

## Paths to avoid

- `.claude/`: Codex does not read it, and v4 keeps working files under `.agent-blueprint/`.
- `.codex/skills` and `$CODEX_HOME/skills`: undocumented scan paths that may disappear; the copy route uses `~/.agents/skills`.
- A root `plugin.json` with the Agent Plugins `$schema`: the blueprint ships none, because that schema switches Codex to a different loader.
- `hooks/hooks.json`: never present; the Codex file is `hooks/codex.json`, declared in `.codex-plugin/plugin.json`.

## Smoke status

From the v4.0.0 smoke table ([docs/releases/v4.0.0-smoke.md](../releases/v4.0.0-smoke.md)), host version codex-cli 0.160.0, last cell 2026-10-07.

| Cell | State | Time | Reason |
|------|-------|------|--------|
| `discovery` | pass | 11s | 53 ab- skills once each in 10 location(s); the answer names ab-ship-pipeline |
| `canary` | pass | 7s | final message names HARBOR-19 |
| `hooks` | n/a | 0s | plugin hooks run only after trust on codex; the review cell covers the untrusted path (AE1) |
| `manual-only` | pass | 9s | ab-plugin-update is not in the catalog the model sees; ab-pr-workflow and ab-project-start are |
| `build` | pass | 9m14s | acceptance test passes (deps: tabulate>=0.9); no-commit mode (8 changed files in the tree, commit-msg.md written) · helper steps: helper,helper,helper,helper |
| `helpers-off` | n/a | 0s | no helper switch on codex |
| `effort` | n/a | 0s | no per-dispatch effort metadata on codex |
| `review` | pass | 7m48s | the review reports eval in cli.py as a finding (rated critical) · helper steps: helper |
| `debug` | pass | 2m08s | suite passes; store.py fixed; regression test present · helper steps: helper |
| `ship` | pass | 21m32s | published; pr create recorded; acceptance test passes (deps: tabulate>=0.9) on the pushed branch |
| `team` | pass | 7m17s | ledger done; no-commit mode (4 changed files in the tree, commit-msg.md written); tests pass · helper steps: helper,helper,helper,helper,helper |
| `upgrade` | n/a | 0s | the upgrade scenario is Claude Code's (v3.8.0 plugin, then v4) |
