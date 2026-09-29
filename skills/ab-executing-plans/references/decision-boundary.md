# Decision boundary

Loaded on demand from SKILL.md when you decide whether to decide or stop, and from other pipelines and helpers that follow the decision boundary in the ab-executing-plans skill.

## The rule

This rule settles decide-versus-stop, refining the project instructions' "when in doubt, ask". A decision in one of their must-ask categories stops for a human wherever the pipeline can stop: ab-executing-plans and ab-build-pipeline ask, ab-autonomous-loop escalates, and ab-ship-pipeline, which cannot stop, decides conservatively and locks it in `docs/context/DECISIONS.md`. Outside them, a choice you can detect and roll back (name how) is decided, recorded under `### Assumptions` (plus a `BACKLOG.md` line if it defers work) and continued. Anything else goes by posture: an interactive session asks with two or three options, an autonomous one takes the conservative option and records it, and a helper returns `NEEDS_INPUT` with the options for the coordinating session to route, not retry with a narrower scope. A claim that something is impossible, blocked or needs a credential needs evidence: a verbatim error, a documentation citation or a live probe.

## Examples

A migration is a must-ask category, so every posture stops (ab-ship-pipeline alone decides conservatively and records, because it cannot stop). A helper's default value is detectable with a grep and revertible with one edit, so it is decided, recorded, and continued.
