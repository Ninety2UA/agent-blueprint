---
name: ab-forensics
description: "Diagnoses a failed, stalled or aborted automated run after the fact, read-only: finds the run's logs, run state and git history, checks for stuck loops, missing artifacts, abandoned work and crashes, redacts secrets, and writes an evidence-cited report (verdict, timeline, root-cause hypothesis, recommended next action) to .agent-blueprint/forensics/. Use when ab-ship-pipeline, ab-orchestrate, a build pipeline or an iteration loop ended without delivering, stopped early, did not converge or left contradictory results, and the user wants a post-mortem before retrying. Not for live debugging of a code bug (ab-systematic-debugging), for fixing the failure (a separate step), or for a routine status check (ab-project-status, ab-health-check)."
argument-hint: "[run id, log path, or symptom]"
---

# Forensics

When the ab-ship-pipeline or ab-orchestrate skill, or any iterative pipeline, ends without delivering, the operator needs to know why before retrying: re-running blindly often produces the same failure, just slower. This skill diagnoses a finished run, read-only, from its logs, run state, git state and planning artifacts. It is done when the report is written and the user has the summary and the Step 5 choice.

Ground every conclusion in specific evidence (commits, log lines, file timestamps, planning artifacts), because a guess written up as a finding sends the retry the wrong way; "unknown" is better than speculation.

## When to Use

- An ab-ship-pipeline run exited without delivering
- An ab-orchestrate run produced partial output across waves
- Iterative refinement hit max iterations without convergence
- A long-running session ended in an unexpected state
- The user resumes a project and finds inconsistent state

Not for live debugging of code bugs (the ab-systematic-debugging skill), active recovery or fix-forward (this skill only diagnoses), or routine status checks (the ab-project-status or ab-health-check skill).

## Inputs

The user usually gives one of:
- A run id (for example `ship-2026-04-15-1430`)
- A log path (for example the ship runner's `logs/iteration-5.log`, located in Step 1)
- A symptom ("the last ship run stopped at iteration 5")
- Nothing: then locate the most recent run yourself

## Process

### Step 1: Locate the artifact

If the user gave a path, use it. Otherwise list the newest logs. The ship runner keeps them outside the working tree, in `${XDG_STATE_HOME:-$HOME/.local/state}/agent-blueprint/<hash>/logs/` as `iteration-<n>.log` (everything the session printed) and `iteration-<n>.last` (the host's last message), where `<hash>` is computed below; the `record` file beside `logs/` holds the base commit, branch and iteration count. Nothing writes under `.agent-blueprint/run/logs/`.

```bash
repo=$(git rev-parse --show-toplevel)
if command -v sha256sum >/dev/null; then hash=$(printf '%s' "$repo" | sha256sum | cut -c1-16)
elif command -v shasum >/dev/null; then hash=$(printf '%s' "$repo" | shasum -a 256 | cut -c1-16)
elif command -v openssl >/dev/null; then hash=$(printf '%s' "$repo" | openssl dgst -sha256 | sed 's/.*= *//' | cut -c1-16)
else echo "no SHA-256 tool (sha256sum, shasum or openssl); ask for the log path" >&2; fi
if [ -n "$hash" ]; then ls -t "${XDG_STATE_HOME:-$HOME/.local/state}/agent-blueprint/$hash/logs/"iteration-*.log 2>/dev/null | head -3; fi
```

Also read `.agent-blueprint/run/state.json` if it exists: its `status`, `stage`, `iteration`, `reason` and `decisions` say where the run stopped and why it thought so. Treat them as claims to check against the logs and git, not as findings.

If the block found no SHA-256 tool, the logs may still exist: ask the user for the path. If no logs exist (an interactive run has none: its record is state.json and git), fall back to:
- Recent git activity (`git log --since='1 day ago' --oneline`)
- Pending changes (`git status --short`)
- Run files under `.agent-blueprint/`: `run/commit-msg.md`, the team marker and ledgers (`team/active.md`, `team/*/ledger.md`), progress ledgers (`plans/*.progress.md`) and debug notes (`debug/*.md`)

A run in no-commit mode (`AGENT_BLUEPRINT_GIT_WRITABLE` was `0`, or `.agent-blueprint/run/commit-msg.md` exists) leaves its work in the working tree instead of commits, so there "no commits" is expected, not a missing artifact.

### Step 2: Investigate four anomaly categories

For each, gather evidence before drawing conclusions.

**1. Stuck execution loops**
- Same iteration block repeating with near-identical output?
- Same helper started 3+ times with no observable progress?
- Same test failing across iterations with no fix attempted?
- Evidence: count repeated phrases / same-file diffs in the log; check iteration timestamps (long iterations = thrashing).

**2. Missing or incomplete artifacts**
- Plan file references files that were never created?
- Tasks marked complete but no commits?
- Helper started but never returned?
- Evidence: cross-reference plan TODOs against `git log --oneline`, check for empty deliverable directories.

**3. Abandoned work in progress**
- WIP commits without follow-up?
- Branch with uncommitted changes that don't match the plan?
- A pause checkpoint (the Session Continuity section of `docs/context/STATUS.md`) or a team ledger with unfinished rows?
- Evidence: `git stash list`, `git diff` against base branch, the progress and team ledgers from Step 1.

**4. Crashes or sudden interruptions**
- Log ends mid-line or mid-tool-call?
- Exit code in log indicating non-zero termination?
- Hook timeout messages?
- System errors (rate limit, network, OOM)?
- Evidence: `tail` of log, look for error patterns, check timestamps for gaps.

### Step 3: Redact

Before producing the report, scrub sensitive content, because reports get pasted into issues and shared with teammates:

- API tokens, secrets, env values (replace with `<redacted>`)
- Full file paths inside the user's home directory (replace home with `~`)
- Email addresses and personal info appearing in evidence quotes
- Auth headers if any were logged

### Step 4: Produce report

**Working folder.** Blueprint working files live under `.agent-blueprint/` in the project root. Before the first write there, make sure `.agent-blueprint/.gitignore` exists and lists `run/`, `team/`, `review-runs/`, `cache/` and `.gitignore`, so run state and the ignore file itself stay out of commits while plans and notes stay tracked.

Write findings to `.agent-blueprint/forensics/<run-id-or-timestamp>.md` in the format of `references/report-template.md` § Format. If this run already has a report, extend it instead of starting a second one.

### Step 5: Offer next steps

After writing the report, summarize it inline in 200 words or fewer and offer the next steps.

**Asking the user.** Ask with your question tool if you have one, offering at most three options; otherwise ask in plain text with a numbered list. In a headless or unattended run nobody will answer: take the default named below, say so in your output, and log it in the run state's decisions if there is a run state.

Options: 1. Open a GitHub issue with the redacted report as its body. 2. Re-run with the parameter the diagnosis points at changed (name it). 3. Resume the abandoned work with the ab-resume-session skill (offer it only when abandoned work was the diagnosis). Default when nobody answers: do none of them and stop with the report, because filing, retrying and resuming are the user's decisions.

## Rules

- **Read-only.** Apart from the report, change no source files, start no pipelines and retry nothing on your own, because a retry repeats the failure and buries its evidence before anyone knows the cause. A claim you cannot cite goes under Unverifiable.
- **Don't fix.** If you spot the obvious fix, name it under Recommended Next Action but don't apply it. Diagnosis and remediation are separate steps; mixing them hides what actually went wrong.
