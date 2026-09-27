<p align="center">
  <img src="docs/images/hero-banner.svg" alt="Claude Code Project Template" width="100%">
</p>

<p align="center">
  <strong>Production-grade Claude Code plugin for AI-assisted software development</strong>
</p>

<p align="center">
  <a href="#how-does-this-compare">Compare</a> ·
  <a href="#whats-new-in-v380--plans-as-decisions-and-opus-55-currency">What's New</a> ·
  <a href="#quick-start">Quick Start</a> ·
  <a href="#what-you-get">What You Get</a> ·
  <a href="#workflow">Workflow</a> ·
  <a href="#autonomous-pipeline-ship-pipeline">Ship</a> ·
  <a href="#agent-teams--swarms">Agent Teams</a> ·
  <a href="#skills-reference">Skills</a> ·
  <a href="#agents-reference">Agents</a> ·
  <a href="#customization">Customization</a> ·
  <a href="#error-recovery">Error Recovery</a>
</p>

---

<p align="center">
  <img src="docs/images/overview.gif" alt="Claude Code Blueprint overview — 7 scenes showing skills, agents, pipelines, and multi-agent orchestration" width="90%">
</p>

## Why This Template?

Most AI coding sessions start from scratch: no conventions, no memory, no workflow. Each session reinvents the wheel. This template fixes that.

It gives Claude Code a **structured operating system** — a set of skills, agents, and documentation patterns that compound across sessions. The result: higher quality code, fewer regressions, and a codebase that gets easier to work on over time.

**The core philosophy:**

> *Each unit of engineering work should make subsequent units easier — not harder.*

## How Does This Compare?

Before committing to any tool, it helps to understand the landscape. We've analyzed **19 repos and frameworks** across the Claude Code ecosystem — over 1.15M combined GitHub stars — through direct source code inspection, not marketing claims.

<p align="center">
  <img src="docs/images/ecosystem-guide.png" alt="Claude Code Tools Guide — curated ecosystem subset" width="90%">
</p>

**[Download the free ecosystem guide (PDF)](ebook/claude-code-tools-guide.pdf)** — covers tool profiles, classification matrices, scenario-based recommendations, combination safety, and confidence-scored final rankings.

> *The best tool is the one that matches your actual workflow, not the one with the most stars.*

## Latest: Ecosystem-Wide Analysis

Every component in Blueprint is informed by what works (and what doesn't) across the broader ecosystem. We analyze repos at the source code level — reading implementation, not just READMEs — and either absorb the best patterns into existing skills and agents, or document exactly why we rejected them.

| Repo / Tool | Stars | Verdict | What We Took |
|---|---|---|---|
| [**gstack**](https://github.com/garrytan/gstack) | 132.6K | **21 patterns** (now a Bun-runtime engineering platform grown from its role-based skills) | Suppressions lists, premise challenge, AI slop detection, confidence tiering, WTF-likelihood scoring; 2026-09 additions: a plan-completion audit, a decision-boundary confusion protocol backed by claimed-limitation evidence, a reuse ladder, always-run learnings capture, a tracker-text data envelope, and scan-before-sink safeguards |
| [**GSD**](https://github.com/gsd-build/get-shit-done) | 64.6K | **4 patterns** (archived upstream 2026-05; lineage continues in gsd-core) | Interface context in plans, prompt injection guard hook, stub tracking, verification commands |
| [**GSD-2**](https://github.com/gsd-build/gsd-2) | 7.8K | **6 patterns** | Error classification fast-path, degradation detection, structured escalation, assumption tracking |
| [**gsd-core**](https://github.com/open-gsd/gsd-core) [†](#gsd-core-provenance) | 9.4K | **2 micro-grafts** | Community fork of GSD (4th GSD-lineage pass, v1.7.0); post-fork build-out is 16-runtime embeddable-orchestration + MCP infra — the multi-runtime direction we repeatedly reject; ideas only, re-implemented, never copied: a failing-direction check for acceptance commands and a STATE.md commit stamp; 4 verifier/plan refinements still deferred |
| [**Anthropic skill-creator**](https://github.com/anthropics/skills) | Official | **3 concepts** | Description trigger testing, structured assertions, iteration strategy by skill type |
| [**Superpowers**](https://github.com/obra/superpowers) | 285.2K | Patterns adopted (6 in 2026-09) | Anti-rationalization guards, TDD quality gates (re-analyzed v6.1.1 — blueprint already carries 13/14 of its skills, nothing new); 2026-09 additions: a fix-loop that resumes the same implementer, test falsifiability, discard-only-on-request with no forced worktree removal, no worker-spawned subagents, ceremony sized to the size of the idea in brainstorming, and a plan Spec pointer |
| [**Compound Eng.**](https://github.com/EveryInc/compound-engineering-plugin) | 25.0K | Patterns adopted | Parallel review swarm, agent tool restrictions, confidence-anchored scoring, blindspot pass, reversibility-tiering (re-analyzed v3.19.0); 2026-09 additions: settle-first questions before planning, a plan Objective/Means header, handoff hygiene, PR description discipline, knowledge-base gardening, a SKILL.md size budget, and contributor AI-disclosure notes |
| [**Ralphy**](https://github.com/michaelshimeles/ralphy) | 2.9K | Pattern adopted | External bash loop for context-exhaustion recovery |
| [**Ralph**](https://github.com/snarktank/ralph) | 21.2K | Pattern adopted | Original autonomous agent loop that inspired the external ship loop |
| [**claude-mem**](https://github.com/thedotmack/claude-mem) | 87.9K | **Import nothing** | Exhaustive capture conflicts with selective curation philosophy |
| [**claude-squad**](https://github.com/smtg-ai/claude-squad) | 8.1K | **Import nothing** | External process manager — our internal agent approach is strictly more powerful |
| [**OpenCLI**](https://github.com/jackwener/opencli) | 26.9K | **Import nothing** | Browser automation tool — completely different problem domain |
| [**Everything CC**](https://github.com/affaan-m/everything-claude-code) | 231K | Reference | Security-first approach, 992 tests |
| [**UI/UX Pro Max**](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | 108K | Reference | 100+ reasoning rules |
| [**Claude Skills**](https://github.com/alirezarezvani/claude-skills) | 22.8K | Reference | Progressive disclosure |
| [**Plugins+Skills**](https://github.com/jeremylongshore/claude-code-plugins-plus-skills) | 2.5K | Reference | Community patterns |
| [**oh-my-claudecode**](https://github.com/Yeachan-Heo/oh-my-claudecode) | 39.1K | **9 patterns** | Evidence hierarchy for debugging, ambiguity gating for requirements, deslop pass for AI text cleanup; 2026-09 additions: a verifiability boundary, a fog test for vague requirements, an ADR admission test, minimal-code non-negotiables, a hard iteration ceiling, UI anti-slop signals, and knowledge-base gardening (its v5.0 retired the routing machinery this table never imported) |
| **Multi-Agent Framework** | Doc | **3 patterns** | Worker failure protocol, contradiction resolution, structured escalation |
| [**agent-skills**](https://github.com/addyosmani/agent-skills) | 93.5K | **13 patterns** | HTTP-revalidating WebFetch cache, source-driven-development skill, rationalization tables, severity prefixes, When-NOT-to-Use sections; cross-skill collision detection, OWASP-LLM lens, doubt-driven review (re-analyzed 0.6.4); 2026-09 additions: retrieval safety for fetched documentation, a quality-bar regression lens, and a neutral-is-revert ledger |

> **"Import nothing" is a feature, not a failure.** The gravitational pull to adopt *something* from impressive repos is a real bias. Sometimes the right answer after deep analysis is to change nothing — and documenting why is just as valuable as documenting what you imported.

<a id="gsd-core-provenance"></a>
> **† gsd-core provenance.** `open-gsd/gsd-core` is a **post-abandonment community fork** of `gsd-build/get-shit-done` (created 2026-05-22, after the original maintainer went dark and the associated `$GSD` token was linked to a rug-pull). Maintainer safety is **unconfirmed**. It appears here for analysis completeness only; any pattern from a GSD-lineage repo is re-implemented from the described idea, never copied from fork source — so the supply-chain risk to this project is negligible.

### The latest two releases: a platform-sync cycle

v3.4.0 and v3.5.0 were produced by a single **platform-sync cycle** — one initiative in two maintainer-gated parts. Part 1 audited the entire Claude Code platform delta since the last sync and adopted what fit; Part 2 re-analyzed four external repos and imported what earned its place. The audit method is now codified into two reusable monthly watchers — `/cli-watch` (platform) and `/repo-watch` (external repos) — maintainer workspace tooling that drives the release cadence, not part of the shipped plugin.

<p align="center">
  <img src="docs/images/platform-sync-cycle.png" alt="Platform-sync cycle — Audit (68 CLI versions) → Gate 1 → Adopt + verify (Part 1, v3.4.0) → Delta sweep (Part 2, 4 repos) → Gate 2 → Import + close (v3.5.0), codified into the /cli-watch + /repo-watch watchers" width="90%">
</p>

### What's New in v3.8.0 — Plans as Decisions and Opus 5.5 Currency

A combined watcher cycle. `/repo-watch` compared six watched repositories against their September baselines and grafted twenty-five ideas onto existing skills and agents; `/cli-watch` re-verified every platform claim against Claude Code 2.1.283. No new skills, agents, or hooks. Verdicts, provenance, and deferrals: `docs/learnings/2026-09-27-cli-and-repo-watch-verdicts.md`.

- **Plans record decisions, not code** — `writing-plans` names the test and its assertions, the signature, and the spec values, with a code body only for an algorithm those leave open. Plans end with a Review Focus list pinned to tests, and the handoff recommends one execution option with its reason and cost. The user reviews the saved plan before execution, because approving the design approved only the scope. `plan-checker` and `deepen-plan` no longer push code back into plans.
- **Security findings can't vanish silently** — `findings-validator` rejects an auth, injection, data-loss, or secrets finding only with a quoted refutation; a finding it can neither confirm nor refute is kept as advisory with a human owner.
- **Sharper reviews** — review ranges start at the merge base and refuse empty ranges; untracked files are in scope; a raised maximum counts as a loosened threshold; spec-silent behavior is judged by what a reasonable user expects, and invented rules go to a human; `test-coverage-reviewer` asks whether a test would still pass with the code broken; `security-sentinel` adds SameSite cookies, signature audits, data retention, LLM tool-argument validation, and flag bypass; review depth follows consequence, not size.
- **Green means the whole suite** — TDD, the SDD implementer, and verification require the project's test command, with every failure named; `executing-plans` runs the final whole-branch review its cleanup step already referred to.
- **Loops that stay honest** — ship-pipeline routes bugs and questions away from shipping and re-verifies a plan it finds on disk; an advisory pre-flight danger scan runs before autonomous runs; completion reports state the run's numbers; declined review findings aren't raised again; `pr-workflow` checks the pushed HEAD and refuses to merge onto a red main; `team-lead` judges progress by artifacts.
- **Lighter knowledge capture** — `knowledge-compounding` records only what the code and tests don't already preserve, with an optional `retire_when:`; session-wrap ends on an action the next session can start; context-checkpoint has a keep-and-cut order.
- **Opus 5.5 currency** — Opus 5.5 is the default model on every plan and starts sessions at `medium` effort. A new "Session model and effort: your choice" section explains how agent tiers interact with the session level and how to set both; the blueprint doesn't prescribe a level. Workflow facts (under 10 agents, adjustable concurrency) and `/goal` retry notes are refreshed, and `writing-skills` points at `claude plugin eval`.
- **Two new structure checks** — the collision gate fails on frontmatter that isn't valid YAML and on `references/` pointers, links, or `§` headings that don't resolve.

**Evaluated and deferred:** a `claude plugin eval` pilot suite, `/doctor prompt-audit` sweep, `omitClaudeMd` on validators, skill-level `effort:` (it would override a higher level you chose), the size-headroom listing, the PR babysit loop, and every multi-host portability item (routed to a separate brainstorm).

### What's New in v3.7.1 — Size Sweep and Fixes

- **Skill size sweep** — `writing-skills`, `ship-pipeline`, `session-wrap`, and `systematic-debugging` keep a lean `SKILL.md` and load templates, optional modes, worked examples, and long-session procedures from `references/` at the point of use. Every SKILL.md body is now under the 16 KB tier (the collision gate's size report shows it); nothing was deleted, only relocated behind a pointer.
- **Finishing path fixes** — Option 1 (merge locally) runs from the main checkout and removes the worktree before deleting the branch, the order git accepts; a refused discard on a plain branch reports the branch instead of a non-existent worktree.
- **Resume and wrap precision** — `resume-session` requires the STATE.md stamp to be an ancestor of HEAD before counting commits, so a squash or rebase merge no longer reads as "HEAD moved"; `session-wrap`'s STATUS.md step points ADR links at Step 12, where ADRs are created.

### What's New in v3.7.0 — Ecosystem Imports

The second `/repo-watch` cycle compared seven watched repositories against their July baselines and grafted twenty-one ideas onto existing skills and agents. No new skills, agents, or hooks; every idea re-implemented in the blueprint's own words, with provenance, deferrals, and rejections recorded in `docs/learnings/2026-09-11-ecosystem-import-verdicts.md`.

- **Plan audit before a branch is finished** — `finishing-a-development-branch` dispatches a fresh-context `code-reviewer` that classifies every plan item against the diff (DONE, CHANGED, PARTIAL, NOT DONE, DEFERRED, UNVERIFIABLE) and lists unplanned work; NOT DONE or PARTIAL blocks merge and PR, and `pr-workflow` renders the table in the PR body.
- **Discard only on request** — the default finishing menu has three options; an explicit discard lists untracked files first and relays the force commands for you to run, and no skill ever runs `git worktree remove --force`.
- **One decision boundary** — "if this is done wrong, can the system detect it and roll it back?" decides versus stops, stated once in `executing-plans` and cited by `autonomous-loop`, `team-lead`, `build-pipeline`, and `ship-pipeline`; must-ask categories are checked first, workers return `NEEDS_INPUT` instead of guessing and never spawn subagents, and `ship.sh` runs stop at a fixed 20-iteration ceiling read from the progress file.
- **Converging fix loop** — `subagent-driven-development` messages the same named implementer for fix rounds, re-reviews cumulatively from the pre-task commit, caps five rounds per phase, and marks a stuck task blocked in the progress ledger.
- **Tests that can fail, reviewers that catch a lowered bar** — Anti-Pattern 6 (falsifiability), a failing direction on every acceptance command, a quality-bar regression lens in `code-reviewer`, newly skipped tests and loosened assertions flagged, and a neutral-is-revert ledger in `performance-profiling`.
- **External text is data** — fetched documentation and tracker comments enter prompts inside the plugin's DATA markers; `pr-comment-resolver` never executes a quoted command and returns `NEEDS_INPUT` when a comment's intent is ambiguous.
- **Handoffs you can trust** — `session-wrap`'s learnings step always runs (and says "No durable learnings this session" when true), applies a three-part ADR admission test, and stamps `STATE.md` with the HEAD sha so `resume-session` can tell whether HEAD moved; `knowledge-compounding` gains a gardening checklist.
- **Authoring refinements** — `brainstorming` sizes ceremony (spike, bounded, architectural) behind a fog test; `writing-plans` headers carry Objective, Means, and Spec; SKILL.md bodies get an 8 KB budget with a warn-only size report in the collision gate (17 bodies over 8 KB and 4 over 16 KB after these grafts); three UI anti-slop signals; contributor AI disclosure.
- **Ecosystem table refreshed** — current stars and 2026-09 verdicts for all seven watched repos (1.15M+ combined stars); get-shit-done is archived upstream and its lineage continues in gsd-core.

**Evaluated and deferred:** the watch-to-merge PR loop, retuning and eval harnesses, design spikes, release-rule discovery, worktree merge-back, the DX lens and edit lock, honest-verifier abstention, the size sweep of the four largest skills, and a `ship.sh` stop marker for must-ask categories.

### What's New in v3.6.0 — Platform Currency Refresh

The second `/cli-watch` cycle audited 47 CLI releases (2.1.213 → 2.1.268, 1,381 changelog entries) and refreshed every platform claim the template makes. No rebuilds and no new skills or agents: every supersede candidate resolved to keep again, with the cycle's probes and verdicts recorded in `docs/learnings/2026-09-11-cli-watch-cycle-verdicts.md`.

- **Model-agnostic task tracking** — Claude Code removed TodoWrite and the Task tools on Opus 4.8, Sonnet 5, Fable 5 and newer, so `executing-plans`, `subagent-driven-development` and `writing-skills` now track progress in a plan-scoped `.claude/plans/<plan>.progress.local.md` (git-ignored in new scaffolds, with a `git check-ignore` guard for older projects).
- **Limits and lineup refreshed** — the 200-subagent session cap is gone; the real limits are 20 concurrent subagents and a spawn depth of 3. The opt-in effort mapping now points at Opus 5 / Fable 5.1, and effort tiers are documented as honored on every model from CLI 2.1.267.
- **Native alternatives as they behave today** — dynamic-workflow gating (paid plans, Pro opt-in, org switch, `-p`/SDK support), `/goal` check-ins and its headless loop, teammate model rules, and the bundled `/deep-research` workflow that shares a name with the research-swarm skill.
- **Native-first plugin update** — `/plugin-update` tries `claude plugin update` (scope-aware, cache-verified) before falling back to the manual sync; README and site copy now say `/reload-plugins` instead of "restart".
- **Two new gates** — a CI job runs `claude plugin validate --strict` on the plugin and marketplace manifests, and the drift gate now catches a stale README "What's New" nav anchor (negative-tested).
- **Diagrams re-rendered** — the effort-tiers and platform-currency images are regenerated from source with the new labels.

**Evaluated and kept:** `ship-loop.sh` vs `/goal` (still not skill-invocable), `ship.sh` vs `claude -p "/goal …"` (a headless goal loop trades against fresh-context iteration — an opt-in flag is deferred), wave orchestration vs the Workflow tool (a plugin-bundled workflow is deferred), and the injection scanners (native observers now cover Artifact reads and auto-mode probes, still not main-session Read/Write/Edit).

### What's New in v3.5.2 — Validator Wiring & Guide Refresh

- **Independent fix verification** — the `bug-reproduction-validator` agent is now wired into `systematic-debugging`: it independently establishes disputed or intermittent repros before investigation, and re-verifies non-trivial fixes in a fresh context with none of the session's assumptions.
- **July 2026 guide edition** — [The Claude Code Tools Guide](ebook/claude-code-tools-guide.pdf) refreshed with live GitHub data: stars, forks, and versions across all 14 profiled tools (950K+ combined stars); corrupted data cells fixed.
- **Committed PDF pipeline** — new `docs/images/render-ebook.js` regenerates the guide PDF from source, joining `render-diagrams.js` and `record-promo.js` so every visual artifact rebuilds with one command.

### What's New in v3.5.1 — Verification Sweep

Post-release verification loops — three parallel review agents plus mechanical cross-checks against the filesystem and the live GitHub API — caught every stale surface left behind by three releases of growth, and taught the drift gate to catch each class.

- **Total rename purge** — ~35 surviving pre-v3.2 command names eliminated (install.sh next-steps, scaffolded templates, 21 skill/agent prose refs, hook comments).
- **Complete rosters** — the site agents grid and README table now list all 29 agents; the skills grid all 55; the promo GIF re-rendered with real stats.
- **Live ecosystem data** — star columns refreshed from the GitHub API (19 repos, ~1.1M combined stars); corrupted cells fixed.
- **Gate expansion** — `check-drift.sh` now verifies grid completeness and badge integrity, ecosystem repo-count claims, the README agents table, and the promo GIF source. Every new check is negative-tested against the pre-fix files.

### What's New in v3.5.0 — Ecosystem Delta Sweep

Delta re-analysis of four external repos at the source level, refreshing imports since the last cycle. Each closed with a recorded version pin so future deltas have a baseline. **5 patterns imported; two repos yielded nothing (a documented outcome).**

- **compound-engineering** (re-analyzed v3.7.0 → **v3.19.0**): imported the **blindspot pass** (brainstorming maps the decision surface for users in unfamiliar territory) and **reversibility-tiering** (size scrutiny by two-way vs one-way door in ideation).
- **agent-skills** (re-analyzed → **0.6.4**): imported **cross-skill description-collision detection** (a CI gate flagging near-duplicate skill descriptions that a single-skill trigger test can't catch), the **OWASP-LLM lens** + "system prompt is not a security boundary" (grafted onto systematic-debugging), and **doubt-driven reviewer input-hygiene** (feed reviewers the artifact + contract, strip the author's claim, demand disproof).
- **superpowers** (first pin, **v6.1.1**): **import nothing** — the blueprint already carries 13 of its 14 skills by name; recent work is internal refactors and multi-harness portability out of scope here. Leftover superpowers branding in four skills was cleaned up.
- **gsd-core** (**v1.7.0**, new row): **import nothing** — a post-fork 16-runtime orchestration + MCP build-out, the multi-runtime direction the blueprint repeatedly rejects; four verifier/plan refinements deferred. Provenance recorded above.

### What's New in v3.4.0 — Platform Currency Sync

A full audit of the Claude Code platform delta since the last sync (68 CLI versions, 1,328 changelog entries) brought the template back to currency. New native features are adopted as **stability-guarded opt-ins** — no core pipeline depends on a gated or experimental capability. Every supersede candidate was evaluated under a keep-old-until-pass rebuild lifecycle; all four resolved to keep, with committed decision records.

**Adopted:**
- **Effort tiers on all 29 agents** — per-agent `effort:` frontmatter (low/medium/high) by reasoning depth. `model: inherit` stays the shipped default; an opt-in per-tier model mapping (`low`→Haiku 4.5, `medium`→Sonnet 5, `high`→Opus 4.8 / Fable 5) is documented for plans that support it.
- **Native `/goal` opt-in** — `/ship` can emit a copyable `/goal` prompt for platform-native condition completion (mirroring compound-engineering's copyable-prompt pattern). The `ship-loop.sh` Stop-hook guard stays the zero-config, headless-safe default; `/goal` complements it, never replaces it.
- **Exact-match drift gate** — new `scripts/check-drift.sh` CI job derives skill/agent/hook counts from the filesystem and enforces version-string equality across every manifest, doc, and the website. Retires the manual count sweeps that drifted three times.
- **Hooks exec-form** — all 10 handlers converted to `args[]` exec-form spawning (no shell tokenization; robust to install paths with spaces).
- **Platform currency docs** — native `/loop`/ScheduleWakeup, dynamic workflows/ultracode, per-session caps (200 subagents/WebSearches), and Agent-tool injection hardening are documented as gated opt-ins, each with the blueprint's stance recorded.

**Evaluated and kept (decision records in `docs/learnings/`):** `ship.sh` (fresh-context respawn; native `/loop` never resets context), wave orchestration (native Workflow tool is triple-gated + forbids mid-run sign-off), and the injection scanners (native hardening observes only the subagent-read surface; the custom layers uniquely cover Write/Edit + main-session Read — 7/7 positive-fixture catch verified).

### What's New in v3.3.0 — GSD Deep-Analysis Imports

Third-pass deep analysis of [gsd-build/get-shit-done](https://github.com/gsd-build/get-shit-done) (60.9K ★) compared dimension-by-dimension against our system. **13 patterns imported across 3 priority tiers:**

**P0 — high-leverage / low-effort:**
- **Read-injection PostToolUse hook** — new `read-injection-scanner.js` scans content returned by `Read` for prompt-injection patterns + invisible Unicode + Unicode tag-block range (U+E0000–U+E007F). Different threat model from prompt-guard (Write/Edit content): catches file-content poisoning that survives context compression. Advisory, non-blocking.
- **Agent-handoff `<<DATA_START>>` / `<<DATA_END>>` markers** — defense-in-depth for agent-to-agent injection. team-lead, code-reviewer, findings-synthesizer, integration-checker all wrap externally-sourced content in markers when forwarding to subagents.
- **Plan-checker dimensional additions** — three new checks: scope-reduction detection ("v1" hedges against locked decisions), cross-plan data-contract compatibility, must_haves discipline (user-observable truths, not implementation details).

**P1 — meaningful refinements to existing surfaces:**
- **Persistent debug session file** — `systematic-debugging` skill now supports optional `.claude/debug/<slug>.md` capturing hypothesis log + eliminated branches. Survives context resets. Auto-trigger after 3rd hypothesis cycle.
- **Nyquist test-gap discipline** — `test-gap-analyzer` agent adopts FILLED/ESCALATED/SKIP triage. Implementation files are read-only — bugs escalate, never direct-fix. Adversarial framing: every gap uncovered until passing test proves otherwise.
- **doc-claim-verifier agent (new)** — extracts factual claims (file paths, commands, API endpoints, function names, deps) from docs and verifies each against the filesystem. Returns PASS/FAIL/UNVERIFIABLE per claim. Wired into `document-review` Pass 1.
- **pattern-mapper agent (new)** — for each new file in a plan, finds 3–5 strong analogs and emits `PATTERNS.md` with line-numbered code excerpts. Wired into `executing-plans`.
- **context-monitor refactor** — debounce + severity escalation (NONE→WARNING→CRITICAL). Suppresses repeats unless 5 tool calls passed or severity escalated. Replaces prior implementation that had double-trigger bugs.
- **Adversarial stance phrasing** — code-reviewer, security-sentinel, integration-checker, findings-synthesizer, plan-checker now lead with explicit "assume X is broken until evidence proves otherwise" framing.

**P2 — refinements and additions:**
- **`/forensics` skill (new)** — post-mortem of failed `/ship` runs against `.claude/ship-logs/` + git state. Investigates 4 anomaly categories (stuck loops, missing artifacts, abandoned work, crashes). Read-only. Redacts sensitive content before producing reports.
- **Conventional-commits validator (opt-in)** — new `validate-commit.js` PreToolUse hook on Bash. Validates `type(scope): subject ≤ 72 chars`. Off by default; opt-in via `.claude/blueprint.local.json`.
- **Calibration tiers** — Full / Standard / Minimal-decisive scaling in `research-synthesizer` and `plan-checker`.
- **LOCKED-vs-LOCKED hard-blocker rule** — two contradictory locked decisions in DECISIONS.md is a hard BLOCKER, never auto-resolved.
- **Severity-mandatory formalism** — code-reviewer, security-sentinel, plan-checker explicitly invalidate findings without severity + confidence anchor.
- **Synthesis-by-intersection** — research-synthesizer surfaces gaps where research files don't intersect (capability described but no architectural counterpart).
- **Required-reading block + goal-backward verification** — plan-checker explicit conventions.
- **Subagent return-state contract** — `{DONE, BLOCKED, NEEDS_INPUT, INCONCLUSIVE}` enum + ≤ 2K-token summary commitment for long-running agents in team-lead and iterative-refinement.

**Rejected (verified to be already-covered or scope-mismatched):** workflow-guard hook (already rejected v2.3), read-before-edit guard (Claude Code native), AI-application-specific eval/framework agents, knowledge-graph/sketch/spike commands (we have spike-exploration), pause-work/resume-work commands (we have session-continuity trio), MVP-mode/SPIDR/Walking-Skeleton methodology, ns-* router commands.

[gsd-build/get-shit-done](https://github.com/gsd-build/get-shit-done) joins the ecosystem table as the 3rd-deepest analysis after compound-engineering and multi-agent-framework. The overlap with our system is large enough that imports were mostly *refinements*, not net-new capabilities — which validates that the prior two GSD import waves (v2.3 and earlier v3.x) absorbed most load-bearing patterns.

### What's New in v3.2.1 — Framework Audit Fixes

Full framework audit (5 parallel reviewers + Team Lead cross-check) across all 53 skills, 26 agents, 6 hooks, 17 templates, and supporting infrastructure. **18 fixes:**

- **TypeScript false positives fixed** — `task-completed.js` hook was running `node --check` on `.ts`/`.tsx` files, which always fails. Narrowed to `.js`/`.jsx` only.
- **Python syntax checks restored** — same hook used `python` (missing on macOS) instead of `python3`. Python file syntax errors were silently ignored.
- **Stale command names purged** — 35 occurrences of old command names (`/start`, `/wrap`, `/compound`, `/planning`, `/backlog`, `/pause`, `/build`, `/ship`, `/quick`) updated across 7 template files and 6 skill files. Every new project now gets correct references.
- **`execSync` replaced with `execFileSync`** — `render-graphs.js` now uses the safer subprocess API.
- **Shell script hardened** — `find-polluter.sh` word-splitting bug on file paths with spaces fixed (`for` loop replaced with `while IFS= read -r`).
- **README TOC anchor fixed** — "What's New" link now resolves correctly on GitHub.
- **Version chain aligned** — `install.sh`, `plugin.json`, and `CLAUDE.md` all report consistent version numbers.
- **Team count corrected** — website and diagram source now agree on 4 agent teams (was 6 vs 4).
- **`--local` flag documented** — `install.sh` usage now shows the development install flag.

### What's New in v3.1 & v3.2 — Plugin Mode

**Blueprint is now a native Claude Code plugin.** Install once, available in every project — zero engine files in your git history.

```
/plugin marketplace add Ninety2UA/claude-code-blueprint
/plugin install claude-code-blueprint
```

**Key changes:**
- **Plugin architecture** — 54 skills, 29 agents, 8 hooks provided by the plugin, not copied into your project
- **`/project-start` scaffolding** — project files (CLAUDE.md, docs/, BACKLOG.md) created on demand per project
- **`/migrate-to-plugin`** — skill to transition v2.x projects to plugin mode
- **All slash commands are skills** — invoked by name, content loads directly (no sandbox gap)
- **Legacy mode preserved** — `--legacy` flag in install.sh for users who prefer in-project files

### What's New in v3.2 — Commands Merged into Skills

Commands were thin wrappers that couldn't load skill content due to Claude Code's plugin sandbox. v3.2 eliminates this gap entirely by removing commands and making skills the direct entry point.

**Key changes:**
- **Commands eliminated** — all 27 commands merged into 54 skills. Every slash command now loads full workflow content directly
- **Skill descriptions follow Anthropic best practices** — pushy triggers ("even if they don't explicitly ask..."), negative triggers ("DO NOT TRIGGER when..."), extensive trigger phrase lists
- **No more sandbox loading gap** — skills are invoked by name and Claude sees the full content, no improvisation
- **Auto-create MEMORY.md** — session-start hook creates the auto-memory index if missing, eliminating the "no MEMORY.md" warning for new projects
- **Skill names changed** — all 21 renames:

  | Old (v3.1) | New (v3.2) |
  |------------|------------|
  | `/build` | `/build-pipeline` |
  | `/ship` | `/ship-pipeline` |
  | `/planning` | `/brainstorming` |
  | `/quick` | `/quick-fix` |
  | `/start` | `/project-start` |
  | `/status` | `/project-status` |
  | `/wrap` | `/session-wrap` |
  | `/compound` | `/knowledge-compounding` |
  | `/debug` | `/systematic-debugging` |
  | `/update` | `/plugin-update` |
  | `/team` | `/team-execution` |
  | `/review` | `/requesting-code-review` |
  | `/ideate` | `/ideation` |
  | `/map` | `/codebase-mapping` |
  | `/backlog` | `/backlog-triage` |
  | `/health` | `/health-check` |
  | `/pause` | `/pause-checkpoint` |
  | `/resume` | `/resume-session` |
  | `/pr` | `/pr-workflow` |
  | `/changelog` | `/changelog-generation` |
  | `/deepen` | `/deepen-plan` |

  Unchanged: `/discuss`, `/orchestrate`, `/deep-research`, `/review-swarm`, `/add-tests`, `/migrate-to-plugin`

### What was new in v2.3

The v2.3 release added **5 new repos** to the analysis and incorporated patterns from two previously-analyzed ones:

- **GSD** (24.7K ★) — 82K-line meta-prompting framework. Imported interface context extraction for plans, a prompt injection guard hook, stub tracking, and verification command guidelines. Rejected the Node.js CLI layer and milestone lifecycle.
- **Anthropic skill-creator** (Official) — Anthropic's own skill factory. Imported description trigger testing, structured assertions, and iteration strategy by skill type. Rejected the blind-comparison eval agents and Python scripting layer.
- **claude-mem** (39.7K ★) — Automatic memory via observer agent + SQLite + ChromaDB. Analyzed in depth, deliberately rejected — exhaustive capture conflicts with Blueprint's selective curation philosophy.
- **claude-squad** (6.5K ★) — Go tmux multiplexer for parallel agents. Analyzed in depth, deliberately rejected — external process manager at the wrong abstraction layer.
- **OpenCLI** (v1.3) — Browser automation CLI via Chrome session reuse. Analyzed in depth, deliberately rejected — completely different problem domain (web scraping, not agent orchestration).
- **Multi-Agent Framework** (conceptual doc) — Hybrid multi-model coordination (Claude + Gemini + Codex). Absorbed worker failure protocol for team-lead, contradiction resolution for synthesizer, and structured escalation format. Rejected multi-model delegation and file-based coordination.
- **gstack** (22K ★) — 15 patterns absorbed including suppressions lists, premise challenge, AI slop detection, and WTF-likelihood risk scoring. See details below.

<details>
<summary><strong>gstack (22K ★) — 15 patterns absorbed</strong></summary>

Fifteen patterns from [gstack](https://github.com/garrytan/gstack) (Garry Tan's "software factory" — 13 role-based skills turning Claude Code into a virtual engineering team) incorporated into existing skills and agents:

**Applied:**

- **Suppressions lists for all reviewer agents** — explicit "DO NOT flag" sections prevent false positives that erode trust. Each reviewer agent now has a calibrated suppressions list (redundancy that aids readability, thresholds that rot as comments, assertions already sufficient, anything already fixed in the diff)
- **Review checklist patterns** — production-battle-tested detection patterns absorbed into relevant agents: TOCTOU races, `find_or_create_by` without unique index, LLM output trust boundaries, enum completeness traced through ALL consumers (reading code outside the diff), time window mismatches, type coercion at serialization boundaries, crypto entropy issues
- **Completeness Principle ("Boil the Lake")** — AI compresses implementation time 10-100x, so the marginal cost of completeness is near-zero. Always prefer the complete implementation. Dual-scale effort estimation (human time vs AI time) embedded in team-lead agent decisions
- **AskUserQuestion format standardization** — consistent 4-step format across agents: re-ground (project + branch), simplify (plain language), recommend with WHY, lettered options with dual effort scales
- **WTF-Likelihood risk scoring** — additive risk score complementing circuit breakers: reverts (+15%), multi-file fixes (+5%), volume after 15 fixes (+1% each), touching unrelated files (+20%). Stops at 20% threshold with 50-change hard cap
- **Premise Challenge + Scope Modes** — brainstorming skill now challenges WHAT to build before planning HOW. Four scope modes: Expansion, Selective Expansion, Hold Scope, Reduction
- **AI Slop detection patterns** — frontend-reviewer now detects telltale AI-generated UI: purple gradients, 3-column icon grids, center-aligned everything, uniform border-radius, generic hero copy. Confidence tiers (HIGH/MEDIUM/LOW) with different actions
- **Confidence tiering in findings synthesis** — findings-synthesizer tags each finding as [HIGH], [MEDIUM], or [LOW] confidence. LOW-confidence findings go in a separate "Verify Manually" section
- **Shadow path tracing** — writing-plans skill traces four paths for every data flow: happy, nil, empty, and error. Unhandled paths become explicit plan tasks
- **Error/Rescue Map** — writing-plans skill requires failure mode tables for every external call
- **Test Coverage Audit patterns** — codepath tracing with quality stars (★★★/★★/★), user flow coverage alongside code path coverage

**Prompt techniques:**

- **Mode commitment** — "Once selected, commit fully. Do not silently drift."
- **Explicit anti-patterns** — negative examples steer model behavior more effectively than positive instructions alone
- **"Never stop for X, only stop for Y"** — explicit lists eliminate ambiguity in autonomous workflows
- **Diagram forcing** — mandatory ASCII diagrams for non-trivial data flows
- **Dual-scale effort** — every effort estimate shows both human team time and AI-assisted time

All patterns woven into existing agents ([security-sentinel](plugins/claude-code-blueprint/agents/security-sentinel.md), [performance-oracle](plugins/claude-code-blueprint/agents/performance-oracle.md), [data-integrity-guardian](plugins/claude-code-blueprint/agents/data-integrity-guardian.md), [code-reviewer](plugins/claude-code-blueprint/agents/code-reviewer.md), [frontend-reviewer](plugins/claude-code-blueprint/agents/frontend-reviewer.md), [findings-synthesizer](plugins/claude-code-blueprint/agents/findings-synthesizer.md), [team-lead](plugins/claude-code-blueprint/agents/team-lead.md)) and skills ([autonomous-loop](plugins/claude-code-blueprint/skills/autonomous-loop/), [brainstorming](plugins/claude-code-blueprint/skills/brainstorming/), [writing-plans](plugins/claude-code-blueprint/skills/writing-plans/)) — no new files were added.

</details>

<details>
<summary><strong>GSD (24.7K ★) — 4 patterns absorbed</strong></summary>

Analyzed [GSD](https://github.com/gsd-build/get-shit-done) — an 82K-line meta-prompting framework with milestone lifecycle, 44 commands, 46 workflows, 16 agents, and a Node.js CLI layer. Key architectural difference: GSD invests in runtime tooling (state management, config, frontmatter CRUD); Blueprint stays zero-dependency markdown-only.

**Imported:**

- **Interface context extraction in plans** — embed types/interfaces from the codebase directly into plans so parallel executors don't waste context exploring the codebase. Highest-value single import — plans are prompts, not documents that become prompts
- **Prompt injection guard hook** — PreToolUse advisory scan for injection patterns and invisible Unicode in docs/ writes ([prompt-guard.js](plugins/claude-code-blueprint/hooks/handlers/prompt-guard.js))
- **Deviation scope boundary + stub tracking** — only auto-fix issues caused by the current task (3-attempt limit); post-execution scan for hardcoded empty values and placeholder text
- **Verification command guideline** — every plan step includes a runnable verification command, not "it works"

**Rejected:** Multi-runtime support (wrong layer), Node.js CLI layer (different architecture), milestone lifecycle (our pipelines suffice), model profiles (per-agent frontmatter is enough), file locking (not needed for our model).

</details>

<details>
<summary><strong>Anthropic Skill-Creator — 3 concepts absorbed</strong></summary>

Analyzed Anthropic's official skill-creator (`github.com/anthropics/skills`) — a skill factory with 3 blind-comparison eval agents, 8 Python scripts, 7 JSON schemas, and HTML eval viewers. Our system is a skill workshop: TDD-driven, pressure-tested, rationalization-resistant.

**Imported:**

- **Description trigger testing** — generate 20 should/shouldn't-trigger queries and iterate on the description string. Fills a gap in our testing methodology
- **Structured assertions** — define specific pass/fail criteria per test instead of freeform "document behavior", making testing quantitative
- **Iteration strategy by skill type** — discipline skills need loophole-closing, technique skills need metaphor reframing, reference skills need organization iteration

**Rejected:** Blind comparison agents, Python scripts, JSON benchmark schemas — factory tooling that adds marginal value over our TDD approach and brings Python dependencies.

</details>

<details>
<summary><strong>GSD-2 Knowledge Base — 6 patterns absorbed</strong></summary>

Six agent-building patterns from the GSD-2 knowledge base ("Building Coding Agents" — synthesized from Claude, GPT, Gemini, Grok):

- **Error classification with fast-path debugging** — syntax errors skip the full 4-phase debugging process; flaky tests are quarantined
- **Degradation detection** — rising difficulty and hot-file signals catch soft deterioration that hard-stall circuit breakers miss
- **Structured escalation format** — 4-part escalation output (what failed, tried, suspected, needed)
- **Assumption tracking** — `### Assumptions` convention with `[cascading]` flags
- **False-positive filtering** — review synthesis includes verification step and "Discarded" section
- **"Never summarize summaries"** — session wraps regenerate from source of truth, preventing drift

</details>

<details>
<summary><strong>Multi-Agent Framework — 3 patterns absorbed</strong></summary>

Analyzed a hybrid multi-model coordination framework (Claude Code as lead + Gemini CLI + Codex CLI). File-based shared state, phased waterfall lifecycle, parallel review with complementary focus split. Key architectural difference: framework optimizes for model diversity (heterogeneous agents via CLI); Blueprint optimizes for prompt diversity (homogeneous agents via native subagents).

**Imported:**

- **Worker failure protocol for team-lead** — retry once with reduced scope → skip and continue → report all skipped tasks. Prevents a single worker failure from stalling the entire pipeline
- **Contradiction resolution rules for findings-synthesizer** — 4-step protocol: same problem → more specific fix; different problems → address both; genuine contradiction → conservative position wins + log reasoning; one approves one flags → flag wins
- **Structured escalation format for iterative-refinement** — when convergence fails, present "both perspectives + my recommendation" with lettered options instead of a flat findings list

**Rejected:** Multi-model delegation via CLI (fragile, adds dependencies, loses native tool access), file-based coordination protocol (I/O overhead unnecessary for same-model systems), assignment heuristic matrix (designed for heterogeneous agents), Phase 0 whole-repo analysis (our 5-agent research swarm is more thorough), CONTRACTS.md (GSD import of interface context extraction is fresher), attribution changelog (git blame already handles this), research skip conditions (already covered by `/quick-fix` and session awareness).

</details>

<details>
<summary><strong>oh-my-claudecode (21.9K ★) — 3 patterns absorbed</strong></summary>

Analyzed [oh-my-claudecode](https://github.com/Yeachan-Heo/oh-my-claudecode) — a multi-agent orchestration plugin with 20 agents, 38+ skills, magic keyword triggers, multi-AI routing (Claude + Gemini + Codex), and MCP bridge infrastructure. Key architectural difference: OMC is feature-maximalist with heavy tooling dependencies (TypeScript, npm, tmux); Blueprint is rigor-maximalist with zero dependencies. 17 OMC features were already covered by our system, 7 were interesting but not needed, 2 were rejected.

**Imported:**

- **Evidence hierarchy for systematic-debugging** — 6-tier credibility ranking (direct reproduction > reproduction script > logs/traces > converging sources > code-path inference > speculation). Prevents treating speculation as fact. Cross-referenced in findings-synthesizer confidence tiering
- **Ambiguity gating for pipeline entry** — dimension-weighted requirement scoring (scope 40%, constraints 30%, criteria 30%) with 0.8 clarity threshold. Gates `/ship-pipeline` Stage 1 and `/build-pipeline` Stage 1. Brownfield variant adds context clarity at 15%
- **Deslop pass for iterative-refinement** — pre-review cleaning step targeting AI text patterns (over-hedged language, filler transitions, restating-the-obvious comments, redundant type annotations). Step 0.5 in iterative-refinement, referenced from autonomous-loop Step 7

**Rejected:** Multi-AI routing (unpredictable cross-model behavior, already rejected in multi-agent framework analysis), MCP bridge + LSP + AST integration (environment-level tool, breaks zero-dependency guarantee), magic keywords (semantic landmines that conflict with project names), `.omc/` state directory (fragments state across three locations), Deep Interview mode (target users know what to build), notification routing (infrastructure-layer concern), Ralplan consensus planning (analysis paralysis risk — plan-checker is sufficient).

</details>

<details>
<summary><strong>Analyzed & Deliberately Rejected — claude-mem, claude-squad, OpenCLI</strong></summary>

Not every analysis leads to adoption. These three repos were analyzed in depth and rejected with documented rationale:

- **claude-mem** (39.7K ★) — Automatic memory via observer agent + SQLite + ChromaDB. Uses exhaustive capture + AI compression. Blueprint uses selective curation — different philosophies for different goals. Three initially-proposed improvements all collapsed under scrutiny: session-end memory prompt risks over-saving, richer descriptions conflict with the 200-line cap, self-documenting headers duplicate system prompt instructions.

- **claude-squad** (6.5K ★) — Go tmux multiplexer for parallel Claude Code instances. Operates at a fundamentally different abstraction layer — an external process manager that treats agents as black boxes via terminal scraping. Blueprint's internal approach with native tool access is strictly more powerful.

- **OpenCLI** (v1.3, TypeScript) — Turns websites into CLI commands via browser automation and Chrome session reuse. Well-engineered but solves a completely different problem at a completely different layer. Zero architectural overlap with agent orchestration.

</details>

## Quick Start

### Install as a Claude Code plugin

Inside any Claude Code session:

```
/plugin marketplace add Ninety2UA/claude-code-blueprint
/plugin install claude-code-blueprint
```

That's it — the blueprint is now available in **all your projects**. No per-project files cluttering your git history.

### Set up a project

```bash
claude          # Start Claude Code — plugin loads automatically
> /project-start    # Scaffolds project files (CLAUDE.md, docs/) + interactive setup
> /brainstorming    # Brainstorm and plan your first feature
```

### Alternative: one-line install via script

```bash
curl -fsSL https://raw.githubusercontent.com/Ninety2UA/claude-code-blueprint/main/install.sh | bash
```

### Legacy mode (copy all files into project)

```bash
curl -fsSL https://raw.githubusercontent.com/Ninety2UA/claude-code-blueprint/main/install.sh | bash -s -- --legacy /path/to/your/project
```

### Update to latest version

From a terminal:

```bash
claude plugin update claude-code-blueprint@claude-code-blueprint
```

Or, inside any Claude Code session, `/plugin install claude-code-blueprint@claude-code-blueprint` — which refreshes the marketplace catalog first. Either path re-fetches the latest version from GitHub and updates the plugin cache. All projects get the update automatically — run `/reload-plugins` (or restart) to use the new version.

### Migrate from v2.x

Already using the blueprint with in-project files? Install the plugin, then run `/migrate-to-plugin` to remove the in-project engine files.

## What You Get

<p align="center">
  <img src="docs/images/project-structure.png" alt="Project Structure" width="90%">
</p>

### Project structure

```
Plugin (installed globally, zero files in your project)
├── 55 skills            /build-pipeline, /ship-pipeline, /brainstorming, /review-swarm, /orchestrate, /forensics, ...
│                        TDD, wave-orchestration, swarms, iterative-refinement, ...
├── 29 agents            team-lead, reviewer, security, perf, doc-claim-verifier, pattern-mapper, ...
└── 10 hooks              session-start, context-monitor, prompt-guard, read-injection-scanner, validate-commit (opt-in), ship-loop, sdd-cache (pre/post) + 2 Agent Teams

your-project/ (scaffolded by /project-start)
├── docs/
│   ├── context/        # GOALS.md · STATUS.md · CONVENTIONS.md
│   ├── plans/          # Implementation plans
│   ├── specs/          # Feature specifications
│   ├── decisions/      # Architecture Decision Records
│   ├── research/       # Spike results & evaluations
│   └── solutions/      # Institutional knowledge (created by /knowledge-compounding)
├── src/                # Your application code
├── tests/              # Your test suite
├── infra/              # Deployment & infrastructure
├── CLAUDE.md           # Master orchestration — Claude reads this first
├── BACKLOG.md          # Idea & bug capture inbox
└── blueprint.local.md  # Per-project agent config (gitignored)
```

### What each piece does

| Component | Purpose |
|-----------|---------|
| **CLAUDE.md** | Master configuration that Claude reads at session start. Contains behavioral rules, session continuity, agent team hierarchy, skill triggers, and project-specific learnings. |
| **Skills** | Workflow modules that activate at specific points — TDD, debugging, code review, wave orchestration, swarm coordination, knowledge compounding. They enforce quality gates automatically. |
| **Agents** | Specialized subprocesses dispatched for focused analysis — security audits, performance reviews, architecture evaluation. Organized into teams (review swarm, research swarm, execution waves). Each gets a fresh 200K context. |
| **docs/context/** | Living project state — goals, current status, conventions, execution state. Updated every session by `/session-wrap`. |
| **docs/solutions/** | Institutional knowledge — solved problems documented by `/knowledge-compounding` and searched by `/brainstorming` before future work. |
| **BACKLOG.md** | Quick-capture inbox for ideas, bugs, and tasks. Triaged by `/backlog-triage` into prioritized work. |
| **blueprint.local.md** | Per-project agent configuration — choose which review/research agents are relevant for your tech stack. Gitignored so each developer can customize. |

## Workflow

<p align="center">
  <img src="docs/images/workflow.png" alt="Development Workflow" width="90%">
</p>

### The development loop

Every feature follows this flow:

<p align="center">
  <img src="docs/images/dev-loop.png" alt="Orient → Design → Plan → Build → Ship → next feature" width="90%">
</p>

**1. Orient** — Load context with `/project-status` or set up with `/project-start`

**2. Ideate** (optional) — Run `/ideation` to discover what's worth building. AI scans your codebase and surfaces ranked improvement ideas.

**3. Design** — Brainstorm options with `/brainstorming`. Present tradeoffs. Get human approval before any code is written.

**4. Plan** — Break the approved design into tasks that record decisions, not code: exact file paths, each test and what it asserts, signatures, and a Review Focus list of spec-implied edge cases. The user reviews the saved plan before it runs. After the plan is written, choose: deepen with research (`/deepen-plan`), execute sequentially (subagent-driven), execute in parallel (`/orchestrate`), or execute with Agent Teams (`/team-execution`).

**5. Build** — Execute using TDD (red-green-refactor). Verify with evidence. Dispatch code review agents.

**6. Ship** — Merge the branch. Update all documentation with `/session-wrap`. Capture learnings for next session.

### Lightweight workflow for small changes

Not everything needs the full 5-step flow. Bug fixes with obvious root causes, typo fixes, config changes, and adding tests for existing behavior can use a shortcut:

<p align="center">
  <img src="docs/images/lightweight-workflow.png" alt="Write failing test → Fix it → Verify → Commit" width="80%">
</p>

The boundary is clear: if you're touching 4+ files, adding a new API, or unsure of the approach, use the full workflow. See CLAUDE.md for the complete criteria.

### Autonomous pipeline: `/ship-pipeline`

<p align="center">
  <img src="docs/images/ship-pipeline.png" alt="/ship Pipeline" width="90%">
</p>

For well-defined features you want to fire and forget, `/ship-pipeline` runs the entire development lifecycle autonomously — zero checkpoints, zero user input. It plans, researches, executes via a dedicated team-lead agent, iteratively reviews (3 cycles by default), and opens a PR.

```bash
# Inside Claude — interactive mode (single session)
> /ship-pipeline add JWT authentication with refresh tokens

# From terminal — external loop mode (fresh 200K context per iteration)
./scripts/ship.sh "add JWT authentication with refresh tokens" --max 10
```

**Two loop mechanisms handle context exhaustion:**

| Mechanism | Where it runs | Context reset | Purpose |
|-----------|--------------|---------------|---------|
| **`ship-loop.sh`** (Stop hook) | Inside Claude session | No (same session) | Blocks premature exit — Claude gives up too early |
| **`scripts/ship.sh`** (bash loop) | Outside, in terminal | Yes (fresh process) | Handles context exhaustion — spawns fresh 200K per iteration |

The external loop (`ship.sh`) is inspired by [Ralph](https://github.com/snarktank/ralph) — each iteration is a brand new Claude process with clean context. State persists via git commits, plan files, and progress tracking. The inner Stop hook guards against Claude stopping before `<promise>DONE</promise>` is output within a single session.

As of v3.4.0, interactive runs can also opt into the platform-native `/goal` command for condition-based completion. It's a **complement, never a replacement**: a skill can't invoke `/goal`, and `ship-loop.sh` is the only guard that works headless (`-p` / CI / `ship.sh`), so the Stop hook stays the guarantee while `/goal` adds a live overlay for interactive sessions.

<p align="center">
  <img src="docs/images/goal-opt-in.png" alt="/ship completion guard — ship-loop.sh is the always-on default that works headless; native /goal is an interactive opt-in complement, never a replacement" width="90%">
</p>

**Pipeline comparison:**

| Pipeline | Checkpoints | Review | Best for |
|----------|-------------|--------|----------|
| `/build-pipeline` | Between every stage | Single pass (or `--iterate N`) | Human-guided features |
| `/ship-pipeline` (interactive) | None | 3 iterative cycles | Single-context fire-and-forget |
| `ship.sh` (external) | None | 3 iterative cycles | Large features, context exhaustion |
| `/quick-fix` | None | None | Trivial changes (< 3 files) |
| `/orchestrate` | Between waves | Single pass (or `--iterations N`) | Dependency-ordered parallel execution |
| `/team-execution` | Async (teammates) | Single pass (or `--iterations N`) | Collaborative multi-file work |

### Quality gates

<p align="center">
  <img src="docs/images/quality-gates.png" alt="Quality Gates" width="90%">
</p>

Five non-negotiable checkpoints enforce quality at every stage:

| Gate | Rule | Enforced By |
|------|------|-------------|
| **1** | No code without design approval | `brainstorming` skill |
| **2** | No production code without a failing test first | `test-driven-development` skill |
| **3** | No fix without root cause investigation | `systematic-debugging` skill |
| **4** | No completion claim without fresh verification evidence | `verification-before-completion` skill |
| **5** | No merge without code review | `requesting-code-review` skill |

These aren't suggestions — they're hard gates. Claude will stop and course-correct if any gate is skipped.

### Consistency gates (CI)

Beyond the workflow gates above, two exact-match gates run in CI to keep the repo honest — both derive their truth from the filesystem rather than trusting hand-maintained numbers:

<p align="center">
  <img src="docs/images/consistency-gates.png" alt="Two CI consistency gates — check-drift.sh derives counts from the filesystem and verifies them everywhere including website widgets; check-skill-collisions.py flags near-duplicate skill descriptions by Jaccard overlap" width="90%">
</p>

- **Drift gate** (`scripts/check-drift.sh`) — derives skill/agent/hook counts from the filesystem and checks them against every manifest, doc, installer, and **website widget**, plus exact version-string equality. It retired the manual count sweeps that drifted three times.
- **Skill-collision gate** (`scripts/check-skill-collisions.py`) — computes pairwise description overlap (Jaccard) across all skills and fails on near-duplicates (warn ≥50%, fail ≥75%) that would route ambiguously — a failure a single-skill trigger test can't catch. The same script fails on skill structure: skill or agent frontmatter that isn't valid YAML, and, inside a skill, a `references/` pointer, a relative link, or a `§ heading` cited after a pointer that doesn't resolve.

A third CI job validates the plugin and marketplace manifests with the CLI's own validator (`claude plugin validate --strict`).

## Agent Teams & Swarms

Agents are organized into coordinated teams for multi-agent workflows. Four orchestration patterns are built in:

### Review Swarm (`/review-swarm`)

Dispatches 6-10 specialized reviewers in parallel, each analyzing the same code from a different angle. A findings-synthesizer merges all results into one prioritized report (P1/P2/P3).

<p align="center">
  <img src="docs/images/review-swarm.png" alt="Review Swarm — 6-10 parallel reviewers → findings synthesizer" width="90%">
</p>

### Research Swarm (`/deep-research`)

Spawns 5 research agents in parallel before planning, then synthesizes findings into a unified research brief.

<p align="center">
  <img src="docs/images/research-swarm.png" alt="Research Swarm — 5 parallel researchers → research synthesizer" width="90%">
</p>

### Wave Orchestration (`/orchestrate`)

Groups plan tasks by dependency into waves. Independent tasks within each wave run in parallel; an integration-verifier validates between waves.

<p align="center">
  <img src="docs/images/wave-orchestration.png" alt="Wave Orchestration — dependency-ordered waves with integration verification" width="90%">
</p>

### Agent Teams (`/team-execution`) — Experimental

For complex multi-file implementations where teammates need to discuss and coordinate, Agent Teams spawns fully independent Claude Code instances with a shared task list and messaging system.

<p align="center">
  <img src="docs/images/agent-teams.png" alt="Agent Teams — collaborative instances with shared task list and messaging" width="90%">
</p>

**When to use which:**

| Pattern | Best For | Key Feature |
|---------|----------|-------------|
| **Swarms** (`/review-swarm`, `/deep-research`) | Parallel analysis — same code, different lenses | Read-only, synthesizer merges outputs |
| **Waves** (`/orchestrate`) | Dependency-ordered implementation | Worktree isolation, integration verification |
| **Agent Teams** (`/team-execution`) | Collaborative multi-file implementation | Shared task list, inter-teammate messaging |

Agent Teams is an experimental Claude Code feature. Enable it with `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1"` in settings.json. The typical workflow combines all patterns: `/deep-research` (swarm) → `/brainstorming` → `/team-execution` (agent teams) → `/review-swarm` (swarm).

### Knowledge Loop (`/knowledge-compounding`)

Each solved problem becomes searchable institutional knowledge. Future `/brainstorming` and `/deep-research` skills automatically consult past solutions.

<p align="center">
  <img src="docs/images/knowledge-loop.png" alt="Knowledge Loop — solve → compound → search → plan → repeat" width="90%">
</p>

### Per-Project Configuration

Edit `blueprint.local.md` to enable/disable agents for your stack. No need for Rails reviewers on a Python project.

## Skills Reference

<p align="center">
  <img src="docs/images/skills-map.png" alt="Skills Map" width="90%">
</p>

Skills are workflow modules that activate at specific development phases. They contain detailed instructions, flowcharts, and examples that guide Claude through each step.

### Design phase

| Skill | What it does | Trigger |
|-------|-------------|---------|
| [**brainstorming**](plugins/claude-code-blueprint/skills/brainstorming/) | Explores 3+ design options with tradeoff analysis before any creative work | `/brainstorming` or before any new feature |
| [**writing-plans**](plugins/claude-code-blueprint/skills/writing-plans/) | Converts approved design into implementation plan with bite-sized tasks | After design approval |
| [**spike-exploration**](plugins/claude-code-blueprint/skills/spike-exploration/) | Timeboxed investigation to answer a specific technical question before committing to an approach | Significant technical uncertainty |
| [**scope-cutting**](plugins/claude-code-blueprint/skills/scope-cutting/) | Systematically separates must-haves from nice-to-haves using MoSCoW classification | Feature too large or deadline at risk |

### Execution phase

| Skill | What it does | Trigger |
|-------|-------------|---------|
| [**executing-plans**](plugins/claude-code-blueprint/skills/executing-plans/) | Executes plans in batches with review checkpoints. Tracks assumptions with `[cascading]` impact flags | Separate session from planning |
| [**test-driven-development**](plugins/claude-code-blueprint/skills/test-driven-development/) | Enforces red-green-refactor for all code changes | Before any code implementation |
| [**subagent-driven-development**](plugins/claude-code-blueprint/skills/subagent-driven-development/) | Dispatches fresh subagent per task with two-stage review | In-session plan execution |
| [**dispatching-parallel-agents**](plugins/claude-code-blueprint/skills/dispatching-parallel-agents/) | Runs independent investigations concurrently | 2+ independent failure domains |
| [**using-git-worktrees**](plugins/claude-code-blueprint/skills/using-git-worktrees/) | Creates isolated git workspace for feature work | Before major features |

### Quality phase

| Skill | What it does | Trigger |
|-------|-------------|---------|
| [**systematic-debugging**](plugins/claude-code-blueprint/skills/systematic-debugging/) | Root cause investigation before any fix is attempted. Step 0 error classification fast-paths syntax errors and quarantines flaky tests | Any bug or test failure |
| [**verification-before-completion**](plugins/claude-code-blueprint/skills/verification-before-completion/) | Requires fresh evidence before claiming work is done | Before any success claim |
| [**requesting-code-review**](plugins/claude-code-blueprint/skills/requesting-code-review/) | Dispatches code-reviewer agent for automated review | After completing a task |
| [**receiving-code-review**](plugins/claude-code-blueprint/skills/receiving-code-review/) | Evaluates review feedback technically, not defensively | When review feedback arrives |

### Completion phase

| Skill | What it does | Trigger |
|-------|-------------|---------|
| [**finishing-a-development-branch**](plugins/claude-code-blueprint/skills/finishing-a-development-branch/) | Structured merge workflow with options for squash, rebase, or merge | After all tests pass |
| [**session-wrap**](plugins/claude-code-blueprint/skills/session-wrap/) | Documents work done, updates all project docs, captures learnings. Regenerates from source of truth — never summarizes previous summaries | `/session-wrap` or end of session |

### Operations phase

| Skill | What it does | Trigger |
|-------|-------------|---------|
| [**codebase-mapping**](plugins/claude-code-blueprint/skills/codebase-mapping/) | Maps unfamiliar codebase into structured documentation | `/codebase-mapping` or before modifying unfamiliar code |
| [**context-checkpoint**](plugins/claude-code-blueprint/skills/context-checkpoint/) | Mid-session state capture — lighter than `/session-wrap` | `/pause-checkpoint` or before risky operations |
| [**pr-workflow**](plugins/claude-code-blueprint/skills/pr-workflow/) | End-to-end PR lifecycle — create, self-review, handle feedback | `/pr-workflow` or when creating pull requests |
| [**resolve-in-parallel**](plugins/claude-code-blueprint/skills/resolve-in-parallel/) | Batch-resolves independent items concurrently | 2+ independent items to fix |
| [**deployment-verification**](plugins/claude-code-blueprint/skills/deployment-verification/) | Go/no-go pre-deploy checklist across 8 areas | Before any production deployment |
| [**document-review**](plugins/claude-code-blueprint/skills/document-review/) | Structured three-pass critique (accuracy, clarity, completeness) | When reviewing specs, plans, or docs |
| [**changelog-generation**](plugins/claude-code-blueprint/skills/changelog-generation/) | Release notes from git history in Keep a Changelog format | `/changelog-generation` or preparing a release |
| [**migration-planning**](plugins/claude-code-blueprint/skills/migration-planning/) | Safe migration plans with rollback procedures | Database/API/dependency migrations |
| [**performance-profiling**](plugins/claude-code-blueprint/skills/performance-profiling/) | Profile-driven investigation — measure before optimizing | When something is "slow" |
| [**browser-testing**](plugins/claude-code-blueprint/skills/browser-testing/) | Verify UI changes via Playwright MCP browser tools | After UI changes need visual verification |
| [**autonomous-loop**](plugins/claude-code-blueprint/skills/autonomous-loop/) | Iterate through plan tasks with retry, backoff, circuit breaker (3 no-progress / 5 same-error), degradation detection (rising difficulty, hot-file signals), and mandatory Reflection Gate before every retry (3-question self-check enforced by HARD-GATE) | Autonomous plan execution — "just do it all" |
| [**iterative-refinement**](plugins/claude-code-blueprint/skills/iterative-refinement/) | Review→fix→review cycles with 3 convergence modes (fast/deep/perfect), early exit on convergence | `/ship-pipeline` Stage 5, `/build-pipeline --iterate N` |
| [**dependency-management**](plugins/claude-code-blueprint/skills/dependency-management/) | Evaluates, adds, upgrades, and removes dependencies with safety gates | Adding, upgrading, or auditing dependencies |

### Orchestration phase

| Skill | What it does | Trigger |
|-------|-------------|---------|
| [**wave-orchestration**](plugins/claude-code-blueprint/skills/wave-orchestration/) | Groups tasks by dependency into waves, parallel within waves, integration verification between | `/orchestrate` or plans with mixed dependencies |
| [**swarm-orchestration**](plugins/claude-code-blueprint/skills/swarm-orchestration/) | Coordinates multiple specialized agents analyzing the same input in parallel | `/review-swarm`, `/deep-research`, or custom swarms |
| [**agent-teams**](plugins/claude-code-blueprint/skills/agent-teams/) | Collaborative multi-file implementation with shared task list and messaging (experimental) | `/team-execution` or complex cross-layer features |
| [**knowledge-compounding**](plugins/claude-code-blueprint/skills/knowledge-compounding/) | Documents solved problems as searchable institutional knowledge in docs/solutions/ | `/knowledge-compounding` or after solving non-trivial problems |
| [**session-continuity**](plugins/claude-code-blueprint/skills/session-continuity/) | Manages STATE.md for execution tracking across session boundaries | `/pause-checkpoint`, `/resume-session`, or during wave orchestration |

### Meta

| Skill | What it does | Trigger |
|-------|-------------|---------|
| [**writing-skills**](plugins/claude-code-blueprint/skills/writing-skills/) | Creates and tests new skills using TDD for documentation | When creating new skills |

## Agents Reference

<p align="center">
  <img src="docs/images/agents-ecosystem.png" alt="Agent Ecosystem" width="90%">
</p>

Agents are specialized subprocesses dispatched via Claude's Task tool. Each agent gets a fresh 200K-token context window focused entirely on its domain.

| Agent | Domain | When to dispatch |
|-------|--------|-----------------|
| [**code-reviewer**](plugins/claude-code-blueprint/agents/code-reviewer.md) | Standards, correctness, plan compliance | After completing a major step or before merge |
| [**architecture-strategist**](plugins/claude-code-blueprint/agents/architecture-strategist.md) | Structural patterns, service boundaries | When reviewing PRs, adding services, refactoring |
| [**security-sentinel**](plugins/claude-code-blueprint/agents/security-sentinel.md) | OWASP, auth flows, vulnerability scanning | Before deployment, after auth/payment/API work |
| [**code-simplicity-reviewer**](plugins/claude-code-blueprint/agents/code-simplicity-reviewer.md) | YAGNI violations, over-engineering | After implementation is complete |
| [**performance-oracle**](plugins/claude-code-blueprint/agents/performance-oracle.md) | Bottlenecks, N+1 queries, algorithmic complexity | After features are built, on performance concerns |
| [**best-practices-researcher**](plugins/claude-code-blueprint/agents/best-practices-researcher.md) | Industry standards, library documentation | When needing external guidance |
| [**git-history-analyzer**](plugins/claude-code-blueprint/agents/git-history-analyzer.md) | Code evolution, pattern archaeology | When understanding why code is the way it is |
| [**learnings-researcher**](plugins/claude-code-blueprint/agents/learnings-researcher.md) | Past solutions, decisions, patterns | Before planning — searches docs/ for prior art |
| [**plan-checker**](plugins/claude-code-blueprint/agents/plan-checker.md) | Plan validation, gap detection | After writing a plan, before execution |
| [**integration-checker**](plugins/claude-code-blueprint/agents/integration-checker.md) | Component wiring, connection validation | After implementation — verifies components connect |
| [**bug-reproduction-validator**](plugins/claude-code-blueprint/agents/bug-reproduction-validator.md) | Bug reproduction, fix verification | When debugging — validates repro steps and fixes |
| [**codebase-mapper**](plugins/claude-code-blueprint/agents/codebase-mapper.md) | Architecture, conventions, stack analysis | Onboarding to unfamiliar code or before modifying it |
| [**pr-comment-resolver**](plugins/claude-code-blueprint/agents/pr-comment-resolver.md) | Targeted PR comment resolution | Processing review feedback — one comment per agent |
| [**test-gap-analyzer**](plugins/claude-code-blueprint/agents/test-gap-analyzer.md) | Coverage gaps, test generation | Improving coverage or before major refactors |
| [**research-synthesizer**](plugins/claude-code-blueprint/agents/research-synthesizer.md) | Multi-agent output consolidation | After parallel research — unifies findings |
| [**deployment-verifier**](plugins/claude-code-blueprint/agents/deployment-verifier.md) | Deployment readiness verification | Before deploying — checks 8 critical areas |
| [**schema-drift-detector**](plugins/claude-code-blueprint/agents/schema-drift-detector.md) | Unrelated schema/migration changes | Reviewing PRs — catches scope creep in data layer |
| [**frontend-reviewer**](plugins/claude-code-blueprint/agents/frontend-reviewer.md) | UI/UX code quality review | Reviewing frontend code — a11y, responsive, perf |
| [**convention-enforcer**](plugins/claude-code-blueprint/agents/convention-enforcer.md) | CONVENTIONS.md compliance checking | Reviewing code against project standards |
| [**data-integrity-guardian**](plugins/claude-code-blueprint/agents/data-integrity-guardian.md) | Migration safety, transactions, rollback plans | PRs with migrations, schema changes, data transforms |
| [**test-coverage-reviewer**](plugins/claude-code-blueprint/agents/test-coverage-reviewer.md) | Test quality, assertion meaningfulness, edge cases | After implementation — verifies tests actually validate behavior |
| [**framework-docs-researcher**](plugins/claude-code-blueprint/agents/framework-docs-researcher.md) | Current framework docs for installed versions | Before planning features that use specific framework APIs |
| [**codebase-context-mapper**](plugins/claude-code-blueprint/agents/codebase-context-mapper.md) | Focused impact map for a specific change | Before planning — maps files and dependencies a change will touch |
| [**integration-verifier**](plugins/claude-code-blueprint/agents/integration-verifier.md) | Cross-task integration verification | After wave completion — ensures parallel implementations work together |
| [**findings-synthesizer**](plugins/claude-code-blueprint/agents/findings-synthesizer.md) | Review swarm output consolidation | After `/review-swarm` — de-duplicates and prioritizes all findings |
| [**pattern-mapper**](plugins/claude-code-blueprint/agents/pattern-mapper.md) | Analog-file mapping for new code | Between research and execution — grounds new files in existing conventions |
| [**doc-claim-verifier**](plugins/claude-code-blueprint/agents/doc-claim-verifier.md) | Doc claims vs live codebase | Reviewing READMEs, ADRs, runbooks — catches doc drift after refactors |
| [**findings-validator**](plugins/claude-code-blueprint/agents/findings-validator.md) | Independent re-verification of review findings | Between `/review-swarm` and synthesis — suppresses false positives |
| [**team-lead**](plugins/claude-code-blueprint/agents/team-lead.md) | Dedicated orchestrator (200K fresh context) | Coordinates `/orchestrate` and `/team-execution` — delegates to workers, monitors progress, reviews, signs off |

### How agents work

Agents run in isolation with their own 200K context window. They can be dispatched individually or as coordinated swarms:

**Single dispatch** — one agent, one focused job:
```
Main Session → Task("security-sentinel: audit auth endpoints") → findings → act on results
```

**Swarm dispatch** — multiple agents, same input, different lenses:

<p align="center">
  <img src="docs/images/dispatch-swarm.png" alt="Swarm dispatch — 5 agents → findings-synthesizer → unified report" width="90%">
</p>

**Wave dispatch** — parallel within waves, worktree-isolated, sequential between:

<p align="center">
  <img src="docs/images/dispatch-wave.png" alt="Wave dispatch — parallel within waves, integration-verifier between" width="90%">
</p>

**Agent team dispatch** — collaborative instances with shared task list:

<p align="center">
  <img src="docs/images/dispatch-team.png" alt="Agent team dispatch — teammates with file ownership, shared tasks + messaging" width="90%">
</p>

## Slash Commands

Skills are invoked as slash commands. Each skill's content loads directly — no indirection.

| Skill | What it does |
|-------|-------------|
| **`/project-start`** | Interactive project setup. Fills in CONVENTIONS.md, GOALS.md, STATUS.md through a guided conversation. |
| **`/ideation`** | Generate and rank improvement ideas. Scans codebase, backlog, and git history to surface what's worth building. |
| **`/brainstorming`** | Brainstorming session. Explores design options, presents tradeoffs, gets approval, then creates implementation plan. |
| **`/build-pipeline`** | Full-cycle supervised pipeline with checkpoints between every stage. Supports `--iterate N` for iterative review and `--team` for team-lead dispatch. |
| **`/ship-pipeline`** | Fully autonomous pipeline — zero checkpoints, fire-and-forget. Plans, executes via team-lead, iteratively reviews (3 cycles), and opens a PR. |
| **`/discuss`** | Capture decisions before planning. Explores requirements, locks decisions that planners must honor. |
| **`/deepen-plan`** | Enrich an existing plan with parallel research agents. Dispatches all configured researchers in parallel, then merges findings into the plan. |
| **`/requesting-code-review`** | Dispatches code-reviewer agent against your current changes. |
| **`/review-swarm`** | Multi-agent parallel review — dispatches 6-10 specialized reviewers, synthesizes findings into prioritized P1/P2/P3 report. |
| **`/deep-research`** | Multi-agent parallel research — spawns 5 research agents, synthesizes into unified brief for planning. |
| **`/knowledge-compounding`** | Document a solved problem for future reference. Creates searchable entry in docs/solutions/. |
| **`/orchestrate`** | Wave-based parallel execution — groups plan tasks by dependency, runs independent tasks in parallel per wave. Supports `--iterations N` and `--convergence fast\|deep\|perfect` for iterative review. |
| **`/team-execution`** | Spawn an Agent Team for collaborative multi-file implementation with shared task list and messaging (experimental). Supports `--iterations N` and `--convergence fast\|deep\|perfect` for iterative review. |
| **`/project-status`** | Shows current project state, goal alignment, blockers, and suggests next actions. |
| **`/systematic-debugging [issue]`** | Root cause investigation. Gathers evidence, forms hypotheses, tests them systematically. |
| **`/backlog-triage`** | Triages inbox items in BACKLOG.md into prioritized tasks using GOALS.md context. |
| **`/session-wrap`** | End-of-session documentation. Updates CLAUDE.md session continuity, STATUS.md, and captures learnings. Distinguishes planning-only vs implementation sessions — won't mark goals as done if only a plan was written. |
| **`/pr-workflow`** | Create, manage, or respond to pull requests. Full PR lifecycle. |
| **`/codebase-mapping`** | Map an unfamiliar codebase into structured documentation before modifying it. |
| **`/resume-session`** | Resume work from where the last session left off. Loads context and orients you. |
| **`/pause-checkpoint`** | Quick mid-session checkpoint. Captures state without full `/session-wrap`. |
| **`/quick-fix`** | Fast-track a small, well-understood change with TDD and verification gates. |
| **`/changelog-generation`** | Generate release notes from git history using Keep a Changelog format. |
| **`/add-tests`** | Analyze test coverage gaps and generate tests for untested code paths. |
| **`/health-check`** | Comprehensive project health check — build, tests, lint, deps, conventions, docs, backlog, git. |
| **`/migrate-to-plugin`** | Migrate v2.x in-project files to v3.0 plugin mode. Removes engine files, keeps project state. |
| **`/plugin-update`** | Update the blueprint plugin to the latest version from GitHub. Self-service — no reinstall needed. |

### Typical session flow

**Supervised (human in the loop):**
```bash
claude
> /resume-session                           # Reload context from last session
> /ideation                                 # "What's worth building?" — AI generates ranked ideas
> /deep-research add OAuth2 login           # Research the chosen idea (5 agents in parallel)
> /brainstorming add OAuth2 login           # Design + plan based on research findings
> /orchestrate                              # Execute with wave-based parallelism
>   # OR: /team-execution                   # Execute with collaborative Agent Team
> /review-swarm                             # Multi-agent review (6-10 reviewers in parallel)
> /knowledge-compounding OAuth2 sessions    # Document the solution for future reference
> /session-wrap                             # Document everything for next session
```

**Autonomous (fire and forget):**
```bash
# Inside Claude — single session
claude
> /ship-pipeline add OAuth2 login with JWT refresh tokens --iterations 5

# From terminal — with context-exhaustion recovery
./scripts/ship.sh "add OAuth2 login with JWT refresh tokens" --max 10 --swarm
```

## Customization

### Adapting to your project

After installation, run `/project-start` to configure:

- **GOALS.md** — Your 3-5 project objectives and priority framework
- **CONVENTIONS.md** — Your tech stack, naming conventions, file structure patterns
- **STATUS.md** — Current project state, known issues, recent work

### Adding your own skills

In plugin mode, skills are provided by the plugin. To add project-specific skills, create them in your project's `.claude/skills/your-skill-name/SKILL.md` (local overrides take precedence). The plugin includes a `writing-skills` skill that uses TDD to create and test new skills:

```bash
claude
> Create a new skill for database migration workflows
# Claude will use the writing-skills skill to:
# 1. Write a failing test scenario
# 2. Create the skill
# 3. Verify it handles the test scenario correctly
```

### Adding your own agents

In plugin mode, agents are provided by the plugin. To add project-specific agents, create them in your project's `.claude/agents/your-agent-name.md`. Create a markdown file with YAML frontmatter and a system prompt:

```markdown
---
name: your-agent-name
description: "When to use this agent. Be specific so Claude knows when to delegate."
model: inherit
effort: medium
tools: [Read, Glob, Grep, Bash]
---

You are a [role] specializing in [domain].

## Process
1. [Step-by-step instructions]

## Output Format
[How findings should be structured]

## Rules
- [Operational guardrails]
```

**Key frontmatter fields:**

| Field | Purpose | Example |
|-------|---------|---------|
| `tools` | Restrict which tools the agent can use (principle of least privilege) | `[Read, Glob, Grep, Bash]` for read-only; add `Edit, Write` for agents that modify code |
| `model` | Override the model (`sonnet`, `opus`, `fable`, `haiku`, or `inherit`) | `inherit` to use the session's model |
| `effort` | Reasoning-depth tier — `low`, `medium`, or `high`. Every bundled agent sets one (see Effort tiers below) | `high` for reviewers/oracles, `low` for mechanical validators |
| `isolation` | Set to `worktree` for agents that modify files in parallel | Used by `pr-comment-resolver` |
| `maxTurns` | Limit agentic turns to prevent runaway token consumption | `20` for focused tasks |

### Effort tiers & opt-in model mapping

Every bundled agent now carries an `effort:` tier in its frontmatter — `low`, `medium`, or `high` — chosen from the depth of reasoning its job demands (all 29 agents set exactly one):

<p align="center">
  <img src="docs/images/effort-tiers.png" alt="Effort tiers — 2 low, 14 medium, 13 high across 29 agents; model: inherit stays default with an opt-in per-tier model mapping" width="90%">
</p>

| Tier | Assigned to | Examples |
|------|-------------|----------|
| `high` | Reviewers, synthesizers, oracles, and the orchestrator — deep reasoning, cross-checking, adversarial review | `code-reviewer`, `security-sentinel`, `findings-synthesizer`, `team-lead` |
| `medium` | Standard workers and researchers — implementers, verifiers, doc and research gathering | `pr-comment-resolver`, `best-practices-researcher`, `integration-checker` |
| `low` | Mechanical validators — rule-matching or existence checks against a known source | `convention-enforcer`, `doc-claim-verifier` |

`effort:` is a plain frontmatter scalar. CLIs that don't recognize the key ignore it harmlessly, so the tiers are safe to ship in a portable template.

The shipped default stays `model: inherit` on every agent, so agents ride whatever model your session runs and the template assumes nothing about your plan tier. If your plan supports per-model selection, you *may* opt in by adding a `model:` line per agent in your project's `.claude/agents/` copies, mapping tiers to models:

| Effort tier | Suggested opt-in model |
|-------------|------------------------|
| `low` | Haiku 4.5 |
| `medium` | Sonnet 5 |
| `high` | Opus 5.5 / Fable 5.1 |

This mapping is documentation, not shipped configuration — leaving `model: inherit` in place is the supported default.

Effort tiers are honored on every model from CLI 2.1.267. Earlier CLIs silently ignored per-agent `effort:` whenever the session ran Opus 4.7, Opus 4.8, or Fable 5 — which affects `model: inherit` agents on those sessions, so a CLI upgrade, not a model pin, is what restores the tiers. The `maxEffortLevel` setting caps every tier from above. To give subagents a different default model without editing agent files, set `CLAUDE_CODE_SUBAGENT_MODEL`; an agent's own `model:` line and a per-spawn model still take precedence over it, and `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` overrides all of them.

#### Session model and effort: your choice

The blueprint never picks a model or an effort level for you, in Claude Code or in any other tool. Agents set a tier in frontmatter, which overrides the session level (still capped by `maxEffortLevel`), so all 29 agents run at their tier whatever the session uses. Skills set no `effort:`, so a main-session pipeline (`/ship-pipeline`, `/build-pipeline`, `/lfg`-style runs) reasons at whatever level your session runs. A skill-level `effort:` would override a higher level you chose, which is why skills don't carry one.

Opus 5.5 is the default model on every plan from CLI 2.1.280, and it **starts sessions at `medium` effort** (other current models start at `high`). An `effortLevel` saved in user settings before per-model `/effort` does not carry over to Opus 5.5. From 2.1.280, Opus 4.7, Opus 4.8, and Fable 5 no longer hold their launch default over the level set by settings, `--settings`, or `-p`. Some reference points:

| Session setting | Fits |
|-----------------|------|
| Opus 5.5 at `high` | A solid default for pipeline runs |
| Opus 5.5 at `xhigh`, or Fable 5.1 at `high` | More careful on hard or high-stakes work; slower and costlier |
| Opus 5.5 at `medium` (its starting level) or lower | Fine for small tasks, quick fixes, and questions |

Set them in a session with `/model` and `/effort`, or at launch with `claude --model <model> --effort <level>`. `scripts/ship.sh` passes no `--model` or `--effort` of its own, so its runs use your saved defaults.

### Platform currency (2026-07 sync, refreshed 2026-09)

The blueprint tracks new Claude Code platform features and adopts them as **opt-ins** — no core pipeline is allowed to depend on a gated or experimental capability (a deliberate stability guardrail). Where a native feature overlaps something the template already does, the table records why the template's own mechanism stays the default.

<p align="center">
  <img src="docs/images/platform-currency.png" alt="Native platform features adopted as guarded opt-ins — effort tiers and Claude 5 shipped, /goal and /loop and caps opt-in, Workflow tool and fast mode gated" width="90%">
</p>

| Platform feature | Blueprint's stance | Gating |
|------------------|--------------------|--------|
| **Effort tiers** (`effort: low/medium/high`) | Shipped on every bundled agent (see "Effort tiers & opt-in model mapping" above) | None — an unrecognized key is ignored by older CLIs |
| **`/goal`** (condition-based completion) | Opt-in complement to the ship loop's Stop-hook guard | None; generally available in the CLI |
| **Native `/loop` + ScheduleWakeup** | Add interval/scheduled reruns, but `/loop` is session-scoped and does **not** reset context, circuit-break, or detect degradation — so `autonomous-loop` keeps its own circuit breaker and degradation detection | None; complementary, not a replacement |
| **Workflow tool / `/workflows` / ultracode** | Opt-in for very large autonomous fan-outs — default size guideline `medium` (under 10 agents; Pro defaults to `small`, under 5), 16 concurrent agents by default (adjustable 1–256 via `CLAUDE_CODE_WORKFLOW_MAX_CONCURRENT_AGENTS`) and 1,000 per run, runs pause and resume across a usage-limit reset in interactive subscription sessions (not `-p`), no mid-run user input; wave orchestration stays the ungated, portable default | Available on all paid plans, the API, and Bedrock/Vertex/Foundry (Pro enables it in `/config`); runs in `claude -p`/SDK only behind a `Workflow` allow rule, auto or bypass mode, or a PreToolUse hook; disable-able per user (`disableWorkflows` / `CLAUDE_CODE_DISABLE_WORKFLOWS=1`) and org-wide |
| **Fast mode** | Opt-in only | Gated: Opus 5.5 (the default), Opus 5, and Opus 4.8 only; research preview, pricing subject to change |
| **Claude 5 lineup** (Opus 5.5, Opus 5, Sonnet 5, Fable 5.1, Haiku 4.5) | Every agent ships `model: inherit`, so agents ride the session model automatically — no per-agent pins. Opus 5.5 (`claude-opus-5-5`, CLI 2.1.280+) is the default on every plan, Pro and Team Standard included, and starts sessions at `medium` effort (see "Session model and effort" above); Fable 5.1 answers to the `fable` alias | None; opt-in model mapping documented above |
| **Per-session caps** | Large swarms and research sweeps stay within the native limits — there is no per-session subagent total since CLI 2.1.224, only a concurrency cap and a nesting depth (ultracode sessions are exempt from the concurrency cap) | 20 concurrent subagents by default (`CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`), nested spawns to depth 3 (`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`), 200 WebSearches per session unchanged |
| **Native injection hardening** (Agent tool, CLI v2.1.210) | Reinforces — does not replace — the template's custom read/prompt scanners and `<<DATA_START>>`/`<<DATA_END>>` markers, which still cover the main-session Write/Edit and Read surfaces native hardening does not observe | None; defense-in-depth |
| **Bundled `/deep-research` workflow** | Claude Code bundles a web-search fan-out workflow of that name (manual-invoke only); the blueprint's `deep-research` skill is the five-agent research swarm. When the slash menu shows both, `/claude-code-blueprint:deep-research` is the swarm | None; custom skills override bundled skills of the same name — precedence over the bundled workflow is unverified |

### Adjusting quality gates

Quality gates are encoded in the skill files. To relax a gate (e.g., skip code review for docs-only changes), edit the corresponding skill's `SKILL.md` and add your exception criteria.

### Install options

```bash
# Plugin mode (default) — installs plugin for all projects
./install.sh

# Plugin + scaffold a specific project
./install.sh /path/to/project

# Scaffold only (plugin already installed)
./install.sh --scaffold /path/to/project

# Legacy mode — copy all files into project (v2.x behavior)
./install.sh --legacy /path/to/project

# Preview what would be installed
./install.sh --dry-run
```

## Documentation structure

The template includes **example docs** in each category so you can see the expected format immediately. Delete them when you start your project (they're clearly marked as examples).

| Example file | Shows you how to write |
|-------------|----------------------|
| `docs/decisions/001-example-project-structure.md` | Architecture Decision Records |
| `docs/plans/2026-03-04-example-user-auth.md` | Implementation plans with bite-sized tasks |
| `docs/specs/example-csv-export.md` | Feature specifications with acceptance criteria |
| `docs/research/example-jwt-refresh-strategies.md` | Research docs with findings and recommendations |

The `docs/` directory uses four categories, each with its own lifecycle:

| Directory | Contains | Lifecycle |
|-----------|----------|-----------|
| `docs/context/` | GOALS.md, STATUS.md, CONVENTIONS.md | Updated every session |
| `docs/plans/` | `YYYY-MM-DD-topic.md` implementation plans | Created per feature, archived when done |
| `docs/specs/` | `feature-name.md` specifications | Created before building, stable after approval |
| `docs/decisions/` | `NNN-kebab-case-title.md` ADRs | Created when choosing between options, permanent |
| `docs/research/` | Spike results, tool evaluations | Created during exploration, referenced later |
| `docs/solutions/` | Solved problems, institutional knowledge | Created by `/knowledge-compounding`, searched by `/brainstorming` and `/deep-research` |

## How it works under the hood

### Context loading order

When Claude starts a session, it loads context in this order:

1. **CLAUDE.md** — Behavioral rules, session continuity, agent team hierarchy, skill/agent dispatch tables
2. **docs/context/STATUS.md** — What happened recently, what's in flight
3. **docs/context/STATE.md** — Execution state for resuming in-progress work (wave progress, task completion)
4. **docs/context/GOALS.md** — What we're trying to achieve
5. **docs/context/CONVENTIONS.md** — How we write code here
6. **BACKLOG.md** — What's waiting to be done
7. **docs/solutions/** — Institutional knowledge searched before planning
8. **blueprint.local.md** — Per-project agent configuration
9. **Skills** — Activated contextually based on what's happening
10. **Agents** — Dispatched on-demand for focused analysis (individually or as swarms)

### Context window management

Large features can exhaust Claude's context window. The template has layered defenses:

| Layer | Mechanism | What it does |
|-------|-----------|-------------|
| **Prevention** | Subagent isolation | Each agent gets fresh 200K context; main session only sees results |
| **Detection** | `context-monitor.js` (PostToolUse hook) | Warns at 150 tool calls, escalates at 200, detects analysis paralysis at 8+ consecutive reads |
| **Inner guard** | `ship-loop.sh` (Stop hook) | Blocks premature exit within a session — re-injects the prompt (max 5 retries) |
| **Outer loop** | `scripts/ship.sh` (bash) | Spawns fresh Claude process per iteration — true context reset (max 10, configurable) |
| **Circuit breakers** | `autonomous-loop` skill | Stops after 3 no-progress iterations or 5 identical errors. Degradation detection catches rising difficulty and hot-file churn before hard stalls. Mandatory Reflection Gate before every retry forces agents to verbalize what failed and confirm a different approach |

The inner guard and outer loop solve different problems: the Stop hook catches Claude quitting early (same session, growing context), while the external bash loop handles genuine context exhaustion (fresh 200K per iteration, state persists via git).

To trim what loads in the first place, run `/skill-doctor` (CLI 2.1.261+) — it reports which loaded skills go unused and what each costs in context.

### Session continuity

The `Session Continuity` section in CLAUDE.md acts as a handoff note between sessions:

```markdown
## Session Continuity

**Last session:** 2026-03-04

**What was done:**
- Implemented JWT refresh token rotation
- Added rate limiting middleware
- Fixed Safari redirect loop (root cause: SameSite cookie attribute)

**What's remaining:**
- Integration tests for token refresh edge cases
- Load testing the rate limiter

**Start here:** Run the failing integration tests in tests/auth/refresh.test.ts

**Current state of the code:**
- Build: passing
- Tests: 2 failing (expected — the ones we need to write)
- Uncommitted changes: none
```

This is updated automatically by `/session-wrap` at the end of each session.

## Error recovery

CLAUDE.md includes built-in guidance for common failure scenarios:

| Situation | Recovery |
|-----------|----------|
| Test fails after code change | Don't iterate blindly — use `systematic-debugging` skill |
| Merge conflict | Read both sides, understand intent, then resolve |
| Broken build after dep update | Pin previous version, BACKLOG the upgrade |
| Corrupted worktree | Create fresh from main, cherry-pick completed commits |
| Agent returns bad results | Verify findings manually before acting |
| Lost uncommitted changes | Check `git stash list`, `git reflog`, `git fsck --lost-found` |

## FAQ

<details>
<summary><strong>Can I use this with an existing project?</strong></summary>

Yes. In plugin mode (default), the blueprint installs as a plugin — it adds zero files to your project. Run `/plugin marketplace add Ninety2UA/claude-code-blueprint` then `/plugin install claude-code-blueprint`, then `/project-start` in your project to scaffold the docs structure. Your existing code is never touched.
</details>

<details>
<summary><strong>Do I need all the skills?</strong></summary>

No. Skills activate contextually. If you never do TDD, the test-driven-development skill won't activate. You can also delete any skill directory you don't want. The template works with any subset.
</details>

<details>
<summary><strong>How do agents differ from skills?</strong></summary>

**Skills** are instructions for the main Claude session — they guide Claude's behavior during your conversation. **Agents** are separate subprocesses dispatched via the Task tool, each with their own 200K context window. Use agents for focused analysis that benefits from isolation (security audits, deep code reviews).
</details>

<details>
<summary><strong>Will this slow down Claude?</strong></summary>

CLAUDE.md adds minimal context. Skills and agents are loaded on-demand, not upfront. The template is designed to be lightweight — most of the intelligence is in the skill files which are only read when triggered.
</details>

<details>
<summary><strong>Can I use this with Claude Code in my IDE?</strong></summary>

Yes. The template works identically in VS Code, JetBrains, and the CLI. Slash commands, skills, and agents are all available in every environment.
</details>

<details>
<summary><strong>How do I update the blueprint?</strong></summary>

**Plugin mode (v3.0+):** Run `claude plugin update claude-code-blueprint@claude-code-blueprint` (or `/plugin install claude-code-blueprint@claude-code-blueprint` again) — it updates the cached plugin for all projects; then run `/reload-plugins` (or restart).

**Legacy mode (v2.x):** Use `--legacy` with `--force` to refresh in-project files.

Your project-specific files (CLAUDE.md, docs/, BACKLOG.md) are never touched.
</details>

<details>
<summary><strong>What are the example docs? Should I keep them?</strong></summary>

The template includes example files in `docs/decisions/`, `docs/plans/`, `docs/specs/`, and `docs/research/` showing the expected format for each document type. They're clearly marked as examples. Delete them when you start your own project — they're there to help you understand the structure.
</details>

<details>
<summary><strong>Do small bug fixes need the full brainstorm/plan flow?</strong></summary>

No. The template includes a **lightweight workflow** for small, well-understood changes (< 3 files, obvious root cause). Write a failing test, fix it, verify, commit. See the "Lightweight Workflow" section in CLAUDE.md for the full criteria.
</details>

<details>
<summary><strong>What are agent swarms and when should I use them?</strong></summary>

Agent swarms dispatch multiple specialized agents in parallel on the same input. `/review-swarm` runs 6-10 reviewers simultaneously (security, performance, code quality, etc.) and merges their findings. `/deep-research` runs 5 research agents in parallel before planning. Use swarms for significant changes — they consume more tokens but catch issues a single reviewer would miss. For small changes (< 50 lines), a single `/requesting-code-review` is usually sufficient.
</details>

<details>
<summary><strong>What is wave orchestration?</strong></summary>

Wave orchestration (`/orchestrate`) groups plan tasks by dependency. Independent tasks run in parallel within each "wave," while dependent tasks wait for their prerequisites. An integration-verifier checks that parallel implementations work together between waves. It's the sweet spot between fully sequential execution and fully parallel — maximizing speed without breaking dependency order.
</details>

<details>
<summary><strong>What is knowledge compounding?</strong></summary>

After solving a non-trivial problem, `/knowledge-compounding` saves it as a structured document in `docs/solutions/`. Future `/brainstorming` and `/deep-research` skills automatically search this directory before starting new work. Over time, your project builds institutional knowledge that prevents repeated mistakes and informs better plans.
</details>

<details>
<summary><strong>What are Agent Teams and how do they differ from swarms?</strong></summary>

Agent Teams (`/team-execution`) spawn fully independent Claude Code instances that collaborate through a shared task list and messaging. Unlike swarms (which are read-only subagents reporting analysis back to a controller), Agent Teams are peers that can discuss design decisions, divide file ownership, and coordinate in real time. Use swarms for parallel analysis (review, research) and Agent Teams for collaborative implementation. Agent Teams is an experimental feature — enable with `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1"` in settings.json.
</details>

<details>
<summary><strong>What is /ship-pipeline and when should I use it?</strong></summary>

`/ship-pipeline` is the fully autonomous development pipeline — zero checkpoints, fire-and-forget. It plans, researches, executes via a dedicated team-lead agent, iteratively reviews (3 cycles by default), and opens a PR. Use it for well-defined features where you don't need to approve each stage. For large features that may exhaust context, use `scripts/ship.sh` from your terminal — it spawns a fresh Claude process per iteration so each run gets a clean 200K context window. State persists through git commits and plan files.
</details>

<details>
<summary><strong>How does context exhaustion recovery work?</strong></summary>

Two mechanisms work at different layers. **Inside** a session, the `ship-loop.sh` Stop hook blocks premature exit — if Claude tries to stop before `<promise>DONE</promise>` is output, the hook re-injects the prompt (max 5 retries, same context). **Outside** a session, `scripts/ship.sh` is a bash loop that spawns fresh Claude processes — each iteration gets a clean 200K context window, and state persists via git. The external loop is inspired by [Ralph](https://github.com/snarktank/ralph)'s approach to long-running agent loops.
</details>

<details>
<summary><strong>How do I configure which agents run for my project?</strong></summary>

Edit `blueprint.local.md` (gitignored, so each developer can customize). It has YAML frontmatter listing which review and research agents to dispatch. Comment out agents that aren't relevant to your stack — no point running a frontend-reviewer on a CLI tool.
</details>

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

If you've built a useful skill or agent, consider submitting it for inclusion in the template.

## License

MIT License. See [LICENSE](LICENSE) for details.

---

<p align="center">
  <sub>Built for use with <a href="https://claude.ai/claude-code">Claude Code</a> by Anthropic</sub>
</p>
