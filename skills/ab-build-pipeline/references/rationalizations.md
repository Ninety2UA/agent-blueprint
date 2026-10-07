# Common rationalizations

Loaded on demand from SKILL.md when you are tempted to skip a stage or a checkpoint.

| Rationalization | Reality |
|---|---|
| "Stage 5 review is overkill, the code looks right" | Review is the discipline; "looks right" is the heuristic that produced the bug. Run it. |
| "I'll skip the brainstorm — requirements are clear" | If requirements are clear AND the change is small, use `--quick`. Otherwise, brainstorm. Skipped brainstorms are how features ship the wrong shape. |
| "I'll batch through stages without checkpoints" | That's `ab-ship-pipeline`. `ab-build-pipeline` exists *because* checkpoints catch misalignment cheaply. Strip them and you've made the wrong tool. |
| "The user approved Stage 1, so Stage 4 changes are pre-approved" | Approval is per-stage. Plan changes mid-execution need a fresh checkpoint. |
| "Tests fail but the build is otherwise complete" | Stage 6 (Verify) blocks the pipeline. Failing tests at the gate means the previous stages weren't actually done. |
| "I'll defer the compound stage" | Stage 8 captures learnings while context is hot. Deferred to "later" means lost. 60 seconds now beats reconstructing it next sprint. |
