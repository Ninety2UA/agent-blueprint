---
description: How ab-orchestrate runs a plan as team work in parallel waves, how the review and research swarms work, and how a helper runs in tools with and without subagents.
---

The blueprint runs several helpers at once in two ways. Team work splits a plan into waves of parallel tasks with [`ab-orchestrate`](/skills/ab-orchestrate/), with your session as the lead and the only one that commits. A swarm gives several read-only helpers the same input, each with its own lens, and merges what they find, as [`ab-review-swarm`](/skills/ab-review-swarm/) and [`ab-deep-research`](/skills/ab-deep-research/) do.
