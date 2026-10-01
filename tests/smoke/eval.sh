#!/usr/bin/env bash
# eval.sh — v3.8.0 against v4 on Claude Code: the same fixture tasks, N times each (U17 step 1).
#
# Usage: bash tests/smoke/eval.sh --v3-dir DIR [options]
#   --v3-dir DIR     A checkout of the main branch at v3.8.0; its plugin root is plugins/claude-code-blueprint
#   --v4-dir DIR     The v4 checkout (default: this one)
#   --runs N         Runs per task and version (default 3)
#   --task t1,t2     Tasks (default: build review debug ship)
#   --out DIR        Where the report goes (default: docs/releases/)
#   --timeout S      Seconds per run (default: Claude Code's row in hosts.sh; ship runs get twice that)
#   --keep           Keep every run's working copy (a failed run's copy is kept either way)
#   -h, --help
#
# Every run is a fresh copy of tests/smoke/fixture with the task's seed (the smoke test's scenarios),
# on Claude Code with --plugin-dir pointing at one plugin root or the other. v3 skills are named as
# /claude-code-blueprint:<v3 name>, the v3 name read from the v3 checkout's skills/ folder through
# docs/upgrade/v4-skill-names.tsv; v4 skills as /agent-blueprint:<name>. The ship task runs v3's
# scripts/ship.sh (with a `claude` wrapper that adds --plugin-dir, since ship.sh has no such flag)
# and v4's ship runner, both against a local bare remote and the gh shim. The outcome checks are
# the smoke test's; v4 runs also need the skill's provenance record.
#
# Output: <out>/v<version>-eval.md and .json (every run appended, so a second invocation adds to the
# sample). This costs real tokens and runs on the maintainer's machine only, never in CI.

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

ALL_TASKS="build review debug ship"
COMMAND="bash tests/smoke/eval.sh $*"
# AB_EVAL_HOST=fake runs the mechanics against tests/smoke/fake-host.sh (selftest.sh); the eval itself is Claude Code only.
EVAL_HOST="${AB_EVAL_HOST:-claude}"

V3_DIR="" V4_DIR="$SMOKE_REPO" RUNS=3 TASKS="$ALL_TASKS" OUT="$SMOKE_REPO/docs/releases" TIMEOUT_OVERRIDE="" KEEP=false
usage() { sed -n '2,23p' "$0" | sed 's/^# \{0,1\}//'; }
while [ $# -gt 0 ]; do
    case "$1" in
        --v3-dir)   [ $# -ge 2 ] || { usage; exit 1; }; V3_DIR="$2"; shift 2 ;;
        --v3-dir=*) V3_DIR="${1#--v3-dir=}"; shift ;;
        --v4-dir)   [ $# -ge 2 ] || { usage; exit 1; }; V4_DIR="$2"; shift 2 ;;
        --v4-dir=*) V4_DIR="${1#--v4-dir=}"; shift ;;
        --runs)     [ $# -ge 2 ] || { usage; exit 1; }; RUNS="$2"; shift 2 ;;
        --runs=*)   RUNS="${1#--runs=}"; shift ;;
        --task)     [ $# -ge 2 ] || { usage; exit 1; }; TASKS=$(printf '%s' "$2" | tr ',' ' '); shift 2 ;;
        --task=*)   TASKS=$(printf '%s' "${1#--task=}" | tr ',' ' '); shift ;;
        --out)      [ $# -ge 2 ] || { usage; exit 1; }; OUT="$2"; shift 2 ;;
        --out=*)    OUT="${1#--out=}"; shift ;;
        --timeout)  [ $# -ge 2 ] || { usage; exit 1; }; TIMEOUT_OVERRIDE="$2"; shift 2 ;;
        --timeout=*) TIMEOUT_OVERRIDE="${1#--timeout=}"; shift ;;
        --keep)     KEEP=true; shift ;;
        -h|--help)  usage; exit 0 ;;
        *)          error "Unknown option: $1"; usage; exit 1 ;;
    esac
done
[ -n "$V3_DIR" ] || { error "--v3-dir is required"; usage; exit 1; }
V3_DIR="$(cd "$V3_DIR" 2>/dev/null && pwd)" || { error "--v3-dir is not a directory"; exit 1; }
V4_DIR="$(cd "$V4_DIR" 2>/dev/null && pwd)" || { error "--v4-dir is not a directory"; exit 1; }
V3_PLUGIN="$V3_DIR/plugins/claude-code-blueprint"
[ -f "$V3_PLUGIN/.claude-plugin/plugin.json" ] || { error "$V3_PLUGIN has no .claude-plugin/plugin.json: is --v3-dir a checkout of main at v3.8.0?"; exit 1; }
[ -f "$V4_DIR/.claude-plugin/plugin.json" ] || { error "$V4_DIR has no .claude-plugin/plugin.json"; exit 1; }
case "$RUNS" in ''|*[!0-9]*) error "--runs wants a number"; exit 1 ;; esac
for t in $TASKS; do case " $ALL_TASKS " in *" $t "*) ;; *) error "Unknown task: $t (one of: $ALL_TASKS)"; exit 1 ;; esac; done
mkdir -p "$OUT"; OUT="$(cd "$OUT" && pwd)"
VERSION=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["version"])' "$V4_DIR/.claude-plugin/plugin.json")
V3_VERSION=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["version"])' "$V3_PLUGIN/.claude-plugin/plugin.json")
NAME_MAP="$V4_DIR/docs/upgrade/v4-skill-names.tsv"
[ -f "$NAME_MAP" ] || { error "missing $NAME_MAP"; exit 1; }
host_known "$EVAL_HOST" || { error "unknown host $EVAL_HOST"; exit 1; }
host_preflight "$EVAL_HOST" "$SMOKE_FIXTURE" || exit 1

RUN_ID=$(date +%Y%m%d-%H%M%S)
LOG_ROOT="${AB_SMOKE_LOGS:-$HERE/logs}/eval-$RUN_ID"
mkdir -p "$LOG_ROOT"
RESULTS="$LOG_ROOT/results.jsonl"
: > "$RESULTS"
rel_log() { printf '%s' "${1#"$SMOKE_REPO"/}"; }

# v3_name SKILL: the v3 folder name for a v4 skill, from the name map, checked against the v3 tree.
v3_name() {
    local name
    name=$(awk -F'\t' -v v4="$1" 'NR > 1 && $2 == v4 { print $1; exit }' "$NAME_MAP")
    [ -n "$name" ] || { error "no v3 name for $1 in $NAME_MAP"; return 1; }
    [ -f "$V3_PLUGIN/skills/$name/SKILL.md" ] || { error "the v3 checkout has no skills/$name/SKILL.md"; return 1; }
    echo "$name"
}

# A `claude` wrapper for v3's ship.sh, which calls claude with no --plugin-dir flag.
WRAP_DIR="$LOG_ROOT/wrap"
mkdir -p "$WRAP_DIR"
if [ "$EVAL_HOST" = fake ]; then
    cat > "$WRAP_DIR/claude" <<EOF
#!/usr/bin/env bash
# claude stand-in for the mechanics check: the fake host gets ship.sh's prompt (its last argument).
for a in "\$@"; do last="\$a"; done
exec bash "$(host_bin fake)" "\$last"
EOF
else
    REAL_CLAUDE=$(command -v claude)
    cat > "$WRAP_DIR/claude" <<EOF
#!/usr/bin/env bash
# claude wrapper for the v3 eval arm: adds --plugin-dir to every call from v3's scripts/ship.sh.
exec "$REAL_CLAUDE" --plugin-dir "$V3_PLUGIN" "\$@"
EOF
fi
chmod +x "$WRAP_DIR/claude"

echo ""
echo -e "  ${BOLD}Agent Blueprint eval${NC} v$V3_VERSION against v$VERSION on Claude Code ${DIM}(logs: $(rel_log "$LOG_ROOT"))${NC}"
info "Tasks: $TASKS · runs per task and version: $RUNS"
info "v3 plugin: $V3_PLUGIN"
info "v4 plugin: $V4_DIR"

on_signal() { trap - INT TERM; echo ""; warn "Interrupted"; kill_smoke_child; exit 130; }
trap on_signal INT TERM

record() {   # TASK VERSION RUN STATE SECONDS REASON LOG
    record_result "$RESULTS" "$EVAL_HOST" "$1" "$4" "$5" "$TOKENS" "$COST" "$(rel_log "$7")" "$6" "task=$1" "version=$2" "run=$3"
}

secs_for() { local t; t="${TIMEOUT_OVERRIDE:-$(host_timeout "$EVAL_HOST")}"; [ "$1" = ship ] && t=$((t * 2)); echo "$t"; }

verdict() {   # STATE REASON: prints the line and cleans up
    local state="$1" reason="$2" color keep=false
    case "$state" in pass) color="$GREEN" ;; *) color="$RED"; keep=true ;; esac
    [ "$KEEP" = true ] && keep=true
    if [ "$keep" = true ]; then reason="$reason · work: $WORK_ROOT"; else rm -rf "$WORK_ROOT"; fi
    echo -e "  ${color}${state}${NC} ${DIM}tokens $TOKENS · cost $COST${NC}"
    [ -n "$reason" ] && echo -e "    ${DIM}$reason${NC}"
    LAST_STATE="$state" LAST_REASON="$reason"
}

# run_task TASK VERSION RUN: one run; records the result.
run_task() {
    local task="$1" version="$2" n="$3" scenario skill ref prompt secs rc=0 log start reason check_rc=0
    scenario="$SMOKE_SCENARIOS/$task"
    log="$LOG_ROOT/$task-$version-$n.log"; : > "$log"
    skill=$(head -1 "$scenario/skill" 2>/dev/null || true)
    echo ""
    echo -e "  ${BOLD}$task · $version · run $n${NC} ${DIM}($(date '+%H:%M:%S'))${NC}"
    new_work "$task-$version-$n" "$scenario"
    start=$(epoch)
    TOKENS="n/a" COST="n/a"
    secs=$(secs_for "$task")
    if [ "$task" = ship ]; then
        run_ship "$version" "$log" "$secs" || rc=$?
    else
        if [ "$version" = v3 ]; then
            ref="/claude-code-blueprint:$(v3_name "$skill")"
            prompt=$(fill_prompt_with "$scenario" "$ref")
            printf '=== %s %s run %s · %s · timeout %ss · work %s ===\n--- prompt ---\n%s\n--- output ---\n' "$task" "$version" "$n" "$(now_utc)" "$secs" "$WORK" "$prompt" >> "$log"
            run_host_timed "$EVAL_HOST" "$secs" "$log" "$prompt" "$log.last" "$V3_PLUGIN" || rc=$?
        else
            prompt=$(fill_prompt "$scenario" claude "$V4_DIR")
            printf '=== %s %s run %s · %s · timeout %ss · work %s ===\n--- prompt ---\n%s\n--- output ---\n' "$task" "$version" "$n" "$(now_utc)" "$secs" "$WORK" "$prompt" >> "$log"
            run_host_timed "$EVAL_HOST" "$secs" "$log" "$prompt" "$log.last" "$V4_DIR" || rc=$?
        fi
        host_final_message "$EVAL_HOST" "$log" "$log.last" > "$log.final" 2>/dev/null || true
        usage_fields "$EVAL_HOST" "$log"
        if [ "$rc" -eq 124 ]; then
            verdict timeout "no result after ${secs}s"
        else
            reason=$(bash "$scenario/check.sh" "$WORK" "$BASE" "$log.final" "$log" "$REMOTE" 2>&1) || check_rc=$?
            reason=$(printf '%s' "$reason" | tr '\n' ' ' | cut -c1-400)
            if [ "$check_rc" -eq 0 ] && [ "$version" = v4 ] && [ "$(helper_summary "$WORK" "$skill" | head -1)" = missing ]; then
                check_rc=1; reason="no provenance record for $skill; $reason"
            fi
            [ "$rc" -ne 0 ] && reason="$reason (host exited $rc)"
            if [ "$check_rc" -eq 0 ]; then verdict pass "$reason"; else verdict fail "$reason"; fi
        fi
    fi
    record "$task" "$version" "$n" "$LAST_STATE" "$(( $(epoch) - start ))" "$LAST_REASON" "$log"
}

# run_ship VERSION LOG SECS: v3's ship.sh or v4's runner, then the pushed-branch check.
run_ship() {
    local version="$1" log="$2" secs="$3" rc=0 old_path="$PATH" feature branch reason f any=false total_t=0 total_c="0"
    feature=$(head -1 "$SMOKE_SCENARIOS/ship/feature.txt")
    branch=$(git -C "$WORK" symbolic-ref --short -q HEAD)
    setup_gh_shim "$WORK_ROOT"
    if [ "$version" = v3 ]; then
        PATH="$WRAP_DIR:$PATH"; export PATH
        printf '=== ship v3 · %s · timeout %ss · work %s ===\n--- command ---\nscripts/ship.sh "%s" --max 6 (claude wrapper adds --plugin-dir %s)\n--- output ---\n' "$(now_utc)" "$secs" "$WORK" "$feature" "$V3_PLUGIN" >> "$log"
        run_command_timed "$secs" "$log" bash "$V3_PLUGIN/scripts/ship.sh" "$feature" --max 6 || rc=$?
    else
        printf '=== ship v4 · %s · timeout %ss · work %s ===\n--- command ---\nrun.sh --host claude "%s" --max 6 --plugin-dir %s\n--- output ---\n' "$(now_utc)" "$secs" "$WORK" "$feature" "$V4_DIR" >> "$log"
        run_command_timed "$secs" "$log" env XDG_STATE_HOME="$WORK_ROOT/state" bash "$V4_DIR/skills/ab-ship-pipeline/scripts/run.sh" --host "$EVAL_HOST" "$feature" --max 6 --plugin-dir "$V4_DIR" || rc=$?
    fi
    PATH="$old_path"; export PATH
    # Tokens: v4 iteration logs are JSON results; v3's ship.sh logs are --verbose text, so n/a there.
    for f in "$WORK_ROOT"/state/agent-blueprint/*/logs/iteration-*.log; do
        [ -f "$f" ] || continue
        usage_fields "$EVAL_HOST" "$f"
        [ "$TOKENS" != n/a ] && { total_t=$((total_t + TOKENS)); any=true; }
        [ "$COST" != n/a ] && total_c=$(python3 -c 'import sys; print("%.4f" % (float(sys.argv[1]) + float(sys.argv[2])))' "$total_c" "$COST")
    done
    if [ "$any" = true ]; then TOKENS="$total_t"; COST="$total_c"; else TOKENS="n/a"; COST="n/a"; fi
    if [ "$rc" -eq 124 ]; then verdict timeout "no publish after ${secs}s"; return 0; fi
    if ! grep -q "^gh pr create" "$GH_SHIM_LOG"; then verdict fail "no pull request was opened (exit $rc)"; return 0; fi
    if ! git --git-dir="$REMOTE" show-ref --verify -q "refs/heads/$branch"; then verdict fail "the bare remote has no branch $branch (exit $rc)"; return 0; fi
    local clone="$WORK_ROOT/pushed"
    git clone -q --branch "$branch" "$REMOTE" "$clone" 2>>"$log"
    if reason=$(acceptance_test "$clone"); then
        verdict pass "pull request opened; $reason on the pushed branch"
    else
        verdict fail "pull request opened, but on the pushed branch: $reason"
    fi
}

LAST_STATE="" LAST_REASON=""
for task in $TASKS; do
    n=1
    while [ "$n" -le "$RUNS" ]; do
        for version in v3 v4; do run_task "$task" "$version" "$n"; done
        n=$((n + 1))
    done
done

python3 "$HERE/report.py" eval --version "$VERSION" --json "$OUT/v$VERSION-eval.json" --md "$OUT/v$VERSION-eval.md" \
    --results "$RESULTS" --command "$COMMAND" --v3-dir "$V3_DIR" --v4-dir "$V4_DIR" --runs "$RUNS" --tasks "$ALL_TASKS"
echo ""
success "Report: $(rel_log "$OUT/v$VERSION-eval.md") · runs: $(rel_log "$OUT/v$VERSION-eval.json") · logs: $(rel_log "$LOG_ROOT")"
