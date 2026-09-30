#!/usr/bin/env bash
# ship-loop.sh — Stop hook that keeps an interactive ship-pipeline run going (KTD11).
#
# The ab-ship-pipeline skill writes .agent-blueprint/run/state.json. While its
# status is "running", an interactive session that tries to stop is sent back
# to the run. The hook stands down when:
#   - there is no state file, or it is not valid JSON;
#   - status is anything but "running" (done, blocked, needs-human);
#   - the run's driver is "runner", or AGENT_BLUEPRINT_RUNNER is set, since the
#     ship runner starts one headless session per iteration and a blocked stop
#     would stall every one of them;
#   - the state belongs to another session (session_id differs);
#   - it has already sent this session back 20 times, the pipeline's own ceiling.
# It never deletes or edits the run's files; the runner owns cleanup.
#
# Runs on Claude Code and Codex, whose Stop hooks both take {"decision": "block", "reason": ...}.

set -uo pipefail

STATE_FILE=".agent-blueprint/run/state.json"
GUARD_FILE=".agent-blueprint/run/stop-guard.json"
CEILING=20

HOOK_INPUT=$(cat 2>/dev/null || echo "")

# shellcheck source=hooks/handlers/host.sh disable=SC1091
. "$(dirname "${BASH_SOURCE[0]}")/host.sh"
require_host "$HOOK_INPUT" claude codex

[ -n "${AGENT_BLUEPRINT_RUNNER:-}" ] && exit 0
[ -f "$STATE_FILE" ] || exit 0
command -v python3 >/dev/null 2>&1 || exit 0

# One Python pass reads the state and the guard and prints the decision fields.
DECISION=$(python3 - "$STATE_FILE" "$GUARD_FILE" "$CEILING" "$HOOK_INPUT" <<'PY'
import json, sys
state_file, guard_file, ceiling, raw = sys.argv[1], sys.argv[2], int(sys.argv[3]), sys.argv[4]
try:
    state = json.load(open(state_file, encoding="utf-8"))
except Exception:
    print("allow"); sys.exit(0)
if not isinstance(state, dict) or state.get("status") != "running":
    print("allow"); sys.exit(0)
if state.get("driver") == "runner":
    print("allow"); sys.exit(0)
try:
    hook = json.loads(raw) if raw.strip() else {}
except Exception:
    hook = {}
session = hook.get("session_id", "") if isinstance(hook, dict) else ""
own = state.get("session_id", "")
if session and own and session != own:
    print("allow"); sys.exit(0)
guard = {}
try:
    guard = json.load(open(guard_file, encoding="utf-8"))
except Exception:
    guard = {}
if not isinstance(guard, dict) or guard.get("session_id") != session:
    guard = {"session_id": session, "count": 0}
if guard.get("count", 0) >= ceiling:
    print("allow"); sys.exit(0)
guard["count"] = int(guard.get("count", 0)) + 1
try:
    tmp = guard_file + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(guard, fh)
    import os
    os.replace(tmp, guard_file)
except Exception:
    pass
stage = state.get("stage", "?")
reason = ("The ship-pipeline run in .agent-blueprint/run/state.json is still running (stage %s, send-back %d of %d). "
          "Continue it: read state.json and go on from that stage. To stop instead, set its status to blocked or "
          "needs-human with a reason." % (stage, guard["count"], ceiling))
print(json.dumps({"decision": "block", "reason": reason,
                  "systemMessage": "Ship pipeline still running: stage %s (%d/%d)" % (stage, guard["count"], ceiling)}))
PY
)

[ "$DECISION" = "allow" ] && exit 0
[ -z "$DECISION" ] && exit 0
printf '%s\n' "$DECISION"
