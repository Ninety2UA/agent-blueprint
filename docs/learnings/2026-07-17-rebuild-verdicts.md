---
title: "Decision record: Part 1 supersede verdicts — ship.sh, wave orchestration, and injection scanners all KEPT"
date: 2026-07-17
category: gate-decision
cycle: platform-sync-2026-07-17
requirement: R2, R6, R16, KTD-1, KTD-5, KTD-8
applies_when:
  - A future platform-sync cycle re-flags ship.sh, wave-orchestration, or the injection scanners as duplicating a native feature
  - Deciding whether a native primitive should replace custom blueprint machinery
tags: [gate-decision, supersede, ship-sh, wave-orchestration, injection-scanner, platform-sync]
---

# Part 1 supersede verdicts — three rebuilds evaluated, all kept

Gate 1 evaluated four supersede candidates (R2). Candidate a (`ship-loop.sh` → `/goal`) is
recorded separately in [the goal-vs-ship-loop record](2026-07-17-goal-vs-ship-loop-rebuild.md). The
other three are recorded here. All three resolved to **keep** — the native feature does not supersede the custom machinery.
Recorded per R16 so future cycles and the `/cli-watch` watcher do not re-litigate them.

## R2b — `scripts/ship.sh` outer loop vs native `/loop` + ScheduleWakeup → **KEEP ship.sh**

`ship.sh` exists to give each iteration a **fresh 200K context via process respawn**.
The candidate natives do not do this:

- **`/loop`** is session-scoped and **never resets context** — it re-runs a prompt on an interval
  inside one growing session. That is the opposite of `ship.sh`'s purpose.
- **ScheduleWakeup** is cron-style *triggering*, not context-refresh.

On the decisive context-reset axis, neither native provides what `ship.sh` provides. Pre-seeded
no-go (KTD-1) confirmed. Native `/loop`/ScheduleWakeup are documented as complementary in
`autonomous-loop` (they cover interval/scheduled invocation; the skill retains its circuit-breaker
and degradation-detection, which `/loop` does not perform).

## R2c — wave orchestration vs the Workflow tool → **KEEP waves; document workflows as opt-in**

Scoped per KTD-5 to dispatch and sequencing mechanics (team-lead's judgment calls stay agent-side
regardless). The prototype confirmed dispatch mechanics port cleanly, but two factors make a
rebuild wrong for a **public template**:

1. **Gating (R6).** The Workflow tool is triple-gated: CLI floor (v2.1.154+; session
   `/effort ultracode` v2.1.203+), **paid plans only** (absent on free), and **disable-able
   per-user and org-wide** (`disableWorkflows`, `CLAUDE_CODE_DISABLE_WORKFLOWS=1`). A core pipeline
   hard-wired to it would break for a real slice of template users. R6 forbids that.
2. **Posture.** The runtime rule "no mid-run user input; for sign-off between stages, run each stage
   as its own workflow" is incompatible with wave/team sign-off gates and `/build`'s between-stage
   checkpoints.

The three KTD-5 judgment calls (dependency-graph build, adaptive re-scope, integration-verify +
human sign-off) also resist deterministic encoding. Verdict: keep the ungated, portable markdown
orchestration as the default; document dynamic workflows as an opt-in for very large autonomous
fan-outs (25+ independent tasks). Full analysis: workspace slate `2026-07-17-u6-verdict.md`.

## R2d — custom injection scanners vs native subagent-output scanning → **KEEP all layers**

Replace fails the KTD-8 zero-regression threshold on **coverage alone**. Native's only injection
observer is the **subagent-read / Agent-tool** boundary (CLI 2.1.210) plus preview-scoped
character-neutralization (2.1.211). It has **no observer** on the two surfaces the custom layers
uniquely cover:

- **PreToolUse Write/Edit** content — `prompt-guard.js` only.
- **PostToolUse main-session Read** output — `read-injection-scanner.js` only.

Empirically validated by running all 35 fixtures through the real scanners: **7/7 positives caught,
0/7 false-flags on clean negatives**, exclusion list works, and the ZWSP/tag-block evasions still
caught by the Unicode rules. Native cannot match a catch it never observes. The `<<DATA_START>>`
markers (the only natively-covered surface) are ~zero-cost prose retained as deterministic,
operator-visible defense-in-depth; native hardening reinforces rather than replaces them. Full
analysis + fixture matrix: workspace slates `2026-07-17-u5-verdict.md` and
`2026-07-17-scanner-fixtures.md`.

## Net

No custom machinery removed in Part 1. Combined with the reverted `/goal` rebuild (candidate a),
**no rebuild shipped**, so Part 1 is a **minor** release (KTD-10).
