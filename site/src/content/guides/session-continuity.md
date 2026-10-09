---
description: How ab-session-wrap writes the handoff note in docs/context/STATUS.md, how ab-resume-session reads it, and how to save your place in the middle of a session.
---

A new session starts from nothing. The handoff note below is what it reads first, whichever tool opens the repository. To step away in the middle of a session instead, [`ab-pause-checkpoint`](/skills/ab-pause-checkpoint/) saves a snapshot and keeps the execution state in `docs/context/STATE.md` current through [`ab-session-continuity`](/skills/ab-session-continuity/). What a session reads when it starts, and in which order, is on [How it works](/docs/how-it-works/).
