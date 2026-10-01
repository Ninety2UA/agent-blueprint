#!/usr/bin/env bash
# run-upgrade.sh — the Claude Code upgrade scenario (U15 step 5): v3.8.0 installed, then v4.
#
# Usage: bash run-upgrade.sh --v3-dir DIR --v4-dir DIR [--work DIR] [--keep]
#   --v3-dir DIR   a checkout of the main branch at v3.8.0 (its plugin root is plugins/claude-code-blueprint)
#   --v4-dir DIR   this checkout (the repository root is the plugin root)
#   --work DIR     where the temporary Claude config and the fixture project go (default: a temp dir)
#   --keep         keep that folder
#
# In a temporary CLAUDE_CONFIG_DIR (the user's own config is never touched): add the v3 marketplace
# from the v3 checkout and install claude-code-blueprint, add the v4 marketplace from the v4
# checkout and install agent-blueprint, check that `claude plugin list` shows both ids, run
# ab-migrate's detect-v3.sh on a project with v3 traces (the gate fixture in
# tests/gates/fixtures/v3-legacy-repo) and check its report and its --apply, then run the
# session-start hook as Claude Code and check that its warning names the v3 plugin.
#
# Prints one PASS: or FAIL: line per check and stops at the first failure (exit 1). No model runs.
set -euo pipefail

V3_DIR="" V4_DIR="" WORK="" KEEP=false
while [ $# -gt 0 ]; do
    case "$1" in
        --v3-dir) V3_DIR="$2"; shift 2 ;;
        --v4-dir) V4_DIR="$2"; shift 2 ;;
        --work)   WORK="$2"; shift 2 ;;
        --keep)   KEEP=true; shift ;;
        -h|--help) sed -n '2,17p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
        *) echo "unknown option: $1" >&2; exit 2 ;;
    esac
done
if [ -z "$V3_DIR" ] || [ -z "$V4_DIR" ]; then echo "FAIL: --v3-dir and --v4-dir are required"; exit 1; fi
V3_DIR="$(cd "$V3_DIR" && pwd)"; V4_DIR="$(cd "$V4_DIR" && pwd)"
[ -f "$V3_DIR/plugins/claude-code-blueprint/.claude-plugin/plugin.json" ] || { echo "FAIL: $V3_DIR has no plugins/claude-code-blueprint/.claude-plugin/plugin.json (not a v3 checkout)"; exit 1; }
[ -f "$V4_DIR/.claude-plugin/plugin.json" ] || { echo "FAIL: $V4_DIR has no .claude-plugin/plugin.json"; exit 1; }
command -v claude >/dev/null 2>&1 || { echo "FAIL: claude is not on PATH"; exit 1; }
command -v node >/dev/null 2>&1 || { echo "FAIL: node is not on PATH (the session-start hook needs it)"; exit 1; }
if [ -z "$WORK" ]; then
    t="${TMPDIR:-/tmp}"; WORK=$(mktemp -d "${t%/}/ab-smoke-upgrade-XXXXXX")
fi
mkdir -p "$WORK"
cleanup() { [ "$KEEP" = true ] || rm -rf "$WORK"; }
trap cleanup EXIT

export CLAUDE_CONFIG_DIR="$WORK/claude-config"
mkdir -p "$CLAUDE_CONFIG_DIR"
LOG="$WORK/upgrade.log"
: > "$LOG"
step() {   # NAME CMD...: run a command, log it, fail the scenario on a non-zero exit
    local name="$1"; shift
    echo "--- $name: $*" >> "$LOG"
    if "$@" >> "$LOG" 2>&1; then
        echo "PASS: $name"
    else
        echo "FAIL: $name (exit $?; see $LOG)"
        tail -n 15 "$LOG" | sed 's/^/    /'
        exit 1
    fi
}

step "add the v3.8.0 marketplace from $V3_DIR" claude plugin marketplace add "$V3_DIR"
step "install claude-code-blueprint@claude-code-blueprint" claude plugin install claude-code-blueprint@claude-code-blueprint
step "add the v4 marketplace from $V4_DIR" claude plugin marketplace add "$V4_DIR"
step "install agent-blueprint@agent-blueprint" claude plugin install agent-blueprint@agent-blueprint

LIST=$(claude plugin list --json 2>>"$LOG" || true)
printf '%s\n' "$LIST" >> "$LOG"
for id in claude-code-blueprint@claude-code-blueprint agent-blueprint@agent-blueprint; do
    if printf '%s' "$LIST" | grep -q "\"$id\""; then
        echo "PASS: claude plugin list shows $id"
    else
        echo "FAIL: claude plugin list does not show $id"; exit 1
    fi
done

# A project with v3 traces: the ab-migrate gate fixture, its SKILL.fixture.md files renamed.
PROJECT="$WORK/project"
mkdir -p "$PROJECT"
FIXTURE="$V4_DIR/tests/gates/fixtures/v3-legacy-repo"
(cd "$FIXTURE" && find . -type f | while IFS= read -r f; do
    dest="$PROJECT/$f"
    case "$f" in */SKILL.fixture.md) dest="$PROJECT/$(dirname "$f")/SKILL.md" ;; esac
    mkdir -p "$(dirname "$dest")"
    cp "$f" "$dest"
done)
git -C "$PROJECT" init -q
DETECT="$V4_DIR/skills/ab-migrate/scripts/detect-v3.sh"
REPORT=$(bash "$DETECT" "$PROJECT" 2>&1 || true)
printf '%s\n' "$REPORT" >> "$LOG"
for line in "remove  .claude/skills/build-pipeline" "remove  scripts/ship.sh" "rename  CLAUDE.md -> AGENTS.md" "plugin  claude-code-blueprint is still installed"; do
    if printf '%s' "$REPORT" | grep -Fq "$line"; then
        echo "PASS: detect-v3.sh reports '$line'"
    else
        echo "FAIL: detect-v3.sh did not report '$line'"; printf '%s\n' "$REPORT" | sed 's/^/    /'; exit 1
    fi
done
step "detect-v3.sh --apply" bash "$DETECT" --apply "$PROJECT"
if [ -f "$PROJECT/AGENTS.md" ] && [ "$(cat "$PROJECT/CLAUDE.md")" = "@AGENTS.md" ] && [ ! -e "$PROJECT/.claude/skills/build-pipeline" ]; then
    echo "PASS: AGENTS.md exists, CLAUDE.md imports it, the v3 skill copy is gone"
else
    echo "FAIL: the project is not in the v4 layout after --apply"; exit 1
fi

# The session-start hook, run as Claude Code with the temporary config dir, warns about v3.
PAYLOAD='{"session_id":"s1","transcript_path":"/home/u/.claude/projects/p/s1.jsonl","cwd":"'"$PROJECT"'","hook_event_name":"SessionStart"}'
HOOK_OUT=$(cd "$PROJECT"; printf '%s' "$PAYLOAD" | CLAUDECODE=1 node "$V4_DIR/hooks/handlers/session-start.js" 2>>"$LOG" || true)
printf '%s\n' "$HOOK_OUT" >> "$LOG"
if printf '%s' "$HOOK_OUT" | grep -q "claude-code-blueprint" && printf '%s' "$HOOK_OUT" | grep -q "ab-migrate"; then
    echo "PASS: the session-start warning names the v3 plugin and ab-migrate"
else
    echo "FAIL: no session-start warning about the v3 plugin (settings: $CLAUDE_CONFIG_DIR/settings.json)"
    printf '%s\n' "$HOOK_OUT" | sed 's/^/    /'
    [ -f "$CLAUDE_CONFIG_DIR/settings.json" ] && sed 's/^/    settings: /' "$CLAUDE_CONFIG_DIR/settings.json"
    exit 1
fi
echo "PASS: upgrade scenario complete (log: $LOG)"
