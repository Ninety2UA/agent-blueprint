# Guardrails

Loaded on demand from SKILL.md when deciding whether a request fits this skill, or when tempted to bend its contract.

## When NOT to Use

- **Unclear requirements** — if you can't describe the feature in one sentence, use ab-build-pipeline with human checkpoints
- **Architectural decisions needed** — if the feature requires choosing between fundamentally different approaches, use ab-discuss + ab-build-pipeline
- **First feature in a new codebase** — conventions aren't established yet; use ab-build-pipeline to set patterns with human oversight
- **Database migrations** — a person should read a migration before it runs, because a bad one can lose data that no revert brings back; use ab-build-pipeline with `--deploy`

A must-ask category from the project instructions file stops the ab-build-pipeline and ab-autonomous-loop skills for the user; this skill decides it conservatively instead (SKILL.md Stage 1), so a request likely to hit several of them fits ab-build-pipeline better.

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "The change is well-defined enough — no need for autonomous review iterations" | If the change is *that* well-defined and small, use `ab-quick-fix`. Ship-pipeline exists for autonomous quality, not autonomous skipping. |
| "I'll prompt for approval mid-pipeline if something feels off" | That's `ab-build-pipeline`. Adding checkpoints to `ab-ship-pipeline` defeats the point — fire-and-forget is the contract. |
| "Iteration cap reached, ship it anyway" | Cap-reached without convergence is a no-go signal, not a permission slip. Stop as `blocked` and surface the findings to the user. |
| "I'll auto-merge after a green review" | Ship-pipeline reviews; the user merges. The pipeline finishes by handing off, not by pushing main. |
| "Reviews are duplicating work between iterations" | Iterations exist *because* fixes introduce regressions. Two passes catch what one missed; you'd find this with measurement, not intuition. |
| "Database migration is small, autonomous is fine" | Size does not make lost data come back. Migrations go through `ab-build-pipeline --deploy`, with a person reading the migration file. |
