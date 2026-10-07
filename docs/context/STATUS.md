# Project Status

Last updated: 2026-09-29

## Session Continuity

_Kept current by the ab-session-wrap and ab-context-checkpoint skills. Full history: git log and docs/learnings/._

**Last session:** 2026-09-29

**What was done:** v3.8.0 "Plans as Decisions and Opus 5.5 Currency" is released from `main`. The v4.0 "Agent Blueprint" rebuild runs on the long-lived `release/v4` branch from `docs/plans/2026-09-28-1036-feat-agent-blueprint-portability-plan.md`, one stacked pull request per phase: phase 1 (U1-U4, flatten, rename, gates, snippets) and phase 2 (U5-U10, prompt files, working state, team work, skill rewrites, instructions and scaffold).

**What's remaining:**
- Phase 3 (U11-U14): host manifests and installer, hooks as optional enhancements, the ship runner for any host, and the upgrade path.
- Phase 4 (U15-U17): the local smoke test across all eight hosts (needs Pi, Hermes and Amp installed), docs and site, evaluation and the v4.0.0 release.

**Start here:** the open phase pull requests against `release/v4`; none is merged until the maintainer reviews it.

## Current State of the Code

- **Build:** none (the repository is the plugin)
- **Tests:** `python3 -m unittest discover -s tests/gates`
- **Lint:** markdownlint and shellcheck, as CI runs them
- **Gates:** drift, skill collisions, portability (with the shrink-only allowlist), manifests, snippet sync, and `claude plugin validate --strict`; see AGENTS.md § Gates
