# Smoke test

One command proves which Agent Blueprint pipelines work in which tools, and its table feeds the release decision (plan unit U15; requirements R3, R21, R28, R29; decisions KTD15, KTD18, KTD19).

**It costs real tokens on real hosts.** Every cell starts a headless session on the host under test, and the build, ship and team cells run whole pipelines with helpers. Expect an hour and several dollars per host for the full table. It runs on the maintainer's machine only and never in CI; CI only lints its scripts.

## Running it

```bash
bash tests/smoke/run-smoke.sh                       # every installed host, every cell, into docs/releases/
bash tests/smoke/run-smoke.sh --host claude,codex   # two hosts
bash tests/smoke/run-smoke.sh --host claude --cell canary,hooks --plugin-dir . --v3-dir ../main-checkout
bash tests/smoke/run-smoke.sh --jobs 3              # three hosts at a time (the cells of one host stay sequential)
bash tests/smoke/run-smoke.sh --keep --timeout 900  # keep every working copy; 15 minutes per cell
```

| Flag | Meaning |
|------|---------|
| `--host h1,h2` | Hosts to run; default every host in `hosts.sh` (`claude codex agy grok pi cursor-agent hermes amp`). A host not on PATH renders `not-installed` |
| `--cell c1,c2` | Cells to run; default all. They always run in the canonical order (build before helpers-off and effort, canary before hooks) |
| `--plugin-dir PATH` | The checkout passed to hosts that take a plugin directory (Claude Code, Cursor, Antigravity); default this checkout. Other hosts use their installed copy |
| `--v3-dir PATH` | A checkout of `main` at v3.8.0 (plugin root `plugins/claude-code-blueprint`) for the `upgrade` cell; without it that cell is `n/a` |
| `--out DIR` | Where the table and JSON go; default `docs/releases/` |
| `--jobs N` | Hosts in parallel, N at a time |
| `--timeout S` | Seconds per cell instead of the host's row in `hosts.sh` (3600; Antigravity 2400); ship cells get twice that |
| `--keep` | Keep every cell's working copy. A cell that did not pass keeps its copy anyway and names it in its reason |

Before a run: the host must be installed and logged in, and the plugin installed by the host's canonical route from the local checkout (KTD19; the support notes in `docs/hosts/` name the route). `hosts.sh`'s preflight checks auth and trust per host and prints the fix; a hard failure renders `fail` for every cell of that host. Antigravity needs `allowNonWorkspaceAccess` in its settings, Cursor needs `cursor-agent login`, Codex `codex login`.

Output:

- `docs/releases/v<version>-smoke.md`: the table (rows hosts, columns cells, each cell its state and wall time), the legend, the host versions, the runs and every non-pass reason.
- `docs/releases/v<version>-smoke.json`: every cell's details (state, seconds, tokens, cost, log path, reason, session id, vendor-bug link). A run merges into the existing file, so partial runs (`--host`, `--cell`) build one table and a rerun replaces the same host and cell.
- `tests/smoke/logs/<run>/<host>/<cell>.log` (and `.final`, `.last`, `.trace`), ignored by git.

## What each cell proves

Every cell runs on a fresh copy of `tests/smoke/fixture/` (a small stdlib-only Python notes store with `AGENTS.md` in the v4 scaffold shape, `CLAUDE.md` importing it, `docs/context/STATUS.md`, tests) with only its own seed applied. The harness commits the fixture on `main`, adds a local bare `origin`, creates the work branch `smoke/<cell>` and commits the seed there. Prompts name the skill the way the host does (`host_skill_ref` in `hosts.sh`: `/agent-blueprint:ab-x` on Claude Code with `--plugin-dir`, `$ab-x` on Codex, `/skill:ab-x` on Pi, "the ab-x skill" elsewhere) and say the run is headless, so questions take their defaults.

| Cell | Seed | Prompt | Passes when |
|------|------|--------|-------------|
| `discovery` | none | "Which skill runs the autonomous ship pipeline?" | Every `ab-` skill folder appears exactly once across the host's catalog locations (`host_catalog_dirs` in `hosts.sh`, from the U11 fact sheet; Claude Code counts the plugins enabled in `settings.json` plus `--plugin-dir`), and the answer names `ab-ship-pipeline` (KTD18) |
| `canary` | none | "What is the project codename?" | The final message contains `HARBOR-19`, the line in `AGENTS.md` (the instructions file loads) |
| `hooks` | none | the canary prompt with `AGENT_BLUEPRINT_HOOK_TRACE` exported | On Claude Code a handler wrote the trace (the trace works); on Grok, Cursor and Antigravity the trace file does not exist (no blueprint hook fired, KTD11). Reuses the canary run when it ran in the same invocation. `n/a` on Codex (hooks run only after trust; the review cell covers the untrusted path, AE1) and on hosts with no hook path |
| `manual-only` | none | "Check whether a newer version of the Agent Blueprint plugin is available and update it if so." | The final message and log lack "Upgrading Agent Blueprint" and no provenance record for `ab-plugin-update` exists (KTD12, AE4). `n/a` on Amp and Hermes, which cannot enforce it |
| `build` | `docs/plans/feature-export-table.md` | ab-build-pipeline on the plan | The hidden acceptance test `scenarios/build/acceptance/test_export_table.py` (copied in after the run) passes in a venv built from the project's declared dependencies, so `tabulate` must be declared and `notes export --format table` must list both notes. A run that changes nothing fails it |
| `helpers-off` | as build | the build prompt with helpers disabled (`host_helpers_off_args`: Claude Code `--disallowedTools Agent Task`, Codex `-c features.multi_agent=false`) | The acceptance test passes and every helper step in the provenance record ran inline: `degraded-pass (inline)` (AE3). `n/a` where the host has no switch |
| `effort` | reads the build cell | none | Claude Code only: the build session's helper transcripts (`~/.claude/projects/<cwd>/<session>/subagents/*.jsonl`) carry the same `effort` as the session (AE2). Other hosts `n/a`; `n/a` when the build ran without helpers |
| `review` | `cli.py` gains `list --filter EXPR`, evaluated with `eval()`, committed on the branch | ab-requesting-code-review on the branch against main | The review output (final message plus files written under `.agent-blueprint/review-runs/` or `docs/`) names `eval` and `cli.py`. Change `scenarios/review/skill` to `ab-review-swarm` for the multi-reviewer pipeline |
| `debug` | `store.py` compares case-sensitively; `tests/test_search.py` fails | ab-systematic-debugging on the failing suite | The suite passes, `src/notes/store.py` changed, and a regression test was kept or added |
| `ship` | the build plan | `run.sh --host <host> "<feature>" --max 6 --plugin-dir <checkout>` with the `gh` shim on PATH | The runner reports a publish, the shim log holds `pr create`, the bare remote has the branch, and the acceptance test passes on the pushed branch (AE5, AE6) |
| `team` | the three-task plan from the U7 runs replaces the project (T1 and T3 share `calc.py`) | `ab-orchestrate docs/plans/three-task-plan.md --no-review` | `.agent-blueprint/team/<run>/ledger.md` says `Status: done`, three commits landed after the base, and `python3 -m unittest -v` passes (AE7) |
| `upgrade` | none (Claude Code only, needs `--v3-dir`) | `scenarios/upgrade/run-upgrade.sh` | In a temporary `CLAUDE_CONFIG_DIR`: the v3.8.0 marketplace and plugin install from the v3 checkout, then v4 from this one; `claude plugin list` shows both ids; `ab-migrate`'s `detect-v3.sh` reports and removes the v3 traces of a legacy project; the session-start hook warns about the v3 plugin. No model runs |

Build, review, debug, ship and team pass only when the skill's provenance record `.agent-blueprint/run/provenance/<skill>.json` exists (KTD6); a missing record turns a pass into `fail`. A record whose helper steps all ran inline turns `pass` into `degraded-pass (inline)`. (The ship runner deletes the record when it publishes; there the runner's own done check enforced the marker.)

## States

| State | Meaning |
|-------|---------|
| `pass` | The outcome check held (and the provenance record exists for pipeline cells) |
| `degraded-pass (inline)` | The check held, but every helper step ran inline |
| `degraded (vendor bug)` | The check failed and `scenarios/known-vendor-bugs.tsv` has a row for the host and cell (or `*`); the table links the upstream issue (AE6). Add a row only for a confirmed vendor bug |
| `fail` | The check failed, the provenance record is missing, the host exited early, or the host's preflight failed |
| `timeout` | The host did not finish within the cell's timeout; its process group was killed |
| `not-installed` | The host CLI is not on PATH; nothing ran |
| `n/a` | The cell does not apply to the host; the reason says why |

## Adding a host or a cell

A host is a row in `skills/ab-ship-pipeline/scripts/hosts.sh` (KTD15): add it to `AB_HOSTS` and to every `host_*` function, including the smoke rows `host_version`, `host_helpers_off_args`, `host_hooks`, `host_manual_only`, `host_catalog_dirs` and `host_usage`. The smoke test reads nothing about a host from anywhere else.

A cell is a folder under `scenarios/<cell>/`: `apply.sh WORK` seeds the fresh copy (optional; `commit-message` names the seed commit), `skill` names the skill (optional; it drives the prompt reference and the provenance rule), `prompt.txt` holds the prompt with `{{SKILL_REF}}`, and `check.sh WORK BASE FINAL LOG REMOTE` decides the outcome (prints the reason; exit 0 passes). Add the name to `ALL_CELLS` in `run-smoke.sh` and, when the cell needs a host fact, a `cell_<name>` function there (as `hooks`, `helpers-off`, `effort`, `discovery` and `upgrade` do). Teach `fake-host.sh` the new prompt and add the assertion to `selftest.sh`.

## Checking the harness without a host

```bash
bash tests/smoke/selftest.sh                                    # about a minute, no tokens
SMOKE_SELFTEST_V3_DIR=../main-checkout bash tests/smoke/selftest.sh   # also the eval mechanics
```

`selftest.sh` runs the harness against `tests/smoke/fake-host.sh` (`hosts.sh`'s `fake` row, selected with `AGENT_BLUEPRINT_FAKE_HOST`), which answers the prompts a cooperating host would, and asserts every state from the JSON: pass mode, fail mode with a vendor-bug row, a not-installed host, `--jobs 2`, a timeout, a duplicated catalog, a foreign hook that fires, and markdownlint on the rendered table.

## The evaluation (U17 step 1)

```bash
bash tests/smoke/eval.sh --v3-dir ../main-checkout            # build, review, debug, ship; 3 runs each on v3.8.0 and v4
bash tests/smoke/eval.sh --v3-dir ../main-checkout --runs 5 --task build,ship
```

`eval.sh` runs the same fixture tasks on Claude Code against the v3.8.0 plugin (`--plugin-dir plugins/claude-code-blueprint`, skills named `/claude-code-blueprint:<v3 name>` through `docs/upgrade/v4-skill-names.tsv`; ship through v3's `scripts/ship.sh` with a `claude` wrapper that adds the flag) and against v4 (`/agent-blueprint:<name>`; ship through the runner). It writes `docs/releases/v<version>-eval.md`: passes out of N per version, median wall time, tokens and cost, a regression flag when v3 passes and v4 fails in the majority, and every increase above 25% for the release lead to explain. Runs append to `v<version>-eval.json`.

## The Agent Teams check (manual, interactive only)

The Claude Code Agent Teams extra only runs in an interactive session, so it is not a cell. Once per release:

1. Copy the fixture and apply the team seed: `bash tests/smoke/scenarios/team/apply.sh <copy>`; commit it.
2. Start Claude Code in that copy with `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 claude --plugin-dir <checkout>`.
3. Run `/agent-blueprint:ab-orchestrate docs/plans/three-task-plan.md`.
4. Confirm that `.agent-blueprint/team/active.md` flips to `active: true` while the run is on and back to `active: false` when it ends, that teammates appear in the session, and that the ledger ends with `Status: done` and three commits.
