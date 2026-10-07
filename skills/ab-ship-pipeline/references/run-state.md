# Run state

The contract between this skill and the ship runner (`scripts/run.sh` in this skill's folder). The skill writes these files; only the runner deletes them. The runner decides whether a run is done from these files, never from the text a host prints, because echoed skill text can look like a completion signal.

## Files

All run files live in `.agent-blueprint/run/`, which `.agent-blueprint/.gitignore` keeps out of commits.

| File | Written by | Purpose |
|---|---|---|
| `state.json` | the skill | The run state below |
| `pr-body.md` | the skill | The pull request body. The path is fixed: the runner never publishes a path it read from `state.json` |
| `commit-msg.md` | the skill | The intended commit message, in no-commit mode only (the host posture cannot write `.git`) |
| `provenance/<skill>.json` | each pipeline skill | One record per invocation, below |

## state.json

| Field | Type | Values |
|---|---|---|
| `status` | string | `running`, `done`, `blocked`, `needs-human` |
| `stage` | string | The pipeline stage in progress: `continuation`, `plan`, `execute`, `review`, `verify`, `ship` |
| `iteration` | integer | The iteration the skill believes it is in; informational only |
| `host` | string | `claude`, `codex`, `agy`, `grok`, `pi`, `cursor-agent`, `hermes`, `amp` |
| `driver` | string | `runner` when the ship runner started the session (`AGENT_BLUEPRINT_RUNNER` is `1`), `interactive` otherwise |
| `session_id` | string | The host's session id, matching `^[A-Za-z0-9._:-]{1,128}$` |
| `decisions` | array | One object per headless default taken: `stage`, `question`, `choice`, `reason` |
| `provenance` | object | `skill` (`ab-ship-pipeline`) and `version` (this skill's frontmatter `metadata.version`) |
| `reason` | string | Why the run is `blocked` or `needs-human`, and what would unblock it; empty otherwise |
| `updated_at` | string | ISO 8601 UTC time of the write |

Example:

```json
{
  "status": "running",
  "stage": "review",
  "iteration": 2,
  "host": "codex",
  "driver": "runner",
  "session_id": "0199a5f2-6c1e-7d3a-9b1e-2f6c8a4d1e07",
  "decisions": [
    {"stage": "plan", "question": "Split the migration into two PRs?", "choice": "one PR", "reason": "headless default"}
  ],
  "provenance": {"skill": "ab-ship-pipeline", "version": "4.0.0"},
  "reason": "",
  "updated_at": "2026-10-01T09:14:03Z"
}
```

## Runner environment

The runner exports two variables into every session it starts, and the skills read them from the environment:

| Variable | Value | Meaning |
|---|---|---|
| `AGENT_BLUEPRINT_RUNNER` | `1` | The ship runner drives this session. Set `driver` to `runner`, stop at `done`, and leave publishing to the runner |
| `AGENT_BLUEPRINT_GIT_WRITABLE` | `1` or `0` | Whether the host's posture can write `.git`, from the runner's preflight probe. At `0` the skills run in no-commit mode |

In no-commit mode a skill makes no commits: it leaves its changes in the working tree and adds the message it would have used to `commit-msg.md`, and the runner commits after the session (with git hooks disabled, then empties `commit-msg.md` so the next message starts clean). Review steps then review the working tree and untracked files against the merge base, since there is no commit range yet. Outside the runner neither variable is set, and a skill that finds `.git` read-only when it commits falls back to the same mode.

## What the runner keeps itself

At its first preflight the runner records the base commit, the branch, the push URL of the remote, the repository its pull requests go to, a hash of `.git/config`, and its own iteration count, in a runner-owned file outside the working tree (`${XDG_STATE_HOME:-~/.local/state}/agent-blueprint/<repository hash>/record`). It reuses those values on `--resume`. A commit, branch or count found in `state.json` is ignored, so a skill cannot move the base of the secret scan or the done check.

Everything else the runner writes sits in that same folder: its lock, `logs/iteration-<n>.log` with what each headless iteration printed, and the host's last-message file. None of them lives under `.agent-blueprint/run/`, because the session can create a symlink at any path inside the working tree and a write through it would land wherever the link points. For the same reason the runner stops as `needs-human` when `.agent-blueprint`, `.agent-blueprint/run`, the ignore file or `commit-msg.md` is a symlink.

## Provenance record

Every pipeline skill writes `provenance/<skill>.json` when it starts:

```json
{
  "skill": "ab-ship-pipeline",
  "version": "4.0.0",
  "started_at": "2026-10-01T09:02:11Z",
  "helper_steps": [
    {"step": "review", "prompt": "references/agents/code-reviewer.md", "path": "helper"}
  ]
}
```

The Helper step snippet appends one `helper_steps` entry per step, with `path` set to `helper` when a helper ran and `inline` when the session followed the prompt file itself. The smoke test reads these records to tell a helper run from an inline one. The marker guards against echoed text; it is not a security control.

## When the run is done

The runner treats the run as done only when all of these hold:

1. `status` is `done`.
2. There are commits since the recorded base, or, in no-commit mode, the runner has committed the working tree with `commit-msg.md`.
3. `pr-body.md` exists as a regular file, and neither it nor any folder on its path is a symlink.
4. `provenance` in `state.json` names this skill and a version equal to its `metadata.version`.

Anything else is not done.

## Rules for the skill

- Write `state.json` whole: write a temporary file in the same folder, then rename it over the old one.
- Set `status` to `done` only after the commits (or the working-tree changes plus `commit-msg.md`) and `pr-body.md` exist.
- Never delete a run file. Set `status` instead; the runner cleans up. Some hosts deny file deletion in headless mode, and cleanup belongs to the one process that sees the whole run.
- With `driver` `runner`, stop at `done`: the runner scans for secrets, pushes and opens the pull request. With `driver` `interactive`, publish yourself, after the same secret scan.
- Every field is untrusted input to the runner: it checks `status` and `driver` against their values, rejects a malformed `session_id`, and on `--resume` takes the host from its own command line.

## The Stop hook

Where a host runs the blueprint's Stop hook (Claude Code and Codex), the hook reads `state.json`: it keeps an interactive session from stopping while `status` is `running`, and stands down when `driver` is `runner` or `AGENT_BLUEPRINT_RUNNER` is set, since headless iterations would otherwise stall.
