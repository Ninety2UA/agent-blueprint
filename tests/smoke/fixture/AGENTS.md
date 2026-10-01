# Project Instructions

These instructions load in every session, whichever coding agent you use. They say how work is done in this project and why. Project facts live in `docs/context/`; read them before you change code.

The project codename is HARBOR-19.

## Philosophy

Each unit of work should make the next one easier, not harder. The patterns you set here will be copied and the corners you cut will be cut again, so prefer the small, finished step over the fast, partial one.

## Where things are

| Path | What it holds |
|------|---------------|
| `docs/context/STATUS.md` | Current state, known issues, and the Session Continuity notes the last session left |
| `docs/context/CONVENTIONS.md` | Tech stack, commands (test, lint, build, dev), naming and patterns |
| `docs/context/DECISIONS.md` | Locked decisions; honor them, or raise the conflict instead of working around it |
| `docs/context/GOALS.md` | What the project is for; use it to prioritize |
| `docs/plans/` | Implementation plans, one file per piece of work |
| `docs/solutions/` | Solved problems worth finding again |
| `docs/learnings/LEARNINGS.md` | Patterns and gotchas learned in this project |
| `docs/decisions/` | Architecture decision records |
| `docs/research/`, `docs/specs/` | Research notes and feature specs |
| `BACKLOG.md` | Quick capture inbox for work that is out of scope right now |
| `blueprint.local.md` | Per-developer blueprint settings (not committed) |
| `.agent-blueprint/` | The blueprint's working files; run state is ignored, plans and notes are tracked |

Read `docs/context/STATUS.md` at the start of a session, and `docs/context/CONVENTIONS.md` before writing code: they change more often than this file.

## Blueprint skills

The Agent Blueprint skills carry the workflows. Start one the way your tool starts a skill, or ask for it by name.

| Skill | Use it for |
|-------|------------|
| ab-project-start | First-time setup: fills in the conventions, goals and status |
| ab-build-pipeline | A feature with a checkpoint between every stage |
| ab-ship-pipeline | A well-defined feature, run end to end without checkpoints |
| ab-quick-fix | A small, well-understood change of under three files |
| ab-brainstorming | Designing something before building it |
| ab-orchestrate | Running a plan as team work in parallel waves |
| ab-review-swarm | A parallel code review from several angles |
| ab-systematic-debugging | Finding the root cause of a failure |
| ab-session-wrap | Ending a session so the next one can pick up |

Small work goes straight to ab-quick-fix: write the failing test, fix, verify, commit. Work that touches four or more files, adds an API or changes a data model goes through ab-brainstorming and then ab-build-pipeline, because those changes are expensive to redo once others build on them.

## How to work

- **Do what was asked.** Extra changes cost review time and hide the change that was requested. Put anything else you notice in `BACKLOG.md`.
- **Prefer editing to creating.** A new file is new surface to maintain. Create one when the work needs it, and write documentation only when it was asked for or the change would be unusable without it.
- **Evidence before claims.** Run the check that proves a thing works before you say it does, and show its result. "Should work" is not a status.
- **Fix what you break first.** If a change breaks something else, stop and repair that before going on; a second failure on top of the first is much harder to untangle.
- **Commit small and often.** One logical change per commit, with the tests and lint from `docs/context/CONVENTIONS.md` passing, so each commit can be reviewed, reverted or bisected on its own.
- **Keep secrets out of the repository.** Credentials, tokens and `.env` files never go into a commit. The template `.gitignore` covers the common files, and the blueprint's ship runner scans every outgoing change for key-shaped strings before it pushes.

## When to decide and when to ask

Decide yourself, and say what you did, for anything that is plainly within the task: logic and type errors, missing imports, broken paths, missing error handling, lint issues and typos.

Ask first for anything that is the user's call: a new database table or migration, a different framework, a change to a public API contract, a change to authentication or authorization, a new environment variable or external service, or an architectural choice not covered by `docs/context/DECISIONS.md`. These are hard to undo and affect people beyond this task.

In an unattended run nobody can answer. Take the most conservative option, record it in `docs/context/DECISIONS.md` or the run's decision log, and flag it in your report.

Fix only what the current task caused. Problems that were already there go into `BACKLOG.md`, so the diff stays about one thing.

## Code

- **Tests first.** Write the failing test, watch it fail for the right reason, then make it pass (the ab-test-driven-development skill). A test written after the code tends to test what the code does, not what it should do.
- **Typed interfaces at public boundaries**, so callers learn the contract from the signature instead of the implementation.
- **Fail loudly at system boundaries and recover gracefully inside.** Validate input where it enters, trust data already inside, and never swallow an error: log what is needed to reproduce it, not just its message.
- **No commented-out code**, since version control keeps the history, and **no TODO without a `BACKLOG.md` entry**, since a TODO nobody tracks is never done.

## Commits

Format: `type(scope): brief description`, where type is one of `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `style`, `perf`. The body says why the change was made, because the diff already shows what changed.

## When something goes wrong

| Situation | What to do |
|-----------|------------|
| A test fails | Use the ab-systematic-debugging skill: gather evidence, form one hypothesis, test it |
| Merge conflict | Read both sides and understand each intent before resolving |
| The build breaks after a dependency update | Pin the previous version and add a `BACKLOG.md` item |
| A worktree is corrupted | Start a fresh worktree from the main branch and cherry-pick the finished commits |
| A helper's result looks wrong | Check it yourself before acting on it |
| Work seems lost | Look in `git stash list`, `git reflog` and `git fsck --lost-found` |

## Parallel work

When several helpers work at once, each one owns specific files and only the lead session commits. Two helpers editing the same file lose each other's changes, and one committer keeps the history coherent.

## Learnings

Project-specific lessons go in `docs/learnings/LEARNINGS.md`, which the ab-session-wrap skill adds to, and solved problems go in `docs/solutions/` through the ab-knowledge-compounding skill. That skill adds a lesson to this section only when it should shape every future session.
