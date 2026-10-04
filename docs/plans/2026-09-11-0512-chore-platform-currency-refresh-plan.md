---
title: Platform Currency Refresh v3.6.0 - Plan
type: chore
date: 2026-09-11
topic: platform-currency-refresh-2026-09
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# Platform Currency Refresh v3.6.0 - Plan

## Goal Capsule

- **Objective:** A developer who installs the blueprint on Claude Code 2.1.268 gets skills and docs whose platform claims are true today: task tracking works on current models, subagent limits and model names are accurate, native alternatives are described as they actually behave, and the plugin updates with one native command.
- **Means:** Text and configuration edits only, released as v3.6.0 (KTD3, KTD10).
- **Authority hierarchy:** This plan's Product Contract governs scope. The five session-settled decisions in Key Decisions and Key Technical Decisions are fixed; report a conflict rather than overriding one. Everything else is the executor's call within the requirements.
- **Execution profile:** Eight units. U1, U2, U4, U5, and U7 are independent; U3 precedes U6 (U6 owns the two diagrams' alt-text lines after U3's README pass); U8 (release surfaces) runs last because its What's New copy summarizes U1–U7. No unit needs a human answer.
- **Stop conditions:** Stop and report when a gate in the Verification Contract cannot be made green without touching a frozen surface (KTD3), or when evidence shows a settled decision cannot work. A diagram re-render that fails twice is not a stop: apply KTD4's fallback, record the deferral in U6's commit message and in the final handoff so the caller can carry it into the PR body, and continue.
- **Tail ownership:** The executor commits per unit on a `feat/v3.6.0-platform-currency` branch; the calling pipeline owns push, PR, and CI watch.
- **Open blockers:** None.

---

## Product Contract

### Summary

Bring the plugin's platform claims back to Claude Code 2.1.268 (from 2.1.212): replace the removed TodoWrite tool with a plan-scoped progress file, refresh subagent limits and the Claude 5 lineup in skills and docs, refresh the dynamic-workflow and `/goal` notes, make plugin-update native-first, add a manifest-validation CI job, record the cycle's verdicts, and ship it as v3.6.0.

### Problem Frame

The 2026-09-11 `/cli-watch` audit found 47 CLI releases since the last sync. Four findings make current text wrong for users on the default models: TodoWrite and the Task tools no longer exist on Opus 4.8, Sonnet 5, Fable 5 and newer (2.1.233, 2.1.268), yet three skills (four files) instruct "Create TodoWrite"; the 200-subagent session cap the skills cite was removed (2.1.224) and replaced by a concurrency cap and a nesting depth; the model lineup gained Opus 5 (2.1.219) and Fable 5.1 (2.1.257) and the docs still map `high` to "Opus 4.8 / Fable 5"; and the dynamic-workflow note describes gating that has since changed. Smaller facts also drifted: `/goal` gained check-in behavior, plugin management gained a native update command, and the CLI gained a manifest validator the CI does not use. The July decision records (docs/learnings/2026-07-17-*.md) stand; this release refreshes facts, it does not rebuild anything.

### Key Decisions

- **Every agent stays `model: inherit`; the lineup change is documentation only.** Governs R10, R11. (session-settled: user-approved — chosen over per-agent model pins mapped by effort tier: inherit rides the session model and assumes nothing about the user's plan tier.)
- **Historical What's New text and July decision records are frozen.** Governs R13, R19. Release notes are history; only current-state surfaces are refreshed (KTD3).
- **No new skill, agent, or hook.** Governs R17. The counts 55/29/10 stay, so no promo re-render and no count cascade.

### Requirements

**Task tracking (TodoWrite removal)**

- R1. `executing-plans`, `subagent-driven-development`, and `writing-skills` (SKILL.md and `persuasion-principles.md`) instruct progress tracking in a plan-scoped checklist file named per KTD1, with the session's native task list as the alternative when the model offers one; no instruction names TodoWrite as the mechanism.
- R2. The checklist file's lifecycle is stated at every place that creates it: first line names the plan; one checkbox per task; if the file already exists, reuse it and its ticks instead of recreating it; at creation, guard git hygiene with `git check-ignore -q` and, when that fails, append the pattern to the repo's local exclude file (`git rev-parse --git-path info/exclude`); deleted when the run's final review is clean (SDD: after the final reviewer approves; executing-plans: at its last step, before `finishing-a-development-branch`); an interrupted run leaves it in place and the `STATE.md` handoff points at it.
- R3. Scaffolded projects ignore the checklist file in git (`templates/.gitignore`).

**Platform facts in skills**

- R4. `deep-research`, `review-swarm`, and `wave-orchestration` state the current limits: no per-session subagent total (removed 2.1.224); 20 concurrent subagents by default (`CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`, 2.1.217); nested spawns to depth 3 by default (`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`, 2.1.219); 200 WebSearches per session unchanged.
- R5. `orchestrate`'s "native workflow" note states the facts that decide waves versus workflows: available on all paid plans, the API, and Bedrock/Vertex/Foundry, with Pro enabling it in `/config`; runs in `claude -p` and the Agent SDK when a `Workflow` allow rule, auto or bypass mode, or a PreToolUse hook approves it; disable-able per user (`disableWorkflows`, `CLAUDE_CODE_DISABLE_WORKFLOWS=1`) and org-wide; default size guideline `medium` (<15 agents); runtime caps of 16 concurrent agents and 1,000 per run; no mid-run user input. Wave orchestration remains the ungated default (KTD8).
- R6. `deep-research` carries a note that Claude Code bundles a `/deep-research` workflow (web-search fan-out, manual-invoke only); the blueprint's skill is the five-agent research swarm; when the slash menu shows both, the namespaced entry `/claude-code-blueprint:deep-research` is the swarm; custom skills override bundled skills of the same name, so a legacy copied `deep-research` skill is expected to take precedence, while precedence over the bundled workflow is unverified. No rename (KTD11).
- R7. `ship-pipeline`'s `/goal` block keeps its opt-in posture and adds: the goal clears itself on an unrecoverable error; idle sessions check in on 30+ minute background work at 30 m, 1 h, then 2 h, at most three times per goal, with `CLAUDE_CODE_GOAL_CHECKIN_MINUTES=0` opting out (noted beside the copyable block so it does not conflict with the pipeline's no-questions rule); `--resume` restores an active goal; `claude -p "/goal …"` is a documented headless goal loop but still not skill-invocable, so `ship-loop.sh` remains the guarantee (KTD7).
- R8. `agent-teams` states that teammates run on the leader's model unless the spawn names one (2.1.234), a teammate's final answer arrives in its idle notification (2.1.251), and `ListAgents` lists live teammates (2.1.239).

**Documentation (README, CLAUDE.md, site)**

- R9. README's agent-frontmatter table lists `fable` among the `model` values.
- R10. README's "Effort tiers & opt-in model mapping" maps `high` to Opus 5 / Fable 5.1 and gains a short paragraph: tiers are honored on every model from CLI 2.1.267 (earlier CLIs ignored per-agent `effort:` whenever the session ran Opus 4.7, Opus 4.8, or Fable 5, which affects `model: inherit` agents on those sessions); `maxEffortLevel` caps them; `CLAUDE_CODE_SUBAGENT_MODEL` sets a default subagent model without editing agent files, with agent `model:` and per-spawn model taking precedence and `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` overriding all.
- R11. README's "Platform currency" table rows read: Workflow tool per R5 facts; Fast mode = Opus 5 and Opus 4.8 only (research preview); Claude 5 lineup = Opus 5 default on Max / Team Premium / Enterprise / API, Sonnet 5 default on Pro / Team Standard, Fable 5.1 as the `fable` alias, every agent `model: inherit`; Per-session caps per R4; plus a new row for the bundled `/deep-research` collision (R6). The section heading marks the 2026-09 refresh.
- R12. CLAUDE.md's effort paragraph carries the same mapping as R10, and its Session Continuity block reflects the v3.6.0 state (it is a release behind today).
- R13. README's "Update to latest version" block, the matching site copy, the `plugin-update` skill's report, and README's context-window section are consistent: native update command first, `/reload-plugins` (or restart) instead of "restart your session", and one sentence pointing at `/skill-doctor` (2.1.261) for unused-skill context cost. Frozen history (README v3.4.0 bullets, site v3.4.0 cards, July learnings) is untouched.

**Tooling and CI**

- R14. `plugin-update` runs a native-first Step 0: detect a legacy install (no `installed_plugins.json` entry for `claude-code-blueprint@claude-code-blueprint`) and redirect it to `install.sh --legacy --force`; otherwise resolve one registry entry (its `scope`, and `projectPath` when project-scoped), refresh the marketplace catalog, run `claude plugin update claude-code-blueprint@claude-code-blueprint --scope <scope> --json`, then compare the version in that entry's cached `<installPath>/.claude-plugin/plugin.json` against the remote `plugin.json` on `main`; on match skip the manual steps, on any failure, ambiguity, or mismatch fall through to the existing manual Steps 2–5 unchanged. Every existing manual step stays.
- R15. CI gains a job that installs the Claude Code CLI and runs `claude plugin validate --strict --json` on the plugin directory and the marketplace root (KTD2).
- R16. `scripts/check-drift.sh` also verifies that the README navigation "What's New" anchor equals the slug of the first `### What's New in v…` heading, negative-tested (KTD12).

**Release**

- R17. Version 3.6.0 in `plugin.json`, `install.sh`, the site hero badge, and the site's first What's New badge; counts stay 55/29/10.
- R18. A v3.6.0 What's New block leads the site section and a `### What's New in v3.6.0 — Platform Currency Refresh` section leads the README list, with the nav anchor updated; the two rendered diagrams whose labels change (effort tiers, platform currency) are re-rendered from their source (KTD4).
- R19. A decision record `docs/learnings/2026-09-11-cli-watch-cycle-verdicts.md` in the July records' shape captures the probes and supersede verdicts so future cycles do not re-litigate them.

### Scope Boundaries

- Not in scope: any rebuild of `ship-loop.sh`, `ship.sh`, wave orchestration, or the injection scanners; a plugin-bundled workflow; the `/claude-api prompt-audit` sweep; renaming `deep-research`; changing hooks or hook handlers; touching frozen release notes or July learnings; the repo-watch imports (a separate v3.7.0 release).

#### Deferred to Follow-Up Work

- Namespacing the ~24 other bare `/deep-research` mentions (session-start banner, agent-teams instruction, README prose) once slash-menu precedence between a bundled workflow and a plugin skill is verified in a live install.
- Reconciling structural skill-linting (deferred in July) with the new validate job.
- Agent Teams "experimental" wording appears in five places; unchanged this release because the flag still gates the feature.

### Success Criteria

- A grep of the plugin, README, CLAUDE.md, and index.html for `TodoWrite`, `200 subagents`, `Opus 4.8 / Fable 5`, `25+ independent`, and (case-insensitively) `restart your session` returns hits only inside frozen history sections, and a positive grep finds the replacement facts (`CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`, `Opus 5 / Fable 5.1`, `progress.local.md`, `plugin validate --strict`) where the requirements place them.
- Every gate in the Verification Contract is green on the branch, including the new validate job and the new anchor check.

### Sources

- `/cli-watch` report: `/Users/dbenger/projects/claude-eng/.claude/cli-watch/reports/2026-09-11-cli-report.md` (maintainer workspace root, two levels above this repo, deliberately not committed; probes, per-version classification, supersede verdicts).
- Official changelog entries cited by version above; docs pages `workflows`, `model-config`, `goal`, `sub-agents`, `glossary` on code.claude.com (fetched 2026-09-11).
- July records: `docs/learnings/2026-07-17-goal-vs-ship-loop-rebuild.md`, `docs/learnings/2026-07-17-rebuild-verdicts.md`.
- Drift gate anchors: `scripts/check-drift.sh` (hero badge regex, first `new__badge` after `id="whats-new"`, `^VERSION=` in install.sh, one-line count triples in index.html).

---

## Planning Contract

### Key Technical Decisions

- KTD1. **Progress file is `.claude/plans/<plan-basename>.progress.local.md`, ignored via `templates/.gitignore`.** The `.local.md` suffix matches the template's existing ignored state files (`ship-loop.local.md`, `ship-progress.local.md`), so SDD implementers committing per task never commit it; because projects scaffolded before v3.6.0 never receive template updates, the creating skills also guard with `git check-ignore` and append the pattern to the repo's local `info/exclude` when it is missing. `writing-skills` uses `<skill-name>-skill` as the basename since a skill checklist has no plan.
- KTD2. **Validate job: separate CI job, unpinned CLI, two targets.** A separate job keeps a CLI install failure from turning the python drift gate red; unpinned `@anthropic-ai/claude-code` makes new validator rules a platform-currency signal rather than a silent skip; only the plugin directory and marketplace root are validated because `validate` on the skills or agents directories returns an empty `contents` array (verified on 2.1.268). Both targets pass `--strict` today with zero warnings, including in a clean `HOME`, so no auth is assumed. The existing install-test "Verify plugin structure" step stays; it checks existence, not manifests.
- KTD3. **Frozen history stays frozen.** README v3.4.0 bullets (lines with "Opus 4.8 / Fable 5" and "200 subagents/WebSearches"), site v3.4.0 cards, and July learnings keep their original wording; the gate's header comment records this convention. Refresh only current-state surfaces.
- KTD4. **Re-render the two stale diagrams from source; accept stale images only on renderer failure.** `docs/images/render-diagrams.html` holds the effort-tiers note and the platform-currency items; `node docs/images/render-diagrams.js --only effort-tiers,platform-currency` regenerates the PNGs (Playwright, local server). If the renderer fails twice, keep the July PNGs, leave their alt text truthful to the image, and note the deferral in the PR.
- KTD5. **plugin-update goes native-first with the manual path as fallback.** `claude plugin update <plugin@marketplace>` exists on 2.1.268 (bare-name fix 2.1.246, `--json` 2.1.268) but is untested for cache sync by the maintainer, and the marketplace "Update now" button is known not to sync; so the skill refreshes the marketplace catalog first, targets the registry entry's own scope (installs are often project-scoped), and verifies the cached `plugin.json` under that entry's `installPath` against the remote `plugin.json` on `main` before trusting the native path; it never names the button. This is the one-challenge outcome for the caller's directive: the research confirmed the command exists, and the fallback preserves the July-verified manual path.
- KTD6. **Model lineup refresh changes no agent file.** Instantiates the settled Key Decision; cites R10 and R11. All 29 agents keep `model: inherit`; the mapping is documentation.
- KTD7. **`ship-loop.sh` byte-identical; `/goal` stays an opt-in complement.** (session-settled: user-approved — chosen over rebuilding the guard on `/goal` or adding a `--goal` flag to `ship.sh`: a skill cannot invoke `/goal`, the Stop hook is the only zero-action guard, and a headless goal loop trades against `ship.sh`'s fresh-context design.)
- KTD8. **Wave orchestration stays the ungated default; workflows are documented as opt-in; no bundled workflow ships.** (session-settled: user-approved — chosen over rebuilding `/orchestrate` on the Workflow tool or scaffolding a plugin workflow: workflows remain gated by plan, Pro opt-in, and org switches, and forbid mid-run sign-off.) The refreshed facts in R5 do not change the verdict because any remaining gate keeps a core dependency out of bounds.
- KTD9. **Injection scanners and DATA markers stay, all layers.** (session-settled: user-approved — chosen over retiring them for native hardening: native observers now cover subagent reports, Artifact reads, permission previews, and auto-mode tool-result probes, still not main-session Read/Write/Edit outside auto mode.) Recorded in R19's decision record.
- KTD10. **Bump to 3.6.0 before push.** (session-settled: user-directed — chosen over shipping content without a bump: installed plugin caches resync only when `plugin.json`'s version changes.)
- KTD11. **`deep-research` keeps its name; the collision is documented, not engineered around.** A rename would break every user's muscle memory and cross-references; Claude's own Skill-tool invocations resolve plugin skills by name, so only user-typed `/deep-research` is ambiguous, and a note in the skill and the README table is the proportionate fix. Other bare mentions are deferred (Scope Boundaries).
- KTD12. **Extend the drift gate to the README nav anchor.** The v3.2.1 sweep found this exact anchor stuck at an old version; the gate derives the slug from the first What's New heading (lowercase, drop punctuation other than spaces and hyphens, spaces to hyphens) and compares it to the `href` in the nav line. Negative-test it by temporarily editing the anchor.

### Assumptions

- `claude plugin validate --strict` behaves in GitHub Actions as it does locally in a clean `HOME` (offline, no login). If CI shows otherwise, the job is fixed rather than dropped.
- Claude's Skill-tool invocation of plugin skills by bare name keeps working (maintainer-verified earlier); the bundled `/deep-research` workflow is a command, not a skill, so it does not shadow Skill-tool calls. Slash-menu precedence for user-typed `/deep-research` is unverified; R6's wording says "when the menu shows both" rather than asserting an order.
- Playwright and a Chromium are available for `render-diagrams.js` (they were in July); KTD4 covers failure.
- Agent Teams still requires `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`; no in-window changelog entry lifted the gate.
- The 20-concurrent and depth-3 defaults, the TodoWrite model list, the 2.1.267 effort fix, `maxEffortLevel`, and the subagent-model precedence come from the official changelog and `model-config` docs fetched 2026-09-11; this session's own tool roster on Fable 5.1 has no TodoWrite, consistent with the claim.
- README's What's New heading omits a date parenthetical so its slug stays short: `#whats-new-in-v360--platform-currency-refresh`.
- Whether `claude plugin update` refreshes the marketplace catalog before resolving "latest" is undocumented (the docs describe the pre-refresh only for install), so Step 0 runs `claude plugin marketplace update claude-code-blueprint` first; verify once from a session whose catalog predates the push.

### System-Wide Impact

- **Drift gate anchors:** the new site block must sit first after `<div class="container">` in the What's New section (the gate reads the first badge), and the demoted v3.5.2 header gains the `margin-top: 4rem` style every non-first block carries. Any new card sentence that lists skills, agents, and hooks on one line must say 55/29/10 (index.html is triple-checked whole-file).
- **Collision gate:** `plugin-update`'s description may be edited only if it stays under the 50% overlap warning; the body edits are gate-neutral.
- **Users on older models (still have TodoWrite):** R1's "native task list when the model offers one" keeps their flow; nothing is removed from them.
- **Legacy installs:** R14's legacy branch sends them to `install.sh`, matching the README FAQ.

### Risks & Dependencies

- Diagram re-render is the only step with an environment dependency (Playwright); KTD4 bounds it.
- Unpinned CLI in CI can turn red on a future validator change; that is the intended signal, and the job is isolated from the other gates.

---

## Implementation Units

### U1. Plan-scoped progress ledger replaces TodoWrite

- **Goal:** Skills track progress in a file that exists on every model, with a stated lifecycle and git hygiene.
- **Requirements:** R1, R2, R3 (KTD1)
- **Dependencies:** none
- **Files:** `plugins/claude-code-blueprint/skills/executing-plans/SKILL.md`, `plugins/claude-code-blueprint/skills/subagent-driven-development/SKILL.md`, `plugins/claude-code-blueprint/skills/writing-skills/SKILL.md`, `plugins/claude-code-blueprint/skills/writing-skills/persuasion-principles.md`, `plugins/claude-code-blueprint/skills/session-continuity/SKILL.md`, `plugins/claude-code-blueprint/templates/.gitignore`
- **Approach:**
  1. State the lifecycle in the same words at each creation point (executing-plans Step 1, subagent-driven-development's plan-read step, writing-skills' checklist): file per KTD1; first line names the plan (or skill); one checkbox per task; reuse the file and its ticks when it already exists; at creation run `git check-ignore -q` on it and, if that fails, append `.claude/plans/*.progress.local.md` to the file named by `git rev-parse --git-path info/exclude`; delete it when the final review is clean; an interrupted run leaves it for the resume.
  2. executing-plans: replace "Create TodoWrite and proceed" with that lifecycle; Step 2's in_progress/completed become ticking the box; the deletion point is the last step before `finishing-a-development-branch`.
  3. subagent-driven-development: rename the two dot-graph nodes and the example line from "TodoWrite" to the progress file; carry the lifecycle line and the final-reviewer deletion point; add the platform reason in one clause (native task tools exist only on Claude 3.x, Opus 4.0–4.7, Sonnet 4.0–4.6, Haiku 4.5; `CLAUDE_CODE_ENABLE_TODO_TOOLS=1` restores them).
  4. writing-skills: the checklist instruction points at `.claude/plans/<skill-name>-skill.progress.local.md` with the same lifecycle; persuasion-principles' three teaching mentions keep the commitment principle and swap the mechanism ("a written checklist file you tick").
  5. session-continuity: the STATE.md template's task list gains one line pointing at the progress file when one exists.
  6. templates/.gitignore: add `.claude/plans/*.progress.local.md` next to the existing `.local.md` entries.
- **Patterns to follow:** existing `.local.md` naming in `templates/.gitignore`; `.claude/plans/PATTERNS.md` as the sibling file executing-plans already creates.
- **Test scenarios:**
  - `grep -rn TodoWrite plugins/` returns nothing.
  - Reading each creation point (executing-plans Step 1–2, SDD's plan-read step, writing-skills' checklist) as an implementer on Fable 5.1, the file name, first line, reuse rule, tick action, ignore guard, and deletion point are each stated.
  - `templates/.gitignore` ignores `.claude/plans/x.progress.local.md` (`git check-ignore` in a scaffolded temp dir).
  - In a temp repo whose `.gitignore` lacks the rule, following the creation step leaves `git status --porcelain` empty.
- **Verification:** grep clean; markdownlint clean; the skill still has its When-NOT-to-use and rationalization sections intact.

### U2. Platform-fact refresh across skills

- **Goal:** The six skill passages that state platform limits or native alternatives are true for 2.1.268.
- **Requirements:** R4, R5, R6, R7, R8 (KTD7, KTD8, KTD11)
- **Dependencies:** none
- **Files:** `plugins/claude-code-blueprint/skills/deep-research/SKILL.md`, `plugins/claude-code-blueprint/skills/review-swarm/SKILL.md`, `plugins/claude-code-blueprint/skills/wave-orchestration/SKILL.md`, `plugins/claude-code-blueprint/skills/orchestrate/SKILL.md`, `plugins/claude-code-blueprint/skills/ship-pipeline/SKILL.md`, `plugins/claude-code-blueprint/skills/agent-teams/SKILL.md`
- **Approach:**
  1. Replace the three "Session cap(s)" sentences with the R4 facts in the same bold-lead form; keep each skill's own sizing remark (5-agent swarm, 6–10 reviewers, wide waves) and add that nested spawns count against depth 3.
  2. orchestrate's "When to reach for a native workflow instead" paragraph: rewrite with the R5 facts; keep the last sentence's stance that no core pipeline depends on the tool.
  3. deep-research: one short paragraph after the announce line per R6.
  4. ship-pipeline: extend the `/goal` block's bullets per R7; add the check-in opt-out line beside the copyable prompt; keep the three invariants from the July record (interactive only, never stall for the paste, no CLI floor on the pipeline); update the Running Modes sentence near the end that mentions pasting the `/goal` prompt so it matches.
  5. agent-teams: add the three R8 facts next to "Idle notifications".
- **Patterns to follow:** the existing sentence shapes quoted in Sources; cite CLI versions inline the way the current text does.
- **Test scenarios:**
  - `grep -rn "200 subagents" plugins/` returns nothing.
  - orchestrate no longer says "25+ independent tasks" or "v2.1.154+"; it names `/config` for Pro, `-p`/SDK, and the `medium` guideline.
  - ship-pipeline's block still says "interactive only" and still names `ship-loop.sh` as the guarantee.
- **Verification:** greps above; markdownlint clean; `python3 scripts/check-skill-collisions.py` unchanged (descriptions untouched).

### U3. README and CLAUDE.md currency refresh

- **Goal:** The user-facing docs describe the current lineup, effort semantics, native alternatives, update path, and skill hygiene.
- **Requirements:** R9, R10, R11, R12, R13 (KTD3, KTD6)
- **Dependencies:** U4 (the update wording it mirrors), U5 (the validate-job sentence)
- **Files:** `README.md`, `CLAUDE.md`, `index.html`
- **Approach:**
  1. README agent-frontmatter table: `model` row lists `sonnet`, `opus`, `fable`, `haiku`, `inherit`.
  2. README effort-mapping table: `high` → Opus 5 / Fable 5.1; add the R10 paragraph after "This mapping is documentation…".
  3. README Platform currency: heading "Platform currency (2026-07 sync, refreshed 2026-09)"; rewrite the Workflow, Fast mode, Claude 5 lineup, and Per-session caps rows; add a "Bundled `/deep-research` workflow" row; leave the image and its alt text as they are (the diagram is re-rendered in U6, alt updated there).
  4. README "Update to latest version": lead with `claude plugin update claude-code-blueprint@claude-code-blueprint` (or `/plugin install …`), then "run `/reload-plugins` (or restart)"; mirror in index.html's install/update copy.
  5. README consistency-gates paragraph: keep "two exact-match gates", add one sentence naming the CLI manifest-validation job.
  6. README context-window management: one `/skill-doctor` sentence.
  7. CLAUDE.md: effort paragraph mapping → Opus 5 / Fable 5.1 with the 2.1.267 clause; Session Continuity block rewritten to the v3.6.0 state (last session date, what was done, nothing remaining, gates list including the validate job and anchor check).
- **Patterns to follow:** current table row voice ("Opt-in complement…", "Gated: …"); frozen v3.4.0 bullets untouched (KTD3).
- **Test scenarios:**
  - README outside lines of the v3.4.0 What's New section contains no "Opus 4.8 / Fable 5" and no "200 subagents".
  - The v3.4.0 bullets at README's "What's New in v3.4.0" still read exactly as before (`git diff` shows no hunk there).
  - CLAUDE.md Session Continuity names v3.6.0 and lists no remaining items.
- **Verification:** greps; `bash scripts/check-drift.sh` still green (README agents table and tree counts unchanged); markdownlint clean.

### U4. plugin-update native-first with manual fallback

- **Goal:** Updating takes one native command when it works and falls back to the proven manual sync when it does not.
- **Requirements:** R13 (report wording), R14 (KTD5)
- **Dependencies:** none
- **Files:** `plugins/claude-code-blueprint/skills/plugin-update/SKILL.md`
- **Approach:**
  1. Insert `## Step 0: Try the native update first` before Step 1: read the registry key (a list of per-scope installs; reuse Step 1's python); if no entry exists, report "legacy install — run `install.sh --legacy --force`" and stop; resolve one target entry (the `scope: user` entry if present, else the entry whose `projectPath` equals the current project root, else fall through); run `claude plugin marketplace update claude-code-blueprint`, then `claude plugin update claude-code-blueprint@claude-code-blueprint --scope <scope> --json`; fetch the remote version with `curl -fsSL` of the raw `plugin.json` on `main`; read the version from `<installPath>/.claude-plugin/plugin.json` of the resolved entry (falling back to that entry's row in `claude plugin list --json` only if the file is missing); if every command succeeded and the versions match, jump to Step 6's report; otherwise say why and continue with Steps 2–5 unchanged (Step 0 already performed Step 1's registry read).
  2. Step 6 report and Important Notes: "run `/reload-plugins` (or restart)"; add that `/plugin install claude-code-blueprint@claude-code-blueprint` is the interactive route that refreshes the marketplace first; never mention the marketplace "Update now" button as a route.
  3. Keep Steps 1–5 byte-for-byte except a new one-line lead-in at the top of Step 2 stating that Steps 2–5 run only when Step 0 falls through.
- **Patterns to follow:** the skill's existing fenced-bash-per-step structure and python one-liners.
- **Test scenarios:**
  - Legacy path: with no registry entry, Step 0's script prints the redirect and exits before any clone.
  - Project-scope path: the only entry is `scope: project` for the current project → Step 0 passes `--scope project` and compares that entry's cached `plugin.json`.
  - Multi-entry path: two entries at different versions → Step 0 compares only the resolved entry.
  - Match path: update exit 0 and the cached version equals the remote → Steps 2–5 are skipped.
  - Mismatch path: registry row updated but the cached `plugin.json` still old → manual steps run.
  - Old-CLI path: `--json` rejected → non-zero exit → manual steps run.
- **Verification:** description unchanged so the collision gate is unaffected; shell snippets pass `shellcheck` when extracted (they are illustrative, but keep them clean); markdownlint clean.

### U5. CI validate job and nav-anchor gate

- **Goal:** CI validates the plugin manifests with the CLI's own validator and catches a stale README nav anchor.
- **Requirements:** R15, R16 (KTD2, KTD12)
- **Dependencies:** none
- **Files:** `.github/workflows/ci.yml`, `scripts/check-drift.sh`
- **Approach:**
  1. ci.yml: add job `plugin-validate` ("Plugin Validate"): `actions/checkout@v4`, `npm install -g @anthropic-ai/claude-code`, then two steps running `claude plugin validate --strict --json` on `plugins/claude-code-blueprint` and `.`; mirror the existing job style (Title Case name, imperative step names, ubuntu-latest).
  2. check-drift.sh: in the VERSION EQUALITY section add a README nav-anchor check: find the first `### What's New in v` heading, slugify per KTD12, find the nav line's `href="#whats-new…"`, fail with the anchor-changed message style if they differ.
- **Patterns to follow:** the gate's existing `failures.append(...)` messages and "anchor changed, re-point the gate" wording; ci.yml job layout.
- **Test scenarios:**
  - Gate positive: `bash scripts/check-drift.sh` passes on the current heading/anchor pair (the post-bump pass is U8's test).
  - Gate negative: temporarily set the nav href to a stale slug (`#whats-new-in-v351--verification-sweep`) → gate fails naming the anchor; revert.
  - Validate locally: both targets pass `--strict --json` with `success: true`.
- **Verification:** `shellcheck scripts/check-drift.sh` clean; the negative test performed and reverted (no leftover edit).

### U6. Diagram source labels and re-render

- **Goal:** The effort-tiers and platform-currency diagrams show the refreshed lineup and limits.
- **Requirements:** R18 (KTD4)
- **Dependencies:** U3 (U6 owns the alt-text lines of the two diagrams in `README.md` and `index.html`; U3 leaves them untouched)
- **Files:** `docs/images/render-diagrams.html`, `docs/images/effort-tiers.png`, `docs/images/platform-currency.png`, alt text in `README.md` and `index.html` for those two images
- **Approach:**
  1. Edit the effort-tiers note (`high→Opus 5 / Fable 5.1`) and the platform-currency items (caps → "20 concurrent · depth 3 · 200 WebSearches"; Workflow → "GATED: paid plans, Pro opt-in, org switch") in the HTML source.
  2. Run `node docs/images/render-diagrams.js --only effort-tiers,platform-currency`; confirm both PNGs changed and open them to check the labels rendered.
  3. Update the two alt texts to match; if rendering fails twice, revert the HTML edit, keep the July PNGs and alt text, and record the deferral in this unit's commit message and the final handoff so the caller can carry it into the PR body.
- **Patterns to follow:** `docs/images/render-diagrams.js` usage from the July cycle (2× scale, local server).
- **Test scenarios:**
  - Both PNGs have a newer mtime and non-zero size; viewing them shows the new labels.
  - `git status` shows only the two PNGs, `docs/images/render-diagrams.html`, and the alt-text lines in `README.md` and `index.html` changed by this unit.
- **Verification:** visual check recorded in the unit's commit message; `check-drift.sh` unaffected (promo source untouched).

### U7. Decision record for the 2026-09 cycle

- **Goal:** Future cycles read one file to see what this cycle probed and decided.
- **Requirements:** R19 (KTD7, KTD8, KTD9)
- **Dependencies:** none
- **Files:** `docs/learnings/2026-09-11-cli-watch-cycle-verdicts.md`
- **Approach:** Frontmatter as the July records (`title`, `date`, `category: gate-decision`, `cycle: cli-watch-2026-09-11`, `requirement`, `applies_when`, `tags`). Body: the cutoff pin; the six capability probes with holds/changed and evidence — (a) `/goal` invocability HOLDS, (b) Workflow tool gating HOLDS with refined facts, (c) native injection scanning HOLDS (new observers: Artifact reads, auto-mode tool-result probes), (d) model lineup CHANGED, (e) subagent caps CHANGED, (f) hooks.json contract HOLDS; then the five supersede verdicts: S1 ship-loop vs `/goal` KEEP; S2 `ship.sh` vs `claude -p "/goal …"` NO-GO with the `--goal` flag deferred and why; S3 waves vs Workflow tool KEEP with the refreshed gating facts and the bundled-workflow scaffold deferred; S4 scanners KEEP with the new native observers named; S5 plugin-update native-first GO with fallback; deferred items (`prompt-audit` sweep). Link the July records relatively.
- **Patterns to follow:** `docs/learnings/2026-07-17-rebuild-verdicts.md` section shape.
- **Test scenarios:** Test expectation: none -- documentation record; markdownlint passes.
- **Verification:** file present; links resolve; frontmatter keys match the July records.

### U8. Release surfaces and version bump

- **Goal:** v3.6.0 is announced on the site and README and every version anchor agrees.
- **Requirements:** R17, R18 (KTD10, KTD12)
- **Dependencies:** U1–U7 (the What's New copy summarizes them)
- **Files:** `plugins/claude-code-blueprint/.claude-plugin/plugin.json`, `install.sh`, `index.html`, `README.md`
- **Approach:**
  1. Bump `plugin.json` to 3.6.0; `install.sh` `VERSION="3.6.0"`; hero badge text to `v3.6.0 &mdash; Platform Currency`.
  2. index.html What's New: insert a `<!-- v3.6.0 -->` block immediately after `<div class="container">` with badge, `<h2>What's New</h2>`, a lower-case tagline, and a `grid-4` of four cards (model-agnostic tracking; refreshed limits and lineup; native-first update and validator job; cycle verdicts recorded); add `style="margin-top: 4rem;"` to the now-second v3.5.2 header; avoid listing counts in card text.
  3. README: add `### What's New in v3.6.0 — Platform Currency Refresh` above the v3.5.2 section with bullets in the existing `- **Bold lead-in** — sentence` style (one per user-visible change; name the kept verdicts in one closing line); update the nav anchor to `#whats-new-in-v360--platform-currency-refresh`.
- **Patterns to follow:** the v3.5.2 block and section as the template; hero badge two-word tagline.
- **Test scenarios:**
  - `bash scripts/check-drift.sh` reports version 3.6.0 everywhere and the new anchor check passes.
  - No index.html card line pairs a number with "skills", "agents", or "hooks" other than 55/29/10.
  - README nav "What's New" link resolves to the new heading in a rendered preview (slug check).
- **Verification:** all gates in the Verification Contract green; `git diff --stat` touches only the files this plan names.

---

## Verification Contract

| Check | Command | Applies to |
|---|---|---|
| Drift gate (incl. new anchor check) | `bash scripts/check-drift.sh` | U3, U5, U8 |
| Skill-collision gate | `python3 scripts/check-skill-collisions.py` | U2, U4 |
| Markdown lint | `npx --yes markdownlint-cli '**/*.md' --ignore node_modules --ignore docs/images --ignore plugins/claude-code-blueprint/skills/writing-skills` (mirrors the CI job; `markdownlint` is not on PATH locally) | all |
| Shell lint | `shellcheck install.sh scripts/check-drift.sh plugins/claude-code-blueprint/hooks/handlers/*.sh` and `shellcheck --exclude=SC2317,SC2329 plugins/claude-code-blueprint/scripts/ship.sh` | U5 |
| Manifest validation | `claude plugin validate --strict --json plugins/claude-code-blueprint` and `claude plugin validate --strict --json .` | U5, U8 |
| Stale-string sweep | `grep -rin "TodoWrite\|200 subagents\|Opus 4.8 / Fable 5\|25+ independent\|restart your session" plugins README.md CLAUDE.md index.html` → hits only in frozen history | U1–U4 |
| Positive spot-check | `grep -rn "CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS\|Opus 5 / Fable 5.1\|progress.local.md\|plugin validate --strict" plugins README.md CLAUDE.md .github` → each term present where its requirement places it | U1–U5 |
| Anchor negative test | edit nav href to a stale slug, run the gate, expect failure, revert | U5 |
| Diagram check | PNG mtimes updated and labels visible on open, or the KTD4 fallback recorded in U6's commit message | U6 |

---

## Definition of Done

- All eight units landed on `feat/v3.6.0-platform-currency` as `type(scope): description` commits; every Verification Contract check green (the diagram check may instead show the KTD4 fallback recorded).
- No hook, agent, or skill file added or removed; counts 55/29/10 unchanged; frozen history untouched (`git diff` shows no hunk in README's v3.4.0 or earlier What's New sections, site v3.4.0 cards, or July learnings).
- Stale-string sweep clean outside frozen history; CLAUDE.md Session Continuity reflects v3.6.0.
- No scratch files, temporary anchor edits, or renderer leftovers in the diff.
