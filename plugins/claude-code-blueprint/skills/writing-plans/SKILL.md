---
name: writing-plans
description: "Trigger this skill when converting an approved design or spec into an implementation plan that records the decisions — exact file paths, the tests and what they assert, signatures, dependency ordering. Trigger when the user says 'write a plan', 'create a plan', 'implementation steps', 'break this down into tasks', 'how do we implement this', 'plan out the work', or 'turn this design into tasks'. Trigger after brainstorming produces an approved design — even if the user doesn't explicitly ask for a plan, suggest this skill once a design is approved. Also trigger when the user has a clear spec from any source and needs it decomposed into bite-sized executable steps. DO NOT TRIGGER when the user hasn't brainstormed or designed yet — use brainstorming first to produce an approved design. DO NOT TRIGGER for executing an existing plan — use executing-plans instead. DO NOT TRIGGER for enriching a plan with research — use deepen-plan instead."
---

# Writing Plans

## Overview

A plan records decisions, not a transcript of the code. For each task it names the files, the test and what it asserts, the signatures and spec values the code must honor, the order, and the command that proves it done. The executor is a capable engineer who lacks this codebase's context, so supply the context (paths, conventions, contracts, commands) and leave out the code those decisions already determine. DRY. YAGNI. TDD. Frequent commits.

## When NOT to Use

- **No design exists yet** — run `/brainstorming` first to lock the design; planning a vague idea produces a vague plan.
- **The change qualifies as a quick fix** (< 3 files, obvious root cause) — use `/quick-fix` and skip the plan document.
- **You're triaging open work** — use `/backlog-triage`; `/writing-plans` produces *one* plan for *one* change.
- **You're researching feasibility** — use `/spike-exploration` or `/deep-research`; the plan is the artifact *after* feasibility is settled.
- **A costly-to-reverse choice is still open after research** (storage engine, public API shape, a vendor) — compare the options in `/spike-exploration` first; the plan commits to the one that wins.
- **You're fixing a regression** — use `/systematic-debugging`; debug-first then plan if the fix is non-trivial.

Assume a skilled developer who knows almost nothing about our toolset or problem domain. Test design is where executors most often drift, so the plan settles it: every test is named with the behavior it asserts.

**Announce at start:** "I'm using the writing-plans skill to create the implementation plan."

**Context:** This should be run in a dedicated worktree (created by brainstorming skill).

**Save plans to:** `docs/plans/YYYY-MM-DD-<feature-name>.md`

## Requirements Quality Check (Rigor Probes)

Requirements that came from a probed brainstorming session skip this. Otherwise, before planning, scan them for five gaps (evidence, specificity, counterfactual, attachment, durability) and ask at most two or three of those questions in prose. A real gap sends the user back to refine the requirements. The probe table and rules are in `references/rigor-probes.md`.

## Bite-Sized Task Granularity

**Each step is one action with a checkable result:**
- "Write the failing test `test_x` asserting Y" - step
- "Run it and see it fail for the expected reason" - step
- "Implement `f(a) -> B` in `path/file.py` until it passes" - step
- "Run the project suite and see it green" - step
- "Commit" - step

A step's detail is the decision it pins: the test and its assertions, or the signature, file, and spec values. Write a code body only for an algorithm those don't determine (a tricky parse, a non-obvious formula). Everything else the executor writes against the real code.

## Plan Document Header

**Every plan MUST start with this header:**

```markdown
# [Feature Name] Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Objective:** [One sentence describing the outcome — a holdable statement of what's true for users after this ships, not the mechanism]

**Means:** [Only when an approach is already fixed — the chosen technique, in one sentence]

**Spec:** [Optional — link to a design doc or spec this plan implements]

**Architecture:** [2-3 sentences about approach]

**Tech Stack:** [Key technologies/libraries]

---
```

The plan-completion audit (`finishing-a-development-branch` Step 3) reads `### Task N:` headings (this template's unit shape), `### U<N>.` headings, or checklist lines as the plan's items, whichever shape a given plan uses.

## Task Structure

````markdown
### Task N: [Component Name]

**Files:**
- Create: `exact/path/to/file.py`
- Modify: `exact/path/to/existing.py:123-145`
- Test: `tests/exact/path/to/test.py`

**Step 1: Write the failing test** `test_rejects_expired_token` — an expired token returns `None` and logs `token.expired`.

**Step 2: Run it to verify it fails**
Run: `pytest tests/path/test.py::test_rejects_expired_token -v` → Expected: FAIL (`validate_token` not defined)

**Step 3: Implement** `validate_token(token: str) -> User | None` in `src/path/file.py`; expiry uses the `exp` claim with the 30 s clock skew from the spec.

**Step 4: Run the project suite** → Expected: PASS, with any failure named, including ones this task didn't cause

**Step 5: Commit** `feat(auth): reject expired tokens`
````

## Shadow Path Tracing

For every new data flow in the plan, trace four paths — not just the happy path:

```
INPUT ──► VALIDATION ──► TRANSFORM ──► PERSIST ──► OUTPUT
  │            │              │            │           │
  ▼            ▼              ▼            ▼           ▼
[nil?]    [invalid?]    [exception?]  [conflict?]  [stale?]
[empty?]  [too long?]   [timeout?]    [dup key?]   [partial?]
```

For each node: document what happens on each shadow path in the task description. If a shadow path is unhandled, add a task to handle it.

## Error/Rescue Map

For tasks that introduce new service calls, external APIs, or database operations, include an error map in the task description:

```
METHOD/CODEPATH       | WHAT CAN GO WRONG    | HANDLED? | USER SEES
Service#call          | API timeout          | ?        | ?
                      | Malformed response   | ?        | ?
                      | Rate limited (429)   | ?        | ?
```

Any "?" in the HANDLED column becomes a sub-task. Every external call must have its failure mode explicitly addressed in the plan.

## Review Focus

End the plan with a `## Review Focus` section: at most five inputs or failure modes the spec implies but no task's test exercises yet (Shadow Path Tracing and the Error/Rescue Map are where they surface). Give each one a test in the task that owns it, and list it here so the final reviewer checks it on purpose instead of by luck.

## Interface Context for Parallel Executors

When the plan will run in parallel waves (`/orchestrate`, `/team-execution`), embed the contracts executors need (key types, exports, signatures) in the plan so they don't explore the codebase to find them, and add a "Task 0: Define contracts" when later tasks consume new interfaces. When to include or skip it, and the block shapes, are in `references/interface-context.md`.

## Verification Commands

Every task step that produces a testable result should include a **runnable verification command** — not just "verify it works."

| Bad | Good |
|-----|------|
| "Verify it works" | `Run: pytest tests/auth.py -v` → Expected: PASS |
| "Check the endpoint" | `Run: curl -s localhost:3000/api/health \| jq .status` → Expected: `"ok"` |
| "Make sure it builds" | `Run: npm run build` → Expected: exit 0, no errors |

If no automated verification exists yet, say so explicitly: `No automated verification available — requires manual browser check at /dashboard`. This honesty prevents executors from inventing fake checks.

## Remember
- Exact file paths always
- Decisions, not code: name the test and its assertions, the signature, the spec values (not "add validation"); a code body only for an algorithm those leave open
- Exact commands with expected output
- Reference relevant skills with @ syntax
- DRY, YAGNI, TDD, frequent commits

## Boundaries

Every plan should declare three lists, in this order:

- **Always do** — non-negotiables for this work (run tests before commits, follow existing naming, validate user input at boundaries, cite framework docs for non-obvious patterns)
- **Ask first** — actions that need explicit user approval (DB schema changes, new dependencies, auth changes, env var additions, public API changes, anything in CLAUDE.md's "Must ask the user FIRST" list)
- **Never do** — hard prohibitions (commit secrets, edit vendor directories, remove failing tests without approval, skip verification, use `--no-verify` to bypass hooks)

The three-tier framing is sharper than a generic "be careful" — at decision time, an action falls into exactly one bucket. Plans without explicit boundaries inherit them from CLAUDE.md, but for non-trivial work always restate the work-specific items.

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "The plan is obvious, I'll just describe the steps" | Vague plans become vague code. Exact file paths, exact commands, named tests with their assertions, and signatures keep the executor from improvising. |
| "I'll write the code into the plan to save the executor time" | The executor rewrites it against the real code anyway, and pasted code goes stale at the first deviation. Planning in code also drifts into building the project during planning. Record the decision. |
| "I'll skip verification commands and figure them out at run-time" | The executor will skip verification too. If the plan-author can't articulate "Expected: PASS," neither will the implementer. |
| "Interface contracts are implementation details" | When parallel executors share a contract, the contract IS the spec. Skipping the interface section creates Wave-N integration breakage. |
| "Plans are overhead — let me start coding" | Planning IS the task. Implementation without a plan is typing, not engineering. The cost of the plan is paid back many times over in fewer wrong turns. |
| "I'll write the plan after the design — they're the same thing" | Brainstorming produces a *what*; the plan produces a *how with file paths and commands*. Conflating them loses the executable detail. |
| "Boundaries are for big projects" | Boundaries are cheapest to declare on small plans (3 lines per list) and most expensive to recover from when missing. |

## Self-Review Before Handoff

- **Step scan** — every step is one action with a checkable result; no step body repeats what its test and signature already determine.
- **Proportion check** — a plan much longer than the spec it implements is usually transcribing code. Cut it back to decisions.
- **Review Focus** — present, five items or fewer, each pinned by a test in its owning task.

## Execution Handoff

The user reviews the *saved* plan before anything runs. Approving the design in brainstorming approved the scope, not this plan. Then recommend one option below with a one-line reason and its cost (e.g. "Subagent-Driven: 4 sequential tasks, one review per task"), and close with:

**"Plan saved to `docs/plans/<filename>.md` — please review it before anything runs.**

**1. Deepen the plan (`/deepen-plan`)** — Dispatch parallel research agents to enrich each section with best practices, prior solutions, and framework docs before executing

**2. Subagent-Driven (this session)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Good for hands-on oversight.

**3. Parallel Orchestration (`/orchestrate`)** — Executes the wave plan: independent tasks run in parallel within each wave. Faster total time for plans with concurrent tasks.

**4. Agent Teams (`/team-execution`)** — Collaborative teammates with file ownership and shared task list. Best for 4+ tasks touching different areas. Requires `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`.

**I recommend [option] because [reason]. Which approach?"**

**If Deepen chosen:**
- Invoke `/deepen-plan` with the plan file path
- After deepening, re-present execution options (2-4)

**If Subagent-Driven chosen:**
- **REQUIRED SUB-SKILL:** Use subagent-driven-development
- Stay in this session
- Fresh subagent per task + code review

**If Parallel Orchestration chosen:**
- Invoke `/orchestrate` with the plan file path
- Team-lead agent handles wave grouping and parallel dispatch

**If Agent Teams chosen:**
- Invoke `/team-execution` with the plan file path
- Team-lead agent designs team structure and assigns file ownership
