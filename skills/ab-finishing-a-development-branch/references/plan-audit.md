# Plan audit

Loaded on demand from SKILL.md when Step 3 finds the plan and dispatches the audit. Fill in `<plan-path>` and `<base-branch>` before sending the request.

## Plan path

Use the path the caller passed. Without one, take the newest `docs/plans/*.md` file added or modified on the branch, skipping design documents:

```bash
git log --name-only --format= <base-branch>..HEAD -- docs/plans/ | grep -v -- '-design\.md$' | grep . | sort -u | tail -1
```

## Audit request

```
Plan audit. Classify; do not review. Read only.

PLAN_FILE: <plan-path>
DIFF: git diff <base-branch>...HEAD
ITEMS: every `### U<N>.` heading, `### Task N:` heading, and checklist line in PLAN_FILE

Output one table row per item: | Item | State | Evidence |
State is exactly one of DONE, CHANGED, PARTIAL, NOT DONE, DEFERRED, UNVERIFIABLE.
CHANGED states the reason. DEFERRED names the BACKLOG.md line or the plan's
Assumptions entry that defers it. Evidence is one line: a path and hunk, a
commit, or the sentence that decided the call.

Then, under the heading "Unplanned diff work", list every change in DIFF that
no item covers, one line each, or the single word "none". Leave out
PLAN_FILE and .agent-blueprint/plans/*.progress.md: they record the plan,
they are not work on it.

Output the table and that list only. No strengths, no issues, no assessment.
```

## States

Each row's state, and the evidence it carries:

| State | Meaning | Evidence line |
|-------|---------|---------------|
| DONE | The diff delivers the item as planned | Path and hunk, or commit |
| CHANGED | Delivered, but not as planned | The hunk plus the reason |
| PARTIAL | Some of the item landed | What landed; what is missing |
| NOT DONE | Nothing in the diff addresses it | "no hunk" |
| DEFERRED | A `BACKLOG.md` line or a plan-file Assumptions entry defers it | That line, quoted |
| UNVERIFIABLE | The diff cannot show it (runtime or external behaviour) | Why the diff cannot show it |
