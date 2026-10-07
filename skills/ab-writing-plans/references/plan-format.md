# Plan format

Loaded on demand from SKILL.md when you write the plan document: the header, the task shape, verification commands and the boundaries lists.

## Plan Document Header

Every plan starts with this header, so the executor and the reviewer find the objective and the spec in the same place:

```markdown
# [Feature Name] Implementation Plan

> **For the executing agent:** use the ab-executing-plans skill to implement this plan task by task.

**Objective:** [One sentence describing the outcome — a holdable statement of what's true for users after this ships, not the mechanism]

**Means:** [Only when an approach is already fixed — the chosen technique, in one sentence]

**Spec:** [Optional — link to a design doc or spec this plan implements]

**Architecture:** [2-3 sentences about approach]

**Tech Stack:** [Key technologies/libraries]

---
```

The plan-completion audit (`ab-finishing-a-development-branch` Step 3) reads `### Task N:` headings (this template's unit shape), `### U<N>.` headings, or checklist lines as the plan's items, whichever shape a given plan uses.

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

## Verification Commands

Every task step that produces a testable result includes a **runnable verification command**, not just "verify it works", because an executor given no command skips the check.

| Bad | Good |
|-----|------|
| "Verify it works" | `Run: pytest tests/auth.py -v` → Expected: PASS |
| "Check the endpoint" | `Run: curl -s localhost:3000/api/health \| jq .status` → Expected: `"ok"` |
| "Make sure it builds" | `Run: npm run build` → Expected: exit 0, no errors |

If no automated verification exists yet, say so explicitly: `No automated verification available — requires manual browser check at /dashboard`. This honesty prevents executors from inventing fake checks.

## Boundaries

Every plan should declare three lists, in this order:

- **Always do** — non-negotiables for this work (run tests before commits, follow existing naming, validate user input at boundaries, cite framework docs for non-obvious patterns)
- **Ask first** — actions that need explicit user approval (DB schema changes, new dependencies, auth changes, env var additions, public API changes, anything on the project instructions file's ask-first list)
- **Never do** — hard prohibitions (commit secrets, edit vendor directories, remove failing tests without approval, skip verification, use `--no-verify` to bypass hooks)

The three-tier framing is sharper than a generic "be careful" — at decision time, an action falls into exactly one bucket. Plans without explicit boundaries inherit them from the project instructions file; for non-trivial work, restate the work-specific items anyway, since the general file cannot know them.

## Remember

- Exact file paths always
- Decisions, not code: name the test and its assertions, the signature, the spec values (not "add validation"); a code body only for an algorithm those leave open
- Exact commands with expected output
- Name relevant skills in prose ("use the ab-test-driven-development skill"), never in a slash or @ form, since each tool invokes skills differently
- DRY, YAGNI, TDD, frequent commits
