# Native team extras

Some hosts have a team feature of their own: helpers that stay alive between tasks and can be messaged. Where the user has switched one on, team work uses it. Everything else stays as `references/team-ledger.md` describes: the ledger is the task list, the lead is its only writer, tasks run in waves, and the lead alone integrates, commits and runs the authoritative tests.

Decide from the tools you actually have in this session, not from what a settings file says, since a setting can be present while the feature is unavailable. If no section below applies, use plain helpers, or do the tasks yourself when you have none.

## Claude Code Agent Teams

**Applies only when all of these hold:**

- You are running in Claude Code, and the `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` environment variable is `1`.
- The session is interactive. Claude Code starts no teammates in `claude -p` or the Agent SDK, so a run driven by the ship runner never uses this extra.
- Your tool list includes the team tools, among them `SendMessage` and the shared task tools.

**What changes:**

1. Before the first teammate starts, write `.agent-blueprint/team/active.md` containing the line `active: true`. The blueprint's `TeammateIdle` and `TaskCompleted` hooks act only while that line is there: they keep a teammate working while tests or lint fail and refuse a task completion that leaves syntax errors or debug breakpoints.
2. Start one named teammate per task in the first wave (three to five at most). Teammates share your checkout, so file ownership is the isolation: every teammate prompt is the task packet, including the files the teammate may touch and the ones it must leave alone.
3. Ask each teammate for its approach before it writes code, and approve or redirect it.
4. A teammate's final answer arrives with its idle notice. Treat it as that task's output section and record it in the ledger as usual. Check the live roster before you broadcast to or wait on a teammate.
5. For the next wave, message an idle teammate its next packet rather than starting a new one, so its context carries over. The host's shared task list may mirror the ledger, but the ledger stays the record.
6. Teammates do not commit. You commit each task's files after its checks pass.
7. When the run ends, rewrite `.agent-blueprint/team/active.md` to `active: false`, so the hooks stop acting in the rest of the session.

## Codex multi_agent_v2

**Applies only when:** you are running in Codex and your tool list includes the version 2 agent tools, among them `send_message`, `followup_task`, `list_agents` and `interrupt_agent`. They exist only when the user has set `multi_agent_v2 = true` under `[features]`. Unlike the Claude extra, this one also works in headless `codex exec`, though an action that needs a new approval fails there.

**What changes:**

1. Start each task's helper as a named agent with the task packet. At most four run at once by default (`agents.max_concurrent_threads_per_session`).
2. Helpers share your checkout and sandbox, so file ownership is the isolation.
3. Give a finished helper its next task with `followup_task` instead of starting a new agent, so its context carries over. Relay a note to a sibling with `send_message` only when that sibling needs it before its task ends; everything else goes through the ledger.
4. Use `list_agents` before waiting, and `interrupt_agent` for a helper whose output shows it has left its task.
5. Codex has no shared task board yet, so the ledger is the only task list.

## Adding another host

Give a new extra its own section here with the same two parts:

- **Applies only when:** name the tools that prove the feature is on in this session, and any mode where it is off, such as a headless run.
- **What changes:** say how helpers start, receive their next task and exchange notes.

The ledger, the waves, file ownership and the lead-only commits stay unchanged, so an extra never needs a rewrite of the base. Candidates for later: Hermes Kanban (it needs a profile per role) and Antigravity's subagent messaging.
