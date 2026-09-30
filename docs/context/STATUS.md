# Project Status

Last updated: 2026-10-01

## Session Continuity

_Kept current by the ab-session-wrap and ab-context-checkpoint skills. Full history: git log and docs/learnings/._

**Last session:** 2026-10-01

**What was done:** v3.8.0 "Plans as Decisions and Opus 5.5 Currency" is released from `main`. The v4.0 "Agent Blueprint" rebuild runs on the long-lived `release/v4` branch from `docs/plans/2026-09-28-1036-feat-agent-blueprint-portability-plan.md`, one stacked pull request per phase: phase 1 (U1-U4, flatten, rename, gates, snippets), phase 2 (U5-U10, prompt files, working state, team work, skill rewrites, instructions and scaffold) and phase 3 (U11-U14: a native manifest per host and the installer, hooks as optional enhancements with host detection, the ship runner `skills/ab-ship-pipeline/scripts/run.sh` with its adapter table and 26 fake-host scenarios, and ab-migrate for v3 projects).

**What's remaining:**
- Phase 4 (U15-U17): the local smoke test (`tests/smoke/`) across the installed hosts, the docs and site for eight hosts, the v3.8.0-to-v4 evaluation and the v4.0.0 release checklist (merge, tag, rename the repository, re-check git-URL installs) for the maintainer.
- Pi, Hermes and Amp are not installed on the maintainer's machine, so their smoke cells and adapter rows stay unverified until they are.

**Start here:** the open phase pull requests against `release/v4`; none is merged until the maintainer reviews it.

## Current State of the Code

- **Build:** none (the repository is the plugin)
- **Tests:** `python3 -m unittest discover -s tests/gates`, `bash tests/hooks/run-tests.sh`, `bash tests/runner/run-tests.sh`
- **Lint:** markdownlint and shellcheck, as CI runs them
- **Gates:** drift, skill collisions, portability (with the shrink-only allowlist), manifests, snippet sync, and `claude plugin validate --strict`; see AGENTS.md § Gates
