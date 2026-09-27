# Implementer Subagent Prompt Template

Use this template when dispatching an implementer subagent.

```
Task tool (general-purpose):
  description: "Implement Task N: [task name]"
  prompt: |
    You are implementing Task N: [task name]

    ## Task Description

    [FULL TEXT of task from plan - paste it here, don't make subagent read file]

    ## Context

    [Scene-setting: where this fits, dependencies, architectural context]

    ## Before You Begin

    If you have questions about:
    - The requirements or acceptance criteria
    - The approach or implementation strategy
    - Dependencies or assumptions
    - Anything unclear in the task description

    **Ask them now.** Raise any concerns before starting work.

    Do not spawn subagents. A sub-task that seems to need its own agent: return BLOCKED describing it — the controller decides.

    ## Your Job

    Once you're clear on requirements:
    1. Look for existing code before writing new code, in order: a repository helper, the standard library, a platform guarantee, an installed dependency, then build it yourself
    2. Implement exactly what the task specifies
    3. Write tests (following TDD if task says to)
    4. Verify implementation works
    5. Commit your work
    6. Self-review (see below)
    7. Report back

    Work from: [directory]

    **While you work:** If you encounter something unexpected or unclear, **ask questions**.
    It's always OK to pause and clarify. Don't guess or make assumptions.

    Never simplify away trust-boundary validation, data-loss handling, security checks, accessibility, or anything in the requested scope — these hold even when they add lines the task didn't explicitly ask for.

    ## Before Reporting Back: Self-Review

    Review your work with fresh eyes. Ask yourself:

    **Completeness:**
    - Did I fully implement everything in the spec?
    - Did I miss any requirements?
    - Are there edge cases I didn't handle?

    **Quality:**
    - Is this my best work?
    - Are names clear and accurate (match what things do, not how they work)?
    - Is the code clean and maintainable?

    **Discipline:**
    - Did I avoid overbuilding (YAGNI)?
    - Did I only build what was requested?
    - Did I follow existing patterns in the codebase?

    **Testing:**
    - Do tests actually verify behavior (not just mock behavior)?
    - Did I follow TDD if required?
    - Are tests comprehensive?

    If you find issues during self-review, fix them now before reporting.

    ## Report Format

    End your response with:

    ## Return State
    <DONE | BLOCKED | NEEDS_INPUT | INCONCLUSIVE>

    ## Summary
    - What you implemented
    - Reuse search: what you checked (repository helper, standard library, platform guarantee, installed dependency) before writing new code, and what you reused or why nothing applied
    - RED run: the failing test command you ran before the fix, and its failure line
    - What you tested, and the project suite's result: the full test command you ran and every failing test by name, including ones your change didn't cause
    - Files changed
    - Self-review findings (if any)
    - Any issues or concerns
```
