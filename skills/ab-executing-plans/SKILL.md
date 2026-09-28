---
name: ab-executing-plans
description: "Trigger this skill when executing a written plan sequentially with human review checkpoints between batches. Trigger scenarios: 'execute the plan', 'implement the plan', 'work through the tasks', 'follow this plan', 'run through the plan step by step', 'execute sequentially', or when the user has a plan file and wants controlled, checkpoint-based execution with human review between batches. Even if the user doesn't explicitly mention checkpoints, trigger this skill when they want sequential plan execution with oversight rather than autonomous or parallel approaches. DO NOT TRIGGER when tasks can run in parallel and speed matters — use ab-orchestrate instead. DO NOT TRIGGER when spawning collaborative teammates with shared task lists — use ab-team-execution instead. DO NOT TRIGGER for fully autonomous execution without human checkpoints — use ab-autonomous-loop instead."
---

# Executing Plans

## Overview

Load plan, review critically, execute tasks in batches, report for review between batches.

**Core principle:** Batch execution with checkpoints for architect review.

**Announce at start:** "I'm using the ab-executing-plans skill to implement this plan."

## When NOT to Use

- **Tasks can run in parallel and speed matters** — use `ab-orchestrate` for wave-based parallelism.
- **Spawning collaborative teammates with shared task list** — use `ab-team-execution`.
- **Fully autonomous, no checkpoints** — use `ab-autonomous-loop` or `ab-ship-pipeline`.
- **No written plan exists** — write one with `ab-writing-plans` first.
- **One task only, change is trivial** — execute directly with `ab-quick-fix`.

## The Process

### Step 1: Load and Review Plan
1. Read plan file
2. Review critically - identify any questions or concerns about the plan
3. If concerns: Raise them with your human partner before starting
4. **Pattern mapping (optional but recommended for plans with 3+ new files):** produce `.claude/plans/PATTERNS.md` mapping each new file to existing analogs with line-numbered excerpts. Read PATTERNS.md before each task — it grounds new code in existing conventions and prevents structural drift.

   **Helper step.** Start a helper (subagent) for this step if you can, with the prompt file named below (its absolute path when the helper can read it, else its full text) and the listed inputs; leave its model and effort at the session's. If you cannot start one, follow the prompt file yourself. Either way, return its Output section, and note which path ran in the run's provenance record if there is one.

   Prompt: `references/agents/pattern-mapper.md`. Inputs: the plan file path, the codebase root, and the output path `.claude/plans/PATTERNS.md`.

   **Lower effort.** This step is safe at lower effort. If your host lets you set effort for a single helper, you may start this one lower, unless the user asked for their level everywhere; otherwise it runs at the session's level. Never switch models to save effort.

5. If no concerns: create the progress file (below) and proceed

**Progress file — `.claude/plans/<plan-basename>.progress.local.md`** (`<plan-basename>` is the plan's filename without `.md`):

- First line names the plan; one checkbox per task.
- If the file already exists, reuse it and its ticks instead of recreating it.
- At creation, run `git check-ignore -q` on it; if that fails, append `.claude/plans/*.progress.local.md` to the file named by `git rev-parse --git-path info/exclude`.
- Delete it when the run's final review is clean — Step 5, before invoking ab-finishing-a-development-branch.
- An interrupted run leaves it in place; the STATE.md handoff (ab-session-continuity) points at it.
- The session's native task list is the alternative only when the model offers one: Claude Code exposes its native task-list tools only on Claude 3.x, Opus 4.0–4.7, Sonnet 4.0–4.6 and Haiku 4.5 (CLI 2.1.233; verified on 2.1.268); `CLAUDE_CODE_ENABLE_TODO_TOOLS=1` restores them elsewhere.

```bash
plan=docs/plans/<plan-basename>.md
progress=".claude/plans/$(basename "$plan" .md).progress.local.md"
mkdir -p .claude/plans
if [ ! -f "$progress" ]; then   # an existing file keeps its ticks
  printf '# Progress: %s\n\n' "$plan" > "$progress"
  # then append one "- [ ] Task N: <title>" line per task in the plan
fi
git check-ignore -q "$progress" || {   # projects scaffolded before v3.6.0 lack the ignore rule
  if exclude="$(git rev-parse --git-path info/exclude 2>/dev/null)" && [ -n "$exclude" ]; then
    mkdir -p "$(dirname "$exclude")"
    echo '.claude/plans/*.progress.local.md' >> "$exclude"
  else
    echo "warning: not a git repository - add .claude/plans/*.progress.local.md to your ignore rules yourself" >&2
  fi
}
```

### Step 2: Execute Batch
**Default: First 3 tasks**

For each task:
1. Start at the first unticked box in the progress file
2. Follow each step exactly (plan has bite-sized steps)
3. Run verifications as specified
4. Tick the box (`- [ ]` → `- [x]`)

**Framework-specific code:** if a task touches a framework or library API (forms, routing, data fetching, hooks, ORM queries, framework config), invoke the `ab-source-driven-development` skill — detect the version, fetch the relevant docs page, follow the documented pattern, and cite the URL. The `sdd-cache` hook revalidates each WebFetch via HTTP `If-None-Match`, so repeat fetches are cheap and citations stay fresh.

### Step 3: Report
When batch complete:
- Show what was implemented
- Show verification output
- Say: "Ready for feedback."

### Step 4: Continue
Based on feedback:
- Apply changes if needed
- Execute next batch
- Repeat until complete

### Step 5: Complete Development

After all tasks complete and verified:
- **Final whole-branch review:** run ab-requesting-code-review once over the whole branch (base `git merge-base origin/main HEAD`, head `HEAD`), with the plan as the requirements and its Review Focus list as the reviewer's checklist. Use ab-review-swarm instead when the branch touches auth, money, data, or a public contract. Fix Critical and Important findings and review again; the review is clean when it returns none.
- Delete the progress file (`.claude/plans/<plan-basename>.progress.local.md`) — every box is ticked and the final review is clean, so nothing is left to resume
- Announce: "I'm using the ab-finishing-a-development-branch skill to complete this work."
- **REQUIRED SUB-SKILL:** Use ab-finishing-a-development-branch, passing the plan path (`docs/plans/<plan-basename>.md`) so its plan audit reads this plan
- Follow that skill to verify tests, present options, execute choice

## Decision Boundary

One rule settles decide-versus-stop; it refines CLAUDE.md's "when in doubt, ask" rule rather than replacing it. Check CLAUDE.md's must-ask categories first: a decision inside one stops for a human wherever the running pipeline's contract allows stopping (this skill and ab-build-pipeline ask; ab-autonomous-loop stops with its structured escalation; ab-ship-pipeline, whose contract cannot stop, decides conservatively and locks the decision in `docs/context/DECISIONS.md`). Outside them, when you can both detect it and roll it back — name the rollback action — decide, record the choice under `### Assumptions` (see Assumption Tracking) plus a `BACKLOG.md` line when it defers work, and continue. Otherwise the posture decides: an interactive session asks in one sentence with two or three options; an autonomous session takes the conservative option and records it the same way; a helper returns `NEEDS_INPUT` with the options, and the coordinating session routes that return instead of retrying with a narrower scope. A claim that something is impossible, blocked, or needs a credential requires evidence — a verbatim error, a documentation citation, or a live probe.

Examples: a migration is a must-ask category, so every posture stops (ab-ship-pipeline alone decides conservatively and records, because it cannot stop). A helper's default value is detectable with a grep and revertible with one edit, so it is decided, recorded, and continued.

## Deviation Scope Boundary

When executing, you will discover issues not in the plan. Apply these rules:

**Auto-fix (no permission needed):**
- Bugs directly caused by the current task's changes (wrong logic, type errors, broken imports)
- Missing critical functionality for correctness/security (null checks, input validation, error handling)
- Blocking issues preventing task completion (missing dependency, wrong path)

**Scope boundary:** Only fix issues DIRECTLY caused by the current task's changes. Pre-existing warnings, linting errors in unrelated files, or tech debt you notice → add to BACKLOG.md, don't fix inline.

**Fix attempt limit:** After 3 auto-fix attempts on a single issue within a task, STOP trying. Document it under `### Deferred Issues` in the batch report and move to the next task. Don't burn context retrying what isn't working.

**Must ask the user FIRST:**
- New database tables or major schema changes
- Switching frameworks or libraries
- Changing public API contracts
- Modifying auth logic
- Adding new environment variables

## Stub Tracking

After completing each batch, scan created/modified files for stub patterns before reporting:

- Hardcoded empty values flowing to rendering: `= []`, `= {}`, `= null`, `= ""`
- Placeholder text: "not available", "coming soon", "placeholder", "TODO", "FIXME"
- Components with no data source wired (props always receiving empty/mock data)

If stubs are found, include a `### Known Stubs` section in the batch report:

```markdown
### Known Stubs
- `src/components/Dashboard.tsx:45` — `items = []` hardcoded, API not wired yet (Task 5 will resolve)
- `src/api/users.ts:23` — `// TODO: add pagination` (out of scope for this plan, added to BACKLOG)
```

Don't mark a batch as fully complete if stubs prevent the planned feature from working end-to-end. Either wire the data or document which future task resolves it.

## When to Stop and Ask for Help

**STOP executing immediately when:**
- Hit a blocker mid-batch (missing dependency, test fails, instruction unclear)
- Plan has critical gaps preventing starting
- You don't understand an instruction
- Verification fails repeatedly
- 3 auto-fix attempts on the same issue haven't resolved it (see Deviation Scope Boundary)

**Ask for clarification rather than guessing.**

## When to Revisit Earlier Steps

**Return to Review (Step 1) when:**
- Partner updates the plan based on your feedback
- Fundamental approach needs rethinking

**Don't force through blockers** - stop and ask.

## Analysis Paralysis Guard

**If you make 5+ consecutive read-only operations (Read, Glob, Grep) without any Edit, Write, or Bash action that modifies state, STOP.**

You are in analysis paralysis. Do one of:
1. **Write code** — you have enough information, start implementing
2. **Report a blocker** — explain what's preventing you from writing code
3. **Ask for help** — if the plan is unclear, ask rather than endlessly reading

Reading code is preparation. Writing code is progress. Don't confuse the two.

## Assumption Tracking

During execution, you will make interpretive decisions — the spec says "handle errors" and you choose to return 400 with a JSON body; the plan says "add validation" and you choose specific validation rules. These decisions are invisible unless documented.

**After each task**, if you made any interpretive choices, append them to the plan file under an `### Assumptions` heading:

```markdown
### Assumptions
- Task 3: "Handle errors" interpreted as returning 400 with `{ error: string }` JSON body (not HTML error pages)
- Task 3: Rate limiting set to 100 req/min per IP (common default, not specified in plan)
- Task 5: "Support pagination" interpreted as cursor-based, not offset-based (better for large datasets)
```

**Rules:**
- Only document decisions where a reasonable engineer might have chosen differently
- Skip obvious choices (naming a variable, import ordering)
- The user reviews these at batch checkpoints (Step 3), not in real-time — don't interrupt execution to ask about each one
- If an assumption has cascading impact (other tasks will build on it), flag it: `[cascading]`

## Remember
- Review plan critically first
- Follow plan steps exactly
- Don't skip verifications
- Reference skills when plan says to
- Between batches: just report and wait
- Stop when blocked, don't guess
- Never start implementation on main/master branch without explicit user consent
- Document interpretive decisions in Assumptions section (see above)

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "The plan says X but Y is obviously better, I'll just do Y" | If Y is better, surface it. Silent deviations break the spec contract and corrupt the next reviewer's mental model. |
| "I'll skip verification — the code is obviously correct" | Verification catches what "obvious" misses. Skipping is the failure mode every postmortem cites. |
| "Three tasks done, I'll do six before reporting" | Bigger batches mean more rework when feedback finally arrives. Default 3 exists for a reason. |
| "I'll fix this adjacent thing while I'm here" | Scope creep. Note it for the assumption log or BACKLOG; don't expand the diff. |
| "The plan is wrong, I'll rewrite it" | If the plan is wrong, stop and report. Rewriting silently creates a phantom plan no one reviewed. |
| "Verification failed but the code looks right" | Trust the verification. "Looks right" is exactly the heuristic that produced the failure. |
| "I'll add a stub now and fill it in later" | Stubs ship. Track them explicitly in Known Stubs and resolve before the batch is complete — never carry implicit ones forward. |

## Integration

**Required workflow skills:**
- **ab-using-git-worktrees** - REQUIRED: Set up isolated workspace before starting
- **ab-writing-plans** - Creates the plan this skill executes
- **ab-finishing-a-development-branch** - Complete development after all tasks
