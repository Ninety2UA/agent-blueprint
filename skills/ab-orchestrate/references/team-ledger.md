# Team ledger

How this skill runs a plan as team work in any host. The ledger is one file that holds the task list, the waves and the notes the helpers hand back. It works the same whether helpers run in parallel, run as a host's native team (`references/native-extras.md`), or do not exist at all and the session does every task itself, so a run can be resumed in another session or another tool.

## Where it lives

Each run has its own folder, `.agent-blueprint/team/<run>/`, where `<run>` is the start time and the plan's name, for example `20261001-0914-oauth-login`. The ledger is `ledger.md` in that folder. Helpers that need to leave long output write it to `.agent-blueprint/team/<run>/<task id>/` and name the path in their summary.

## One writer

The lead session is the only writer of the ledger. Helpers never edit it: they return their state, a summary and any notes in their output section, and the lead records them. A helper may run in another worktree or sandbox where the ledger is stale or absent, and one writer means no two updates race.

## Format

```markdown
# Team run 20261001-0914-oauth-login

- Plan: docs/plans/2026-10-01-oauth-login-plan.md
- Host: codex · Helpers per wave: 4 · Isolation: ownership
- Base commit: 3f2a9c1
- Status: running

## Tasks

| ID | Task | Needs | Files | Wave | Status | Result |
|----|------|-------|-------|------|--------|--------|
| T1 | Token model | - | src/auth/token.ts, test/token.test.ts | 1 | done | 8c1d2e4 |
| T2 | Login route | - | src/routes/login.ts, test/login.test.ts | 1 | done | 5b7f0a9 |
| T3 | Refresh route | T1 | src/routes/refresh.ts, src/auth/token.ts | 2 | running | |

## Waves

- Wave 1: T1, T2. Verified: pass.
- Wave 2: T3.

## Notes

- [wave 1, T1] Token expiry is read from AUTH_TTL_SECONDS; later tasks must not hardcode it.

## Decisions

- [wave 1, T2] Asked whether to rate-limit logins; nobody answered, took "no rate limit in this change" (headless default).
```

- **Status of the run:** `running`, `done` or `blocked`.
- **Status of a task:** `pending`, `running`, `done`, `blocked`, `needs-input` or `failed`. Only the lead moves a task to `done`, and only after its checks pass.
- **Result:** the commit that holds the task once the lead has integrated it (`uncommitted` in no-commit mode, § Isolation), or the reason for `blocked` or `failed`.
- **Files:** every file the task may create or change, taken from the plan. A task whose plan entry names no files gets `?`.
- **Isolation:** `worktree`, `ownership` or `inline` (see below).

## Building waves

1. Read the helper limit for your host from `references/host-limits.tsv`: the `interactive` column in an interactive session, `headless` in a headless one. A `-` means no documented cap. The wave size is the smaller of that limit and the run's setting (default 4). An unlisted host gets 2. Without helpers, the wave size still applies; the tasks of a wave then run one after another.
2. A task is ready when every task in its Needs column is `done`.
3. Fill the next wave from the ready tasks in plan order. Add a task only if no task already in the wave shares one of its files, and stop at the wave size. A task that is left out waits for the next wave.
4. A task whose files are `?` runs in a wave of its own, because nothing can prove it does not collide.
5. Record the wave in the ledger before any helper starts.

Two tasks that touch the same file therefore never share a wave, and a helper limit of 2 splits four ready tasks into two waves of two.

## The task packet

Each helper starts fresh: no host passes the lead's conversation to a helper reliably. Give it everything in one packet:

- The task's text from the plan, word for word, with its acceptance checks.
- The files it owns (it may create or change only these) and, by name, the files other tasks in the wave own.
- The project's conventions file (`docs/context/CONVENTIONS.md`) and the test command.
- Every ledger note from earlier waves that names this task or one of its files.
- The worker rules and the output section from `references/coordinator.md` § Helper Return Contract.

## Isolation

Read the `isolation` column for your host.

- **worktree:** start each helper in its own worktree where the host offers one. The helper may commit on its worktree's branch; the lead brings each task onto the run's branch, one task per commit.
- **ownership:** helpers share the checkout and each touches only the files it owns. Helpers do not commit; the lead commits each task's files once the task passes its checks, naming the files so another task's work stays out of that commit.
- **inline:** no helpers. The lead does each task itself, one after another, in wave order, and commits each task as it would under ownership.

**No-commit mode.** When the environment variable `AGENT_BLUEPRINT_GIT_WRITABLE` is `0`, or a commit fails because `.git` is read-only, make no commits: leave the changes in the working tree and add the commit message you would have used to `.agent-blueprint/run/commit-msg.md`, and the ship runner commits them after the session. A review step in this mode reviews the working tree and untracked files against the merge base instead of a commit range.

Some hosts' sandboxes block `.git` writes, and creating a worktree writes there too, so in this mode helpers use ownership, never worktrees; inline stays inline. The lead still integrates each task after its checks pass, adds that task's message, and sets its Result to `uncommitted`. The wave check then gets the files the wave's tasks own instead of the commit the wave started from.

## Integrating a wave

When every helper in a wave has returned:

1. For each `DONE` task, run its acceptance checks, then integrate it (above) and set its Result to the commit. If the host left the task's worktree and branch behind, remove them with git's own worktree and branch commands once the commit is on the run's branch, so later runs start clean.
2. Append each note a helper returned to Notes, tagged with the wave and task.
3. Record any `NEEDS_INPUT` decision under Decisions, and send the decision back as the Worker Failure Protocol in the coordinator says.
4. Run the wave check (the integration verifier) and record its verdict on the wave's line.
5. Build the next wave.

The lead alone integrates, commits and runs the authoritative tests. A helper's own test run is evidence, not a verdict.

## Resuming

The ledger is the record of the run. A new session, in this tool or another, continues from it: it reads the ledger, treats `running` tasks with no integrated commit as `pending`, and builds the next wave. When the last wave passes, set the run's status to `done`. Never delete the ledger or its folder; set the status instead.
