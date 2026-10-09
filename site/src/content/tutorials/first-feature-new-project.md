---
description: Take an empty git repository to a merged first feature with Agent Blueprint in Claude Code, from project setup and design through a reviewed build. Recorded from a real run.
recorded: 8 October 2026
project: tally, a Node.js tool that totals an expenses CSV
tool: Claude Code 2.1.291
model: Opus 5.5 at xhigh effort
mode: auto
took: 1 h 50 min, answers included
---

This tutorial goes from an empty folder to a first feature merged into `main`. The project is tally, a small Node.js command-line tool that reads an expenses CSV file, and the feature is a report of the total spent per category.

Every prompt below is the one typed in a recorded run, and every file, commit and line of output is what that run produced. Your own project will give different answers, file names and test counts.

The skills stop and ask before they decide anything that matters, so stay at the keyboard. The whole run took 1 hour 50 minutes. Most of it was the build, where every task gets its own implementer and two reviewers.

You need Claude Code with Agent Blueprint installed (see [Getting started](/docs/getting-started/#claude)) and git. The example project also needed Node.js 22 or later; yours needs whatever it builds with.

The session runs in `auto` permission mode. In that mode Claude Code's classifier approves safe tool calls by itself, so you answer the skills' questions and are not asked to approve every command. In this run no permission prompt appeared, and 34 tool calls show "Allowed by auto mode classifier".

## Create the repository and start Claude Code

Time: about 30 seconds

In a new, empty folder:

```bash
git init -b main
claude --permission-mode auto
```

### What happens

Claude Code asks "Quick safety check: Is this a project you created or one you trust?" with "No, exit" selected. Pick "Yes, I trust this folder"; pressing Enter straight away quits. The footer then reads `auto mode on (shift+tab to cycle)`.

### Why it matters

The skills write files into the project, so the session has to trust the folder. Nothing else needs to exist yet: the blueprint works in any git repository, even one with no commits.

### Checkpoint

The footer shows the folder name, the branch `main` and `auto mode on`.

## Set up the project

Skills: `ab-project-start`
Time: 2 min 19 s of agent time, about 4 minutes with the answers

Type the skill name and pick it from the menu, which lists it as `/agent-blueprint:ab-project-start`:

```prompt
/ab-project-start
```

### What happens

The skill runs its scaffold script. The folder held only `.git`, so it created 22 files, among them `AGENTS.md`, `CLAUDE.md`, `BACKLOG.md`, `blueprint.local.md` and the three project files in `docs/context/`: `CONVENTIONS.md`, `GOALS.md` and `STATUS.md`.

With no code to read, it asked one form of four questions. These were the run's answers; give your own:

- "What is this project?" tally: a small Node.js command-line tool that reads an expenses CSV file and prints reports from it.
- "Which stack should the conventions assume?" Plain JavaScript (ES modules) on Node 22 or later, no dependencies, tests with the built-in `node:test` runner via `npm test`, no linter yet.
- "What are the top goals right now?" Totals per category, totals per month, and exporting a report as CSV.
- "Do you work alone on this or with a team?" Solo, which sets short-lived branches merged locally.

A second form confirmed the goal priorities (P1 to P3, in that order) and asked what the CSV looks like: a `date,category,amount` header, dates like `2026-10-08`, amounts like `12.50`.

It filled in `CONVENTIONS.md` (the test command `npm test`, the solo git flow), `GOALS.md` (the three goals with their priorities) and `STATUS.md`, wrote a `README.md`, and listed the gaps it saw, such as the missing linter. Its report also said that `npm test` will not run until a `package.json` exists (the plan's first task adds one), and that `docs/` holds four example files from the template, an auth plan, a JWT research note, a CSV-export spec and a sample decision record, which you can delete.

Because the repository already existed, it committed nothing and left the files for you to review.

### Why it matters

Every later skill reads the test command, the goals and the git workflow from these files instead of asking again.

### Checkpoint

`docs/context/GOALS.md` lists your goals with their priorities, `docs/context/CONVENTIONS.md` names your test command, and `git status` shows the new files as untracked.

## Commit the scaffold

Time: 29 seconds

The skill offers to make the commit. Accept:

```prompt
Yes, commit the scaffold.
```

### What happens

It committed 21 files as `chore: initialize project with Agent Blueprint`, the repository's first commit, and left the working tree clean. Two files stay out on purpose: `.agent-blueprint/.gitignore` ignores itself, and `blueprint.local.md` holds your own settings and is ignored.

### Why it matters

The project files are now part of the history. `AGENTS.md` loads in every session, whichever coding agent you use, and sends it to `docs/context/` before it changes code.

### Checkpoint

`git log --oneline` shows one commit, `chore: initialize project with Agent Blueprint`.

## Design the feature

Skills: `ab-brainstorming`, `ab-writing-plans`
Time: about 9 and a half minutes, answers included

Name the skill and describe the feature in one sentence. Put your own feature in place of this one:

```prompt
/ab-brainstorming Add a report that prints the total spent per category from an expenses CSV
```

When a design section is on screen and you agree with it, reply:

```prompt
approve
```

### What happens

The skill keeps a checklist of its steps in `.agent-blueprint/plans/category-totals.progress.md` and judged the feature worth a full design: "This is architectural work, so I'll give it a proper design". It asked one question first, "Where will the expenses CSVs come from?", and the answer "I write them myself" made it keep the parser strict.

Then came one form of four questions, each with a recommended option. The run took every recommendation:

- Should the parser handle quoted fields? Yes, support quoting now.
- How should negative amounts (refunds) be treated? Allow and subtract.
- What should happen when the file has bad rows? List them all and print no report.
- How should the report be laid out? Largest first, with a grand total.

It offered two approaches, each with a sketch of the files. The run picked the first, a pipeline of small modules (`src/csv.js`, `src/expenses.js`, `src/totals.js`, `src/format.js` and `src/cli.js`) that groups by a key, so the monthly report later needs only a different key. The other was a three-file minimum to refactor later. It also offered one optional extra, a `bin` entry for a `tally` command; "Not now" put it in `BACKLOG.md`.

The design came in four sections (architecture, data flow and output, error handling, testing), with an approval question after each. In this run the first two sections showed only as a one-line summary before their question. If that happens, ask to see them before you approve. The run typed "Please show me sections 1 and 2 in full first. I only see a one-line summary on screen." The skill printed both in full, with the expected output and six stated assumptions, and asked in plain text from then on:

```text
groceries    142.10
transport     12.90
eating out    -3.00
-------------------
total        152.00
```

Two `approve` replies accepted the four sections. It wrote `docs/plans/2026-10-08-category-totals-design.md`, committed it as `docs(plans): design the category totals report`, and started `ab-writing-plans` by itself.

### Why it matters

No code is written until you approve a design. The questions settle the rules that would otherwise be guessed, such as quoting, refunds and bad rows, and the stated assumptions give you a chance to correct the rest.

### Checkpoint

`docs/plans/` holds a design file named after the date and your feature, and `git log --oneline` shows its commit.

## Review the plan and choose how to build it

Skills: `ab-writing-plans`, `ab-deepen-plan`, `ab-subagent-driven-development`, `ab-orchestrate`
Time: 4 min 58 s from your last approval to the saved plan, plus your reading time

Read the plan it saved, then pick option 2:

```prompt
2
```

### What happens

`ab-writing-plans` saved `docs/plans/2026-10-08-category-totals.md`, 367 lines with context for the executor, the interfaces between modules, a Boundaries list, seven tasks built test first and a Review Focus list. Every step in it is one action with a command and an expected result. It committed nothing yet, so you can edit the plan first.

It then asked how to run the plan, with a recommendation:

1. Deepen the plan with `ab-deepen-plan`: research helpers add best practices and docs to each section. It called this low value here, with no framework involved.
2. Subagent-driven, in this session, with `ab-subagent-driven-development`: a fresh helper per task and a code review between tasks. Recommended.
3. Team work with `ab-orchestrate`: task 1 first, tasks 2 to 5 as one parallel wave, then tasks 6 and 7. The fastest option.

### Why it matters

The plan fixes every file and test before any code is written, and you review it before anything runs. The recommendation weighs speed against oversight: for seven small tasks it chose a review after every task over saving a few minutes.

### Checkpoint

`docs/plans/2026-10-08-category-totals.md` (yours is named after your feature) ends with a `## Review Focus` section.

## Build, with a review after every task

Skills: `ab-subagent-driven-development`
Time: about 84 minutes: 75 for the seven tasks, 9 for the final review

Nothing to start: the build begins when you pick option 2. It stopped twice with a question, and both times the run took the recommended option:

```prompt
1
```

### What happens

The skill created the branch `feat/category-totals`, committed the plan, and tracked the tasks in `.agent-blueprint/plans/2026-10-08-category-totals.progress.md`. Each task got three helpers in turn, shown in the agents panel under the prompt: an implementer, a spec reviewer that reads the diff itself and checks it against the task, and a code-quality reviewer. Findings went back to the implementer as fix rounds.

| Task | Review result |
|---|---|
| 1. `package.json` | Ready |
| 2. CSV parser, `src/csv.js` | Fix rounds after both reviews: the code reviewer broke three rules on purpose in a scratch copy, the tests stayed green, and the implementer added tests for them |
| 3. Expense validation, `src/expenses.js` | A bug the design had missed, put to you |
| 4. Totals, `src/totals.js` | Ready, no findings |
| 5. Formatting, `src/format.js` | Ready, one advisory point sent to the backlog |
| 6. Command line and end-to-end tests, `src/cli.js` | A bug the design had missed, put to you |
| 7. Docs | Ready, two optional suggestions taken |

The two questions:

- Task 3: "an unquoted comma inside an amount silently gives the wrong total. If you type 2026-09-01,groceries,1,000.00, the CSV comma splits the amount into 1 and 000.00." Option 1 added a "too many fields" check.
- Task 6: "a file saved in a non-UTF-8 encoding is read without any error." The reviewer saved a Windows-1252 file with the categories Café and Cafë, and tally merged them into one. Option 1 added a strict UTF-8 check.

After the last task a fresh reviewer read the whole branch. Its verdict was "ready with fixes: four minor suggestions, nothing Critical or Important". Its evidence included line coverage of 100% in four of the five modules and a 300,000-input comparison of the CSV parser against an independent parser with no differences. Three of the suggestions were fixed in one more commit, `docs: mark the plan complete and align the header wording`, and the reviewer approved. The skill then deleted the progress file.

If Claude Code's agent teams setting is on, as it was in this run, the helpers show as teammates (for example `@implementer-task-1`) and each report arrives twice. The session says so ("That message repeats the Task 1 code review that's already handled") and carries on.

### Why it matters

Each task is checked against the plan and for quality before the next one starts. That is how both silent wrong-total bugs were caught before they reached `main`. The whole-branch review then looks for problems that only show across tasks.

### Checkpoint

During the build the progress file ticks each task. At the end `npm test` passes (61 tests in this run, from 0), and the final reviewer's verdict in the session is approved.

## Merge the branch

Skills: `ab-finishing-a-development-branch`, `ab-session-wrap`
Time: about 5 minutes

The skill starts by itself after the final review. When it asks what to do, merge locally:

```prompt
1
```

### What happens

`ab-finishing-a-development-branch` ran the tests again (61 of 61), found the base branch (`main`), and had a read-only helper audit the plan against the diff. Its result: tasks 1, 2, 4 and 5 done as planned; tasks 3, 6 and 7 changed, each matching a deviation recorded in the plan; and a list of unplanned work, such as the extra tests the implementers added. Nothing blocked the merge, and it asked:

```text
Implementation complete. What would you like to do?
1. Merge back to main locally
2. Push and create a Pull Request
3. Keep the branch as-is (I'll handle it later)
```

With option 1 it fast-forwarded `main`, ran the tests on the merged result, deleted the branch and ran the real command:

```text
$ node src/cli.js category tests/fixtures/expenses.csv
groceries    42.10
eating out   15.00
transport    12.90
snacks        0.30
------------------
total        70.30
```

The run ended here. `docs/context/STATUS.md` still says the branch waits for review, because `ab-session-wrap`, which brings it up to date at the end of a session, was not run. The next tutorial shows that step.

### Why it matters

The branch reaches `main` only after a fresh test run and a check that every item of the plan is in the diff, or is a change you agreed to.

### Checkpoint

`git branch` lists only `main`, and your feature runs from `main`: here, `node src/cli.js category tests/fixtures/expenses.csv` prints the table above and exits with 0.

## Recap

| Skill | What it produced |
|---|---|
| `ab-project-start` | `AGENTS.md`, `CLAUDE.md`, `README.md`, `BACKLOG.md` and `docs/context/` with `CONVENTIONS.md`, `GOALS.md` and `STATUS.md`; the scaffold commit |
| `ab-brainstorming` | `docs/plans/2026-10-08-category-totals-design.md` and its commit |
| `ab-writing-plans` | `docs/plans/2026-10-08-category-totals.md`: seven tasks, Boundaries and Review Focus, and the choice of how to run it |
| `ab-subagent-driven-development` | The `feat/category-totals` branch: five modules in `src/`, five test files and eight fixtures in `tests/`, a spec and a code review for every task, and the whole-branch review with its fix commit |
| `ab-finishing-a-development-branch` | The plan audit, the merge into `main` with 61 passing tests, and the deleted branch |
