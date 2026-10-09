---
description: Run a feature with nobody watching. The ship runner drives ab-ship-pipeline through Claude Code's headless mode, scans the commits for secrets, pushes the branch and opens the pull request. Recorded from a real run.
recorded: 8 October 2026
project: shop-reports, a small Node.js reports server
tool: Claude Code 2.1.294, headless
model: Opus 5.5 at xhigh effort
mode: auto
took: 39 min 31 s, one iteration
---

This tutorial runs a feature from a terminal with nobody at the keyboard, from one command to an open pull request.

The ship runner, a script in your Agent Blueprint checkout, starts Claude Code in headless mode. There `ab-ship-pipeline` plans, builds, reviews and commits the feature without stopping to ask. The runner then scans the commits for secrets, pushes the branch and opens the pull request. The project is the shop-reports app from the previous tutorial, at its first two commits, and the feature is "Add a sales-by-customer report to the reports page". Every command below is the one typed in a recorded run, and every line of output is what that run printed. For the run the project went to a new private GitHub repository; yours can be any project on GitHub.

The run took 39 minutes 31 seconds in one iteration, and its terminal printed nothing for most of that time.

You need:

- Claude Code, signed in, with Agent Blueprint installed (see [Getting started](/docs/getting-started/#claude)).
- A clone of the Agent Blueprint repository. The runner is `skills/ab-ship-pipeline/scripts/run.sh` inside it; below, `<checkout>` stands for the folder you cloned it to.
- The GitHub CLI, `gh`, signed in. The runner pushes the branch and opens the pull request with it.
- Your project in git, with a remote on GitHub.

The runner starts every iteration as `claude -p --permission-mode auto`. Its preflight describes that posture as "auto-approve safe tools; a dangerous rm is denied", and the README lists it as the least privilege that still lets Claude Code finish a run. Nobody is there to answer a permission prompt; in this run the runner reported "denials logged: 0".

## Add the project files

Skills: `ab-project-start`
Time: a few seconds

In the project folder:

```bash
bash <checkout>/install.sh --scaffold .
git add -A && git commit -m "chore: add Agent Blueprint project files"
```

### What happens

The installer only scaffolds; it installs nothing into your tools. It prints a line for every file, `created AGENTS.md`, `created BACKLOG.md` and so on, and ends with:

```text
    scaffold: 18 created, 1 merged, 0 kept
  ✓ Project scaffolded
```

The merged file is `.gitignore`. The commit then records the project files.

This route leaves `docs/context/CONVENTIONS.md`, `GOALS.md` and `STATUS.md` as templates; filling them in is the job of `ab-project-start` in a session. The run coped by picking its own check and logging the choice: `Lint/verification gate with CONVENTIONS.md unfilled -> npm test (node --test); follow the code idiom`. If your project has no obvious test command, run `/ab-project-start` in a session first, as the first two tutorials do, so the run has your real commands.

### Why it matters

The runner needs a clean working tree, so the project files have to be committed before the run starts.

### Checkpoint

`AGENTS.md` and `docs/context/` exist, and `git status --short` prints nothing.

## Put the project on GitHub

Time: about 5 seconds

Skip this step if your project already has a GitHub remote. The recorded run created a new private repository, named `ab-tutorial-scratch-20261008`; put your own name in place of `<name>`:

```bash
gh repo create <name> --private --source . --remote origin --push
```

### What happens

`gh` creates the repository, adds it as `origin` and pushes `main`:

```text
https://github.com/Ninety2UA/ab-tutorial-scratch-20261008
To https://github.com/Ninety2UA/ab-tutorial-scratch-20261008.git
 * [new branch]      HEAD -> main
branch 'main' set up to track 'origin/main'.
```

If you make a throwaway repository to try this, deleting it later needs the `delete_repo` scope, which `gh` does not have by default. In the recorded run `gh repo delete` failed with `HTTP 403: Must have admin rights to Repository.` Run `gh auth refresh -h github.com -s delete_repo` first, then `gh repo delete <owner>/<name> --yes`.

### Why it matters

The runner pushes the branch and opens the pull request itself, so it needs a remote and a signed-in `gh`.

### Checkpoint

`git remote -v` lists `origin`.

## Create a feature branch

Time: a moment

Name the branch after your feature:

```bash
git switch -c feat/sales-by-customer
```

### What happens

git starts the branch at the commit with the project files. The runner later records that commit as the base of the run.

### Why it matters

The runner refuses to run on the default branch, and it needs a clean working tree.

### Checkpoint

`git status --short` prints nothing, and `git branch` marks `feat/sales-by-customer` (or your branch) as current.

## Do a dry run

Skills: `ab-ship-pipeline`
Time: about 18 seconds

The README says to add `--dry-run` first. Put your own feature in the quotes:

```bash
bash <checkout>/skills/ab-ship-pipeline/scripts/run.sh --host claude --dry-run "Add a sales-by-customer report to the reports page"
```

### What happens

The runner checks everything it needs and starts nothing. After a first line naming the tool, the branch and the project folder, it printed:

```text
  ▸ Dry run: preflight only, nothing starts.
  ▸ Posture: claude -p --permission-mode auto (auto-approve safe tools; a dangerous rm is denied)
  ▸ Helpers per wave: 20 · iteration timeout: 3600s · max iterations: 10
  ▸ claude: logged in
  ▸ claude: -p skips the workspace trust dialog; nothing to trust
  ▸ gh: authenticated
  ▸ Working tree clean
  ▸ Would record base c0cea3c, branch feat/sales-by-customer, push URL https://github.com/Ninety2UA/ab-tutorial-scratch-20261008.git, pull requests in github.com/Ninety2UA/ab-tutorial-scratch-20261008
  ▸ Would run per iteration: claude with the skill prompt for: Add a sales-by-customer report to the reports page
  ▸ Skill reference on this host: /ab-ship-pipeline
  ✓ Dry run complete
```

Most of the 18 seconds went to the `claude` and `gh` sign-in checks.

### Why it matters

Before anything changes you see where the run will push, which permission posture it uses, and that both CLIs are signed in.

### Checkpoint

The last line reads `✓ Dry run complete`, and the push URL is your repository.

## Start the run

Skills: `ab-ship-pipeline`
Time: 39 min 31 s

Run the same command without `--dry-run`. The README advises keeping the runner's output, because its own stop messages go only to the terminal; this keeps a copy outside the project folder, as the recorded run did:

```bash
bash <checkout>/skills/ab-ship-pipeline/scripts/run.sh --host claude "Add a sales-by-customer report to the reports page" 2>&1 | tee ../ship-run.log
```

### What happens

After the same preflight checks, the runner recorded the base, probed the posture and started the first iteration:

```text
  ▸ Recorded base c0cea3c on feat/sales-by-customer, push URL https://github.com/Ninety2UA/ab-tutorial-scratch-20261008.git, pull requests in github.com/Ninety2UA/ab-tutorial-scratch-20261008
  ▸ Probe: the posture can write .git; the skill commits

  → iteration 1: starting claude (18:45:27)
```

Then nothing appeared for 39 minutes. It has not hung: the next step shows how to watch it. When the iteration finished, the runner printed the session's last message and took over publishing:

```text
    last message: The `/reports` page now has a "Sales by customer" table under the region table, and the work is committed on `feat/sales-by-customer`. I didn't push or open a P
  → iteration 1: status done, stage ship

  ▸ Publishing feat/sales-by-customer
  ▸ Scanning the 7 commit(s) the push would publish and the PR body for secrets
  ✓ No secrets found
  ✓ Pushed feat/sales-by-customer to https://github.com/Ninety2UA/ab-tutorial-scratch-20261008.git
  ✓ Opened pull request: https://github.com/Ninety2UA/ab-tutorial-scratch-20261008/pull/1

  Run complete: published after 1 iteration(s).
    iterations: 1 · transient retries: 0 · timeouts: 0 · failed iterations: 0 · denials logged: 0 · 39m31s
```

Its last line names the folder of its logs, `~/.local/state/agent-blueprint/<repo hash>/logs/`. The runner's exit code was 0, which means published.

### Why it matters

Nothing in the run stops to ask you. The skill makes each decision itself and records it, and the runner publishes only after its own secret scan.

### Checkpoint

The output ends with `Run complete: published after 1 iteration(s).`, and the line before it starts `✓ Opened pull request:` with your pull request's address.

## Follow the run from a second terminal

Skills: `ab-ship-pipeline`, `ab-writing-plans`, `ab-deepen-plan`, `ab-orchestrate`, `ab-iterative-refinement`, `ab-review-swarm`, `ab-resolve-in-parallel`, `ab-pr-workflow`
Time: any time during the run

While the runner's terminal is quiet, open a second terminal in the project folder:

```bash
cat .agent-blueprint/run/state.json
git log --oneline
```

### What happens

`ab-ship-pipeline` keeps its state in `.agent-blueprint/run/state.json`. The first version it wrote began:

```text
{
  "status": "running",
  "stage": "plan",
  "iteration": 1,
  "host": "claude",
  "driver": "runner",
```

During the run its `stage` moved from `plan` through `execute`, `review` and `verify` to `ship`, and the commits showed up in `git log` as they landed. Inside the one headless session, by local time:

- 18:46, requirements. With nobody to ask, it locked the requirements as decisions in a new `docs/context/DECISIONS.md`: a second table on `/reports`, the same `?month=` filter, a footer total, an `h2` for the new table.
- 18:47, plan. Three research helpers ran in parallel, then `ab-writing-plans` saved `docs/plans/2026-10-08-sales-by-customer-report.md` with three tasks. A plan-checker helper found no blocking issue, 2 warnings and 3 suggestions, and all five were applied.
- 18:53, deepen. `ab-deepen-plan` ran five more research helpers in parallel and a second plan check. The plan was committed at 18:58.
- 18:58, execute. `ab-orchestrate` ran the tasks as plain helpers in their own worktrees: task 1 in the first wave, tasks 2 and 3 in parallel in the second. A helper checked the result of each wave; 19 tests passed after the second.
- 19:04, review. `ab-iterative-refinement` ran `ab-review-swarm`: six reviewers in parallel, then a validator and a synthesizer. It converged in the first round with no P1 finding. `ab-resolve-in-parallel` then added three tests for gaps the review had found.
- 19:21, knowledge capture. Skipped: the skill records lessons only when the work solved a non-trivial problem, and nothing went into `docs/solutions/`.
- 19:21, ship. It closed the plan and recorded one open security decision. `ab-pr-workflow` had a helper audit the plan against the diff and wrote the pull request body to `.agent-blueprint/run/pr-body.md`. The state was set to `done` at 19:24, and the runner took over.

At the end, `git log --oneline` showed the run's seven commits on top of the project files:

```text
c8b6b71 docs(plans): close the sales-by-customer plan and record the exposure decision
4fe0517 test(reports): pin the region footer and cover & escaping in customer names
df76088 test(reports): cover float drift in salesByCustomer totals
55ba36c docs(readme): mention the sales-by-customer table
645f0fa feat(reports): show sales by customer on the reports page
3a98ec2 feat(reports): add salesByCustomer report function
1d2a1de docs(plans): plan the sales-by-customer report
```

### Why it matters

The state file is how the runner knows where the run stands, and how you can tell too. Text the agent prints never ends a run: it is done only when the state file says `done`, there are new commits since the recorded base, and the pull request body and the provenance record exist.

### Checkpoint

`state.json` shows `"status": "running"` with a `stage` that moves on, and new commits appear in `git log`.

## Read the pull request

Skills: `ab-pr-workflow`
Time: a few minutes of reading

Open the address the runner printed, or, from the project folder:

```bash
gh pr view --web
```

### What happens

The pull request, "Add a sales-by-customer report to the reports page", goes from `feat/sales-by-customer` into `main`: 7 commits, 9 files, 485 lines added and 11 removed. The body that `ab-pr-workflow` wrote has the sections What, Why, How, Testing, Review, Plan audit and Checklist, and one more headed "Needs an owner decision: who may read `/reports`". From the body:

- Testing: "`npm test` (`node --test`): 22 passing, 0 failing on the branch head. That is 9 existing tests plus 13 new".
- Review: "1 of at most 3 iterations and converged in fast mode (P1 = 0)", and "12 raw findings. A validator rejected 5, and 7 were validated: 2 P2 and 1 P3, plus 1 present-tier decision. 3 more fell below the confidence gate."
- The open decision: "`/reports` has no authentication, and the server listens on every interface". With the customer table, the page lists every customer's name, order count and revenue to anyone who can reach the port. The fixes are in categories the skill must ask about, "so this unattended run changed no code for it". The question is also in `docs/context/DECISIONS.md` and `BACKLOG.md`.
- Plan audit: every task DONE, and a list of the work the plan did not name, such as the three tests the review added and five `BACKLOG.md` entries for problems that were already there.

### Why it matters

The pull request is where the run hands back to you. Its body holds the decisions made without you, the review result and the questions only you can answer, and nothing reaches `main` until you merge it.

### Checkpoint

The pull request's Plan audit has every task DONE, and its Testing section matches what `npm test` reports on the branch.

## Check what the run left behind

Time: a few seconds

```bash
ls .agent-blueprint/run/
ls ~/.local/state/agent-blueprint/<repo hash>/logs/
```

`<repo hash>` is in the logs line at the end of the runner's output.

### What happens

The first command prints nothing. After a successful publish the runner deletes `.agent-blueprint/run/state.json`, `pr-body.md` and the provenance records; its code says "Only the runner deletes run files, and only here. Logs stay." So after a published run there is no `state.json` to open. What stays:

- the runner's logs, `probe.log` and `iteration-1.log`. The iteration log holds the headless session's result: in this run 121 turns, 26 helper sessions and no permission denials, and a list-price cost of 18.65 US dollars. The recorded account runs on a subscription, so that figure is what the API would have charged.
- the team ledger, `.agent-blueprint/team/20261008-1858-sales-by-customer-report/ledger.md`.
- the review run, `.agent-blueprint/review-runs/review-20261008-190509/`, with one JSON file per reviewer and `synthesis.md`.

### Why it matters

A published run cleans up its working files, so the logs and the pull request are your record of it. A run that stops early keeps `state.json`: the skill writes `blocked` or `needs-human` and its `reason` there, or the runner prints the reason in the terminal. Fix the cause and continue with `--resume`.

### Checkpoint

`.agent-blueprint/run/` has no `state.json`, and the logs folder lists `iteration-1.log`.

## Recap

| Skill or script | What it produced |
|---|---|
| `install.sh --scaffold` | `AGENTS.md`, `CLAUDE.md`, `BACKLOG.md` and template files in `docs/context/` (18 created, 1 merged) |
| The ship runner, `run.sh` | The preflight record, one headless iteration, the secret scan, the push and the pull request |
| `ab-ship-pipeline` | `docs/context/DECISIONS.md`; `.agent-blueprint/run/state.json` with 14 logged decisions and `pr-body.md`, both deleted by the runner after publishing |
| `ab-writing-plans` | `docs/plans/2026-10-08-sales-by-customer-report.md`, three tasks |
| `ab-deepen-plan` | Findings from five research helpers, folded into the same plan |
| `ab-orchestrate` | The team ledger in `.agent-blueprint/team/` and the feature commits: `salesByCustomer`, the customer table and the README line |
| `ab-iterative-refinement` | One review round, converged with no P1 |
| `ab-review-swarm` | Six reviewer files and `synthesis.md` in `.agent-blueprint/review-runs/` |
| `ab-resolve-in-parallel` | Two test-only commits, 22 tests passing |
| `ab-pr-workflow` | The pull request body with its Plan audit |
