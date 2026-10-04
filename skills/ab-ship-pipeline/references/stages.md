# Stage details

Loaded on demand from SKILL.md when a stage points here: the checks, gates and helper steps behind each stage.

## Intake

Ship only what is a feature. A bug report (something broke, an error to explain) goes to the ab-systematic-debugging skill first; ship the fix only once the root cause is known. A question (how does X work, should we do Y) gets an answer and the run stops: no branch, no PR. Set `status` to `blocked` with the reason "a question, nothing to ship", so neither the runner nor the Stop hook starts the run again.

`references/guardrails.md` § When NOT to Use lists the requests this skill fits badly.

## Continuation checks

Check if this is a continuation of a previous ship pipeline run:

1. Check git log on current branch for prior commits from this pipeline
2. Check if a plan file already exists in `docs/plans/` for this feature. A plan found on disk is never run unverified: confirm it describes this feature, then run it through the Plan check below before skipping ahead
3. Check for uncommitted changes
4. Read `.agent-blueprint/run/state.json` if it exists. It is the iteration counter, and it survives fresh sessions and runner restarts:
   - `status` `done` means an earlier run finished: this is a new run, at `iteration` 1.
   - Any other status continues that run: its `stage` says where it stopped, and `iteration` goes up by one.
   - If the branch's commits and plan belong to another feature, the file is stale: start at `iteration` 1. Every write replaces the whole file, so nothing needs clearing first.

If continuation detected, **skip to the stage that needs work** — don't redo requirements, planning, or deepening if those artifacts already exist on disk. SKILL.md Stage 0's ceiling of 20 iterations applies before Stage 1.

In an interactive Claude Code session (CLI 2.1.139+) you may also print the opt-in prompt in `references/modes-and-reports.md` § Native /goal completion. Continue at once and never wait for the paste: state.json, and the Stop hook where the host runs it, are the guarantee.

## Ambiguity gate

**Ambiguity Gate — score requirements before proceeding:**

| Dimension | Weight | Question |
|-----------|--------|----------|
| **Scope clarity** | 40% | Is it clear what's in and out of scope? Are boundaries explicit? |
| **Constraint clarity** | 30% | Are technical constraints, dependencies, and limitations stated? |
| **Success criteria clarity** | 30% | Are acceptance criteria specific and testable? |

Rate each dimension 0.0–1.0. Calculate: `clarity = (scope × 0.4) + (constraints × 0.3) + (criteria × 0.3)`

For **brownfield** tasks (modifying existing code), add a 4th dimension — **Context clarity (15%)**: is existing codebase behavior understood? Adjust weights to 35%/25%/25%/15%.

- If clarity **≥ 0.8** → proceed to Stage 2
- If clarity **< 0.8** → make reasonable assumptions for the weakest dimension, append them as locked decisions to `docs/context/DECISIONS.md`, then re-score. If still < 0.8, proceed anyway with assumptions documented (autonomous mode — no user questions).

Log each assumption in state.json's `decisions` as well, so the run's record shows every choice made without asking.

## Research

Start these three helpers at the same time; their findings feed the plan in Stage 2b.

**Helper step.** Start a helper (subagent) for this step if you can, with the prompt file named below (its absolute path when the helper can read it, else its full text) and the listed inputs; leave its model and effort at the session's. If you cannot start one, follow the prompt file yourself. Either way, return its Output section, and note which path ran in the run's provenance record if there is one.

Prompt files and inputs:
- `references/agents/learnings-researcher.md`: Search docs/solutions/ for relevant prior work related to: [feature]. Return findings as bullet points.
- `references/agents/framework-docs-researcher.md`: Gather current documentation for [frameworks involved]. Focus on API patterns, version constraints, and gotchas.
- `references/agents/codebase-context-mapper.md`: Map all files and dependencies affected by: [feature description]. Identify integration points and potential conflicts.

**Lower effort.** This step is safe at lower effort. If your host lets you set effort for a single helper, you may start this one lower, unless the user asked for their level everywhere; otherwise it runs at the session's level. Never switch models to save effort.

Collect all research results.

## Plan check

Verify the plan from Stage 2b with the plan-checker helper.

**Helper step.** Start a helper (subagent) for this step if you can, with the prompt file named below (its absolute path when the helper can read it, else its full text) and the listed inputs; leave its model and effort at the session's. If you cannot start one, follow the prompt file yourself. Either way, return its Output section, and note which path ran in the run's provenance record if there is one.

Prompt: `references/agents/plan-checker.md`. Inputs: the plan file from 2b.

BLOCKING issues are those that prevent implementation (missing dependencies, architectural conflicts, unresolvable ambiguity). If the plan-checker reports BLOCKING issues:

```
for pass in 1..3:
    Fix blocking issues in the plan
    Re-dispatch plan-checker
    if no BLOCKING issues: break
```

If blocking issues persist after 3 passes, stop the pipeline with `status` `blocked` and report: "Plan verification failed after 3 passes. Remaining blockers: [list]. Use the ab-build-pipeline skill for supervised planning."

## Danger scan

Before execution, scan the verified plan for irreversible operations (deleting data, migrations on shared databases, force-push or history rewrite, publishing or sending anything outside the repo), pushes to a protected branch, and deleting or skipping tests. A migration on a shared database is the one hit that stops the run, as `needs-human` (`references/guardrails.md` § When NOT to Use); route every other hit through the decision boundary (SKILL.md Stage 1) and log it in `decisions`, never stopping on it.

## PR body

Invoke the ab-pr-workflow skill for its pre-flight checks, its plan audit and its body, and stop it before it pushes or opens anything: publishing is Stage 7's Finish step. Write the body to `.agent-blueprint/run/pr-body.md`. The path is fixed because the runner publishes only that file, never a path read from state.json. The body includes:

- Summary of the feature
- Plan file reference
- Review iterations completed and convergence status
- Test results

If ab-pr-workflow's plan audit blocks the PR (a row marked not done or partial): stop the pipeline, set `status` to `blocked` with the blocking rows as `reason`, report them per Error Recovery, and publish nothing. The deploy check and the Finish step do not run, and the run never reaches `done`.

## Deploy check

With `--deploy`, check deployment readiness with the deployment-verifier helper, and report its go/no-go checklist in the completion report.

**Helper step.** Start a helper (subagent) for this step if you can, with the prompt file named below (its absolute path when the helper can read it, else its full text) and the listed inputs; leave its model and effort at the session's. If you cannot start one, follow the prompt file yourself. Either way, return its Output section, and note which path ran in the run's provenance record if there is one.

Prompt: `references/agents/deployment-verifier.md`. Inputs: Verify deployment readiness for this branch and its PR body. Check build, tests, security, migrations, configuration, dependencies, rollback plan, and monitoring.

**Lower effort.** This step is safe at lower effort. If your host lets you set effort for a single helper, you may start this one lower, unless the user asked for their level everywhere; otherwise it runs at the session's level. Never switch models to save effort.

## Publish

With `driver` `interactive` this session publishes, after the secret scan the runner would make. With `driver` `runner`, skip this section: the runner publishes.

**Bundled scripts.** Paths such as `scripts/run.sh` are relative to this skill's own folder, the one holding its SKILL.md, not to the project. Run a script through its interpreter (`bash` for `.sh`; `python3`, or `python` if that is missing, for `.py`) instead of relying on its executable bit, and if the interpreter is missing, say so and stop that step.

1. In no-commit mode nothing is committed, so nothing can be pushed: set `needs-human`, with a `reason` saying the working tree and `commit-msg.md` wait for a commit.
2. Scan every commit the push would publish, and `pr-body.md`, for secrets with the runner's own scripts, so both paths scan the same commits:

   ```bash
   list=$(bash scripts/outgoing-commits.sh "$(git remote get-url --push <remote>)" "$(git merge-base HEAD <default branch>)") &&
     printf '%s\n' "$list" | bash scripts/scan-secrets.sh --commits - --file .agent-blueprint/run/pr-body.md
   ```

   The list holds, oldest first, every commit since the merge base and every older one that no branch at the push URL has, read live from that URL. Any non-zero exit means publish nothing and set `needs-human`. Each hit is printed with where and what kind, never the value, and a `.env` file any listed commit added is a hit even if a later commit deleted it. Name the file and line in `reason`, never the value, since the reason is printed and may be shared. A non-zero exit with no hit printed means the list failed, most often because the push URL could not be read; say so in `reason`.
3. Push the branch and open the PR through the ab-pr-workflow skill, with `pr-body.md` as the body. If the push or the PR fails (no auth, branch protection), set `needs-human` with the fix in `reason`.
4. Set `status` to `done`.
