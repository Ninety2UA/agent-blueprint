# ab-ship-pipeline — modes, flags, and reports

Loaded on demand from `SKILL.md`; nothing here is needed on every invocation.

## Flags Reference

| Flag | Effect |
|------|--------|
| `--swarm` | Run review and browser testing in parallel at Stage 5 (SLFG pattern); execution goes through ab-orchestrate in every mode |
| `--iterations N` | Set max review-improve iterations (default 3, max 10) |
| `--convergence fast` | Exit review loop when P1 = 0 (default) |
| `--convergence deep` | Exit review loop when P1 + P2 = 0 |
| `--convergence perfect` | Exit review loop when all findings = 0 |
| `--deploy` | After PR, also run deployment verification |
| `--external` | Set by `scripts/ship.sh` — skip Stop hook activation (external loop manages restarts) |

## Running Modes

### Interactive: `ab-ship-pipeline` inside Claude

Type `ab-ship-pipeline <feature>` in a Claude session. The Stop hook (`ship-loop.sh`) guards against premature exit — if Claude tries to stop before outputting `<promise>DONE</promise>`, the hook blocks exit and re-injects the prompt. This does NOT reset context — the conversation keeps growing. Best for features that fit within a single context window. On CLI v2.1.139+ you can optionally paste the native `/goal` prompt emitted at Stage 0 for an elapsed/turns/tokens overlay; set `CLAUDE_CODE_GOAL_CHECKIN_MINUTES=0` first so the goal's idle check-ins (CLI 2.1.234+) never interrupt the no-questions run (it also turns off the goal's retries from 2.1.269; the Stop hook covers that), and `--resume` restores the goal (CLI 2.1.239) — the Stop hook remains the guarantee regardless (see Stage 0).

### External loop: `scripts/ship.sh`

Run from your terminal **before** entering Claude:

```bash
./scripts/ship.sh "add JWT authentication" --max 10 --swarm
```

This spawns a **fresh Claude process per iteration** (Ralph-style). Each iteration gets a clean 200K context window. State persists via git, plan files, and progress tracking. Best for large features that may exhaust context.

The external loop passes `--external` to the ship pipeline, which disables the Stop hook state file (avoiding conflict between inner and outer loop).

## Comparison: ab-build-pipeline vs ab-ship-pipeline vs ship.sh

| Aspect | ab-build-pipeline | ab-ship-pipeline (interactive) | `ship.sh` (external) |
|--------|----------|----------------------|----------------------|
| **Checkpoints** | Between every stage | None | None |
| **User input** | Required at each stage | Never | Never |
| **Context reset** | N/A | No (Stop hook, same session) | Yes (fresh process per iteration) |
| **Max outer iterations** | N/A | 5 (Stop hook) | 10 (configurable via `--max`) |
| **Review iterations** | 1 (default) | 3 (default) | 3 (default) |
| **PR creation** | Manual | Automatic | Automatic |
| **Best for** | Human-guided features | Single-context fire-and-forget | Large features, context exhaustion |

## Completion report

Report completion in this shape:
```markdown
## Ship Pipeline Complete

### Pipeline Summary
| Stage | Status | Duration |
|-------|--------|----------|
| Requirements | Locked [N] decisions | — |
| Plan | Written + verified ([N] checker passes) | — |
| Deepen | Enriched by [N] research helpers | — |
| Execute | [wave/swarm] — [N] tasks completed | — |
| Review | [N] iterations, converged at iteration [N] | — |
| Compound | [captured/skipped] | — |
| PR | Created: [PR URL] | — |

### Run numbers
- Tasks: [done]/[planned] · Retries: [N] · Decisions locked without asking: [N] · Blocked or deferred: [N] (each listed with its reason)

### Quality
- Tests: [X passing]
- Build: pass
- Review: P1=0, P2=[N], P3=[N]
- Iterations to convergence: [N]/[max]
```

## Swarm-mode review

**Swarm mode (`--swarm` flag) — parallel review + test:**

In swarm mode, dispatch review and browser testing as parallel background tasks since they only need the code to exist, not each other's results:

1. **Dispatch in parallel:**
   - Background Task 1: Run ab-iterative-refinement skill (review→fix→review cycles)
   - Background Task 2: Run ab-browser-testing skill (if `git diff` contains changes to component files — `.tsx`, `.jsx`, `.vue`, `.svelte` — or CSS/SCSS files or template files)

2. **Wait for both to complete**

3. **Merge results:** If browser testing found issues not caught by review, create additional fix tasks and resolve them.

This parallelization is the key speedup of swarm mode — review and testing run simultaneously instead of sequentially.

## Native /goal completion

The `ship-loop.sh` Stop hook above is the **default, zero-config guard** — it needs no user action and works in every mode, including headless `--external` runs. As an *optional* enhancement for interactive users on CLI v2.1.139+, emit a copyable `/goal` prompt so completion is also tracked by the platform's native condition-completion (with its live elapsed/turns/tokens overlay). Print this block once at Stage 0 for the user to paste:

```text
/goal Keep working across turns until the ship pipeline is fully complete: all
stages done, review converged, changes committed, and the pipeline has emitted
<promise>DONE</promise> with every item verified. Do not stop before then.
```

Check-in opt-out: set `CLAUDE_CODE_GOAL_CHECKIN_MINUTES=0` in the environment Claude starts from before pasting, so the platform's idle check-ins (CLI 2.1.234+) never conflict with the pipeline's no-questions rule.

- **Emit only in interactive mode** (never when `--external` is set — a headless loop has no one to paste it, which is why the Stop hook, not `/goal`, is the guarantee). **Do not stall waiting for the paste** — continue the pipeline immediately; the `ship-loop.sh` hook protects the run whether or not the user pastes.
- If pasted, native `/goal` and the Stop hook coexist harmlessly: both release the session once `<promise>DONE</promise>` appears, and `/goal` just adds an overlay. `/goal` is an opt-in convenience, **not** a dependency — the pipeline never relies on it, so no minimum-CLI floor is imposed on `ab-ship-pipeline` itself.
- Native `STOP_HOOK_BLOCK_CAP` (default 8, since CLI 2.1.143) backstops the hook against runaway blocking even if `max_iterations` is misconfigured — defense in depth, no action needed.
- From CLI 2.1.269 a goal retries with backoff after API errors, dropped connections, and token or usage limits, or pauses with a stated reason. **`CLAUDE_CODE_GOAL_CHECKIN_MINUTES=0` turns those retries off too.** Keep recommending it for no-questions runs anyway: the goal is an overlay, and the Stop hook still holds the session open if a goal pauses or stops retrying.
- A goal survives resuming a compacted session (CLI 2.1.274). It is unavailable when hooks are disabled (`disableAllHooks`) or restricted to managed hooks (`allowManagedHooksOnly`); plugin hooks fall under the same policies, so check them before relying on either guard.
- The goal clears itself on an unrecoverable error (CLI 2.1.234), which matches Error Recovery below: the pipeline stops and removes its loop state files rather than restarting a broken run.
- An idle session with an active goal checks in on 30+ minute background work at 30 m, then 1 h, then 2 h, at most three times per goal (CLI 2.1.234–2.1.246). `CLAUDE_CODE_GOAL_CHECKIN_MINUTES=0` opts out — see the note above the bullets — so a pasted goal never turns into a question the pipeline is not allowed to ask.
- `--resume` restores an active goal (CLI 2.1.239), so a resumed interactive session keeps the overlay without re-pasting; the Stop hook state file (`iteration` > 1) is what actually resumes the pipeline.
- `claude -p "/goal …"` is a documented headless goal loop, but a skill or hook still cannot start a goal, so `ship-loop.sh` remains the guarantee and `scripts/ship.sh` keeps its fresh-process-per-iteration design rather than wrapping a goal loop.
