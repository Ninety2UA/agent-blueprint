---
description: Run ab-ship-pipeline from a terminal with nobody watching. The ship runner starts a fresh session for every iteration and scans for secrets before it pushes.
---

The ship runner is a script inside [`ab-ship-pipeline`](/skills/ab-ship-pipeline/), at `skills/ab-ship-pipeline/scripts/run.sh` in your checkout. It starts a fresh session for every iteration, and it pushes and opens the pull request only after its own secret scan. When a run ends without a pull request, [`ab-forensics`](/skills/ab-forensics/) reads the logs, run state and git history it left behind.
