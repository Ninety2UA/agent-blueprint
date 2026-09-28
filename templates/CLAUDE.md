# Project Instructions

## Philosophy

**Each unit of engineering work should make subsequent units easier — not harder.**

Quality over speed. Small steps compound. The patterns you establish will be copied. The corners you cut will be cut again.

## Session Continuity

<!-- Updated by /ab-session-wrap. For full state: read docs/context/STATUS.md -->

**Last session:** Not yet initialized

**What was done:**
- Project scaffolded with Agent Blueprint plugin

**What's remaining:**
- Run `/ab-project-start` to configure conventions, goals, and status

**Start here:** Run `/ab-project-start` to set up your project.

**Current state of the code:**
- Build: not configured (run `/ab-project-start`)
- Tests: not configured (run `/ab-project-start`)
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
| `/ab-orchestrate` | Wave-based parallel execution (dependency-ordered) |
| `/ab-team-execution` | Collaborative agent team (shared task list + messaging) |
| `./scripts/ship.sh "feature"` | External loop — fresh context per iteration |
| `/ab-plugin-update` | Update plugin to latest version from GitHub |

Run `/ab-project-start` after install to configure `docs/context/CONVENTIONS.md` with actual lint/test/dev commands.

## Architecture

```
# Plugin-provided (55 skills, 10 hooks)
# Available automatically — no per-project files needed

# Project-local (your project state)
docs/context/        # GOALS.md, STATUS.md, CONVENTIONS.md, DECISIONS.md
docs/plans/          # Implementation plans (YYYY-MM-DD-topic.md)
docs/solutions/      # Institutional knowledge (created by /ab-knowledge-compounding)
docs/learnings/      # Key learnings and gotchas (updated by /ab-session-wrap)
docs/decisions/      # Architecture decision records (ADRs)
docs/research/       # Research findings and exploration notes
docs/specs/          # Feature specs and requirements
scripts/ship.sh      # Wrapper for plugin's Ralph-style external loop
blueprint.local.md   # Per-project agent config (gitignored)
BACKLOG.md           # Quick capture inbox
```

Skills are self-describing via frontmatter; their helper prompts live in each skill's `references/agents/` — read their files for when/how to use them.

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

- Stop hook `"decision": "block"` does NOT reset context — use `scripts/ship.sh` for true context refresh between iterations
- Each Agent Teams teammate MUST own specific files — concurrent modification causes conflicts
- Use `execFileSync` not `execSync` in hook scripts to prevent shell injection
- `docs/images/*` excluded from install — only for template's GitHub README display

## Key Learnings

See `docs/learnings/LEARNINGS.md` for project-specific patterns, gotchas, and insights. Updated by `/ab-session-wrap`.
