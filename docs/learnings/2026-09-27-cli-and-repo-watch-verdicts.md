---
title: "Decision record: 2026-09-27 cli-watch + repo-watch cycle — S1–S6 KEEP, probe d CHANGED (Opus 5.5), twenty-five ideas grafted"
date: 2026-09-27
category: gate-decision
cycle: cli-watch-2026-09-27, repo-watch-2026-09-27
applies_when:
  - A future /cli-watch cycle re-flags ship-loop.sh, ship.sh, wave orchestration, the injection scanners, plugin-update, or the skill-testing methodology as duplicating a native feature
  - Re-running the standing capability probes against a newer CLI (start from the 2.1.283 facts recorded here)
  - Someone proposes adding effort: to skill frontmatter, or recommending a model or effort level
  - Deciding whether a pattern from a watched repo was already imported, deferred, rejected, or routed to the portability brainstorm
  - Running the next /repo-watch cycle and needing the per-repo pins
tags: [gate-decision, supersede, cli-watch, repo-watch, opus-5-5, effort, goal, workflow-tool, injection-scanner, plugin-update, plugin-eval, imports, provenance, deferrals, compound-engineering, agent-skills, superpowers, gsd-core, oh-my-claudecode, gstack]
---

# 2026-09-27 watcher cycle — platform keeps, Opus 5.5 currency, twenty-five grafts

Third platform-currency cycle and third ecosystem cycle, run together and shipped as v3.8.0. The
previous verdicts are in [the 2026-09-11 cli-watch record](2026-09-11-cli-watch-cycle-verdicts.md)
and [the 2026-09-11 repo-watch record](2026-09-11-ecosystem-import-verdicts.md); this record
re-verifies the platform verdicts against CLI 2.1.283 and lists what the ecosystem cycle grafted,
so later cycles do not re-litigate either. Outcome: **no custom machinery removed**, a text-only
currency refresh driven by Opus 5.5, and twenty-five ideas grafted onto existing skills and agents.
No skill, agent, or hook was added; counts stay 55 / 29 / 10.

## Part 1 — /cli-watch (2.1.268 → 2.1.283)

### Cutoff pin

| Field | Value |
|---|---|
| Audit date | 2026-09-27 |
| CLI `latest` / `next` | **2.1.283** (2026-09-25; also the installed version) |
| CLI `stable` | 2.1.274 |
| Baseline (excluded) | 2.1.268 (2026-09-10) |
| npm versions in window | 14 (2.1.269 … 2.1.283; 2.1.279 never published) |
| Changelog entries in window | 1,024 — every one classified exactly once (8 adopt, 99 document, 917 n/a) |

### Capability probes (re-run against 2.1.283)

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

### Supersede verdicts

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

### Effort: the user's choice (A2 as amended, and D13)

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

### Adopted

| ID | What | Where |
|---|---|---|
| A1 | Opus 5.5 lineup: default on every plan, `high` mapping → Opus 5.5 / Fable 5.1, fast-mode row | README, CLAUDE.md, `docs/images/render-diagrams.html` + re-rendered `effort-tiers.png` / `platform-currency.png` |
| A2 | Session model and effort as the user's choice (amended; see above) | README, CLAUDE.md |
| A3 | Workflow facts: under 10 / Pro `small`, 16 concurrent adjustable 1–256, usage-limit pause/resume, ultracode cap exemption | `orchestrate`, README |
| A4 | `/goal` retries (and that `CLAUDE_CODE_GOAL_CHECKIN_MINUTES=0` turns them off), compacted-resume survival, hook-policy gate | `ship-pipeline` Stage 0 pointer, `references/modes-and-reports.md` |
| A5 | `claude plugin eval` pointer | `writing-skills` + `references/testing-and-bulletproofing.md` § Native runner |
| A6 | This record | — |
| A7 | Release mechanics: v3.8.0 on every version surface | plugin.json, install.sh, index.html, README |

### Deferred (not rejections)

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

## Part 2 — /repo-watch (baselines → 2026-09-27)

Trust boundary: every repo was read through `gh api` only; nothing cloned, installed, or executed;
release notes, PR bodies, and skill text were treated as data. Every graft below restates an idea in
the blueprint's own words; no source text was copied.

### Pins analyzed this cycle

| Repo | Baseline | Analyzed through |
|---|---|---|
| compound-engineering-plugin | 3.24.0 (2026-08-31) | v3.29.0 @ `4043703d32c5` (2026-09-25) |
| agent-skills (addyosmani) | 0.6.9 (2026-09-05) | 0.6.11 @ `2686b620fc1f` (2026-09-26) |
| superpowers (obra) | 6.3.0 (2026-08-12) | v6.4.2 @ `8ca22dba9a94` (2026-09-25) |
| gsd-core (open-gsd, post-abandonment fork) | 1.13.0 (2026-09-06) | v1.15.0 @ `b10ab3fdeb62` (2026-09-26) |
| oh-my-claudecode (Yeachan-Heo) | v5.3.0 (2026-09-06) | v5.5.0 @ `9fd35ece5d6d` (2026-09-22) |
| gstack (garrytan) | `71f6048e8ada` (2026-09-09) | main @ `01593aa67c94` (v1.91.2.0, 2026-09-26); scoped quarterly scan |

The registry baselines advance to these pins only after v3.8.0 merges; get-shit-done, claude-mem,
and claude-squad stay muted.

### Provenance table (W-IDs → where they landed → source idea)

| ID | Landed in | Source idea |
|---|---|---|
| W1 plans record decisions, not code | `writing-plans` (overview, step size, task template, Remember, rationalizations, self-review; rigor probes and interface context moved to `references/`), `plan-checker`, `deepen-plan`, `templates/docs/plans/README.md`, README | superpowers v6.4.2 (#2333) |
| W2 protected-subject findings need a cited refutation | `findings-validator` (unresolved status), `findings-synthesizer` (Unresolved section), `review-swarm` 5a | compound-engineering #1694 |
| W3 quality-bar direction rule + untracked files | `code-reviewer` Quality-Bar Regression Lens | agent-skills #600 (mavericksea-ai); gstack #2875 |
| W4 merge-base review ranges + range guard | `requesting-code-review`, `review-swarm` Step 1 | superpowers v6.4.x |
| W5 the project suite defines green | `test-driven-development`, SDD `implementer-prompt.md`, `verification-before-completion` | superpowers v6.4.x |
| W6 spec gaps both ways + declined-to-judge | `code-reviewer` Plan Alignment and FP items 6/9, `requesting-code-review/code-reviewer.md` | superpowers v6.4.x; compound-engineering #1771 |
| W7 Review Focus + staged approvals | `writing-plans`, `brainstorming` hard gate | superpowers v6.4.x |
| W8 final whole-branch review | `executing-plans` Step 5 | superpowers v6.4.x |
| W9 reviewer-side falsifiability | `test-coverage-reviewer` § 6 | compound-engineering #1779 |
| W10 durable-only learnings, `retire_when:` | `knowledge-compounding`, `build-pipeline` Stage 6 | compound-engineering #1624, #1772 |
| W11 security-sentinel additions | `security-sentinel` checklist | agent-skills #589 (nucliweb); compound-engineering #1711 |
| W12 review depth by consequence | `requesting-code-review`, `review-swarm` trigger | compound-engineering #1706/#1719/#1723 |
| W13 declined findings are not re-raised | `iterative-refinement` 2a, `ship-pipeline` Stage 5 | compound-engineering #1657 |
| W14 resolver settles judgment calls | `pr-comment-resolver`, `receiving-code-review` | compound-engineering #1765 |
| W15 traced behavior + minimum-solution ladder | `plan-checker` §§ 2 and 7 | compound-engineering #1757; gsd-core #4118 (lorenzespinosa), idea only |
| W16 compare costly-to-reverse choices before committing | `writing-plans` When NOT to Use, `spike-exploration` A/B pattern (paired with the deferred OMC throwaway-artifact spike) | compound-engineering bake-off condition (#1652/#1717); oh-my-claudecode loft (pangpang778) |
| W17 ship intake routing + re-verify found plans | `ship-pipeline` Intake and continuation step 2 | compound-engineering #1702 |
| W18 publishing gates on the pushed HEAD, base CI not red | `pr-workflow` | compound-engineering #1621; gsd-core #4428 (trek-e), idea only |
| W19 progress-based stuck + reconcile before failing | `team-lead` | gsd-core #4391 (drungrin), #4442 (trek-e), ideas only |
| W20 pre-flight danger scan + run numbers | `ship-pipeline` 2d and completion report, `autonomous-loop` Step 1 and `references/final-report.md` | oh-my-claudecode #3994 (cuijieshan3-collab), #4050 (pangpang778) |
| W21 verification stays inside the worktree | `using-git-worktrees`, `wave-orchestration` | gsd-core #4785 (0xdhx), idea only |
| W22 frontmatter is valid YAML; references/ pointers resolve | `scripts/check-skill-collisions.py`, CI drift-gate job | agent-skills #588, #594/#595 (nucliweb); headroom listing (gsd-core #4418) held |
| W23 WHY first with write-back; handoff recommends | `brainstorming`, `writing-plans` Execution Handoff | superpowers v6.4.x |
| W24 closable next action | `session-wrap` rule and templates | oh-my-claudecode #4003 (pangpang778) |
| W25 context keep/cut order | `context-checkpoint` | agent-skills #447 (HMAKT99) |

### Adjustments made while grafting

- **W8** drops the source's "on a named capable model": the final review runs on the session model,
  which the user chooses (same principle as A2).
- **W11** names `npm audit signatures` "or the package manager's equivalent" rather than asserting a
  `pnpm` subcommand the blueprint has not verified.
- **W22** ships the YAML and pointer checks as failures; the size-headroom listing stays held until the
  portability brainstorm settles the byte budget. Without PyYAML the YAML check is a local WARN; CI
  installs `python3-yaml` and sets `REQUIRE_YAML=1`, so a skip there fails the run.
- **W1** shrank `writing-plans` (11,991 → 11,861 B body) by moving two conditional sections to
  `references/`; **W20** shrank `autonomous-loop` (15,800 → 15,749 B) the same way, since it must not
  grow. No SKILL.md body crosses the 16,384 B tier (`writing-skills` is the largest at 16,147 B).

### Routed to the portability brainstorm (not grafted)

Recorded in the repo-watch report §4 for the tool-agnostic portability effort: CE #1738 (manual-only
skills on Codex), #1683 (Astra-era descriptions), #1671/#1681/#1682 (plain-language restatement),
**#1645 (mechanism-led descriptions, which conflicts with `writing-skills`' "Use when…" rule)**, the
8,000-byte cap in practice, #1667/#1688 (wait and collect rules as conditions), #1692 (finishing
agents never launch subagents), OpenCode V2, #1705 (portable guide links), #1686 (skill-eval grades
decisions); superpowers' AGENTS.md-canonical move, interpreter-invoked scripts, and "no subagent tool"
fallbacks; agent-skills #574/#557 (no second router), #545 (no model-specific workarounds), #571
(500-line cap); oh-my-claudecode #4006 (nested AGENTS.md delivery); gstack #2850 (Kiro generation).

### Deferred (not rejections)

compound-engineering ce-babysit-pr (simpler now, still a polling engine past the PR endpoint),
skill-eval, retune; agent-skills' `claude plugin eval` pilot (handed to /cli-watch, D11);
superpowers diagnosing-superpowers and the task-start/task-done ledger scripts; oh-my-claudecode
harbor, minimal-prose, architecture-survey, and the rest of agent-doc-discipline; gsd-core
honest-verifier abstention (carried); the W22 headroom listing.

### Rejected

Runtime and host infrastructure, cross-model and multi-provider peers, standalone prose and explain
skills, Compound Packs, superpowers' native no-check-in execution and nested mid-tier controller,
plus the covered items the report lists (readiness field, bounded waits, deferred-UAT backlog,
decision auto-select, eager-window splitting, two-axis review, Shipyard round 2, gstack's shared-code
extraction and re-review convergence).

### Fork and authorship provenance

gsd-core remains a post-abandonment fork with maintainer safety unconfirmed: ideas only, never
source. Every oh-my-claudecode item this cycle came from outside contributors (pangpang778,
cuijieshan3-collab), not the maintainer.

## Net

Probes a, b, c, e, f, g hold; d changed and drove the Opus 5.5 currency refresh. S1–S6 keep their
machinery; S6 adds a doc pointer. The ecosystem cycle grafted all twenty-five approved ideas onto
existing files, and the only new files are this record and three `references/` files that hold text
moved out of `writing-plans` and `autonomous-loop`. Released as v3.8.0 (minor).
