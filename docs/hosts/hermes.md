# Agent Blueprint on Hermes

Binary `hermes` (Hermes Agent, by Nous Research); facts from the docs at release v2026.9.24, read on 2026-09-28, and the install checked against Hermes 0.19.0 on 2026-10-12.

## Install

One route: the installer gives Hermes its own copy of `skills/` in `~/.hermes/skills`, a folder only Hermes reads, so there is no config to edit:

```bash
git clone https://github.com/Ninety2UA/agent-blueprint.git && bash agent-blueprint/install.sh --only hermes
```

The installer keeps a record in that folder (`.agent-blueprint-install.json`), so a re-run replaces or removes only the skills it recorded and leaves every other skill there alone. Skills in `~/.hermes/skills` are fully indexed, listed by `skills_list` and `skill_view`, and get slash commands under their bare names. The two plugin routes are not used, because a native plugin (`plugin.yaml`) leaves its skills out of the index and an Agent Plugins package (`hermes plugins install`) namespaces them as `agent-plugin-<slug>-<hash>`. Hermes's hub can install skills one at a time (`hermes skills tap add Ninety2UA/agent-blueprint`, then `hermes skills install Ninety2UA/agent-blueprint/<skill>`); no bulk form is documented, and a hub copy next to the installer's copy would double the catalog.

Trust and scan: project-level `.agents/skills/` and `.hermes/skills/` load only after `hermes skills trust`. Skills installed through the hub pass a security scan, and a "dangerous" verdict quarantines them; the blueprint's skills are written to pass it (no HTML comments, no instruction-file edits by name, no downloads piped into a shell).

What covers what: no other host's install covers Hermes. An `amp skill add` into a project writes `.agents/skills/`, which Hermes reads after `hermes skills trust`.

Check: `hermes skills list`, or `/skills` in the session. Update: `git pull` in the clone, then `bash install.sh --only hermes` again, or the ab-plugin-update skill (`hermes skills update` covers hub installs only). Docs: <https://hermes-agent.nousresearch.com/docs>.

Set up a project: `/ab-project-start` in a session. The README's [Set up your project](../../README.md#set-up-your-project) says what it creates and when to run it.

## Invoke a skill

- Explicit: `/ab-name`, up to five stacked in one message; `hermes chat -s ab-name` preloads a skill.
- By description: the agent loads a skill through `skill_view` when its index entry matches the request. In one-shot runs the skills prompt favors domain skills over process skills, so name the skill in the prompt.
- Manual-only: Hermes documents no `disable-model-invocation` (the string appears only in a test), so it cannot enforce it: `ab-plugin-update` and `ab-migrate` may be picked from a matching request. Both descriptions avoid broad trigger words, and `ab-migrate` asks before it removes anything.

## Model and effort

`-m/--model` and `--provider` on the command line, `/model` and `/reasoning high` in the session, and `agent.reasoning_effort` in the config (`none` to `ultra`). Helpers do not inherit the session's choice: `delegate_task` takes no per-task model or effort, and helpers run at the global `delegation.model` and `delegation.reasoning_effort` settings, so set those to what you want the helpers to use. Docs: <https://hermes-agent.nousresearch.com/docs>.

## What is missing or different

- Hooks: none from files. Hermes hooks live under `hooks:` in `config.yaml` or in a plugin's `register_hook`, and the blueprint ships neither. The five hook effects are absent: the session-start pointer to `docs/context/STATUS.md`, the injection scanner on writes, the commit-message check, the ship-pipeline Stop guard and the Agent Teams gates. Nothing else depends on them.
- Helpers: `delegate_task` (one goal or a task list), each started fresh without the parent's history; `worktree_isolation` gives each its own worktree.
- Team work: 3 helpers per wave interactive (`delegation.max_concurrent_children`: 3 in the config reference, 10 on the delegation page) and 2 in a one-shot run (`delegation.oneshot_max_children`; per the docs, 0 lifts the cap). Hermes Kanban, a durable board with a profile per role, is a candidate extra for a later release.
- Questions: `clarify`, a blocking question tool; a one-shot run takes the documented default.
- Task tracking: the plan file's checkboxes; Hermes's `todo` tool may mirror them.
- One-shot limits: at most 2 helpers, `skill_manage` off, and dangerous commands denied by `approvals.single_query_mode: deny`.
- Text rules: Hermes drops a whole context file that contains an HTML comment, and quarantines a skill or blocks a context file whose text reads as prompt injection (phrases that set aside earlier instructions or hide things from the user, `curl` piped into a shell, reads of secret files). The portability gate keeps the blueprint's files clear of both.
- Instructions: only one project file loads, first match wins: `.hermes.md` or `HERMES.md`, then `AGENTS.override.md`, then `AGENTS.md`, then `CLAUDE.md`, then `.cursorrules`; the file is truncated at `context_file_max_chars`.

## Unattended runs

Run from the project root, with the path to the skill folder as installed (a checkout is shown):

```bash
bash /path/to/agent-blueprint/skills/ab-ship-pipeline/scripts/run.sh --host hermes "<feature>"
```

Posture: `hermes -z "<prompt>"`, the one-shot mode that prints only the final text. `approvals.single_query_mode: deny` (the default) blocks commands Hermes flags as dangerous, and a hardline blocklist (`rm -rf /`, `mkfs`, `dd`, fork bombs) always blocks; that is a guard, so `--allow-unguarded` is not needed, and the runner never passes `--yolo`. The prompt names the skill, because preloading with `-s` under `-z` is not verified. Exit codes: 0 done, 2 failed or partial, 1 no text, 130 interrupted. Per-iteration timeout: 3600 s. Helpers per wave: 2. Preflight: `~/.hermes/config.yaml` exists. This row of the adapter table follows the vendor docs.

## Privacy

Nothing beyond the host's own terms is known. Hermes is self-hosted, so where its data goes depends on the model provider you configure.

## Paths to avoid

- `.claude/`: Hermes does not read it, and v4 keeps working files under `.agent-blueprint/`.
- `skills.external_dirs` pointing at another copy of the skills: Hermes would index it beside `~/.hermes/skills` and list every skill twice. The 4.0 route listed `~/.agents/skills` there; remove that line after a 4.1 install.
- A native `plugin.yaml` or an Agent Plugins `plugin.json`: both hide or rename the skills; the blueprint ships neither.
- HTML comments in `AGENTS.md`, `docs/context/STATUS.md` or any file Hermes loads as context: one comment drops the whole file.

## Smoke status

Install: the v4.1.0 install record ([docs/releases/v4.1.0-installs.md](../releases/v4.1.0-installs.md)) shows this tool installing Agent Blueprint by its own route and listing each skill once.

From the v4.1.0 smoke table ([docs/releases/v4.1.0-smoke.md](../releases/v4.1.0-smoke.md)), host version Hermes Agent v0.19.0 (2026.7.20), last cell 2026-10-12.

| Cell | State | Time | Reason |
|------|-------|------|--------|
| `hooks` | n/a | 0s | no hook path on this host |
| `manual-only` | n/a | 0s | hermes cannot enforce manual-only (KTD12); its support note says so |
