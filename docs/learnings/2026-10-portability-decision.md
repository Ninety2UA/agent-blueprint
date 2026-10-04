---
title: "Decision record: the single-harness scope is reversed — Agent Blueprint v4.0 runs in eight coding CLIs"
date: 2026-10-01
category: scope-decision
cycle: v4.0-portability
requirement: R24, R25, R26, R28, R29, R30
applies_when:
  - Someone proposes Claude-only machinery (an agents/ directory, a slash command, a hook a pipeline depends on, a fixed effort tier) and needs the reason it was retired
  - A watcher cycle flags multi-harness work as out of scope, citing the v3 scope of July or September 2026
  - A ninth host is proposed, or a converter or build step that generates per-host copies
  - Reviewing why a v3 instruction rule is gone, kept as a principle, or enforced by a gate
  - A host fails the smoke test and the release question is whether to block or mark it degraded
tags: [scope-decision, supersede, portability, agent-blueprint, v4, hosts, agents, hooks, instructions, smoke-test, degraded]
---

# The single-harness scope is reversed — v4.0 runs in eight hosts

> **Outcome (2026-10-01, shipped as v4.0.0):** claude-code-blueprint v3.8.0 was a Claude Code plugin by design and said so in its own records. Agent Blueprint v4.0 is one shared tree of 53 `ab-` skills that installs natively in Claude Code, Codex, Antigravity, Grok Build, Pi, Cursor CLI, Hermes and Amp. This record states the earlier decision, why it is reversed, the sixteen decisions that shape the rebuild, what users and the maintainer gain and lose, the instruction-rules ledger, and the evidence gathered so far. Recorded per R26 of the v4.0 plan (`docs/plans/2026-09-28-1036-feat-agent-blueprint-portability-plan.md`) so later cycles do not re-litigate it.

## Context: the decision being reversed

The single-harness scope was set in July 2026 and restated in September. The v3 records called support for other coding CLIs "a different product", judged every change against "a single-runtime Claude Code plugin", and listed Codex, Cursor and Grok adapters as outside "the single-harness, zero-dependency scope". The v3 README repeated it.

The design showed the same scope everywhere: the plugin lived under `plugins/claude-code-blueprint/`, the 29 agents were Claude Code agent files with a fixed `effort:` tier, working state sat in `.claude/`, the ten hooks in `hooks/hooks.json` were Claude Code hooks, `scripts/ship.sh` called `claude --print` and needed a Stop hook, and the project name carried the vendor.

## Why it is reversed

The people who want the blueprint changed. The maintainer switches between Claude Code and Codex, teams mix members on Cursor or Pi, and public users who find the repository run other tools. Against that, the v3 design blocked them in five concrete ways (plan Problem Frame):

1. 21 of the 55 `SKILL.md` files exceeded Codex's 8,000-byte skill limit.
2. The 29 agents were Claude Code agent files that no other tool loads, and their fixed `effort:` tier capped a user who picked `xhigh` or `max` at `high`.
3. The autonomous ship loop called `claude --print` and depended on a Stop hook, which exists only in Claude Code and Codex.
4. The root `CLAUDE.md` and the template leaned on hard rules ("Analysis Paralysis Guard", "Files under 500 lines", "Must ask the user FIRST") that the Claude 5 and GPT-6 Astra guidance says make newer models stall or follow text too literally.
5. The project name tied it to one vendor.

The "different product" judgment of July 2026 was right about the cost and wrong about the value: the product is the pipelines, and the pipelines are prose. Once the agents are prompt files and the skills are tool-neutral, one tree serves every host, and the per-host cost is a manifest and a support note. The "zero-dependency" half of the old scope stands: the gates are stdlib Python, the runner is bash, and no converter or build step exists.

## Decision: the sixteen decisions of v4.0

All sixteen are session-settled (user-directed or user-approved) in the plan's Product Contract; the table restates them in this record's words.

| Decision | Chosen | Rejected | Why |
|---|---|---|---|
| Scope of the rebuild | Portability, user-chosen model and effort, and leaner instructions in one plan | Portability first with the instruction audit later; the audit first | Both rewrites touch every skill; doing them together rewrites each skill once |
| Hosts in the first release | All eight | Claude Code plus the proven four (Codex, Antigravity, Grok Build, Pi) | The maintainer wants full reach at once and accepts the research cost for Cursor CLI, Hermes and Amp |
| What "supported" means | The main pipelines (build, ship, review, debug) run end to end | "Installs and skills load"; "same as Claude Code" | Pipelines are the product; full parity would exclude every host without hooks |
| Where agents live | Prompt files inside the skills that dispatch them | Claude Code agents plus generated Codex copies; prompt files plus optional installed agents | One copy works everywhere and effort follows the user; the loss of the `/agents` listing and per-agent tool limits is accepted |
| Skill format | The agentskills standard plus a short allowlist of extra keys | Strict `skills-ref validate`; moving Claude-only hints to side files | Keeps `argument-hint` for Claude Code users while other tools ignore it |
| Instruction style | Principles with reasons, and tests for the must-haves | A light trim; a facts-only minimal file | Hard rules make current models stall or follow text literally; rules that must hold belong in gates |
| Compatibility | A clean break released as v4.0, with an upgrade guide | Stable skill names; "no visible change" | The best cross-tool design matters more than continuity |
| The autonomous loop | One ship runner for any host; hooks are optional | Looping inside one session; autonomous mode only in hook-capable hosts | A fresh session per iteration works in every headless mode and needs no host feature |
| Name | Agent Blueprint | Shipwright, Plumbline, Keel, Groundwork; plain "Blueprint" | Says what it is without naming a vendor |
| Skill prefix | `ab-` on every skill | `bp-` (the recommendation); `bp-` with one short exception; plain names | Shared skill folders in most hosts would otherwise collide with other packs using names like `brainstorming` |
| Model and effort | The user chooses in the host; the blueprint never prescribes | Recommending a fixed level such as `/effort high`; fixed agent effort tiers | A prescribed level caps or overrides the user's own choice |
| Per-host packaging | A committed native manifest per host, no converter; an installer copies the shared skills where a host has no plugin system | A build step that generates per-host copies | A converter has to change every time a host changes its format, and breaks when it does not |
| Proof | A local scripted smoke test before every release | A manual checklist; running the eight tools in CI on every PR | Most tools need paid accounts and secrets |
| The record | The README and this record state the reversal and why | Silent change | Later cycles would otherwise re-open the question from the July records |
| Vendor bugs | A host broken by its vendor's bug ships marked degraded, not release-blocking | Always block the release; block only v4.0 | One vendor's bug should never hold back the other seven |
| Team work base | The former `agent-teams` and `team-execution` merge into ab-orchestrate as a portable base | Keeping them as Claude-only extras; removing them | Team work is part of the pipelines and has to run everywhere |
| Team work extras | Claude Code Agent Teams and Codex `multi_agent_v2` in v4.0; Hermes Kanban later | All three now; Claude only; adding a multi-session runner | The two available extras are detected from the tools at hand; the slot stays open for more |

## Consequences

**What users gain.** One install route per host, and one copy in `~/.agents/skills` that covers Codex, Grok Build, Pi, Cursor CLI and Amp at once. The same 53 skills, the same pipelines and the same working folders (`.agent-blueprint/`) in every host, so a team can mix tools on one project. Their own model and effort choice drives every step, helpers included, with no tier capping them. `AGENTS.md` as the instructions file every host reads, with `CLAUDE.md` reduced to `@AGENTS.md`. Skills under 8,000 bytes that load in full everywhere. Instruction files that state principles and reasons instead of rules that stall current models.

**What users lose.**

- No `/agents` listing and no per-agent tool limits: a helper is a prompt file run with the session's tools.
- No slash commands as such: skills are named in prose, and explicit invocation differs per host (`/ab-name`, `$ab-name`, `/skill:ab-name`; Amp has no user invocation at all).
- Hooks only on Claude Code and Codex: the other six hosts get no session-start pointer, no injection scanner on writes, no commit-message check, no ship-pipeline Stop guard and no Agent Teams gates. No pipeline depends on them.
- Amp and Hermes cannot enforce manual-only, so ab-plugin-update and ab-migrate may be picked from a description there; their support notes say so.
- The Codex `workspace-write` sandbox cannot write `.git`: skills run in no-commit mode there and the ship runner commits and publishes outside the sandbox.

**What the maintainer pays.** One committed manifest per host (`.claude-plugin/`, `.codex-plugin/` with `.agents/plugins/marketplace.json`, the root `plugin.json` for Antigravity, `.grok-plugin/`, `.cursor-plugin/`, `package.json` for Pi; Hermes and Amp need none), held at one version by `scripts/check-manifests.py`. The portability gate (`scripts/check-portability.py` and `sync-shared.py --check`) over every skill, prompt file and instruction file, with a shrink-only allowlist that must be empty at release. The smoke test across eight installed, signed-in tools before every release, since the tools cannot run in CI. A support note per host that has to match the smoke table.

## Instruction rules ledger

A snapshot at v4.0.0 of `docs/upgrade/v4-instruction-rules.md`, which stays the canonical copy. Every ALWAYS, NEVER and other hard rule in the v3 instruction files (`CLAUDE.md` and `templates/CLAUDE.md`) had one of three outcomes: **enforced** by a gate, hook, script or permission; **kept** as a principle with its reason; or **dropped** because current models do it by default or it no longer applies.

| v3 rule | Outcome | Where it lives now, or why it went |
|---|---|---|
| Do what has been asked; nothing more, nothing less | Kept | "Do what was asked": extra changes cost review time and hide the requested one |
| ALWAYS read a file before editing it | Dropped | Default model behavior, and hosts such as Claude Code refuse an edit to an unread file |
| NEVER create files unless absolutely necessary; prefer editing existing files | Kept | "Prefer editing to creating": a new file is new surface to maintain |
| NEVER proactively create documentation unless requested | Kept | Folded into "Prefer editing to creating" |
| NEVER commit secrets, credentials, or .env files | Enforced | Template `.gitignore`; the ship runner's pre-push secret scan and the interactive publish scan (KTD7); kept as a one-line principle |
| Evidence before claims | Kept | "Evidence before claims", backed by the ab-verification-before-completion skill |
| When in doubt, ask | Kept | "When to decide and when to ask", with the unattended-run default |
| If you break something while fixing something else, fix the regression first | Kept | "Fix what you break first" |
| Commit working code frequently | Kept | "Commit small and often" |
| Deviation rules: auto-fix list, must-ask-first list, scope boundary | Kept | "When to decide and when to ask"; the ask-first list is the user's authority, not a style rule |
| Error handling: fail loudly at boundaries, log context, never swallow errors, validate at the edges | Kept | "Code", as one principle with its reason |
| Error recovery table | Kept | "When something goes wrong" |
| Analysis Paralysis Guard (5+ read-only operations, then stop) | Dropped | Current models do not stall this way, and the count misfires on legitimate research |
| Lightweight workflow for changes under three files | Kept | "Blueprint skills": ab-quick-fix for small work, ab-brainstorming then ab-build-pipeline for large |
| Files under 500 lines | Dropped | A size rule without a reason; splitting by responsibility is the model's default judgment |
| Typed interfaces for public APIs | Kept | "Code", with the reason |
| Write tests FIRST | Kept | "Code", with the ab-test-driven-development skill |
| DRY, YAGNI | Dropped | Default model behavior; "Do what was asked" covers the YAGNI half |
| Run linter and tests before every commit | Kept | "Commit small and often" names the commands from `CONVENTIONS.md` |
| One logical change per commit | Kept | "Commit small and often" |
| No TODO comments without a BACKLOG.md entry | Kept | "Code", with the reason |
| No commented-out code | Kept | "Code", with the reason |
| Commit format `type(scope): description` | Enforced | The opt-in commit validation hook where the host runs hooks; kept as "Commits" |
| Context loading order (SessionStart hook, CLAUDE.md, STATUS.md ...) | Kept | "Where things are" and the line on reading `STATUS.md` and `CONVENTIONS.md` first; the hook is host-specific and no longer listed |
| Session Continuity block in the instructions file | Moved | `docs/context/STATUS.md` § Session Continuity (U6, KTD8) |
| Maintainer gotchas in the template (Stop hook, `execFileSync`, `docs/images`) | Moved | Root `AGENTS.md` only; they concern this repository, not user projects |
| Each Agent Teams teammate MUST own specific files | Kept | "Parallel work", for every host's helpers, with the reason |
| Skill and pipeline tables with slash commands | Kept | Skill names in prose, since every host starts skills differently (KTD4) |
| Plugin-provided counts ("53 skills, 10 hooks") in the template | Dropped | A scaffolded file is copied once and the counts would go stale in every project |

## Evidence

Live checks done during the build, each recorded in the commit that made it:

| Check | Result | Where recorded |
|---|---|---|
| `AGENTS.md` canary: a scaffolded project answers a question that only `AGENTS.md` can answer | Answered correctly in Claude Code (through the `@AGENTS.md` import), Codex and Antigravity | U10, commit `3f43d49` |
| The three-task fixture plan through the ab-orchestrate ledger, in Claude Code headless with `--permission-mode auto` | With helpers disabled the lead ran the tasks inline; with helpers it ran them in worktrees. Both gave two waves, one commit per task, a done ledger of the same shape and 4/4 passing tests; the Agent Teams extra stood down in the headless session | U7, commit `b090211` |
| Hermes `skills_guard` scan over the shipped skills | All 53 skills rate safe (before the rewrite: two dangerous, one caution) | U9, commit `a3ea138`; re-checked in `b6a1014` and U14 `1df26f4` |
| Headless `claude -p` reading the plugin's `references/` files from outside the project | Plain `-p` denies the read for the main session and the helper; `--permission-mode auto` (and `--add-dir <plugin root>`) allow it. The runner uses the auto posture for Claude Code, and the Helper step passes a prompt's path only when the helper can read it | U5, commit `05a6b55` |
| `agy plugin install` and `claude plugin install` from the checkout | Each lists all 53 skills (installed, checked, removed) | U11, commit `af90244` |
| Grok Build 1.0.34 manifest resolution | Reads a root `plugin.json` first and does not merge, so the Grok manifest is inert once the Antigravity one exists; skills are still found by convention and no hook loads, which is the intent | U11, commit `af90244` |

The release-level proof is the smoke table, `docs/releases/v4.0.0-smoke.md`, which runs every main pipeline in each host's headless mode from the local checkout. It is pending as of this record; the support notes under `docs/hosts/` carry its result per host, and any host that fails only through a vendor bug is marked degraded there with the upstream link (R28).

## Verdicts

### Single-harness scope (July and September 2026 records) → **REVERSED**

The scope was a fit judgment for a plugin whose agents, hooks, loop and instructions were Claude-shaped. With agents as prompt files, hooks optional, the loop driven by a state file and instructions written as principles, nothing in the product is Claude-shaped any more, and the marginal host costs a manifest, a support note and a smoke row. The July records stay as they are; they describe the product they judged.

### Zero-dependency, markdown-only → **KEPT**

Still the same product identity. The new gates are stdlib Python, the runner and installer are bash, the skills are Markdown with optional bundled scripts, and nothing is generated at build time.

### A converter or build step that generates per-host copies → **REJECTED**

A converter has to follow every host's format changes and breaks when it falls behind. One shared tree with committed manifests moves the cost to a gate that runs in CI instead of a generator that runs at release.

### Host facts from the docs and from probes → **KEPT**

Every host's behaviour was researched from its docs and probed on this machine, and the manifests and installer were written from those facts.

### A vendor's bug blocking the release → **REJECTED**

R28: the host ships marked degraded with the upstream link, and the other seven are not held back.

## Net

The blueprint is the pipelines, the pipelines are prose, and prose is portable. v4.0 trades the Claude-specific conveniences (`/agents`, per-agent tool limits, slash commands, hooks everywhere, one plugin id) for the same 53 skills in eight hosts on the user's own model and effort, and pays for it with one manifest per host, two gates and a smoke test. The instruction rules that mattered moved into gates and hooks; the ones current models follow on their own were dropped. The single-harness scope question is closed; a ninth host, when one is taken on, costs a manifest, a support note and a smoke row.
