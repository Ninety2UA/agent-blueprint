#!/usr/bin/env bash
# run-smoke.sh — the local smoke test: which Agent Blueprint pipelines work in which tools (U15).
#
# Usage: bash tests/smoke/run-smoke.sh [options]
#   --host h1,h2       Hosts to run (default: every host in hosts.sh: claude codex agy grok pi cursor-agent hermes amp)
#   --cell c1,c2       Cells to run (default: all, in this order:
#                      discovery canary hooks manual-only build helpers-off effort review debug ship team upgrade)
#   --plugin-dir PATH  The plugin checkout passed to hosts that take one (default: this checkout)
#   --v3-dir PATH      A checkout of v3.8.0 (plugin root plugins/claude-code-blueprint), for the upgrade cell
#   --out DIR          Where the table and the JSON go (default: docs/releases/)
#   --jobs N           Hosts run in parallel, N at a time; the cells of one host always run one after another
#   --timeout S        Seconds per cell, overriding the host's row in hosts.sh (ship cells get twice that)
#   --keep             Keep every cell's working copy (a failed cell's copy is kept either way)
#   -h, --help
#
# Every cell runs on a fresh copy of tests/smoke/fixture with only its own seed applied, through the
# host adapter table in skills/ab-ship-pipeline/scripts/hosts.sh, under a timeout. States: pass,
# degraded-pass (inline), degraded (vendor bug), fail, timeout, not-installed, n/a. Output:
# <out>/v<version>-smoke.md (the table), <out>/v<version>-smoke.json (every cell's details, merged
# into an existing file so partial runs build one table) and tests/smoke/logs/<run>/ (ignored by git).
#
# This costs real tokens on real hosts. It never runs in CI. tests/smoke/README.md has the details.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -t 1 ]; then
    GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BLUE='\033[0;34m'; DIM='\033[2m'; BOLD='\033[1m'; NC='\033[0m'
else
    GREEN=''; YELLOW=''; RED=''; BLUE=''; DIM=''; BOLD=''; NC=''
fi
info()    { echo -e "  ${BLUE}▸${NC} $1"; }
success() { echo -e "  ${GREEN}✓${NC} $1"; }
warn()    { echo -e "  ${YELLOW}!${NC} $1"; }
error()   { echo -e "  ${RED}✗${NC} $1" >&2; }

# shellcheck source=lib.sh disable=SC1091
. "$HERE/lib.sh"

ALL_CELLS="discovery canary hooks manual-only build helpers-off effort review debug ship team upgrade"
COMMAND="bash tests/smoke/run-smoke.sh $*"

# ─── Arguments ────────────────────────────────────────────────
HOSTS="$AB_HOSTS" CELLS="$ALL_CELLS" PLUGIN_DIR="$SMOKE_REPO" V3_DIR="" OUT="$SMOKE_REPO/docs/releases" JOBS=1 TIMEOUT_OVERRIDE="" KEEP=false
usage() { sed -n '2,23p' "$0" | sed 's/^# \{0,1\}//'; }
while [ $# -gt 0 ]; do
    case "$1" in
        --host)       [ $# -ge 2 ] || { usage; exit 1; }; HOSTS=$(printf '%s' "$2" | tr ',' ' '); shift 2 ;;
        --host=*)     HOSTS=$(printf '%s' "${1#--host=}" | tr ',' ' '); shift ;;
        --cell)       [ $# -ge 2 ] || { usage; exit 1; }; CELLS=$(printf '%s' "$2" | tr ',' ' '); shift 2 ;;
        --cell=*)     CELLS=$(printf '%s' "${1#--cell=}" | tr ',' ' '); shift ;;
        --plugin-dir) [ $# -ge 2 ] || { usage; exit 1; }; PLUGIN_DIR="$2"; shift 2 ;;
        --plugin-dir=*) PLUGIN_DIR="${1#--plugin-dir=}"; shift ;;
        --v3-dir)     [ $# -ge 2 ] || { usage; exit 1; }; V3_DIR="$2"; shift 2 ;;
        --v3-dir=*)   V3_DIR="${1#--v3-dir=}"; shift ;;
        --out)        [ $# -ge 2 ] || { usage; exit 1; }; OUT="$2"; shift 2 ;;
        --out=*)      OUT="${1#--out=}"; shift ;;
        --jobs)       [ $# -ge 2 ] || { usage; exit 1; }; JOBS="$2"; shift 2 ;;
        --jobs=*)     JOBS="${1#--jobs=}"; shift ;;
        --timeout)    [ $# -ge 2 ] || { usage; exit 1; }; TIMEOUT_OVERRIDE="$2"; shift 2 ;;
        --timeout=*)  TIMEOUT_OVERRIDE="${1#--timeout=}"; shift ;;
        --keep)       KEEP=true; shift ;;
        -h|--help)    usage; exit 0 ;;
        *)            error "Unknown option: $1"; usage; exit 1 ;;
    esac
done
for h in $HOSTS; do host_known "$h" || { error "Unknown host: $h (one of: $AB_HOSTS)"; exit 1; }; done
for c in $CELLS; do case " $ALL_CELLS " in *" $c "*) ;; *) error "Unknown cell: $c (one of: $ALL_CELLS)"; exit 1 ;; esac; done
case "$JOBS" in ''|*[!0-9]*) error "--jobs wants a number"; exit 1 ;; esac
[ "$JOBS" -ge 1 ] || JOBS=1
case "$TIMEOUT_OVERRIDE" in ''|*[0-9]) ;; *) error "--timeout wants seconds"; exit 1 ;; esac
PLUGIN_DIR="$(cd "$PLUGIN_DIR" 2>/dev/null && pwd)" || { error "--plugin-dir is not a directory"; exit 1; }
if [ -n "$V3_DIR" ]; then V3_DIR="$(cd "$V3_DIR" 2>/dev/null && pwd)" || { error "--v3-dir is not a directory"; exit 1; }; fi
mkdir -p "$OUT"
OUT="$(cd "$OUT" && pwd)"
VERSION=$(plugin_version "$SMOKE_REPO/.claude-plugin/plugin.json")

# Cells run in the canonical order whatever --cell said (build before helpers-off and effort; canary before hooks).
ordered=""
for c in $ALL_CELLS; do case " $CELLS " in *" $c "*) ordered="${ordered:+$ordered }$c" ;; esac; done
CELLS="$ordered"

RUN_ID=$(date +%Y%m%d-%H%M%S)
LOG_ROOT="${AB_SMOKE_LOGS:-$HERE/logs}/$RUN_ID"   # AB_SMOKE_LOGS: the selftest keeps its logs out of tests/smoke/logs/
mkdir -p "$LOG_ROOT"
rel_log() { printf '%s' "${1#"$SMOKE_REPO"/}"; }

echo ""
echo -e "  ${BOLD}Agent Blueprint smoke test${NC} v$VERSION ${DIM}(logs: $(rel_log "$LOG_ROOT"))${NC}"
info "Hosts: $HOSTS"
info "Cells: $CELLS"
info "Plugin dir: $PLUGIN_DIR${V3_DIR:+ · v3 dir: $V3_DIR}"
[ "$JOBS" -gt 1 ] && info "Jobs: $JOBS hosts in parallel"

# ─── Signals ──────────────────────────────────────────────────
HOST_PIDS=""
on_signal() {
    trap - INT TERM
    echo ""
    warn "Interrupted: stopping the host's process group"
    kill_smoke_child
    local p
    for p in $HOST_PIDS; do kill -TERM -- "-$p" 2>/dev/null || kill -TERM "$p" 2>/dev/null || true; done
    exit 130
}
trap on_signal INT TERM

# ─── Per-cell bookkeeping ─────────────────────────────────────
HOST="" CELL="" CELL_START=0 LOG="" LASTMSG="" FINAL="" RESULTS="" HOST_LOG_DIR="" HOST_PLUGIN_DIR=""
SESSION="" LINK="" CHECK_RC=0 CHECK_REASON="" RUN_RC=0
# What one host's cells remember for a later cell: the canary's trace file and the build's session.
CANARY_TRACE="" BUILD_SESSION="" BUILD_CHECKED=false SMOKE_TRACE_FILE=""

cell_timeout() {   # SECONDS for the current host; ship cells get twice the host's row
    local t
    t="${TIMEOUT_OVERRIDE:-$(host_timeout "$HOST")}"
    [ "${1:-}" = ship ] && t=$((t * 2))
    echo "$t"
}

begin_cell() {
    CELL="$1"
    CELL_START=$(epoch)
    LOG="$HOST_LOG_DIR/$CELL.log"; LASTMSG="$HOST_LOG_DIR/$CELL.last"; FINAL="$HOST_LOG_DIR/$CELL.final"
    : > "$LOG"; : > "$FINAL"
    SESSION="" LINK="" CHECK_RC=0 CHECK_REASON="" RUN_RC=0 TOKENS="n/a" COST="n/a"
    WORK="" WORK_ROOT="" REMOTE="" BASE=""
    echo ""
    echo -e "  ${BOLD}$HOST · $CELL${NC} ${DIM}($(date '+%H:%M:%S'))${NC}"
}

# vendor_bug_link HOST CELL: the URL from scenarios/known-vendor-bugs.tsv (or the file named by
# AB_SMOKE_VENDOR_BUGS, which the selftest uses), or nothing.
vendor_bug_link() {
    awk -F'\t' -v h="$1" -v c="$2" '$0 !~ /^#/ && $1 == h && ($2 == c || $2 == "*") { print $3; exit }' \
        "${AB_SMOKE_VENDOR_BUGS:-$SMOKE_SCENARIOS/known-vendor-bugs.tsv}" 2>/dev/null
}

# finish_cell STATE REASON: records the cell, prints the verdict, cleans up.
finish_cell() {
    local state="$1" reason="$2" secs url color keep=false
    secs=$(( $(epoch) - CELL_START ))
    case "$state" in
        fail|timeout)
            url=$(vendor_bug_link "$HOST" "$CELL")
            if [ -n "$url" ]; then LINK="$url"; state="degraded (vendor bug)"; reason="$reason · $url"; fi ;;
    esac
    case "$state" in
        pass) color="$GREEN" ;;
        "degraded-pass (inline)"|"degraded (vendor bug)"|n/a|not-installed) color="$YELLOW" ;;
        *) color="$RED"; keep=true ;;
    esac
    [ "$KEEP" = true ] && keep=true
    if [ -n "$WORK_ROOT" ] && [ -d "$WORK_ROOT" ]; then
        if [ "$keep" = true ]; then
            reason="$reason · work: $WORK_ROOT"
        else
            rm -rf "$WORK_ROOT"
        fi
    fi
    record_result "$RESULTS" "$HOST" "$CELL" "$state" "$secs" "$TOKENS" "$COST" "$(rel_log "$LOG")" "$reason" "link=$LINK" "session=$SESSION"
    echo -e "  ${color}${state}${NC} ${DIM}${secs}s · tokens $TOKENS · cost $COST${NC}"
    [ -n "$reason" ] && echo -e "    ${DIM}$reason${NC}"
    return 0
}

na_cell() { finish_cell "n/a" "$1"; }

session_of_log() {   # the host's session id from a JSON result (Claude Code, Cursor), else nothing
    python3 - "$1" <<'PY' 2>/dev/null || true
import json, re, sys
text = open(sys.argv[1], encoding="utf-8", errors="replace").read()
m = re.search(r'"session_id"\s*:\s*"([A-Za-z0-9._:-]{1,128})"', text)
print(m.group(1) if m else "")
PY
}

# run_scenario NAME [FLAG...]: fresh copy + seed, the prompt through the host under the timeout,
# the final message into FINAL, then the scenario's check.sh. Sets RUN_RC, CHECK_RC, CHECK_REASON.
run_scenario() {
    local name="$1" scenario prompt secs
    shift
    scenario="$SMOKE_SCENARIOS/$name"
    new_work "$CELL" "$scenario"
    prompt=$(fill_prompt "$scenario" "$HOST" "$HOST_PLUGIN_DIR")
    secs=$(cell_timeout "$name")
    printf '=== %s · %s · host %s · timeout %ss · work %s ===\n--- prompt ---\n%s\n--- output ---\n' "$CELL" "$(now_utc)" "$HOST" "$secs" "$WORK" "$prompt" >> "$LOG"
    RUN_RC=0
    if [ -n "$SMOKE_TRACE_FILE" ]; then export AGENT_BLUEPRINT_HOOK_TRACE="$SMOKE_TRACE_FILE"; fi
    run_host_timed "$HOST" "$secs" "$LOG" "$prompt" "$LASTMSG" "$HOST_PLUGIN_DIR" "$@" || RUN_RC=$?
    unset AGENT_BLUEPRINT_HOOK_TRACE
    host_final_message "$HOST" "$LOG" "$LASTMSG" > "$FINAL" 2>/dev/null || true
    usage_fields "$HOST" "$LOG"
    SESSION=$(session_of_log "$LOG")
    CHECK_RC=0 CHECK_REASON=""
    if [ "$RUN_RC" -eq 124 ]; then
        CHECK_RC=124; CHECK_REASON="no result after ${secs}s"
    elif [ -f "$scenario/check.sh" ]; then
        CHECK_REASON=$(bash "$scenario/check.sh" "$WORK" "$BASE" "$FINAL" "$LOG" "$REMOTE" 2>&1) || CHECK_RC=$?
        CHECK_REASON=$(printf '%s' "$CHECK_REASON" | tr '\n' ' ' | cut -c1-400)
    fi
    if [ "$RUN_RC" -ne 0 ] && [ "$RUN_RC" -ne 124 ]; then
        CHECK_REASON="$CHECK_REASON (host exited $RUN_RC)"
        # A quota or rate limit is the host refusing the run, not the blueprint failing it: say so.
        if grep -Eiq 'usage limit|rate[ _-]?limit|quota|too many requests|requests too quickly|resource has been exhausted|please slow down' "$LOG"; then
            CHECK_REASON="the host refused the run: usage or rate limit reached. $CHECK_REASON"
        fi
    fi
    return 0
}

# The standard verdict for a scenario cell: the check, then the provenance rule for pipeline skills.
verdict_scenario() {
    local name="$1" skill="" summary="" paths="" helpers=""
    [ -f "$SMOKE_SCENARIOS/$name/skill" ] && skill=$(head -1 "$SMOKE_SCENARIOS/$name/skill")
    if [ "$CHECK_RC" -eq 124 ]; then finish_cell timeout "$CHECK_REASON"; return 0; fi
    if [ -n "$skill" ]; then
        helpers=$(helper_summary "$WORK" "$skill")
        summary=$(printf '%s\n' "$helpers" | sed -n 1p)
        paths=$(printf '%s\n' "$helpers" | sed -n 2p)
        case "$summary" in
            missing) finish_cell fail "no provenance record for $skill; $CHECK_REASON"; return 0 ;;
            invalid) finish_cell fail "the provenance record for $skill is not valid JSON; $CHECK_REASON"; return 0 ;;
        esac
    fi
    if [ "$CHECK_RC" -eq 3 ]; then na_cell "$CHECK_REASON"; return 0; fi   # the host cannot show what the cell judges
    if [ "$CHECK_RC" -ne 0 ]; then finish_cell fail "$CHECK_REASON"; return 0; fi
    if [ "$summary" = all-inline ]; then
        finish_cell "degraded-pass (inline)" "$CHECK_REASON · helper steps: $paths"
    elif [ -n "$paths" ]; then
        finish_cell pass "$CHECK_REASON · helper steps: $paths"
    else
        finish_cell pass "$CHECK_REASON"
    fi
}

cell_prompt() {   # NAME: a plain scenario cell
    run_scenario "$1"
    verdict_scenario "$1"
}

# ─── The cells that need host facts ───────────────────────────
cell_canary() {
    CANARY_TRACE="$HOST_LOG_DIR/canary.trace"
    rm -f "$CANARY_TRACE"
    SMOKE_TRACE_FILE="$CANARY_TRACE"
    run_scenario canary
    SMOKE_TRACE_FILE=""
    verdict_scenario canary
}

cell_hooks() {
    local kind trace lines
    kind=$(host_hooks "$HOST")
    case "$kind" in
        none) na_cell "no hook path on this host"; return 0 ;;
    esac
    if [ "$kind" = native ] && [ "$HOST" != claude ] && [ "$HOST" != fake ]; then
        na_cell "plugin hooks run only after trust on $HOST; the review cell covers the untrusted path (AE1)"; return 0
    fi
    if [ -n "$CANARY_TRACE" ]; then
        trace="$CANARY_TRACE"
        CHECK_REASON="from the canary run"
    else
        trace="$HOST_LOG_DIR/hooks.trace"
        rm -f "$trace"
        SMOKE_TRACE_FILE="$trace"
        run_scenario canary
        SMOKE_TRACE_FILE=""
        [ "$CHECK_RC" -eq 124 ] && { finish_cell timeout "$CHECK_REASON"; return 0; }
        CHECK_REASON="canary prompt run with the trace exported"
    fi
    if [ -f "$trace" ] && [ -s "$trace" ]; then
        lines=$(cut -f1 "$trace" | sort | uniq -c | awk '{printf "%s%s x%s", (NR>1?", ":""), $2, $1}')
    else
        lines=""
    fi
    if [ "$kind" = native ]; then
        if [ -n "$lines" ]; then finish_cell pass "handlers wrote the trace: $lines ($CHECK_REASON)"
        else finish_cell fail "no handler wrote the trace file ($CHECK_REASON)"; fi
    else
        if [ -z "$lines" ]; then finish_cell pass "no blueprint hook fired ($CHECK_REASON)"
        else finish_cell fail "blueprint hooks fired on $HOST: $lines ($CHECK_REASON)"; fi
    fi
}

cell_manual_only() {
    if [ "$(host_manual_only "$HOST")" != 1 ]; then
        na_cell "$HOST cannot enforce manual-only (KTD12); its support note says so"; return 0
    fi
    cell_prompt manual-only
}

cell_discovery() {
    local dirs count
    new_work discovery "$SMOKE_SCENARIOS/discovery"
    dirs=$(cd "$WORK" && host_catalog_dirs "$HOST" "$HOST_PLUGIN_DIR")
    printf '=== catalog locations ===\n%s\n' "${dirs:-<none>}" >> "$LOG"
    count=$(printf '%s\n' "$dirs" | python3 -c '
import os, sys
dirs = [d for d in sys.stdin.read().splitlines() if d]
seen = {}
for d in dirs:
    for root, subdirs, files in os.walk(d, followlinks=True):
        if root[len(d):].count(os.sep) > 6:
            subdirs[:] = []
        if "SKILL.md" in files and os.path.basename(root).startswith("ab-"):
            seen.setdefault(os.path.basename(root), []).append(root)
dups = {k: v for k, v in seen.items() if len(v) > 1}
if dups:
    print("dup\t" + "; ".join("%s (%s)" % (k, ", ".join(v)) for k, v in sorted(dups.items())))
else:
    print("ok\t%d ab- skills once each in %d location(s)" % (len(seen), len(dirs)))
')
    local kind summary
    kind=$(printf '%s' "$count" | cut -f1)
    summary=$(printf '%s' "$count" | cut -f2-)
    if [ "$kind" = dup ]; then
        rm -rf "$WORK_ROOT"; WORK_ROOT=""
        finish_cell fail "counted twice: $(printf '%s' "$summary" | cut -c1-400)"; return 0
    fi
    case "$summary" in
        "0 ab- skills"*)
            rm -rf "$WORK_ROOT"; WORK_ROOT=""
            finish_cell fail "no ab- skill in the host's catalog locations (${dirs:-none found})"; return 0 ;;
    esac
    local prompt secs
    prompt=$(fill_prompt "$SMOKE_SCENARIOS/discovery" "$HOST" "$HOST_PLUGIN_DIR")
    secs=$(cell_timeout discovery)
    printf '=== %s · host %s · timeout %ss ===\n--- prompt ---\n%s\n--- output ---\n' "$(now_utc)" "$HOST" "$secs" "$prompt" >> "$LOG"
    RUN_RC=0
    run_host_timed "$HOST" "$secs" "$LOG" "$prompt" "$LASTMSG" "$HOST_PLUGIN_DIR" || RUN_RC=$?
    host_final_message "$HOST" "$LOG" "$LASTMSG" > "$FINAL" 2>/dev/null || true
    usage_fields "$HOST" "$LOG"
    SESSION=$(session_of_log "$LOG")
    if [ "$RUN_RC" -eq 124 ]; then finish_cell timeout "$summary; no answer after ${secs}s"; return 0; fi
    if grep -q "ab-ship-pipeline" "$FINAL"; then
        finish_cell pass "$summary; the answer names ab-ship-pipeline"
    else
        finish_cell fail "$summary; the answer does not name ab-ship-pipeline: $(tr '\n' ' ' < "$FINAL" | cut -c1-120)"
    fi
}

cell_build() {
    run_scenario build
    BUILD_SESSION="$SESSION"
    BUILD_CHECKED=true
    verdict_scenario build
}

cell_helpers_off() {
    local flags="" summary paths
    flags=$(host_helpers_off_args "$HOST")
    if [ -z "$flags" ]; then na_cell "no helper switch on $HOST"; return 0; fi
    local args=()
    while IFS= read -r line; do [ -n "$line" ] && args+=("$line"); done <<EOF
$flags
EOF
    info "helpers disabled with: ${args[*]}"
    run_scenario build "${args[@]}"
    [ "$CHECK_RC" -eq 124 ] && { finish_cell timeout "$CHECK_REASON"; return 0; }
    helpers=$(helper_summary "$WORK" ab-build-pipeline)
    summary=$(printf '%s\n' "$helpers" | sed -n 1p)
    paths=$(printf '%s\n' "$helpers" | sed -n 2p)
    case "$summary" in
        missing) finish_cell fail "no provenance record for ab-build-pipeline; $CHECK_REASON"; return 0 ;;
        invalid) finish_cell fail "the provenance record is not valid JSON; $CHECK_REASON"; return 0 ;;
    esac
    [ "$CHECK_RC" -ne 0 ] && { finish_cell fail "$CHECK_REASON · helper steps: ${paths:-none}"; return 0; }
    case "$summary" in
        all-inline) finish_cell "degraded-pass (inline)" "$CHECK_REASON · helper steps: $paths" ;;
        helpers)    finish_cell fail "a helper step ran although helpers were disabled (${args[*]}) · helper steps: $paths" ;;
        *)          finish_cell fail "the provenance record lists no helper steps, so the inline path is unproven; $CHECK_REASON" ;;
    esac
}

# effort_check SESSION CONFIG_DIR: pass|fail|n/a, a tab, the reason (AE2).
effort_check() {
    python3 - "$1" "$2" <<'PY'
import collections, glob, json, os, sys
session, cfg = sys.argv[1], sys.argv[2]
projects = os.path.join(cfg, "projects")
mains = glob.glob(os.path.join(projects, "*", session + ".jsonl"))
if not mains:
    print("n/a\tno transcript for session %s under %s" % (session, projects)); sys.exit(0)
def efforts(path):
    c = collections.Counter()
    for line in open(path, encoding="utf-8", errors="replace"):
        try:
            d = json.loads(line)
        except Exception:
            continue
        if d.get("type") == "assistant":
            e = d.get("effort") or d.get("perTurnEffort")
            if isinstance(e, str):
                c[e] += 1
    return c
sess = efforts(mains[0])
if not sess:
    print("n/a\tthe session transcript carries no effort field"); sys.exit(0)
session_effort = sess.most_common(1)[0][0]
subs = sorted(glob.glob(os.path.join(os.path.dirname(mains[0]), session, "subagents", "*.jsonl")))
if not subs:
    print("n/a\tsession effort %s; no helper transcripts under %s" % (session_effort, os.path.join(os.path.dirname(mains[0]), session, "subagents"))); sys.exit(0)
seen = []
bad = []
for s in subs:
    c = efforts(s)
    if not c:
        continue
    e = c.most_common(1)[0][0]
    seen.append(e)
    if e != session_effort:
        bad.append("%s=%s" % (os.path.basename(s), e))
if bad:
    print("fail\tsession effort %s; helpers below it: %s" % (session_effort, ", ".join(bad)))
else:
    print("pass\tsession effort %s; %d helper transcript(s) at the same effort" % (session_effort, len(seen)))
PY
}

cell_effort() {
    if [ "$HOST" != claude ]; then na_cell "no per-dispatch effort metadata on $HOST"; return 0; fi
    if [ "$BUILD_CHECKED" != true ]; then na_cell "reads the build cell's transcripts: run it with the build cell"; return 0; fi
    if [ -z "$BUILD_SESSION" ]; then na_cell "the build run reported no session id"; return 0; fi
    local out state reason
    out=$(effort_check "$BUILD_SESSION" "${CLAUDE_CONFIG_DIR:-$HOME/.claude}")
    state="${out%%	*}"; reason="${out#*	}"
    finish_cell "$state" "$reason"
}

cell_ship() {
    local feature secs rc=0 old_path="$PATH" unguarded runner
    new_work ship "$SMOKE_SCENARIOS/ship"
    setup_gh_shim "$WORK_ROOT"
    feature=$(head -1 "$SMOKE_SCENARIOS/ship/feature.txt")
    secs=$(cell_timeout ship)
    runner="$SMOKE_REPO/skills/ab-ship-pipeline/scripts/run.sh"
    local args=(--host "$HOST" "$feature" --max 6)
    [ -n "$HOST_PLUGIN_DIR" ] && args+=(--plugin-dir "$HOST_PLUGIN_DIR")
    unguarded=$(host_unguarded "$HOST")
    [ "$unguarded" = 1 ] && args+=(--allow-unguarded)
    [ -n "$TIMEOUT_OVERRIDE" ] && args+=(--iterations-timeout "$TIMEOUT_OVERRIDE")
    printf '=== ship · %s · host %s · timeout %ss · work %s ===\n--- command ---\nrun.sh %s\n--- output ---\n' "$(now_utc)" "$HOST" "$secs" "$WORK" "${args[*]}" >> "$LOG"
    run_command_timed "$secs" "$LOG" env XDG_STATE_HOME="$WORK_ROOT/state" bash "$runner" "${args[@]}" || rc=$?
    PATH="$old_path"; export PATH
    # Token use: every iteration log the runner kept, summed where the host reports it.
    local t c
    sum_usage "$HOST" "$WORK_ROOT"
    t="$TOKENS"; c="$COST"
    if [ "$rc" -eq 124 ]; then finish_cell timeout "the runner did not finish within ${secs}s"; return 0; fi
    CHECK_RC=0
    CHECK_REASON=$(GH_SHIM_LOG="$GH_SHIM_LOG" bash "$SMOKE_SCENARIOS/ship/check.sh" "$WORK" "$BASE" "$FINAL" "$LOG" "$REMOTE" 2>&1) || CHECK_RC=$?
    CHECK_REASON=$(printf '%s' "$CHECK_REASON" | tr '\n' ' ' | cut -c1-400)
    TOKENS="$t"; COST="$c"
    if [ "$CHECK_RC" -eq 0 ] && [ "$rc" -eq 0 ]; then
        finish_cell pass "$CHECK_REASON"
    else
        finish_cell fail "runner exit $rc: $(grep -E 'status: (blocked|needs-human)|Stopped:|✗' "$LOG" | tail -1 | strip_ansi | cut -c1-160) $CHECK_REASON"
    fi
}

cell_upgrade() {
    if [ "$HOST" != claude ]; then na_cell "the upgrade scenario is Claude Code's (v3.8.0 plugin, then v4)"; return 0; fi
    if [ -z "$V3_DIR" ]; then na_cell "pass --v3-dir <checkout of main> to run the upgrade scenario"; return 0; fi
    local rc=0 secs
    secs=$(cell_timeout upgrade)
    WORK_ROOT=$(smoke_tmp upgrade); WORK="$WORK_ROOT"
    run_command_timed "$secs" "$LOG" bash "$SMOKE_SCENARIOS/upgrade/run-upgrade.sh" --v3-dir "$V3_DIR" --v4-dir "$PLUGIN_DIR" --work "$WORK_ROOT" || rc=$?
    if [ "$rc" -eq 124 ]; then finish_cell timeout "no result after ${secs}s"; return 0; fi
    if [ "$rc" -eq 0 ]; then
        finish_cell pass "$(grep -c '^PASS:' "$LOG") checks passed: both plugin ids listed, detect-v3.sh reported and removed the v3 traces, the session-start warning names the v3 plugin"
    else
        finish_cell fail "$(grep '^FAIL:' "$LOG" | sed 's/^FAIL: //' | tr '\n' ' ' | cut -c1-300)"
    fi
}

run_cell() {
    begin_cell "$1"
    case "$1" in
        discovery)   cell_discovery ;;
        canary)      cell_canary ;;
        hooks)       cell_hooks ;;
        manual-only) cell_manual_only ;;
        build)       cell_build ;;
        helpers-off) cell_helpers_off ;;
        effort)      cell_effort ;;
        review)      cell_prompt review ;;
        debug)       cell_prompt debug ;;
        ship)        cell_ship ;;
        team)        cell_prompt team ;;
        upgrade)     cell_upgrade ;;
    esac
}

# host_plugin_dir HOST: the checkout, for a host that takes a plugin directory and has no installed
# copy of the blueprint; empty otherwise. A host with the installed copy and the plugin directory
# would list every skill twice (KTD18), so the installed copy wins.
host_plugin_dir() {
    local d
    case "$1" in claude|cursor-agent|agy|fake) ;; *) echo ""; return 0 ;; esac
    while IFS= read -r d; do
        [ -n "$d" ] && [ -f "$d/ab-ship-pipeline/SKILL.md" ] && { echo ""; return 0; }
    done <<LIST
$(host_catalog_dirs "$1" "")
LIST
    echo "$PLUGIN_DIR"
}

# ─── One host, every selected cell ────────────────────────────
run_host_all() {
    HOST="$1"
    HOST_LOG_DIR="$LOG_ROOT/$HOST"
    mkdir -p "$HOST_LOG_DIR"
    RESULTS="$HOST_LOG_DIR/results.jsonl"
    : > "$RESULTS"
    CANARY_TRACE="" BUILD_SESSION="" BUILD_CHECKED=false
    HOST_PLUGIN_DIR=$(host_plugin_dir "$HOST")
    local bin version out rc=0 c
    bin=$(host_bin "$HOST")
    version=$(host_version "$HOST")
    printf '%s\t%s\n' "$HOST" "$version" >> "$LOG_ROOT/versions.tsv"
    echo ""
    echo -e "  ${BOLD}══ $HOST${NC} ${DIM}$version · $(host_posture "$HOST")${NC}"
    if [ "$HOST" != fake ] && ! command -v "$bin" >/dev/null 2>&1; then
        warn "$bin is not on PATH: every cell renders not-installed"
        for c in $CELLS; do
            begin_cell "$c"; finish_cell not-installed "$bin not on PATH"
        done
        return 0
    fi
    out=$(host_preflight "$HOST" "$SMOKE_FIXTURE" 2>&1) || rc=$?
    printf '%s\n' "$out" > "$HOST_LOG_DIR/preflight.log"
    printf '%s\n' "$out" | sed 's/^/    /'
    if [ "$rc" -ne 0 ]; then
        error "preflight failed for $HOST; every cell renders fail"
        for c in $CELLS; do
            begin_cell "$c"; finish_cell fail "preflight: $(printf '%s' "$out" | strip_ansi | grep -E '^[[:space:]]*(x|✗)' | tail -1 | sed 's/^[[:space:]]*[x✗][[:space:]]*//' | cut -c1-300)"
        done
        return 0
    fi
    for c in $CELLS; do run_cell "$c"; done
    return 0
}

# ─── Hosts: one after another, or --jobs at a time ────────────
: > "$LOG_ROOT/versions.tsv"
if [ "$JOBS" -le 1 ]; then
    exec > >(tee -a "$LOG_ROOT/console.log") 2>&1
    for h in $HOSTS; do run_host_all "$h"; done
else
    for h in $HOSTS; do
        while :; do
            alive=""
            for p in $HOST_PIDS; do kill -0 "$p" 2>/dev/null && alive="${alive:+$alive }$p"; done
            HOST_PIDS="$alive"
            [ "$(printf '%s' "$HOST_PIDS" | wc -w | tr -d ' ')" -lt "$JOBS" ] && break
            sleep 1
        done
        set -m
        ( trap 'kill_smoke_child; exit 143' INT TERM; run_host_all "$h" ) > "$LOG_ROOT/$h.smoke.log" 2>&1 &
        HOST_PIDS="${HOST_PIDS:+$HOST_PIDS }$!"
        set +m
        info "started $h (log: $(rel_log "$LOG_ROOT/$h.smoke.log"))"
    done
    for p in $HOST_PIDS; do wait "$p" 2>/dev/null || true; done
    HOST_PIDS=""
    echo ""
    # shellcheck disable=SC2086
    python3 - "$LOG_ROOT" $HOSTS <<'PYEOF'
import json, os, sys
root, hosts = sys.argv[1], sys.argv[2:]
for h in hosts:
    print("  == %s" % h)
    try:
        for line in open(os.path.join(root, h, "results.jsonl"), encoding="utf-8"):
            r = json.loads(line)
            print("  %-24s %-12s %5ss  %s" % (r["state"], r["cell"], r["seconds"], (r.get("reason") or "")[:100]))
    except OSError:
        print("  (no results)")
PYEOF
fi

# ─── The table ────────────────────────────────────────────────
cat "$LOG_ROOT"/*/results.jsonl > "$LOG_ROOT/results.jsonl" 2>/dev/null || true
python3 "$HERE/report.py" smoke --version "$VERSION" --json "$OUT/v$VERSION-smoke.json" --md "$OUT/v$VERSION-smoke.md" \
    --results "$LOG_ROOT/results.jsonl" --versions "$LOG_ROOT/versions.tsv" --command "$COMMAND" \
    --plugin-dir "$PLUGIN_DIR" --hosts "$AB_HOSTS" --cells "$ALL_CELLS"
echo ""
success "Table: $(rel_log "$OUT/v$VERSION-smoke.md") · details: $(rel_log "$OUT/v$VERSION-smoke.json") · logs: $(rel_log "$LOG_ROOT")"
