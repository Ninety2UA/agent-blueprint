---
name: forensics
description: "Trigger this skill for post-mortem diagnosis of failed, stalled, or aborted automated runs. Trigger when the user says 'why did /ship-pipeline fail', 'what went wrong with the last run', 'investigate the failed pipeline', 'forensics', 'post-mortem', 'autopsy', 'diagnose this run', 'last build crashed', 'iteration didn't converge', 'agent stopped without finishing', 'where did this go wrong'. Trigger when ship-logs/, orchestrate output, or a build pipeline produced incomplete or contradictory results and the user wants to know why before retrying. Use after the failure has happened — this is read-only diagnostic, not active recovery. DO NOT TRIGGER for live debugging of code bugs — use systematic-debugging instead. DO NOT TRIGGER to fix the issue — this skill diagnoses; remediation is a separate step."
argument-hint: "[run id, log path, or symptom]"
---

# Forensics

## Overview

When `/ship-pipeline`, `/orchestrate`, `/team-execution`, or any iterative pipeline ends without delivering, the operator needs to know *why* before retrying. Re-running blindly often produces the same failure, just slower. This skill performs read-only post-mortem diagnosis against logs, git state, and planning artifacts.

**Core principle:** Ground every conclusion in specific evidence — commits, log lines, file timestamps, planning artifacts. Speculation without evidence is worse than "unknown".

## When to Use

- `/ship-pipeline` exited without merging
- `/orchestrate` produced partial output across waves
- Iterative refinement hit max iterations without convergence
- A long-running session ended in an unexpected state
- The user resumes a project and finds inconsistent state

**Do NOT use for:**
- Live debugging of code bugs (use `systematic-debugging`)
- Active recovery / fix-forward (this skill only diagnoses)
- Routine status checks (use `project-status` / `health-check`)

## Inputs

The user typically provides one of:
- A run id (e.g., `ship-2026-04-15-1430`)
- A log path (e.g., `.claude/ship-logs/ship-2026-04-15-1430.log`)
- A symptom ("the last ship run stopped at iteration 5")
- Nothing — in which case, locate the most recent run automatically

## Process

### Step 1: Locate the artifact

If user gave a path, use it. Otherwise:

```bash
ls -t .claude/ship-logs/*.log 2>/dev/null | head -3
```

If no logs exist, fall back to:
- Recent git activity (`git log --since='1 day ago' --oneline`)
- Pending changes (`git status --short`)
- Active session files (`ls .claude/team-active.local.md .continue-here.md 2>/dev/null`)

### Step 2: Investigate four anomaly categories

For each, gather evidence before drawing conclusions.

**1. Stuck execution loops**
- Same iteration block repeating with near-identical output?
- Same agent dispatched 3+ times with no observable progress?
- Same test failing across iterations with no fix attempted?
- Evidence: count repeated phrases / same-file diffs in the log; check iteration timestamps (long iterations = thrashing).

**2. Missing or incomplete artifacts**
- Plan file references files that were never created?
- Tasks marked complete but no commits?
- Subagent dispatched but no return?
- Evidence: cross-reference plan TODOs against `git log --oneline`, check for empty deliverable directories.

**3. Abandoned work in progress**
- WIP commits without follow-up?
- Branch with uncommitted changes that don't match the plan?
- Continue-here markers from a paused run?
- Evidence: `git stash list`, `.continue-here.md`, `git diff` against base branch.

**4. Crashes or sudden interruptions**
- Log ends mid-line or mid-tool-call?
- Exit code in log indicating non-zero termination?
- Hook timeout messages?
- System errors (rate limit, network, OOM)?
- Evidence: `tail` of log, look for error patterns, check timestamps for gaps.

### Step 3: Redact

Before producing the report, scrub sensitive content:

- API tokens, secrets, env values (replace with `<redacted>`)
- Full file paths inside the user's home directory (replace home with `~`)
- Email addresses and personal info appearing in evidence quotes
- Auth headers if any were logged

### Step 4: Produce report

Write findings to `.claude/forensics/<run-id-or-timestamp>.md`. Format:

```markdown
# Forensics Report: <run id or symptom>

**Run:** <id / log path>
**Investigated:** <ISO timestamp>
**Verdict:** STUCK_LOOP | MISSING_ARTIFACTS | ABANDONED_WIP | CRASH | UNKNOWN

## Summary
<2–4 sentences: what happened, root signal, recommended next action>

## Evidence

### <Category>
- <Specific observation> — `<file path>:<line>` or commit `<sha>`
- ...

## Timeline
| Time | Event | Source |
|------|-------|--------|
| 14:30 | Run started | log line 1 |
| 14:42 | Wave 2 dispatched | log line 387 |
| 14:58 | Wave 2 first failure | log line 1042 |
| ...

## Root Cause Hypothesis
<one-paragraph hypothesis with evidence cited>

## Confidence
- Tier (1–6 per evidence hierarchy): <X>
- Why: <what could change this hypothesis>

## Recommended Next Action
- [ ] <Specific step the user should take before retrying>
- [ ] <Optional fix>

## Unverifiable
- <Claims that couldn't be checked from logs/git alone>
```

### Step 5: Offer next steps

After writing the report, summarize inline (≤200 words) and offer:

- "Open a GitHub issue from this report" — only if the user explicitly asks; the redacted report is the issue body
- "Re-run with adjusted parameters" — pointing to the specific parameter the diagnosis suggests changing
- "Resume from continue-here" — if abandoned WIP was the diagnosis

## Rules

- **Read-only.** Never modify source files, never run new pipelines, never auto-retry.
- **Evidence-first.** Every claim cites a log line, commit sha, or file. No bare assertions.
- **Redact before writing.** Reports may be shared in issues / pasted to teammates.
- **One report per run.** Don't re-investigate the same run multiple times — extend the existing report instead.
- **UNKNOWN is valid.** If logs are insufficient, say so. Padding the report with speculation is worse than admitting limits.
- **Don't fix.** If you spot the obvious fix, name it under "Recommended Next Action" — but don't apply it. Diagnosis and remediation are separate steps; conflating them hides what actually went wrong.
