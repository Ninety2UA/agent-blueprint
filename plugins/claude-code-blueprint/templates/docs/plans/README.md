# Implementation Plans

Store implementation plans as: `YYYY-MM-DD-feature-name.md`

Plans are created by the `writing-plans` skill after a brainstorming session produces an approved design. They record decisions, not code: enough for a capable engineer (or agent) new to this project to follow — exact file paths, each test and what it asserts, signatures, exact test commands.

## Lifecycle

1. **Created** by `/brainstorming` → writing-plans skill
2. **Executed** by executing-plans skill or subagent-driven-development skill
3. **Updated** during execution as tasks are completed or deviations occur
4. **Completed** when all tasks are done — add completion note at top
5. **Archived** — completed plans stay in this directory as history

## Plan Document Structure

Every plan MUST include:

```markdown
# [Feature Name] Implementation Plan

> **Status:** [IN PROGRESS / COMPLETE as of YYYY-MM-DD / ABANDONED — reason]

**Objective:** [One sentence describing the outcome — what's true for users after this ships, not the mechanism]
**Means:** [Only when an approach is already fixed — the chosen technique, in one sentence]
**Spec:** [Optional — link to the design doc or spec this plan implements]
**Architecture:** [2-3 sentences about the approach]
**Tech Stack:** [Key technologies/libraries]
**Estimated tasks:** [N tasks, ~X hours]

---

### Task 1: [Component Name]
**Files:** Create/Modify/Test paths
**Steps:** One action per step, each with a checkable result: the test and what it asserts, the signature, the command

### Task 2: ...
```

## Rules

- Exact file paths for every file touched
- Decisions, not code: name the test and its assertions, the signature, the spec values (not "add validation"); a code body only for an algorithm those leave open
- Exact test commands with expected output
- Tasks ordered by dependency
- Each task independently verifiable with a clean commit
- Plans are prompts, not documents that become prompts — supply the codebase context a capable executor lacks, and leave out the code the decisions already determine
- End with a `## Review Focus` list: at most five spec-implied inputs or failure modes, each pinned by a test in its owning task

## Updating During Execution

- Check off completed tasks: `- [x] Task 1: ...`
- Note deviations inline: `> **Deviation:** Used X instead of Y because [reason]`
- If a task needs splitting, add sub-tasks rather than rewriting
- Never delete plan content — strikethrough or mark as superseded
