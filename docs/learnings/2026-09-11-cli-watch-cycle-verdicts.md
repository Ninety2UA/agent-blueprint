---
title: "Decision record: 2026-09 cli-watch cycle — S1–S4 KEEP, S5 GO native-first; six probes re-run against CLI 2.1.268"
date: 2026-09-11
category: gate-decision
cycle: cli-watch-2026-09-11
requirement: R19, KTD7, KTD8, KTD9
applies_when:
  - A future /cli-watch cycle re-flags ship-loop.sh, ship.sh, wave orchestration, the injection scanners, or plugin-update as duplicating a native feature
  - Deciding whether a native primitive should replace custom blueprint machinery
  - Re-running the standing capability probes against a newer CLI (start from the 2.1.268 facts recorded here)
tags: [gate-decision, supersede, cli-watch, ship-loop, ship-sh, goal, wave-orchestration, workflow-tool, injection-scanner, plugin-update, platform-currency]
---

# 2026-09 cli-watch cycle — six probes re-run, five supersede verdicts, one native-first GO

Second platform-currency cycle after the July sync. The July verdicts are in
[the Part 1 supersede record](2026-07-17-rebuild-verdicts.md) and
[the goal-vs-ship-loop record](2026-07-17-goal-vs-ship-loop-rebuild.md); this record re-verifies
them against CLI 2.1.268 and adds two new candidates (S2, S5) and two new probes (e, f). Recorded
per R19 so future cycles do not re-litigate. Outcome: **no custom machinery removed**, one
native-first adoption with the manual path kept as fallback, released as v3.6.0 (minor).

## Cutoff pin

| Field | Value |
|---|---|
| Audit date | 2026-09-11 |
| CLI `latest` | **2.1.268** (also the installed version) |
| CLI `stable` | 2.1.236 |
| Baseline (excluded) | 2.1.212 (2026-07-17) |
| npm versions in window | 47 (2.1.213 … 2.1.268) |
| Versions with changelog sections | 45 |
| Changelog entries in window | 1,381 — every one classified exactly once |

## Capability probes (re-run against 2.1.268)

- **(a) `/goal` invocability from a skill or hook → HOLDS.** No Goal tool exists in the 2.1.268
  toolset; the docs offer only user-typed `/goal` and `claude -p "/goal …"`. `/goal` is a
  session-scoped, prompt-based Stop hook with a Haiku-default evaluator. In-window entries
  (2.1.234 / 2.1.236 / 2.1.239 / 2.1.246) change check-in behavior only.
- **(b) Workflow tool gating → HOLDS, facts refined.** Available on all paid plans, the API, and
  Bedrock/Vertex/Foundry; **Pro must enable it in `/config`**; disabled per-user or org-wide by
  `disableWorkflows`, `CLAUDE_CODE_DISABLE_WORKFLOWS=1`, managed settings, or the admin page.
  New: `-p`/SDK runs behind a `Workflow` allow rule; plugins can bundle workflows (`workflows/`
  directory); size guideline default `medium` (<15 agents, 2.1.219); runtime caps 16 concurrent
  agents / 1,000 per run; `/workflow-authoring` bundled skill (2.1.248).
- **(c) Native injection scanning → HOLDS.** Observers: subagent reports (2.1.210), Artifact reads
  (2.1.265), permission previews (2.1.211 / 2.1.223), and auto-mode server-side tool-result
  probes. **No observer on main-session Read output or Write/Edit content outside auto mode.**
- **(d) Effort / model lineup → CHANGED.** Opus 5 (`claude-opus-5`, 2.1.219; default Opus; fast
  mode) and Fable 5.1 (`claude-fable-5-1`, 2.1.257; default Fable; 1M). Defaults: Opus 5 on
  Max / Team Premium / Enterprise / API, Sonnet 5 on Pro / Team Standard. `effort:` frontmatter
  was silently ignored on Opus 4.7 / 4.8 / Fable 5 until 2.1.267; `maxEffortLevel` caps it.
  `CLAUDE_CODE_SUBAGENT_MODEL` / `_FORCE` precedence: FORCE > agent `model:` / per-spawn model >
  `CLAUDE_CODE_SUBAGENT_MODEL` (default) > session model. Fast mode is Opus 5 + Opus 4.8 only. TodoWrite / TaskCreate removed on
  Opus 4.8 / Sonnet 5 / Fable 5 and newer (2.1.233, 2.1.268). `model: inherit` stays correct.
- **(e) Subagent caps → CHANGED.** The 200-subagent total cap is gone (2.1.224); 20 concurrent by
  default (`CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`, 2.1.217); nesting depth 3 by default
  (`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`, 2.1.219); WebSearch 200 per session unchanged.
- **(f) hooks.json contract → HOLDS.** Exec-form `args[]` intact; the stricter stdout-JSON handling
  (2.1.248) and the exit-2 schema fix (2.1.214) were verified against every handler: ship-loop.sh
  emits `json.dumps`-escaped JSON, teammate-idle / task-completed use exit 2 + stderr.

## Supersede verdicts

Each candidate carries the four semantic deltas: **(1) context-reset, (2) per-turn cost,
(3) gating, (4) blocking posture.**

### S1 — `ship-loop.sh` inner guard vs `/goal` → **KEEP** (KTD7)

(1) Equivalent: neither resets context. (2) `/goal` adds one small-model evaluator call per turn;
ship-loop.sh re-feeds the stored prompt per Stop. 2.1.259 removed the cost penalty the custom guard
used to pay (blocking Stop hooks no longer lose reasoning or miss the prompt cache). (3) `/goal` is
GA but still user-typed only (probe a). (4) ship-loop.sh hard-blocks Stop; `/goal` pauses on
no-progress. The July AE5 failure scenario still holds: a skill cannot start the goal, and an
interactive `/ship-pipeline` user who does not paste `/goal` has no guard. `ship-loop.sh` stays
byte-identical; `/goal` stays the opt-in complement (doc refresh only).

### S2 — NEW: `scripts/ship.sh` per-iteration `claude --print` vs `claude -p "/goal …"` → **NO-GO on rebuild; `--goal` flag DEFERRED**

The one headless route the July record did not weigh. (1) Orthogonal: ship.sh exists to respawn a
fresh context per iteration; a `-p /goal` loop continues turns inside one growing process.
(2) Goal loop = evaluator call per turn + growing context; ship.sh = cold start + state re-read per
iteration, each run context-bounded. (3) GA in `-p`; the goal loop pauses and exits the process on
no-progress, after which ship.sh respawns anyway. (4) ship.sh is a blocking external supervisor;
`-p /goal` is an in-process continuation. An opt-in `--goal` flag (prepend `/goal <condition>` to
the print prompt) is reversible and ungated, but its only gain (fewer respawns) trades directly
against ship.sh's fresh-context-per-iteration design, and validating a headless goal loop needs
real unattended runs. Deferred; revisit if a maintainer wants fewer respawns on long ships.

### S3 — wave orchestration vs the Workflow tool → **KEEP; bundled workflow scaffold DEFERRED** (KTD8)

(1) Unchanged: both fan out to fresh-context subagents. (2) Native is cheaper at scale (results in
script variables, prefix cache staggering); waves are cheaper and clearer at 4–15 tasks. (3) Still
gated (probe b): Pro opt-in, free absent, per-user and org-wide switches — any remaining gate keeps
a core dependency out of bounds. (4) "No mid-run user input; run each stage as its own workflow" is
still incompatible with wave sign-off gates and `/build-pipeline` checkpoints. Waves stay the
ungated default; workflows are documented as opt-in with the refreshed facts. A plugin-bundled
workflow (for example a review fan-out) is additive and reversible but adds a fourth component
class to the drift gate, manifests, site counts, and install paths without a validated need, and
stays gated regardless. Deferred.

### S4 — `prompt-guard.js` / `read-injection-scanner.js` / DATA markers vs native observers → **KEEP all layers** (KTD9)

(1) The custom read scanner is still the only deterministic scan for directives crafted to survive
compaction. (2) Unchanged: a Node process per Read/Write/Edit vs built-in. (3) Native now covers
subagent reports, Artifact reads, permission previews, and — only in auto mode — tool results
(probe c); nothing observes main-session Read output or Write/Edit payloads in manual,
accept-edits, or bypass modes. (4) Custom is advisory; native sanitizes previews and flags
summaries. The July zero-regression threshold still fails on coverage alone. Doc line only: native
coverage now includes Artifact reads and auto-mode tool-result probes.

### S5 — NEW: `plugin-update` manual cache sync vs native `claude plugin update` → **GO, native-first with manual fallback**

(1) n/a, both out-of-session. (2) Manual path = clone + six registry-editing steps, brittle across
CLI versions; native = one command (`claude plugin update <plugin@marketplace>`; bare-name fix
2.1.246, `--json` 2.1.268). (3) GA, with a caveat from maintainer memory: the marketplace
"Update now" button did not sync the cache, and `claude plugin update` is untested by the
maintainer, so the skill refreshes the marketplace catalog first, targets the registry entry's own
scope, and verifies the cached `plugin.json` against the remote before trusting the native path.
(4) Both synchronous. Keep-old-until-pass: every manual step is retained as the fallback; nothing
is deleted.

## Deferred

- **D1** Plugin-bundled workflow scaffold (S3).
- **D2** `ship.sh --goal` opt-in (S2).
- **D3** `/claude-api prompt-audit` sweep over 55 skills + 29 agents — its own review-first
  session; judgment-heavy edits across every prompt are the wrong thing to bundle into a release.

## Net

Probes a, b, c, f hold; d and e changed and drove the v3.6.0 doc refresh (model lineup, effort
floor, subagent caps, TodoWrite removal). S1–S4 keep their machinery; S5 adopts the native command
with the July-verified manual path as fallback. No rebuild shipped, so v3.6.0 is a minor release.
