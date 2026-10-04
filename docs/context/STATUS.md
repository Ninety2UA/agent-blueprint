# Project Status

Last updated: 2026-10-03

## Session Continuity

_Kept current by the ab-session-wrap and ab-context-checkpoint skills. Full history: git log and docs/learnings/._

**Last session:** 2026-10-04

**What was done:** v3.8.0 is released from `main`. The v4.0 "Agent Blueprint" rebuild runs on `release/v4` from `docs/plans/2026-09-28-1036-feat-agent-blueprint-portability-plan.md` as four stacked pull requests (#16 phase 1, #17 phase 2, #18 phase 3, #19 phase 4), each ready with CI green and none merged. Phase 4 carries the smoke harness, the eight support notes, the upgrade guide, the evaluation and the release checklist, plus a quality pass over all 53 skills and their 30 helper prompts against the Agent Skills specification and the agent-writing references (two code reviews with independent Codex passes; every finding applied or recorded in the PR), and the harness fixes those reviews produced (a `.env` rule that survives git-quoted paths, hooks and effort cells that cannot pass without evidence, clock-based timeouts, no local paths in the committed smoke documents).

**What's remaining:**
- The evaluation's build and ship tasks are being rerun (`tests/smoke/eval.sh --task build,ship`, three runs each); their rows join `docs/releases/v4.0.0-eval.{json,md}` when they finish, then PR #19 leaves draft.
- The maintainer's release checklist, `docs/releases/v4.0.0-checklist.md`: the smoke rows that could not run on the build machine (Antigravity's settings flag, Grok's free-tier limit, Cursor's catalog cap, Pi, Hermes and Amp not installed, the interactive Agent Teams check), the full-table rerun on the final commit, then the merges in order, the tag and the repository rename.

**Start here:** PR #19's description, then `docs/releases/v4.0.0-checklist.md`; none of the four pull requests is merged until the maintainer reviews them in order.

## Current State of the Code

- **Build:** none (the repository is the plugin)
- **Tests:** `python3 -m unittest discover -s tests/gates`, `bash tests/hooks/run-tests.sh`, `bash tests/runner/run-tests.sh`
- **Lint:** markdownlint and shellcheck, as CI runs them
- **Gates:** drift, skill collisions, portability (with the shrink-only allowlist), manifests, snippet sync, and `claude plugin validate --strict`; see AGENTS.md § Gates
