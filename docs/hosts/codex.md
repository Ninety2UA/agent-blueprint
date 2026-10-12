# Agent Blueprint on Codex

Binary `codex`; facts checked against Codex CLI 0.155.1 on 2026-09-30, and the install, the hooks and the update against 0.160.0 on 2026-10-12.

## Install

One route: the plugin, straight from GitHub, in the CLI and the app. In the CLI, add the marketplace and the plugin:

```bash
codex plugin marketplace add Ninety2UA/agent-blueprint
codex plugin add agent-blueprint@agent-blueprint
```

Then start a session and trust the hooks in `/hooks`. In the Codex app, add the same marketplace and plugin from its plugin directory and trust the hooks the same way. Codex caches the plugin under `~/.codex/plugins/cache/`, one folder per version. `bash install.sh` in a clone of the repository runs the same two commands with GitHub as the source, or with the clone under `--local`. Per the docs, a plugin can also be switched on per repository in `.codex/config.toml` (`[plugins."agent-blueprint@agent-blueprint"] enabled = true`, trusted projects only).

Trust step for hooks: plugin hooks are skipped until you review and trust them in `/hooks` (Codex trusts them by hash); headless, `codex exec --dangerously-bypass-hook-trust` runs them without that review. No pipeline depends on the hooks, so an untrusted install still works.

After the install, Codex offers `$ab-project-start`, the setup skill, because the manifest names it as the plugin's onboarding skill. The README's [Set up your project](../../README.md#set-up-your-project) says what it creates and when to run it. In the `$` picker every skill shows a display name and a one-line description from its `agents/openai.yaml`, such as Project Setup for `ab-project-start`.

What covers what: no other host's install covers Codex. Codex reads neither `.claude/skills` nor Claude Code's plugin cache. If a 4.0 install left a skills copy in `~/.agents/skills`, Codex lists every skill twice until a run of `bash install.sh` without `--only` removes it.

Check: `codex plugin list`, or `/plugins` in the session; `codex plugin marketplace list` shows the marketplace; type `$` in a session and look for the display names. Codex has no `plugin validate` command. Update: `codex plugin marketplace upgrade agent-blueprint`, then `codex plugin add agent-blueprint@agent-blueprint` again, because Codex keeps each version in its own cache folder; a marketplace added from a local checkout is pulled with git instead of upgraded. The ab-plugin-update skill follows the same route and moved a Codex 0.160.0 install from 4.0.2 to 4.1.0 (`docs/releases/v4.1.0-installs.md`). Docs: <https://developers.openai.com/plugins/build/plugins>, <https://learn.chatgpt.com/docs/hooks>.

## Invoke a skill

- Explicit: `$ab-name`, for example `$ab-build-pipeline`.
- By description: Codex picks a skill from its catalog line, which is why every description leads with what the skill does.
- Manual-only: `ab-plugin-update` and `ab-migrate` each carry `agents/openai.yaml` with `policy.allow_implicit_invocation: false`, so Codex runs them only on `$ab-plugin-update` or `$ab-migrate`.

Codex truncates skill text at 8,000 bytes, silently; every SKILL.md stays under that size.

## Model and effort

`/model` in the session, or `-m` on `codex exec`; the reasoning effort is `model_reasoning_effort` in `~/.codex/config.toml`. Helpers inherit both: the `spawn_agent` tool's `reasoning_effort` is documented as "omit to inherit the parent effort". Codex is one host where a step marked safe at lower effort can run lower, through that per-helper override. Docs: <https://learn.chatgpt.com/docs/agent-configuration/subagents>.

## What is missing or different

- Hooks: `hooks/codex.json` carries five handlers: the session-start pointer to `docs/context/STATUS.md`, the injection scanner on writes (`Edit|Write`; it also scans the lines an `apply_patch` edit adds), the commit-message check (`Bash`, on when `.agent-blueprint/config.json` sets `hooks.validateCommit`), the context monitor and the ship-pipeline Stop guard. A Codex 0.160.0 session ran all five (2026-10-12), and in it the guard warned on an `apply_patch` edit and the commit check flagged a commit message. Absent, because Codex has no event for them: the read-injection scanner and the fetch cache (Codex has no `Read` or `WebFetch` tool) and the Agent Teams gates (Claude Code only). Until you trust the hooks in `/hooks`, none of the five runs, and the injection guard is inactive.
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
- `.codex/skills` and `$CODEX_HOME/skills`: undocumented scan paths that may disappear; the plugin is the only route.
- `~/.agents/skills`: Codex scans it, so a skills copy there beside the plugin lists every skill twice; a re-run of the installer removes the one 4.0 recorded.
- A root `plugin.json` with the Agent Plugins `$schema`: the blueprint ships none, because that schema switches Codex to a different loader.
- `hooks/hooks.json`: never present; the Codex file is `hooks/codex.json`, declared in `.codex-plugin/plugin.json`.

## Smoke status

Install: the v4.1.0 install record ([docs/releases/v4.1.0-installs.md](../releases/v4.1.0-installs.md)) shows this tool installing Agent Blueprint by its own route and listing each skill once.

From the v4.1.0 smoke table ([docs/releases/v4.1.0-smoke.md](../releases/v4.1.0-smoke.md)), host version codex-cli 0.160.0, last cell 2026-10-12.

| Cell | State | Time | Reason |
|------|-------|------|--------|
| `discovery` | pass | 23s | 53 ab- skills once each in 11 location(s); the answer names ab-ship-pipeline |
| `hooks` | pass | 15s | all five handlers wrote codex trace lines; prompt-guard.js:warned and validate-commit.js:flagged recorded codex actions |
| `manual-only` | pass | 12s | ab-plugin-update is not in the catalog the model sees; ab-pr-workflow and ab-project-start are |
| `debug` | pass | 2m39s | suite passes; store.py fixed; regression test present · helper steps: helper |
| `tdd-override` | pass | 1m21s | seeded functions retain their recorded behavior; count_words test present; suite passes |
| `brainstorm-override` | pass | 9m34s | no design approval request; plan or code: src/notes/store.py, docs/plans/2026-10-12-note-count.md |
