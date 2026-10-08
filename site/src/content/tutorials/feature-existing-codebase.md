---
description: Add a feature to a codebase you already have with Agent Blueprint in Claude Code, from project setup and a codebase map through the build pipeline's checkpoints to a merge and a handover. Recorded from a real run.
recorded: 8 October 2026
project: shop-reports, a small Node.js reports server
tool: Claude Code 2.1.294
model: Opus 5.5 at xhigh effort
mode: auto
took: 1 h 20 min, answers included
---

This tutorial adds a feature to code that existed before the blueprint. The feature is "Add CSV export to the reports page".

The stand-in for your codebase is shop-reports, a Node.js server with no dependencies that reads `data/orders.json` and shows sales by region on `/reports`, with a month filter. It had two commits and 9 passing tests. Every prompt below is the one typed in a recorded run, and every file, commit and line of output is what that run produced. With your own codebase, the answers, file names and test counts will be different.

Most of the work happens in `ab-build-pipeline`, which stops after every stage until you say to go on. In this run the pipeline took 59 minutes and asked 12 question forms, and the whole session took 1 hour 20 minutes.

You need Claude Code with Agent Blueprint installed (see [Getting started](/docs/getting-started/#claude)) and your code in a git repository. The setup step reads the code and runs its tests.

The session runs in `auto` permission mode. In that mode Claude Code's classifier approves safe tool calls by itself, so you answer the skills' questions and are not asked to approve every command. In this run no permission prompt appeared, and 94 tool calls show "Allowed by auto mode classifier".

## Start Claude Code in your project

Time: about 30 seconds

In the project folder:

```bash
claude --permission-mode auto
```

### What happens

Claude Code asks "Quick safety check: Is this a project you created or one you trust?" with "No, exit" selected. Pick "Yes, I trust this folder"; pressing Enter straight away quits. The footer then reads `auto mode on (shift+tab to cycle)`.

### Why it matters

The skills read and write project files, so the session has to trust the folder.

### Checkpoint

The footer shows the project name and `auto mode on`.

## Set up the project files

Skills: `ab-project-start`
Time: 2 min 31 s

Type the skill name and pick it from the menu, which lists it as `/agent-blueprint:ab-project-start`:

```prompt
/ab-project-start
```

### What happens

The skill ran its scaffold script: "created 18, merged 1 (.gitignore, 32 lines added), kept 0". The new files include `AGENTS.md`, `CLAUDE.md`, `BACKLOG.md`, `blueprint.local.md` and `docs/context/` with `CONVENTIONS.md`, `GOALS.md` and `STATUS.md`. It left the code, the tests, `data/` and `package.json` alone, and kept the `README.md` because it already had real content.

It read the code and ran the tests ("Tests pass (9/9)"), then asked one form of four questions built on what it had read. The run's answers:

- "Here's my read of the stack: plain Node.js ESM (engines ≥22; v26 locally), no dependencies, built-in `node --test` (9 tests, all passing), no linter or formatter, and `npm start` serving on :3000. Is that right?" Yes, no linter.
- "What are the top goals right now?" It offered guesses from the code. Typed instead: "1. Let people download the reports page as a CSV file for spreadsheets. 2. Add a sales-by-customer report."
- "Is there anything an agent must never modify without asking, beyond the usual defaults (.env, CI, new dependencies)?" `data/orders.json`, so the tests use their own fixtures.
- "Do you work on this alone or with a team?" Typed: "Solo, with a short-lived feature branch for each feature, merged into main locally."

A follow-up set the priorities: CSV export P1, the customer report P2.

It found a real bug in the app and logged it in `STATUS.md` and `BACKLOG.md` without fixing it: "If data/orders.json can't be read or parsed, the first request to /reports stops the whole Node process instead of returning a 500." Its report also pointed out that `docs/` now holds example files from the template, one of them `docs/specs/example-csv-export.md`, "which has nothing to do with your CSV goal". Delete the examples when you start. It committed nothing: "Nothing is committed, since the scaffold added files to a repo you already own."

### Why it matters

Later skills read the test command, the goals and the files they must not touch from these files instead of asking again.

### Checkpoint

`docs/context/CONVENTIONS.md` names your test command and any read-only files, and `git status` shows the new files as untracked and `.gitignore` as modified.

## Commit the setup

Time: 26 seconds

```prompt
Commit the setup.
```

### What happens

It followed the git workflow you gave in the setup: it committed on a short-lived branch, `chore/agent-blueprint-setup`, moved `main` forward to it and deleted the branch. The commit, `chore: initialize project with Agent Blueprint`, sits on top of the two existing commits. `blueprint.local.md` and `.agent-blueprint/.gitignore` stay out of it on purpose, since both are ignored.

### Why it matters

The scaffold changed a file you own (`.gitignore`), so the commit waits until you have looked at it.

### Checkpoint

`git log --oneline -1` shows `chore: initialize project with Agent Blueprint`.

## Map the codebase

Skills: `ab-codebase-mapping`
Time: 5 min 24 s, and 10 seconds for the commit

```prompt
/ab-codebase-mapping
```

When it has saved the map, commit it:

```prompt
Commit the map and the backlog entries.
```

### What happens

"The codebase is small (four source files, two test files), so one mapper helper covers it." The helper read the whole project without changing anything (3 min 34 s). The session then checked the helper's line references against the code, reproduced its crash finding, and saved `docs/context/CODEBASE-MAP.md`. Five concerns went into `BACKLOG.md`. What it reported:

- Architecture: "This is one Node process with no dependencies, built in layers. src/server.js handles routing and checks the month, src/data.js reads data/orders.json on every request, src/reports.js filters and groups the orders and sums in cents, and src/views/reports-page.js renders the HTML."
- The top concern: "High: the server process dies on bad order data. The async request handler has no error path." It found a second trigger for the crash: one order with no date, combined with a `?month=` request.
- Where to look next, for the CSV goal: "the CSV route should share the month parsing and the rows/total step with the HTML route, so the two can't drift apart."

While the map was being saved, a write hook printed a prompt-injection warning for `CODEBASE-MAP.md`. The session looked at the text that matched, the words "Blueprint instructions" in the map's table of modules, and called it a false positive. If you see the warning, look at what matched before you carry on.

The commit went through a short-lived branch again: `docs: add codebase map and backlog its concerns`.

### Why it matters

The design and plan that follow start from the map's file paths and concerns, not from guesses. Here the crash it found became the first decision of the pipeline.

### Checkpoint

`docs/context/CODEBASE-MAP.md` exists with Architecture, Concerns and Recommendations sections, and `git log --oneline -1` shows the map commit.

## Build the feature with checkpoints

Skills: `ab-build-pipeline`, `ab-discuss`, `ab-brainstorming`, `ab-writing-plans`, `ab-executing-plans`, `ab-review-swarm`, `ab-resolve-in-parallel`, `ab-verification-before-completion`, `ab-knowledge-compounding`
Time: 59 min 23 s, answers included

Name the pipeline and the feature. Put your own feature in place of this one:

```prompt
/ab-build-pipeline Add CSV export to the reports page
```

### What happens

The pipeline runs one stage at a time and stops at a checkpoint after each. Every question came as a form with a recommended option, and the run took the recommendation each time except where a typed answer is shown.

#### Stage 1: Discuss

`ab-discuss` read the goals, the codebase map and the earlier decisions, then asked four questions in one form:

- The codebase map found that bad order data crashes the server, and the CSV route goes through the same handler. How should that be handled? Fix it first, on this branch.
- Should the CSV end with a Total row, like the table on the page? Yes.
- Which spreadsheet setup should the file target? Comma separators and dot decimals.
- Do the success criteria in `GOALS.md` still hold? Yes, as written.

The requirements scored 0.89 on its ambiguity gate, above the 0.8 bar. It wrote the decisions to `docs/context/DECISIONS.md` and stopped: "These are the locked decisions I'll plan around. Confirm or adjust?" About 3 minutes.

#### Stage 2: Brainstorm

`ab-brainstorming` set out what you said and what it assumed, then offered three approaches: a separate `/reports.csv` route (recommended), the same route with `?format=csv`, or building the CSV in the browser. The run took the separate route. The design came in four sections, architecture, data flow and file format, error handling and testing, each approved with "Looks right". It included the expected file for all months:

```text
Region,Orders,Total
West,4,945.49
North,3,435.75
East,3,387.75
South,2,154.00
Total,,1922.99
```

The format decisions were a UTF-8 byte order mark, CRLF line endings, standard CSV quoting, and a leading `'` on text cells that start with `=`, `+`, `-` or `@`, so a spreadsheet does not run them as formulas. Before writing the design down it checked one claim it depended on by running Node. It saved `docs/plans/2026-10-08-csv-download-design.md`, created the branch `feat/csv-download` and committed. About 4 and a half minutes.

#### Stage 3: Plan

Three research helpers ran in parallel, on earlier learnings, the Node documentation and the code the change touches. In the session's words, "Research before the plan changed it: Node's captureRejections server option turned out to do nothing". `ab-writing-plans` then wrote `docs/plans/2026-10-08-csv-download.md` with seven tasks (an error boundary for the crash, a shared `regionReport`, moving `money` to `src/views/format.js`, the CSV encoder, `GET /reports.csv`, the download link, the docs), a Boundaries list and a Review Focus list. A plan-checker helper spent 3 min 54 s on it and found no blocking issue.

Two questions followed: approve the plan, and how should Stage 4 run, with the choices sequential batches of three (recommended), team waves, or all tasks with no check-ins. The summary on screen before this question was one line, and the full plan is only in the file, so open `docs/plans/` and read it before you approve. About 16 minutes, most of it research.

#### Stage 4: Execute

`ab-executing-plans` ran the tasks in batches of three and recorded each test's failing run before the code that made it pass. After each batch it reported and asked whether to go on:

- Batch 1: the error boundary fix, `regionReport`, and `money` moved to `src/views/format.js`. 12 of 12 tests passing.
- Batch 2: the CSV encoder, the `/reports.csv` route and the download link. 23 of 23. It also started the real server: "/reports.csv?month=2026-09 returns 200, text/csv; charset=utf-8, and attachment; filename="sales-by-region-2026-09.csv". The body starts with efbbbf, has CRLF line endings, and totals 697.99, the same as the page."
- Task 7: the docs.

About 10 minutes.

#### Stage 5: Review

`ab-review-swarm` started six reviewers in parallel, chosen for this diff: code-reviewer, security-sentinel, performance-oracle, code-simplicity-reviewer, convention-enforcer and test-coverage-reviewer. It left out the others because the change had no UI, database or architecture work. A validator rejected 3 of the 13 raw findings, and a synthesizer merged the rest: "Summary: 0 P1 · 4 P2 · 1 P3." The coverage reviewer "broke the code in 32 small ways and 11 of those breaks went unnoticed by the suite". The P3 was a real bug: the request URL went into `console.error` as its format string, so a URL with `%c3%a9` in it, an encoded é, dropped the error and stack from the log line.

It asked three questions in one form: apply the P3 fix (yes), how to handle `;` inside a text cell, which Excel in semicolon locales would split (also quote `;` and tab), and whether to apply three findings that fell below the confidence threshold (apply all three). `ab-resolve-in-parallel` then fixed them in seven commits: "Totals: 9 applied, 0 deferred, 0 skipped." 29 tests passing. About 20 minutes.

#### Stage 6: Verify

`ab-verification-before-completion` ran fresh checks: "The suite is clean (29/29), every branch commit passes independently", "All 17 mutants fail against the baseline", and "All 38 live checks pass." It named the one thing it could not check: opening the CSV in Excel, Google Sheets or Numbers. It updated `STATUS.md`. Stage 7, the deploy check, did not apply. About 2 minutes.

#### Stage 8: Knowledge capture

`ab-knowledge-compounding` asked whether to record two lessons and, with "Capture both", wrote `docs/solutions/2026-10-08-node-http-async-handler-error-boundary.md` and a line in `docs/learnings/LEARNINGS.md`.

The final report ended:

```text
  What I checked
  - Tests: 29 pass (up from 9), and each of the 18 commits on the branch passes on its own.
  - Mutation check: I broke the code in 17 deliberate ways, and the tests caught every one.
  - Real data: on the live server, the CSV matched the page exactly for all time, each month (2026-08, -09, -10), and an empty 2026-11.
  - Constraints: no new dependencies, and data/orders.json is untouched.
  - Not checked: I didn't open the file in Excel, Google Sheets or Numbers.
```

Nothing was merged or pushed; that is the next step.

### Why it matters

Each stage stops for you, so a wrong decision, such as the shape of the route or the file format, is caught before code exists. Most of the hour is helpers: research, the plan check, six reviewers, the validator and the synthesizer.

### Checkpoint

`git log --oneline main..feat/csv-download` lists the branch's commits (18 here), `npm test` shows `ℹ pass 29`, and `docs/solutions/` has the new file.

## Finish the branch

Skills: `ab-finishing-a-development-branch`
Time: 2 min 57 s

```prompt
/ab-finishing-a-development-branch
```

### What happens

It ran the tests ("Step 1 confirms all 29 tests pass"), found the base (`main`), and had a read-only helper audit every task of the plan against the branch (1 min 33 s). Four tasks were DONE and three CHANGED, each with its reason; for the CSV encoder, it "also quotes ; and tab, which you decided in review". "The audit passes the gate. No row is NOT DONE or PARTIAL."

It then asked "Implementation complete. What would you like to do?" with three options: merge to `main` locally, push and create a PR (noting that this repository has no remote), or keep the branch. With merge locally: "The CSV download is now on main. The branch fast-forwarded to d8c9b07 and its 18 commits landed unchanged. Tests on the merged main give 29/29 with exit 0." It deleted `feat/csv-download`.

### Why it matters

The merge happens only after the tests pass again and every plan item is accounted for, either done as planned or changed with a reason you agreed to.

### Checkpoint

`git branch` lists only `main`, `npm test` on `main` passes (29 here), and the reports page has a "Download CSV" link to `/reports.csv`.

## Hand over to the next session

Skills: `ab-session-wrap`, `ab-brainstorming`
Time: 2 min 0 s

```prompt
/ab-session-wrap
```

### What happens

It printed a summary of the session: the changes, the bugs fixed, the decisions, the remaining work, and two questions only the owner can answer. Then it asked "Is this session summary accurate?" With "Accurate, update the docs" it rewrote `docs/context/STATUS.md` from the git log and a fresh test run, marked goal 1 done in `GOALS.md`, added two follow-ups to `BACKLOG.md` and a completion note to the plan, and committed through a short-lived branch as before. The new `STATUS.md` opens its next step with "Start here: Run the ab-brainstorming skill for goal 2."

### Why it matters

The next session, in Claude Code or another tool, starts from `STATUS.md` instead of from memory.

### Checkpoint

`docs/context/STATUS.md` says goal 1 is merged and has a "Start here" line that names the next step.

## Recap

| Skill | What it produced |
|---|---|
| `ab-project-start` | `AGENTS.md`, `CLAUDE.md`, `BACKLOG.md` and `docs/context/` with `CONVENTIONS.md`, `GOALS.md` and `STATUS.md`; the setup commit |
| `ab-codebase-mapping` | `docs/context/CODEBASE-MAP.md` and five concerns in `BACKLOG.md` |
| `ab-build-pipeline` | The staged run in the rows below, with a checkpoint after each stage and a final report |
| `ab-discuss` | `docs/context/DECISIONS.md`, the locked decisions |
| `ab-brainstorming` | `docs/plans/2026-10-08-csv-download-design.md` and the `feat/csv-download` branch |
| `ab-writing-plans` | `docs/plans/2026-10-08-csv-download.md`, seven tasks |
| `ab-executing-plans` | `src/views/reports-csv.js`, `src/views/format.js`, the `GET /reports.csv` route in `src/server.js`, the Download CSV link and `test/reports-csv.test.js` |
| `ab-review-swarm` | A review with 0 P1, 4 P2 and 1 P3 findings from six reviewers, a validator and a synthesizer |
| `ab-resolve-in-parallel` | The review fixes, with 29 tests passing |
| `ab-verification-before-completion` | Fresh evidence: 29 of 29 tests, 17 of 17 mutants caught, 38 live checks; the `STATUS.md` update |
| `ab-knowledge-compounding` | `docs/solutions/2026-10-08-node-http-async-handler-error-boundary.md` and a line in `docs/learnings/LEARNINGS.md` |
| `ab-finishing-a-development-branch` | The plan audit (4 DONE, 3 CHANGED) and the fast-forward merge into `main` |
| `ab-session-wrap` | The updated `STATUS.md`, `GOALS.md` and `BACKLOG.md` and their commit |
