# Project Instructions

## Philosophy

**Each unit of engineering work should make subsequent units easier — not harder.**

Quality over speed. Small steps compound. The patterns you establish will be copied. The corners you cut will be cut again.

## Session Continuity

<!-- Updated by /ab-session-wrap. Full history: git log + docs/learnings/ -->

**Last session:** 2026-09-28

**What was done:** The 2026-09-27 `/cli-watch` + `/repo-watch` cycle was implemented as v3.8.0 "Plans as Decisions and Opus 5.5 Currency" on `feat/v3.8.0-cycle-2026-09-27` (PR open, not merged): all 25 approved repo-watch grafts (plans record decisions, not code; protected-subject findings need a cited refutation; merge-base review ranges; whole-suite green; final whole-branch review; durable-only learnings; publishing gates; pre-flight danger scan; YAML and `references/` pointer checks) and cli-watch A1–A7 (Opus 5.5 lineup, session model and effort as the user's choice, workflow facts, `/goal` notes, `claude plugin eval` pointer). Record: `docs/learnings/2026-09-27-cli-and-repo-watch-verdicts.md`. Earlier cycles: `docs/learnings/2026-09-11-*`.

**What's remaining:**
- Merge the v3.8.0 PR, then tag and publish the GitHub release; only after that, advance `.claude/cli-watch/baseline.json` (2026-09-27 / 2.1.283) and the `.claude/repo-watch/registry.json` pins listed in the decision record.
- The portability brainstorm takes the items the repo-watch report routed to it (§4), including the description-style conflict with compound-engineering #1645.

**Start here:** open the v3.8.0 PR on GitHub, confirm CI is green, and merge it; then run the release steps above.

**Current state of the code:**
- Build: n/a (template repo, no build step)
- Gates: drift gate (promo source, site grids + badge integrity, repo-count claims, README helper-prompts table, version equality, README nav anchor) + skill-collision gate (fails on invalid frontmatter YAML and unresolved `references/` pointers) + portability gate (`scripts/check-portability.py`: agentskills frontmatter, `ab-` names, 8,000-byte SKILL.md cap, no host variables or slash references, Hermes-safe text, shrink-only allowlist in `scripts/portability-allowlist.json`) + manifest gate (`scripts/check-manifests.py`) + snippet sync check (`scripts/sync-shared.py --check`) + the `tests/gates` unit suite + plugin-validate job green; markdownlint + shellcheck clean locally
- Website: live at <https://ninety2ua.github.io/agent-blueprint/>
- Uncommitted changes: none

## Skills

No build step (template repo). Key skills for installed projects:

| Skill | Purpose |
|-------|---------|
| `/ab-build-pipeline` | Supervised pipeline — checkpoints between every stage |
| `/ab-ship-pipeline` | Autonomous pipeline — zero checkpoints, fire-and-forget |
| `/ab-quick-fix` | Fast-track small changes (< 3 files) with TDD |
| `/ab-ideation` | Generate and rank improvement ideas |
| `/ab-brainstorming` | Brainstorm before building |
| `/ab-review-swarm` | Multi-agent parallel code review |
| `/ab-deep-research` | Multi-agent parallel research |
| `/ab-orchestrate` | Team work in dependency-ordered waves through a task ledger (any tool; Agent Teams when switched on) |
| `./scripts/ship.sh "feature"` | External loop — fresh context per iteration |
| `/ab-plugin-update` | Update plugin to latest version from GitHub |

Run `/ab-project-start` after install to configure `docs/context/CONVENTIONS.md` with actual lint/test/dev commands.

## Architecture

```
.claude-plugin/                          # Plugin + marketplace manifests (the repo root is the plugin root)
skills/                                  # 53 skills (slash commands + workflows)
hooks/hooks.json                         # Hook definitions (${CLAUDE_PLUGIN_ROOT})
hooks/handlers/                          # Hook scripts (session-start, context-monitor, etc.)
templates/                               # Project scaffolding source (scaffolded by install.sh / /ab-project-start)
  CLAUDE.md, BACKLOG.md, docs/...        # Template files for new projects
scripts/ship.sh                          # Ralph-style external loop for /ab-ship-pipeline
scripts/check-drift.sh, check-skill-collisions.py  # CI gates
AGENTS.md                                # These instructions (CLAUDE.md is a symlink to it)
docs/images/                             # README images (repo-only)
install.sh                               # Plugin installer + legacy mode
```

Skills are self-describing via frontmatter — read their files for when/how to use them. Helper prompts live in each dispatching skill's `references/agents/`; shared ones have an owner and byte-identical copies listed in `scripts/prompt-owners.json`.

Helper prompts carry no `effort:` tier and skills carry no `effort:` or `model:`: the session model and effort are the user's choice, and helpers inherit them (verified for Claude Code's general-purpose helper in 2.1.284). A prompt whose role header says it is safe at lower effort may run lower only where the host takes a per-helper effort and the user has not asked otherwise.

## Behavioral Rules

- Do what has been asked; nothing more, nothing less
- ALWAYS read a file before editing it
- NEVER create files unless absolutely necessary for the goal
- Prefer editing existing files to creating new ones
- NEVER proactively create documentation unless explicitly requested
- NEVER commit secrets, credentials, or .env files
- Evidence before claims — run verification before asserting completion
- When in doubt, ask — don't assume intent or make silent decisions
- If you break something while fixing something else, stop and fix the regression first
- Commit working code frequently — don't accumulate large uncommitted changesets

## Deviation Rules

When executing a plan or working autonomously:

**Auto-fix (no permission needed):** logic errors, type errors, missing imports, broken paths, missing error handling, lint issues, typos

**Must ask the user FIRST:** new database tables/migrations, switching frameworks, changing public API contracts, modifying auth logic, adding env vars or external service dependencies, architectural decisions not in ADRs

**Scope boundary:** Only fix issues caused by the current task. Pre-existing issues go in BACKLOG.md.

## Error Handling

- Fail loudly at system boundaries; recover gracefully inside
- Log context needed to reproduce, not just the error message
- Never swallow errors silently
- Validate inputs at the edges; trust data already inside the system

## Error Recovery

- **Failed test:** Use ab-systematic-debugging skill — gather evidence, form hypothesis, test it
- **Merge conflict:** Read both sides, understand intent before resolving
- **Broken build after dep update:** Pin previous version, add BACKLOG item
- **Corrupted worktree:** Fresh worktree from main, cherry-pick completed commits
- **Agent unexpected results:** Verify findings manually before acting
- **Lost work:** Check `git stash list`, `git reflog`, `git fsck --lost-found`

## Analysis Paralysis Guard

5+ consecutive read-only operations without writing code → STOP. Either write code, report a blocker, or ask for help.

## Lightweight Workflow

For small, well-understood changes (< 3 files, obvious root cause):
1. Write failing test → 2. Fix → 3. Verify → 4. Commit

If touching 4+ files, adding new API, or changing data models → use full workflow (`/ab-brainstorming` → `/ab-build-pipeline`).

## Code Quality

- Files under 500 lines — split if longer
- Typed interfaces for public APIs
- Write tests FIRST (red-green-refactor)
- DRY, YAGNI — no dead code, no features beyond what's asked
- Run linter and tests before every commit
- One logical change per commit
- No TODO comments without BACKLOG.md entry
- No commented-out code — git remembers

## Commit Conventions

Format: `type(scope): brief description`

Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `style`, `perf`

## Pipelines

| Pipeline | Checkpoints | Review | Best For |
|----------|-------------|--------|----------|
| `/ab-build-pipeline` | Between every stage | Single pass (or `--iterate N`) | Features needing human guidance |
| `/ab-ship-pipeline` | None (fully autonomous) | Iterative (default 3 cycles) | Well-defined features, fire-and-forget |
| `/ab-quick-fix` | None | None | Trivial changes (< 3 files) |

## Context Loading Order

1. **SessionStart hook** — auto-bootstraps project state
2. **CLAUDE.md** (this file)
3. **docs/context/STATUS.md** — current state, commit history, known issues
4. **docs/context/CONVENTIONS.md** — tech stack, naming, patterns (read before writing code)
5. **docs/context/DECISIONS.md** — locked decisions that MUST be honored
6. **docs/context/GOALS.md** — when prioritizing work
7. **BACKLOG.md** — when looking for what to work on next
8. **blueprint.local.md** — which agents are active for this project's stack

## Gotchas

- Plugin hook scripts live at `hooks/handlers/` (referenced via `${CLAUDE_PLUGIN_ROOT}` in hooks.json)
- Hook definitions use nested format: `"hooks": [{"hooks": [...]}]` — missing the inner array silently fails
- The Read tool cannot access plugin files (sandbox restriction) — skills must be invoked by name, not file path
- Stop hook `"decision": "block"` does NOT reset context — use `scripts/ship.sh` for true context refresh between iterations
- Every helper in a team wave owns specific files, and only the lead commits — concurrent edits to one file cause conflicts
- Use `execFileSync` not `execSync` in hook scripts to prevent shell injection
- `docs/images/*` excluded from install — only for template's GitHub README display

## Key Learnings

See `docs/learnings/` for project-specific patterns, gotchas, and insights — one doc per import/analysis cycle (e.g. `pipeline-discipline.md`, `addy-osmani-agent-skills-imports.md`). Updated by `/ab-session-wrap`.
