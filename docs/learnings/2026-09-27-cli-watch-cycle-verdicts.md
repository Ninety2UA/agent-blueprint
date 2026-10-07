---
title: "Decision record: 2026-09-27 cli-watch cycle, S1-S6 KEEP, probe d CHANGED (Opus 5.5)"
date: 2026-09-27
category: gate-decision
cycle: cli-watch-2026-09-27
applies_when:
  - A future /cli-watch cycle re-flags ship-loop.sh, ship.sh, wave orchestration, the injection scanners, plugin-update, or the skill-testing methodology as duplicating a native feature
  - Re-running the standing capability probes against a newer CLI (start from the 2.1.283 facts recorded here)
  - Someone proposes adding effort: to skill frontmatter, or recommending a model or effort level
tags: [gate-decision, supersede, cli-watch, opus-5-5, effort, goal, workflow-tool, injection-scanner, plugin-update, plugin-eval, deferrals]
---

# 2026-09-27 cli-watch cycle: platform keeps, Opus 5.5 currency

Third platform-currency cycle (/cli-watch, 2.1.268 → 2.1.283), shipped as v3.8.0. The previous
verdicts are in [the 2026-09-11 cli-watch record](2026-09-11-cli-watch-cycle-verdicts.md); this
record re-verifies the platform verdicts against CLI 2.1.283 so later cycles do not re-litigate
them. Outcome: **no custom machinery removed** and a text-only currency refresh driven by Opus 5.5.
No skill, agent, or hook was added; counts stay 55 / 29 / 10.

## Cutoff pin

| Field | Value |
|---|---|
| Audit date | 2026-09-27 |
| CLI `latest` / `next` | **2.1.283** (2026-09-25; also the installed version) |
| CLI `stable` | 2.1.274 |
| Baseline (excluded) | 2.1.268 (2026-09-10) |
| npm versions in window | 14 (2.1.269 … 2.1.283; 2.1.279 never published) |
| Changelog entries in window | 1,024 — every one classified exactly once (8 adopt, 99 document, 917 n/a) |

## Capability probes (re-run against 2.1.283)

- **(a) `/goal` invocability from a skill or hook → HOLDS.** Still user-typed or `claude -p "/goal …"`;
  no Goal tool in the 2.1.283 toolset. New: retries with backoff or pauses with a reason (2.1.269),
  survives resume of a compacted session (2.1.274), a 500-character repeat label (2.1.274), and
  unavailable under `disableAllHooks` / `allowManagedHooksOnly`.
- **(b) Workflow tool gating → HOLDS, facts refined.** Still paid plans + API + Bedrock/Agent
  Platform/Foundry, Pro opt-in in `/config`, per-user and org switches. `medium` is now under 10
  agents and Pro defaults to `small` (2.1.271); 16 concurrent is a default, adjustable 1–256
  (`CLAUDE_CODE_WORKFLOW_MAX_CONCURRENT_AGENTS`, 2.1.269); runs pause and resume across a usage-limit
  reset in interactive subscription sessions only; ultracode exempts Agent-tool subagents from the
  concurrency cap.
- **(c) Native injection scanning → HOLDS, reach widened.** Auto mode is the built-in starting mode for
  interactive terminal and VS Code sessions from 2.1.283, so its tool-result probe now observes
  main-session Read output for those users by default. `-p`/SDK start in `default`, `ship.sh` runs
  bypass, and nothing observes Write/Edit payloads in any mode.
- **(d) Effort / model lineup → CHANGED.** Opus 5.5 (`claude-opus-5-5`, 2.1.280) is the default Opus
  and the `default` model on every plan, Pro and Team Standard included. **It starts sessions at
  `medium` effort** (other current models start at `high`; Opus 4.7 at `xhigh`). A legacy top-level
  `effortLevel` does not apply to Opus 5.5; from 2.1.280 Opus 4.7/4.8/Fable 5 stop holding their
  launch default over settings, `--settings`, or `-p`. Fast mode: Opus 5.5 (default), Opus 5, Opus 4.8.
  Frontmatter `effort` still overrides the session level, capped by `maxEffortLevel`.
- **(e) Subagent caps → HOLDS, refined.** 20 concurrent, depth 3, no total; ultracode sessions are
  exempt from the concurrency limit.
- **(f) hooks.json contract → HOLDS.** Exec-form `args[]` everywhere, so the 2.1.281 unquoted
  `${CLAUDE_PLUGIN_ROOT}` warning (shell-form only) cannot fire; the 2.1.277 SessionStart cache fix is
  a free win for `session-start.js`.
- **(g) NEW: plugin validator / CI gate → HOLDS.** `claude plugin validate --strict --json` passes
  with zero errors, warnings, and notes on the plugin and the marketplace root under 2.1.283.

## Supersede verdicts

Each candidate carries the four semantic deltas: **(1) context-reset, (2) per-turn cost,
(3) gating, (4) blocking posture.**

- **S1 — `ship-loop.sh` vs `/goal` → KEEP.** (1) Equivalent. (2) `/goal` got cheaper (500-char
  label); close to parity. (3) Still user-typed only, and newly documented as off under managed-only or
  disabled hooks. (4) The hook hard-blocks Stop; `/goal` retries, pauses, and stops on no-progress. A
  skill still cannot start a goal. Doc refresh only (A4).
- **S2 — `scripts/ship.sh` vs `claude -p "/goal …"` → NO-GO; `--goal` flag stays deferred (D2).** The
  fresh process per iteration is ship.sh's reason to exist, and in `-p` a goal does not pause for
  usage limits, so a long headless goal loop fails where ship.sh's respawn retries.
- **S3 — wave orchestration vs the Workflow tool → KEEP.** Still gated; still "no mid-run user
  input", which wave sign-off gates need. Facts refreshed (A3); bundled workflow stays deferred (D1).
- **S4 — injection scanners vs native observers → KEEP, with a watch trigger.** Reopen when the
  tool-result probe becomes mode-independent (covers `-p` and bypass) or starts inspecting Write/Edit
  content. Until then the custom read scanner is the only deterministic scan for directives written
  to survive compaction, and nothing native covers the prompt-guard surface.
- **S5 — `plugin-update` native-first with manual fallback → no change (keep-old-until-pass).** Native
  `claude plugin update` keeps hardening (project scope, commit recording, repo-named marketplace
  deletion fix, `installed_plugins.json` recovery). The manual path edits files whose format the CLI
  is still changing, so it is now the riskier path. Demote it to diagnostics-only once the maintainer
  verifies native update end-to-end (D20).
- **S6 — NEW: `claude plugin eval` vs the custom skill-testing methodology → NO-GO on replace.** (1)
  Native is stronger: a clean process per run, no session CLAUDE.md bleed. (2) Billed: cases × runs ×
  two arms plus judge calls. (3) GA, but a CI gate needs an API-key secret in a public repo, and a
  default `evals/` inside the plugin root ships into user caches. (4) Native can hard-gate on
  `--threshold`; the methodology is advisory. The methodology designs scenarios; the runner measures
  them. Adopted as a doc pointer (A5); pilot deferred (D11).

## Effort: the user's choice (A2 as amended, and D13)

The report's A2 draft recommended `/effort high` before pipeline runs. The maintainer amended it: the
user chooses the model and effort, in Claude Code and in other tools, and the blueprint never
prescribes one. README "Session model and effort: your choice" therefore states the facts (Opus 5.5
starts at `medium`; agent tiers override the session level; skills carry no `effort:`), gives a short
reference table (Opus 5.5 `high` as a solid pipeline default; Opus 5.5 `xhigh` or Fable 5.1 `high`
more careful, slower, costlier; lower effort fine for small tasks), and shows how to set both
(`/model`, `/effort`, `--model`, `--effort`).

**D13 — no skill-level `effort:`.** Skill frontmatter effort *overrides* the session level, so
`effort: high` on `/ship-pipeline` would downgrade a user who chose `xhigh` or `max`. Revisit only if
the platform adds a floor semantic for frontmatter effort. Agents' `effort:` tiers were not changed
this cycle.

## Native features taken up

| ID | What | Where |
|---|---|---|
| A1 | Opus 5.5 lineup: default on every plan, `high` mapping → Opus 5.5 / Fable 5.1, fast-mode row | README, CLAUDE.md, `docs/images/render-diagrams.html` + re-rendered `effort-tiers.png` / `platform-currency.png` |
| A2 | Session model and effort as the user's choice (amended; see above) | README, CLAUDE.md |
| A3 | Workflow facts: under 10 / Pro `small`, 16 concurrent adjustable 1–256, usage-limit pause/resume, ultracode cap exemption | `orchestrate`, README |
| A4 | `/goal` retries (and that `CLAUDE_CODE_GOAL_CHECKIN_MINUTES=0` turns them off), compacted-resume survival, hook-policy gate | `ship-pipeline` Stage 0 pointer, `references/modes-and-reports.md` |
| A5 | `claude plugin eval` pointer | `writing-skills` + `references/testing-and-bulletproofing.md` § Native runner |
| A6 | This record | — |
| A7 | Release mechanics: v3.8.0 on every version surface | plugin.json, install.sh, index.html, README |

## Deferred (not rejections)

- **D1** plugin-bundled workflow scaffold · **D2** `ship.sh --goal` · **D3** prompt-audit sweep, now
  via the bundled `/doctor prompt-audit` (2.1.283), priority raised, still its own review-first session
  · **D11** `claude plugin eval` pilot on 3–5 skills, run manually · **D12** `omitClaudeMd` on the two
  `low` validators · **D13** skill-level effort (no-go, above) · **D14** unattended-run posture notes
  (dangerous-rm prompts and denials in bypass/auto, auto mode default-on) · **D15** model governance
  keys (`availableModelsMatch`, `deniedModels`) · **D16** AGENTS.md support (scaffolded CLAUDE.md wins)
  · **D17** claude.ai skill sync and short names vs the `deep-research` collision row · **D18**
  `/plugin install … --marketplace` one-liner · **D19** attribution controls · **D20** plugin-update
  fallback demotion.
- Carried unchanged: D4 (prompt-cache TTL opt-in), D5 (`--restricted`, `--permission-prompts none`),
  D6 (model-switch / `DirectoryAdded` hooks), D7 (archive/command marketplace sources), D9
  (cross-session messaging), D10 (fast mode, now covered by A1).

## Net

Probes a, b, c, e, f, g hold; d changed and drove the Opus 5.5 currency refresh. S1–S6 keep their
machinery; S6 adds a doc pointer. Released as v3.8.0 (minor).
