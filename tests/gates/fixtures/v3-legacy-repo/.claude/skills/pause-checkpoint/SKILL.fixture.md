---
name: pause-checkpoint
description: "Trigger this skill when the user says 'pause', 'checkpoint', 'save state', 'stepping away', 'break', 'save progress', 'brb', 'hold on', 'save where I am', 'quick save', or anything suggesting they need a mid-session state capture without ending the session. Trigger even when the user just says 'I need to step away for a bit' or 'hold that thought' — they want their state preserved for a quick return. This is for mid-session snapshots only, not full end-of-session documentation. DO NOT TRIGGER at the end of a full work session — use session-wrap instead. Session-wrap provides comprehensive documentation, learnings capture, and cross-session continuity. This skill is the lightweight alternative for quick interruptions."
argument-hint: "[optional: reason for pausing]"
---

# Pause Checkpoint

Invoke the context-checkpoint skill. Also invoke the session-continuity skill and follow it to update docs/context/STATE.md with current execution state (wave progress, task completion, blockers).

This is a documentation-only operation. Do NOT modify source code.
