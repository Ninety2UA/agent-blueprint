---
name: ab-project-start
description: "Sets up a project for Agent Blueprint: scaffolds AGENTS.md, a one-line CLAUDE.md that imports it, docs/context/ and BACKLOG.md by merging into what exists (never overwriting), then fills in conventions, goals and status from the codebase and a short conversation. Use when starting a new project or adopting the blueprint in an existing one, when the user asks to initialize, set up or bootstrap, or when docs/context/ is missing. Not for a status update (ab-project-status) or resuming earlier work (ab-resume-session)."
argument-hint: "[project directory, default: the current one]"
---

# Project Start

The project ends up with the blueprint's instruction file and docs, filled in with real commands and goals, and nothing it already had is lost. Done when `docs/context/CONVENTIONS.md` names the real test, lint and dev commands, `GOALS.md` and `STATUS.md` say what the project is doing now, and the summary in Step 7 is shown.

Keep it to two or three exchanges with the user: learn everything you can from the files first, and ask only what the files cannot tell you.

## Step 0: Scaffold

**Bundled scripts.** Paths such as `scripts/run.sh` are relative to this skill's own folder, the one holding its SKILL.md, not to the project. Run a script through its interpreter (`bash` for `.sh`; `python3`, or `python` if that is missing, for `.py`) instead of relying on its executable bit, and if the interpreter is missing, say so and stop that step.

Run `scripts/scaffold.py <project directory>`. It copies this skill's `assets/` into the project without overwriting anything:

- files the project lacks are created;
- an existing `AGENTS.md` keeps every section it has and gains only the template sections it lacks;
- an existing `CLAUDE.md` keeps its content and gains an `@AGENTS.md` line at the top, so Claude Code loads both (a `CLAUDE.md` that is a symlink to `AGENTS.md` is left alone);
- `.gitignore` files gain only the lines they are missing;
- a project with nothing in it but `.git` also gets `src/`, `tests/` and `infra/`.

It prints one line per file (`created`, `merged` or `kept`). Pass `--dry-run` first when the user wants to see the changes before they happen. If no Python interpreter is available, copy the files from `assets/` yourself by the same rules: the dotfiles are stored there without their dot (`assets/gitignore` becomes `.gitignore`, `assets/agent-blueprint/gitignore` becomes `.agent-blueprint/.gitignore`).

The ship runner is part of the ab-ship-pipeline skill, which prints its command; nothing needs copying for it.

## Step 1: Orient

Read what exists before asking anything:

- `AGENTS.md`, and `CLAUDE.md` if the project had its own before the scaffold
- `docs/context/CONVENTIONS.md`, `docs/context/GOALS.md`, `docs/context/STATUS.md`
- the source tree and `git log --oneline -5`
- manifest and config files: `package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, `Gemfile`, `pom.xml`, `docker-compose.yml`, `.env.example`

A manifest already tells you the language, runtime, dependencies and usually the test and lint commands. Every answer the files give is a question you do not need to ask.

## Step 2: Ask what the files cannot tell you

**Asking the user.** Ask with your question tool if you have one, offering at most three options; otherwise ask in plain text with a numbered list. In a headless or unattended run nobody will answer: take the default named below, say so in your output, and log it in the run state's decisions if there is a run state.

Group the questions into one message. For a new project: what it is (one sentence), the stack, the testing setup, and the top two or three goals. For an existing one: confirm what you inferred ("This is a TypeScript project on Node 22 with Vitest; is that right?") and ask for current priorities and any conventions not visible in the code. In both cases: the test, lint and dev commands if the files did not show them, anything that must never be touched, and whether the user works alone or with a team.

Default when nobody answers: use what the files show, write "not yet known" where they show nothing, and list those gaps in the summary.

## Step 3: Conventions

Fill in `docs/context/CONVENTIONS.md`: the stack with versions, the lint, format, test and dev commands, the file layout as it actually is, naming conventions seen in the code, the git workflow (a simple solo flow unless the user works with a team), and the "never modify" boundaries. Keep the template's structure and replace its placeholders; other skills read these commands from here.

## Step 4: Goals

Fill in `docs/context/GOALS.md`: the objectives with measurable success criteria, a priority for each (P0 to P3), and non-goals if any came up. Keep it to one screen, since it is read whenever work is prioritized.

**Asking the user.** Ask with your question tool if you have one, offering at most three options; otherwise ask in plain text with a numbered list. In a headless or unattended run nobody will answer: take the default named below, say so in your output, and log it in the run state's decisions if there is a run state.

Ask the user to confirm the priorities in one question. Default when nobody answers: keep the order the user gave, or the order of the goals as written, and mark the priorities as unconfirmed.

## Step 5: Status

Fill in `docs/context/STATUS.md`: today's date, the current state (what is in flight or recently done for existing code, the first task under "Up Next" for a new project), recent commits, and known issues from the conversation. Fill its Session Continuity section too: what this session set up, what remains, and "Start here" pointing at the first task or goal. Session notes live there rather than in the instructions file, because every tool reads `STATUS.md` the same way.

## Step 6: README and git

If `README.md` still holds template text, fill in the name, description, prerequisites and the setup, dev, test and lint commands, and keep its architecture part short with a link to `docs/decisions/`.

If the project has no `.git`, run `git init` and commit the scaffold, naming the files you created: `chore: initialize project with Agent Blueprint`. If git already exists, commit nothing; report what changed so the user can review it first, since the scaffold touched files they own.

## Step 7: Summary

```
✓ Scaffold — [created N, merged N, kept N]
✓ CONVENTIONS.md — [stack and commands]
✓ GOALS.md — [N objectives]
✓ STATUS.md — [current state]
✓ README.md — [updated / unchanged]
✓ Git — [initialized / already existed]
Gaps: [anything still "not yet known"]
```

Then suggest a next step: the ab-brainstorming skill to design the first piece of work, ab-project-status to see where things stand, or ab-session-wrap at the end of the session.

## Boundaries

- Install no dependencies and write no application code: this skill sets up documentation, and a dependency choice is the user's.
- Never overwrite a file with real content. When a doc already has content, merge into it; the scaffold script already follows this rule, so keep to it in the steps after.
