#!/usr/bin/env bash
# lib.sh — what run-smoke.sh, eval.sh and the scenario checks share. Source it; it runs nothing.
#
# Every host fact comes from skills/ab-ship-pipeline/scripts/hosts.sh (KTD15); this file adds the
# fixture mechanics: a fresh copy of tests/smoke/fixture as a git repository with a bare remote and
# a work branch, a seed applied from a scenario folder, a host run under a timeout, the hidden
# acceptance test in a venv, the provenance reader and the gh shim.
#
# Works on macOS bash 3.2 and Linux; needs git, python3 and the host CLIs only.

SMOKE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SMOKE_REPO="$(cd "$SMOKE_DIR/../.." && pwd)"
SMOKE_FIXTURE="$SMOKE_DIR/fixture"
SMOKE_SCENARIOS="$SMOKE_DIR/scenarios"
SMOKE_HOSTS_SH="$SMOKE_REPO/skills/ab-ship-pipeline/scripts/hosts.sh"

type info    >/dev/null 2>&1 || info()    { echo "  - $1"; }
type warn    >/dev/null 2>&1 || warn()    { echo "  ! $1"; }
type error   >/dev/null 2>&1 || error()   { echo "  x $1" >&2; }
type success >/dev/null 2>&1 || success() { echo "  + $1"; }

# shellcheck source=../../skills/ab-ship-pipeline/scripts/hosts.sh disable=SC1091
. "$SMOKE_HOSTS_SH"

# The sentence every skill prompt ends with: the headless defaults rule from the asking-the-user snippet.
SMOKE_HEADLESS="This run is headless and unattended: nobody will answer a question, so at every checkpoint or question take the default you would recommend, say so, and continue to the end."

now_utc() { date -u +%Y-%m-%dT%H:%M:%SZ; }
epoch() { date +%s; }

# A temporary folder with no dot in its name (Claude Code keys its transcript folder on the cwd).
smoke_tmp() { local t="${TMPDIR:-/tmp}"; mktemp -d "${t%/}/ab-smoke-$1-XXXXXX"; }

# git with the harness's own identity and no hooks, so a machine without a git identity still works.
git_h() {
    git -c user.name="Agent Blueprint Smoke" -c user.email="smoke@example.invalid" \
        -c commit.gpgsign=false -c core.hooksPath=/dev/null -c init.defaultBranch=main "$@"
}

# new_work NAME [SCENARIO_DIR]: a fresh copy of the fixture as a repository. Sets WORK (the
# checkout), WORK_ROOT (its parent, also holding the bare remote), REMOTE and BASE (HEAD after the
# seed). main holds the fixture; the work branch smoke/NAME holds the seed commit when the scenario
# has an apply.sh (its commit-message file names the commit).
# shellcheck disable=SC2034  # BASE is read by the callers
WORK="" WORK_ROOT="" REMOTE="" BASE=""
new_work() {
    local name="$1" scenario="${2:-}" msg
    WORK_ROOT=$(smoke_tmp "$name")
    WORK="$WORK_ROOT/work"
    REMOTE="$WORK_ROOT/remote.git"
    mkdir -p "$WORK"
    cp -R "$SMOKE_FIXTURE/." "$WORK"
    find "$WORK" -name '__pycache__' -type d -prune -exec rm -rf {} + 2>/dev/null || true
    git_h -C "$WORK" init -q
    git_h -C "$WORK" symbolic-ref HEAD refs/heads/main
    git_h -C "$WORK" add -A
    git_h -C "$WORK" commit -q -m "chore: notes fixture for the Agent Blueprint smoke test"
    git_h clone -q --bare "$WORK" "$REMOTE"
    git_h -C "$WORK" remote add origin "$REMOTE"
    git_h -C "$WORK" checkout -q -b "smoke/$name"
    if [ -n "$scenario" ] && [ -f "$scenario/apply.sh" ]; then
        bash "$scenario/apply.sh" "$WORK"
        if [ -n "$(git_h -C "$WORK" status --porcelain --untracked-files=all)" ]; then
            msg="chore(smoke): seed $name"
            [ -f "$scenario/commit-message" ] && msg=$(head -1 "$scenario/commit-message")
            git_h -C "$WORK" add -A
            git_h -C "$WORK" commit -q -m "$msg"
        fi
    fi
    # shellcheck disable=SC2034
    BASE=$(git -C "$WORK" rev-parse HEAD)
}

# fill_prompt SCENARIO_DIR HOST PLUGIN_DIR: the scenario's prompt with {{SKILL_REF}} replaced by
# the host's way of naming the skill (hosts.sh), plus the headless sentence when a skill is named.
fill_prompt() {
    local scenario="$1" host="$2" plugin_dir="${3:-}" skill ref=""
    if [ -f "$scenario/skill" ]; then
        skill=$(head -1 "$scenario/skill")
        ref=$(host_skill_ref "$host" "$skill" "$plugin_dir")
    fi
    fill_prompt_with "$scenario" "$ref"
}

# fill_prompt_with SCENARIO_DIR REF: the same with an explicit skill reference (the eval's v3 names).
fill_prompt_with() {
    local scenario="$1" ref="$2" text
    text=$(cat "$scenario/prompt.txt")
    if [ -n "$ref" ]; then
        text="${text//\{\{SKILL_REF\}\}/$ref}"
        text="$text

$SMOKE_HEADLESS"
    fi
    printf '%s' "$text"
}

# run_host_timed HOST SECS LOG PROMPT LASTMSG PLUGIN_DIR [FLAG...]: the host in its own process
# group inside WORK, killed with the group after SECS (returns 124). Sets SMOKE_CHILD for a trap.
SMOKE_CHILD=""
run_host_timed() {
    local host="$1" secs="$2" log="$3" prompt="$4" lastmsg="$5" plugin_dir="$6" ticks=0 rc=0
    shift 6
    set -m
    ( cd "$WORK" && host_run "$host" "$prompt" "$plugin_dir" "$lastmsg" "$@" ) >> "$log" 2>&1 </dev/null &
    SMOKE_CHILD=$!
    set +m
    while kill -0 "$SMOKE_CHILD" 2>/dev/null; do
        if [ "$ticks" -ge $((secs * 4)) ]; then
            kill_smoke_child
            echo "=== killed after ${secs}s (timeout) ===" >> "$log"
            return 124
        fi
        sleep 0.25
        ticks=$((ticks + 1))
    done
    if wait "$SMOKE_CHILD"; then rc=0; else rc=$?; fi
    SMOKE_CHILD=""
    return "$rc"
}
kill_smoke_child() {
    [ -n "$SMOKE_CHILD" ] || return 0
    kill -TERM -- "-$SMOKE_CHILD" 2>/dev/null || kill -TERM "$SMOKE_CHILD" 2>/dev/null || true
    sleep 1
    kill -KILL -- "-$SMOKE_CHILD" 2>/dev/null || kill -KILL "$SMOKE_CHILD" 2>/dev/null || true
    wait "$SMOKE_CHILD" 2>/dev/null || true
    SMOKE_CHILD=""
}

# run_command_timed SECS LOG CMD...: any command (the ship runner, the upgrade script) the same way.
run_command_timed() {
    local secs="$1" log="$2" ticks=0 rc=0
    shift 2
    set -m
    ( cd "$WORK" && "$@" ) >> "$log" 2>&1 </dev/null &
    SMOKE_CHILD=$!
    set +m
    while kill -0 "$SMOKE_CHILD" 2>/dev/null; do
        if [ "$ticks" -ge $((secs * 4)) ]; then
            kill_smoke_child
            echo "=== killed after ${secs}s (timeout) ===" >> "$log"
            return 124
        fi
        sleep 0.25
        ticks=$((ticks + 1))
    done
    if wait "$SMOKE_CHILD"; then rc=0; else rc=$?; fi
    SMOKE_CHILD=""
    return "$rc"
}

# ── provenance ────────────────────────────────────────────────
provenance_file() { echo "$1/.agent-blueprint/run/provenance/$2.json"; }

# helper_summary WORK SKILL: helpers (at least one helper step), all-inline (every step says
# inline), unknown (steps that do not say how they ran), no-steps (a record without steps) or
# missing (no record). A second line lists the paths. The contract is `path: helper | inline`
# (run-state.md), but hosts have written the same fact as `mode: subagent`, so both are read.
helper_summary() {
    local f
    f=$(provenance_file "$1" "$2")
    [ -f "$f" ] || { echo missing; return 0; }
    python3 - "$f" <<'PY'
import json, sys
try:
    doc = json.load(open(sys.argv[1], encoding="utf-8"))
    steps = doc.get("helper_steps") or []
except Exception:
    print("invalid"); sys.exit(0)
HELPER = ("helper", "subagent", "sub-agent", "agent", "worktree", "teammate", "spawn")
INLINE = ("inline", "self", "main", "session", "direct")
def how(step):
    raw = str(step.get("path") or step.get("mode") or step.get("ran") or step.get("how") or "").lower()
    if any(word in raw for word in INLINE):
        return "inline"
    if any(word in raw for word in HELPER):
        return "helper"
    return "?"
paths = [how(s) for s in steps if isinstance(s, dict)]
if not paths:
    print("no-steps")
elif "helper" in paths:
    print("helpers")
elif all(p == "inline" for p in paths):
    print("all-inline")
else:
    print("unknown")
print(",".join(paths))
PY
}

# ── the hidden acceptance test ────────────────────────────────
# _declared_deps WORK: the project's declared dependencies, one per line (bash 3.2 cannot parse a
# heredoc inside a command substitution, hence a function).
_declared_deps() {
    python3 - "$1" <<'PY'
import os, re, sys
work = sys.argv[1]
deps = []
p = os.path.join(work, "pyproject.toml")
if os.path.exists(p):
    text = open(p, encoding="utf-8").read()
    try:
        import tomllib
        deps += list(tomllib.loads(text).get("project", {}).get("dependencies", []))
    except Exception:
        m = re.search(r"^dependencies\s*=\s*\[(.*?)\]", text, re.S | re.M)
        if m:
            deps += re.findall(r"""["']([^"']+)["']""", m.group(1))
r = os.path.join(work, "requirements.txt")
if os.path.exists(r):
    for line in open(r, encoding="utf-8"):
        line = line.split("#", 1)[0].strip()
        if line and not line.startswith("-"):
            deps.append(line)
print("\n".join(deps))
PY
}

# acceptance_test WORK: copies tests/smoke/scenarios/build/acceptance/test_export_table.py into
# WORK/tests, builds WORK/.venv from the project's declared dependencies (pyproject.toml
# [project] dependencies, then requirements.txt) and runs the test there. Prints the reason.
acceptance_test() {
    local work="$1" venv="$1/.venv" py deps log
    cp "$SMOKE_SCENARIOS/build/acceptance/test_export_table.py" "$work/tests/test_export_table.py"
    rm -rf "$venv"
    log="$work/.venv-install.log"
    if ! python3 -m venv "$venv" >"$log" 2>&1; then
        echo "could not create a venv (see $log)"; return 1
    fi
    py="$venv/bin/python"
    [ -x "$py" ] || py="$venv/Scripts/python.exe"
    deps=$(_declared_deps "$work")
    if [ -n "$deps" ]; then
        # shellcheck disable=SC2086
        if ! printf '%s\n' "$deps" | xargs "$py" -m pip install -q >>"$log" 2>&1; then
            echo "pip install of the declared dependencies failed ($(printf '%s' "$deps" | tr '\n' ' ')); see $log"; return 1
        fi
    fi
    if (cd "$work" && "$py" -m unittest discover -s tests -p test_export_table.py >>"$log" 2>&1); then
        echo "acceptance test passes (deps: ${deps:-none})"; return 0
    fi
    if grep -q "No module named 'tabulate'" "$log"; then
        echo "acceptance test failed: tabulate is not declared in pyproject.toml or requirements.txt"; return 1
    fi
    echo "acceptance test failed ($(grep -E '^(AssertionError|FAIL|ERROR|Error)' "$log" | head -1 | cut -c1-120)); see $log"
    return 1
}

# ── the gh shim ───────────────────────────────────────────────
# setup_gh_shim DIR: puts tests/smoke/gh-shim.sh first on PATH as `gh`, recording to GH_SHIM_LOG.
setup_gh_shim() {
    mkdir -p "$1/bin"
    cp "$SMOKE_DIR/gh-shim.sh" "$1/bin/gh"
    chmod +x "$1/bin/gh"
    GH_SHIM_LOG="$1/gh-calls.log"
    : > "$GH_SHIM_LOG"
    export GH_SHIM_LOG
    PATH="$1/bin:$PATH"
    export PATH
}

# ── results ───────────────────────────────────────────────────
# record_result FILE HOST CELL STATE SECONDS TOKENS COST LOG REASON [KEY=VALUE...]: one JSON line.
record_result() {
    python3 - "$@" <<'PY'
import datetime, json, sys
f, host, cell, state, secs, tokens, cost, log, reason = sys.argv[1:10]
def num(v, cast):
    try:
        return cast(v)
    except Exception:
        return None
row = {"host": host, "cell": cell, "state": state, "seconds": num(secs, int), "tokens": num(tokens, int),
       "cost_usd": num(cost, float), "log": log, "reason": reason, "date": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}
for extra in sys.argv[10:]:
    k, _, v = extra.partition("=")
    row[k] = v
with open(f, "a", encoding="utf-8") as fh:
    fh.write(json.dumps(row) + "\n")
PY
}

# usage_fields HOST LOG: sets TOKENS and COST from hosts.sh's host_usage ("n/a" when unreported).
TOKENS="n/a" COST="n/a"
usage_fields() {
    local out
    out=$(host_usage "$1" "$2")
    TOKENS=$(printf '%s' "$out" | sed -n 's/.*tokens=\([^ ]*\).*/\1/p')
    COST=$(printf '%s' "$out" | sed -n 's/.*cost=\([^ ]*\).*/\1/p')
    [ -n "$TOKENS" ] || TOKENS="n/a"
    [ -n "$COST" ] || COST="n/a"
}

# strip_ansi: a filter that removes color codes (BSD sed has no \x1b, so the ESC is spelled out).
strip_ansi() { sed "s/$(printf '\033')\[[0-9;]*m//g"; }
