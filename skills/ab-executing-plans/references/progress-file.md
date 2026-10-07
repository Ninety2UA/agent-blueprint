# Progress file

Loaded on demand from SKILL.md when you create the progress file or check which host task list may mirror it.

The file is `.agent-blueprint/plans/<plan-basename>.progress.md`, where `<plan-basename>` is the plan's filename without `.md`:

- The first line names the plan; then one `- [ ] Task N: <title>` line per task.
- If the file already exists, reuse it and its ticks instead of recreating it.
- Delete it when the run's final review is clean (Step 5, before the ab-finishing-a-development-branch skill runs).
- An interrupted run leaves it in place; the STATE.md handoff (ab-session-continuity) points at it.

A host task list may mirror the file but never replaces it, because not every model has one. Claude Code, for example, exposes its native task-list tools only on Claude 3.x, Opus 4.0–4.7, Sonnet 4.0–4.6 and Haiku 4.5 (CLI 2.1.233; verified on 2.1.268); `CLAUDE_CODE_ENABLE_TODO_TOOLS=1` restores them elsewhere.

```bash
plan=docs/plans/<plan-basename>.md
progress=".agent-blueprint/plans/$(basename "$plan" .md).progress.md"
mkdir -p .agent-blueprint/plans
if [ ! -f "$progress" ]; then   # an existing file keeps its ticks
  printf '# Progress: %s\n\n' "$plan" > "$progress"
  # then append one "- [ ] Task N: <title>" line per task in the plan
fi
```
