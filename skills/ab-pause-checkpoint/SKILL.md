---
name: ab-pause-checkpoint
description: "Saves a quick mid-session snapshot when the user steps away: writes a checkpoint of the branch, changes, decisions and next steps through ab-context-checkpoint, and updates the execution state in docs/context/STATE.md (wave progress, task completion, blockers) through ab-session-continuity. Documentation only; the session goes on afterwards. Use when the user wants to pause, take a break, save progress or checkpoint their place for a quick return. Not for the end of a full work session, which needs complete documentation, learnings and cross-session continuity (ab-session-wrap)."
argument-hint: "[optional: reason for pausing]"
---

# Pause Checkpoint

Save the user's place so they can come straight back to it. The pause is done when the checkpoint and the execution state are both written and the user has been told how to resume.

1. Run the ab-context-checkpoint skill. If the user gave a reason for pausing, use it as the checkpoint's brief description.
2. Run the ab-session-continuity skill and follow its Process: Pausing Work to update `docs/context/STATE.md` with the current execution state (wave progress, task completion, blockers).

This is documentation only: change no source code, because a pause should preserve the state, not change it, and an edit made on the way out goes unreviewed.
