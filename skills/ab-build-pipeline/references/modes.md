# Modes

Loaded on demand from SKILL.md when the user passes `--iterate N` or `--quick`, or the change is small.

## Iterate Mode

If the user specifies `--iterate N` (where N is 1-10):
- Replace the single-pass Stage 5 (Review) with the ab-iterative-refinement skill
- Pass `max_iterations: N` and `convergence: fast` to the ab-iterative-refinement skill
- The review→fix→review cycle runs up to N times until P1 findings reach zero
- All other stages remain the same with normal checkpoints

Example: `--iterate 5` runs the standard pipeline but reviews and fixes up to 5 times.

This can be combined with other flags: `--quick --iterate 3`

## Quick Mode

If the user specifies `--quick` or the change is small (< 3 files, clarity ≥ 0.8 per `references/ambiguity-gate.md`):
- Skip Stage 1 (Discuss) and Stage 2 (Brainstorm)
- Go directly to Plan → Execute → Review → Verify
