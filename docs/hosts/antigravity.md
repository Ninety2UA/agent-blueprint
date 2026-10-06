# Agent Blueprint on Antigravity

Binary `agy`; facts checked against Antigravity CLI 1.2.12 on 2026-09-30.

## Install

One route: `agy plugin install` from a checkout. The source root must hold `plugin.json`, which this repository has at its root.

```bash
git clone https://github.com/Ninety2UA/agent-blueprint.git
agy plugin install ./agent-blueprint
```

The docs document the directory form. A git URL (`agy plugin install https://github.com/Ninety2UA/agent-blueprint`) worked for another plugin on 1.0.10 per a third-party report and is not verified on 1.2.12; it is checked after the repository rename. `bash install.sh` runs `agy plugin install <checkout>` for Antigravity, because a copy in `~/.agents/skills` would not reach it: Antigravity does not scan that folder. The installed copy lives at `~/.gemini/config/plugins/agent-blueprint` on 1.2.12; `agy plugin list` shows it.

Trust step: none. On 1.2.16 a headless run with `--dangerously-skip-permissions` reads the installed plugin's files outside the workspace, writes files and runs commands without any settings change (verified 2026-10-04). Version 1.2.12 stalled the first time a skill read a file outside the workspace unless `allowNonWorkspaceAccess` was `true` in `~/.gemini/antigravity-cli/settings.json`; if an older version stalls that way, set the key. The runner's preflight warns when it is unset and does not stop.

What covers what: no other host's install covers Antigravity, and an Antigravity install covers no other host. Antigravity does read a project's `.agents/skills/`, so an `amp skill add` into a project shows its skills here too; keep one route.

Check: `agy plugin list` shows `agent-blueprint` with its components; `agy plugin validate ./agent-blueprint` checks a checkout and reports each section as processed or skipped. Update: pull the checkout and run `agy plugin install` again, or the ab-plugin-update skill. Docs: <https://antigravity.google/docs/plugins>.

## Invoke a skill

- Explicit: `/ab-name` (verified headless on 1.2.16 and 1.3.0), for a skill in the catalog; see Catalog budget below.
- By description: Antigravity picks a skill whose description matches the request.
- Manual-only: Antigravity documents no `disable-model-invocation` control, but the smoke test's manual-only cell passes on 1.2.16: `ab-plugin-update` is absent from the catalog the model sees while other `ab-p` skills are in it. Both manual-only descriptions also avoid broad trigger words, and `ab-migrate` asks before it removes anything.

## Model and effort

`/model` persists the choice in the session. `agy --model <model>` and `agy --effort low|medium|high|xhigh|max` set them for one session, and `agy models` lists the models (all three in `agy --help` on 1.2.16, checked 2026-10-04). Helpers: `invoke_subagent` documents no per-dispatch model or effort, only a `model` tier (`inherit|flash|pro`) in an agent definition, which the blueprint does not ship; whether an ad hoc helper inherits the session's setting is not verified, so a step marked safe at lower effort runs at the session's level. Docs: <https://antigravity.google/docs/subagents>.

## What is missing or different

- Hooks: none. The blueprint ships no `hooks.json` for Antigravity, so the five hook effects are absent: the session-start pointer to `docs/context/STATUS.md` (Antigravity has no session-start event in any case), the injection scanner on writes, the commit-message check, the ship-pipeline Stop guard and the Agent Teams gates. Nothing else depends on them. Per a third-party report, `PreToolUse` hooks do not fire under `--dangerously-skip-permissions` anyway.
- Helpers: `invoke_subagent`, asynchronous and parallel, started fresh without the parent's history; a helper's workspace can be a git worktree (`branch` mode). No documented cap.
- Team work: no cap in `host-limits.tsv`; worktree isolation. Antigravity's Teamwork mode (`/teamwork-preview`) is paid, in preview and opens with a user interview, so no skill drives it.
- Catalog budget: Antigravity lists skills to the model only up to a context budget and names the ones it left out. On the build machine, with 237 skills from other plugins and `~/.gemini/config/skills` installed, 1.3.0 left out 48 of the 53 `ab-` skills (2026-10-06). A left-out skill does not load even by name: a headless `/ab-build-pipeline` reached the model as plain text, and Gemini built the feature without the pipeline or its provenance record, which is why the smoke test's build and debug cells failed on that machine. With only the blueprint installed, both cells load the skill and write the record (verified 2026-10-06 in a clean profile; `tests/smoke/README.md` § A clean profile for a capped catalog). If `ab-` skills are missing, keep fewer skills in `~/.gemini/config/skills` and fewer plugins enabled (`agy plugin disable <name>`; whether a disabled plugin stops counting is not verified).
- Questions: `ask_question`, a blocking question tool (not in the vendor docs; not verified); a headless run takes the documented default.
- Task tracking: the plan file's checkboxes; `/tasks` is a user command, and a model-callable todo tool is not verified.
- Instructions: Antigravity reads `GEMINI.md` and `AGENTS.md` at the workspace root; per a third-party report `GEMINI.md` wins on conflict and `CLAUDE.md` is not read.
- Paths inside a skill: per a third-party report a relative path written in a SKILL.md does not resolve on its own, which is why every skill locates its scripts from its own folder; a spike on 1.2.12 confirmed a skill reads its own `references/` file headlessly.

## Unattended runs

Run from the project root, with the path to the skill folder as installed (a checkout is shown):

```bash
bash /path/to/agent-blueprint/skills/ab-ship-pipeline/scripts/run.sh --host agy --allow-unguarded "<feature>"
```

Posture: `agy -p --output-format json --dangerously-skip-permissions`. That flag is the only way a headless run completes without waiting for an approval (without it a run may stall on a permission prompt), and it leaves no guard: hooks do not fire under it, and per a third-party report `--sandbox` can be bypassed with it. So the runner requires `--allow-unguarded`, which means: the agent holds your git and `gh` credentials for the whole run, and the runner's secret scan and publish checks cannot contain what it does before it publishes. Run it in a throwaway clone or a container. Per-iteration timeout: 2400 s, shorter than on the other hosts because of earlier headless hang reports (antigravity-cli#548); a check on 1.2.12 completed file writes, shell commands and a project skill cleanly. Preflight: credentials (`~/.gemini/oauth_creds.json` or `GEMINI_API_KEY`), `allowNonWorkspaceAccess`, and a warning when the project is not under `trustedWorkspaces`. Docs: <https://antigravity.google/docs/cli/features>.

## Privacy

Nothing beyond the host's own terms is known.

## Paths to avoid

- `.claude/`: not read by Antigravity (per a third-party report), and v4 keeps working files under `.agent-blueprint/`.
- `~/.agents/skills`: not scanned, so the copy route does not reach Antigravity.
- `.claude-plugin/`: not read natively; `agy plugin import claude` converts a Claude Code install, which would give you a second copy.
- `hooks/hooks.json` and a root `hooks.json`: neither is present in this plugin.

## Smoke status

From the v4.0.0 smoke table ([docs/releases/v4.0.0-smoke.md](../releases/v4.0.0-smoke.md)), host version 1.2.16, last cell 2026-10-04.

| Cell | State | Time | Reason |
|------|-------|------|--------|
| `discovery` | pass | 12s | 53 ab- skills once each in 13 location(s); the answer names ab-ship-pipeline |
| `canary` | pass | 10s | final message names HARBOR-19 |
| `hooks` | pass | 0s | no blueprint hook fired (from the canary run) |
| `manual-only` | pass | 1m05s | ab-plugin-update is not in the catalog the model sees; ab-pr-workflow and ab-project-start are |
| `build` | fail | 1m43s | no provenance record for ab-build-pipeline; acceptance test passes (deps: tabulate); 1 commit(s) after the base |
| `helpers-off` | n/a | 0s | no helper switch on agy |
| `effort` | n/a | 0s | no per-dispatch effort metadata on agy |
| `review` | degraded-pass (inline) | 2m05s | the review reports eval in cli.py as a finding (security: arbitrary) · helper steps: inline |
| `debug` | fail | 59s | no provenance record for ab-systematic-debugging; suite passes; store.py fixed; regression test present |
| `ship` | pass | 2m18s | published; pr create recorded; acceptance test passes (deps: tabulate) on the pushed branch |
| `team` | pass | 4m19s | ledger done; 3 commits; tests pass |
| `upgrade` | n/a | 0s | the upgrade scenario is Claude Code's (v3.8.0 plugin, then v4) |

A `fail` cell blocks the release until it passes or is confirmed as a vendor bug (then it renders `degraded (vendor bug)` with the upstream link; see `docs/releases/v4.0.0-checklist.md`).
