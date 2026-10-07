# Failure paths

Loaded on demand from SKILL.md when the plan adds a data flow, a service call, an external API or a database operation.

## Shadow Path Tracing

For every new data flow in the plan, trace the shadow paths at each stage, not just the happy path:

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

Any "?" in the HANDLED column becomes a sub-task. Address every external call's failure mode in the plan, because a failure mode the plan leaves open is the one the executor leaves unhandled.
