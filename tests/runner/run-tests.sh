#!/usr/bin/env bash
# run-tests.sh — scenario tests for the ship runner (skills/ab-ship-pipeline/scripts/run.sh).
#
# One function per plan scenario (U13). Each runs in a fresh temporary git repository with a
# local bare remote, a `gh` shim on PATH that records its calls and can be told to fail auth,
# and the fake host in tests/runner/fake-host.sh driven by a scenario file. No real host runs.
#
# Usage: bash tests/runner/run-tests.sh [scenario-name ...]
# Exit: 0 when every scenario passes; 1 otherwise. Works on macOS bash 3.2 and Ubuntu.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
RUNNER="$REPO/skills/ab-ship-pipeline/scripts/run.sh"
SCAN="$REPO/skills/ab-ship-pipeline/scripts/scan-secrets.sh"
FAKE="$HERE/fake-host.sh"
SKILL_VERSION=$(sed -n 's/^  version: *"\{0,1\}\([^"]*\)"\{0,1\}.*/\1/p' "$REPO/skills/ab-ship-pipeline/SKILL.md" | head -1)
[ -n "$SKILL_VERSION" ] || { echo "cannot read the skill version" >&2; exit 1; }

WORK=$(mktemp -d "${TMPDIR:-/tmp}/ab-runner-tests.XXXXXX")
# The fake host runs from a copy under $WORK, so cleanup can tell this run's processes from a
# real ship run that happens to use the same checkout: it kills only its own descendants and
# processes whose command line names $WORK.
mkdir -p "$WORK/bin"
cp "$FAKE" "$WORK/bin/fake-host.sh"
FAKE="$WORK/bin/fake-host.sh"
kill_tree() {
    local child
    for child in $(pgrep -P "$1" 2>/dev/null || true); do kill_tree "$child"; done
    kill -TERM "$1" 2>/dev/null || true
}
cleanup() {
    local child
    for child in $(pgrep -P $$ 2>/dev/null || true); do kill_tree "$child"; done
    pkill -f "$WORK/" 2>/dev/null || true
    rm -rf "$WORK"
}
trap cleanup EXIT

# An isolated HOME so the runner's state directory, git identity and gh never touch the user's.
export HOME="$WORK/home"
mkdir -p "$HOME" "$WORK/bin"
git config --global user.email runner-tests@example.com
git config --global user.name "Runner Tests"
git config --global init.defaultBranch main
git config --global commit.gpgsign false
export XDG_STATE_HOME="$WORK/state"
export AGENT_BLUEPRINT_FAKE_HOST="$FAKE"
export AGENT_BLUEPRINT_FAKE_VERSION="$SKILL_VERSION"
export AGENT_BLUEPRINT_FAKE_HOOKS_DIR="$REPO/hooks/handlers"
export AGENT_BLUEPRINT_RUNNER_BACKOFF=1
export GIT_TERMINAL_PROMPT=0
AGENT_BLUEPRINT_RUNNER="" AGENT_BLUEPRINT_GIT_WRITABLE=""
export AGENT_BLUEPRINT_RUNNER AGENT_BLUEPRINT_GIT_WRITABLE

# ─── gh shim ──────────────────────────────────────────────────
cat > "$WORK/bin/gh" <<'EOF'
#!/usr/bin/env bash
# gh shim for the runner tests: records calls under $GH_SHIM_DIR; `unauth` there fails auth.
set -euo pipefail
DIR="${GH_SHIM_DIR:?}"
echo "gh $*" >> "$DIR/calls.log"
head=""; body=""; n=""
case "${1:-} ${2:-}" in
    "auth status")
        if [ -f "$DIR/unauth" ]; then
            echo "You are not logged into any GitHub hosts. To log in, run:  gh auth login" >&2
            exit 1
        fi
        echo "Logged in to github.com account tester" ;;
    "pr list")
        while [ $# -gt 0 ]; do [ "$1" = --head ] && head="$2"; shift; done
        f="$DIR/pr-$(printf '%s' "$head" | tr '/' '_')"
        [ -f "$f" ] && cat "$f"; exit 0 ;;
    "pr create")
        while [ $# -gt 0 ]; do
            case "$1" in --head) head="$2"; shift ;; --body-file) body="$2"; shift ;; esac
            shift
        done
        cp "$body" "$DIR/pr-body.published"
        echo 42 > "$DIR/pr-$(printf '%s' "$head" | tr '/' '_')"
        echo "https://github.com/example/repo/pull/42" ;;
    "pr edit")
        n="$3"; shift 3
        while [ $# -gt 0 ]; do [ "$1" = --body-file ] && body="$2"; shift; done
        cp "$body" "$DIR/pr-body.published"
        echo "https://github.com/example/repo/pull/$n" ;;
    *) echo "gh shim: unsupported: $*" >&2; exit 1 ;;
esac
EOF
chmod +x "$WORK/bin/gh"
export PATH="$WORK/bin:$PATH"

# ─── Per-scenario fixtures ────────────────────────────────────
D="" OUT="" SCENARIO="" FAKE_LOG="" REMOTE=""
new_repo() {   # NAME [--unscaffolded]
    D="$WORK/$1"
    mkdir -p "$D/gh"
    export GH_SHIM_DIR="$D/gh" AGENT_BLUEPRINT_FAKE_GH_DIR="$D/gh"
    SCENARIO="$D/scenario"; FAKE_LOG="$D/fake.log"; OUT="$D/out.txt"
    export AGENT_BLUEPRINT_FAKE_SCENARIO="$SCENARIO" AGENT_BLUEPRINT_FAKE_COUNTER="$SCENARIO.count" AGENT_BLUEPRINT_FAKE_LOG="$FAKE_LOG"
    AGENT_BLUEPRINT_FAKE_GIT_WRITABLE="" AGENT_BLUEPRINT_FAKE_UNGUARDED=""
    export AGENT_BLUEPRINT_FAKE_GIT_WRITABLE AGENT_BLUEPRINT_FAKE_UNGUARDED
    git init -q "$D/work"
    cd "$D/work"
    echo "# fixture" > README.md
    if [ "${2:-}" != --unscaffolded ]; then
        mkdir -p .agent-blueprint
        cp "$REPO/skills/ab-project-start/assets/agent-blueprint/gitignore" .agent-blueprint/.gitignore
    fi
    git add -A && git commit -q -m "init"
    git clone -q --bare "$D/work" "$D/remote.git"
    REMOTE="$D/remote.git"
    git remote add origin "$REMOTE"
    git switch -q -c feat/x
}
scenario() { printf '%s\n' "$@" > "$SCENARIO"; rm -f "$SCENARIO.count"; }
run_runner() {   # args...; captures output and exit code in RC
    RC=0
    bash "$RUNNER" "$@" > "$OUT" 2>&1 || RC=$?
    [ -n "${RUNNER_TESTS_SHOW:-}" ] && { echo "--- run.sh $* (exit $RC)"; cat "$OUT"; } >&2
    return 0
}
remote_has_branch() { git --git-dir="$REMOTE" show-ref --verify -q "refs/heads/$1"; }
remote_commits_ahead() { git --git-dir="$REMOTE" rev-list --count "main..$1"; }
state_dir() { echo "$XDG_STATE_HOME/agent-blueprint/$(git -C "$D/work" rev-parse --show-toplevel | tr -d '\n' | sha256_stdin | cut -c1-16)"; }
record_file() { echo "$(state_dir)/record"; }
run_log() { echo "$(state_dir)/logs/iteration-$1.log"; }
sha256_stdin() {
    if command -v sha256sum >/dev/null 2>&1; then sha256sum | cut -d' ' -f1
    elif command -v shasum >/dev/null 2>&1; then shasum -a 256 | cut -d' ' -f1
    else openssl dgst -sha256 | sed 's/.*= *//'; fi
}
wait_for_file() {   # FILE [SECS]
    local i=0
    while [ ! -f "$1" ]; do
        i=$((i + 1)); [ "$i" -gt $(( ${2:-20} * 4 )) ] && return 1
        sleep 0.25
    done
    return 0
}

# ─── Assertions: each records the failure and returns 1 ───────
FAIL_FILE="$WORK/fails.txt"
fail() { printf '      %s\n' "$1" >> "$FAIL_FILE"; return 1; }
assert_rc() { [ "$RC" -eq "$1" ] || fail "expected exit $1, got $RC (output: $OUT)"; }
assert_out() { grep -Fq -- "$1" "$OUT" || fail "output lacks '$1' ($OUT)"; }
assert_not_out() { ! grep -Fq -- "$1" "$OUT" || fail "output must not contain '$1' ($OUT)"; }
assert_file() { [ -e "$1" ] || fail "missing $1"; }
assert_no_file() { [ ! -e "$1" ] || fail "must not exist: $1"; }
assert_eq() { [ "$1" = "$2" ] || fail "expected '$2', got '$1'${3:+ ($3)}"; }

# ─── Scenarios ────────────────────────────────────────────────

t01_done_publishes() {
    new_repo t01
    scenario "state:running:plan commit:a.txt" "state:done:ship commit:b.txt pr-body"
    run_runner --host fake "add a fake feature"
    assert_rc 0 && assert_out "Opened pull request" && assert_out "iterations: 2"
    remote_has_branch feat/x || fail "feat/x was not pushed"
    assert_eq "$(remote_commits_ahead feat/x)" 2 "commits pushed"
    grep -q "^gh pr create --head feat/x" "$D/gh/calls.log" || fail "gh pr create was not called with --head feat/x"
    grep -q "Body written by the fake host" "$D/gh/pr-body.published" || fail "published body is not the fake's"
    assert_no_file .agent-blueprint/run/state.json && assert_no_file .agent-blueprint/run/pr-body.md
    assert_file "$(run_log 1)" && assert_file "$(run_log 2)"
    assert_no_file .agent-blueprint/run/logs
    assert_no_file "$(record_file)"
    grep -q "RUNNER=1 GIT_WRITABLE=1" "$FAKE_LOG" || fail "the runner's variables did not reach the host"
    grep -q "add a fake feature" "$FAKE_LOG" || fail "the prompt does not name the feature"
    grep -q "state.json" "$FAKE_LOG" || fail "the prompt does not name the state file"
}

t02_sentinel_does_not_stop() {
    new_repo t02
    scenario "sentinel state:running:plan commit:a.txt" "sentinel state:running:execute commit:b.txt" "state:done:ship commit:c.txt pr-body"
    run_runner --host fake "feature"
    assert_rc 0 && assert_out "iterations: 3"
    grep -q "<promise>DONE</promise>" "$(run_log 1)" || fail "sentinel not in the log"
}

t03_stall_is_blocked() {
    new_repo t03
    scenario "state:running:plan"
    run_runner --host fake "feature" --max 6
    assert_rc 2 && assert_out "status: blocked" && assert_out "no progress for two iterations" && assert_out "iterations: 3"
}

t04_transient_error_not_counted() {
    new_repo t04
    scenario "quota" "quota" "state:running:plan commit:a.txt" "state:done:ship commit:b.txt pr-body"
    run_runner --host fake "feature"
    assert_rc 0 && assert_out "transient host error" && assert_out "iterations: 2" && assert_out "transient retries: 2"
    assert_eq "$(grep -c 'iteration 1: transient' "$OUT")" 2 "two retries of iteration 1"
}

t05_timeout_is_killed() {
    new_repo t05
    scenario "hang"
    run_runner --host fake "feature" --max 1 --iterations-timeout 2
    assert_rc 4 && assert_out "iteration 1: timeout after 2s" && assert_out "timeouts: 1"
    local pid
    pid=$(cat .agent-blueprint/run/fake-hang.pid 2>/dev/null || echo "")
    [ -n "$pid" ] || fail "the fake host never started"
    sleep 0.5
    ! kill -0 "$pid" 2>/dev/null || fail "the hung host (PID $pid) is still alive"
    grep -q "killed after 2s (timeout)" "$(run_log 1)" || fail "timeout not recorded in the log"
}

t06_denied_command_continues() {
    new_repo t06
    scenario "denied state:running:plan commit:a.txt" "state:done:ship commit:b.txt pr-body"
    run_runner --host fake "feature"
    assert_rc 0 && assert_out "denied a command" && assert_out "denials logged: 1"
}

t07_second_runner_sees_lock() {
    new_repo t07
    scenario "hang"
    set -m
    bash "$RUNNER" --host fake "feature" --max 1 --iterations-timeout 30 > "$D/first.txt" 2>&1 &
    local first=$!
    set +m
    wait_for_file .agent-blueprint/run/fake-hang.pid 30 || fail "first runner never reached the host"
    run_runner --host fake "feature"
    assert_rc 1 && assert_out "Another runner (PID $first) holds"
    kill -INT "$first" 2>/dev/null || true
    wait "$first" 2>/dev/null || true
}

t08_ctrl_c_then_resume() {
    new_repo t08
    scenario "state:running:plan commit:a.txt" "hang" "state:done:ship commit:b.txt pr-body"
    set -m
    bash "$RUNNER" --host fake "feature" --iterations-timeout 60 > "$OUT" 2>&1 &
    local runner=$!
    set +m
    wait_for_file .agent-blueprint/run/fake-hang.pid 30 || fail "the runner never reached iteration 2"
    local hung
    hung=$(cat .agent-blueprint/run/fake-hang.pid)
    kill -INT "$runner"
    RC=0; wait "$runner" || RC=$?
    assert_rc 130 && assert_out "Interrupted"
    sleep 0.5
    ! kill -0 "$hung" 2>/dev/null || fail "the host (PID $hung) survived Ctrl-C"
    [ -z "$(pgrep -g "$hung" 2>/dev/null || true)" ] || fail "processes remain in the host's process group"
    assert_no_file "$(state_dir)/lock"
    grep -q '^iteration=1$' "$(record_file)" || fail "record does not say iteration 1"
    run_runner --host fake --resume
    assert_rc 0 && assert_out "Resuming after iteration 1" && assert_out "iteration 2: starting"
    assert_eq "$(remote_commits_ahead feat/x)" 2 "commits pushed"
}

t09_gh_unauthenticated_at_publish() {
    new_repo t09
    scenario "state:done:ship commit:a.txt pr-body gh-unauth"
    run_runner --host fake "feature"
    assert_rc 3 && assert_out "status: needs-human" && assert_out "gh auth login"
    ! remote_has_branch feat/x || fail "pushed without gh auth"
}

t10_missing_provenance_fails_iteration() {
    new_repo t10
    scenario "no-provenance commit:a.txt" "no-provenance" "no-provenance"
    run_runner --host fake "feature" --max 4
    assert_out "iteration 1: failed" && assert_out "no provenance marker" && assert_out "failed iterations: 3"
    assert_rc 2
}

t11_team_ledger_counts_as_progress() {
    new_repo t11
    scenario "state:running:execute ledger:T1" "state:running:execute ledger:T2" "state:running:execute ledger:T3" "state:done:ship commit:a.txt pr-body"
    run_runner --host fake "feature"
    assert_rc 0 && assert_not_out "status: blocked" && assert_out "iterations: 4"
}

t12_pr_body_symlink_publishes_nothing() {
    new_repo t12
    printf 'SENTINEL: this file lives outside the repository\n' > "$D/outside.md"
    scenario "state:done:ship commit:a.txt pr-body-symlink:$D/outside.md"
    run_runner --host fake "feature"
    assert_rc 3 && assert_out "status: needs-human" && assert_out "symlink"
    ! remote_has_branch feat/x || fail "pushed with a symlinked PR body"
    ! grep -q "pr create" "$D/gh/calls.log" 2>/dev/null || fail "gh pr create was called"
    assert_no_file "$D/gh/pr-body.published"
}

t13_skill_names_a_runner_that_exists_after_copy_install() {
    D="$WORK/t13"; mkdir -p "$D"; OUT="$D/out.txt"
    grep -q 'scripts/run.sh' "$REPO/skills/ab-ship-pipeline/SKILL.md" || fail "SKILL.md does not name scripts/run.sh"
    grep -q 'scripts/run.sh' "$REPO/skills/ab-ship-pipeline/references/modes-and-reports.md" || fail "modes-and-reports.md does not name scripts/run.sh"
    (cd "$REPO" && bash install.sh --copy-dir "$D/skills" > "$OUT" 2>&1) || fail "install.sh --copy-dir failed ($OUT)"
    local copy="$D/skills/ab-ship-pipeline/scripts"
    assert_file "$copy/run.sh" && assert_file "$copy/hosts.sh" && assert_file "$copy/scan-secrets.sh" && assert_file "$copy/outgoing-commits.sh" && assert_file "$copy/host-limits.tsv"
    RC=0; bash "$copy/run.sh" --help > "$OUT" 2>&1 || RC=$?
    assert_rc 0 && assert_out "--host HOST"
}

t14_state_pr_body_path_is_ignored() {
    new_repo t14
    scenario "state-other-path commit:a.txt pr-body"
    run_runner --host fake "feature"
    assert_rc 0
    grep -q "Body written by the fake host" "$D/gh/pr-body.published" || fail "the fixed-path body was not published"
    ! grep -q "Wrong body" "$D/gh/pr-body.published" || fail "the body named in state.json was published"
}

t15_default_branch_refused() {
    new_repo t15
    git switch -q main
    scenario "state:done:ship commit:a.txt pr-body"
    run_runner --host fake "feature"
    assert_rc 1 && assert_out "default branch"
    assert_no_file "$FAKE_LOG"
}

t16_unguarded_hosts_need_the_flag() {
    new_repo t16
    scenario "state:done:ship commit:a.txt pr-body"
    run_runner --host pi "feature"
    assert_rc 1 && assert_out "--allow-unguarded"
    assert_no_file "$FAKE_LOG"
    run_runner --host amp "feature"
    assert_rc 1 && assert_out "--allow-unguarded"
    export AGENT_BLUEPRINT_FAKE_UNGUARDED=1
    run_runner --host fake "feature"
    assert_rc 1 && assert_out "--allow-unguarded"
    run_runner --host fake "feature" --allow-unguarded
    assert_rc 0 && assert_out "Unguarded posture accepted" && assert_out "Posture: fake host"
    AGENT_BLUEPRINT_FAKE_UNGUARDED=""
}

t17_interactive_stop_hook_stands_down() {
    new_repo t17
    scenario "stop-hook state:running:review commit:a.txt" "state:done:ship commit:b.txt pr-body"
    run_runner --host fake "feature"
    assert_rc 0
    grep -q "stop hook stood down" "$(run_log 1)" || fail "the Stop hook blocked the runner's session"
}

t18_no_commit_mode_runner_commits() {
    new_repo t18
    export AGENT_BLUEPRINT_FAKE_GIT_WRITABLE=0
    scenario "state:running:execute change:a.txt commit-msg:feat(fake):_first_change" "state:done:ship change:b.txt commit-msg:feat(fake):_second_change pr-body"
    run_runner --host fake "feature"
    assert_rc 0 && assert_out "no-commit mode" && assert_out "iteration 1: committed the working tree" && assert_out "iteration 2: committed the working tree"
    assert_eq "$(remote_commits_ahead feat/x)" 2 "commits pushed"
    git --git-dir="$REMOTE" log --format=%s main..feat/x | grep -q "feat(fake): first change" || fail "commit-msg.md was not used"
    grep -q "GIT_WRITABLE=0" "$FAKE_LOG" || fail "the host did not see AGENT_BLUEPRINT_GIT_WRITABLE=0"
    AGENT_BLUEPRINT_FAKE_GIT_WRITABLE=""
}

t19_secrets_stop_the_publish() {
    new_repo t19a
    scenario "state:done:ship secret-commit pr-body"
    run_runner --host fake "feature"
    assert_rc 3 && assert_out "secret scan" && assert_out "cloud access key" && assert_not_out "AKIAQQQQ"
    ! remote_has_branch feat/x || fail "pushed a commit with a key"
    new_repo t19b
    scenario "state:done:ship commit:a.txt pr-body-secret"
    run_runner --host fake "feature"
    assert_rc 3 && assert_out "secret scan" && assert_out "GitHub token" && assert_not_out "ghp_AAAA"
    ! remote_has_branch feat/x || fail "pushed with a key in the PR body"
}

t20_ci_paths_remote_url_and_prepush_hook() {
    new_repo t20a
    scenario "state:done:ship workflow pr-body"
    run_runner --host fake "feature"
    assert_rc 3 && assert_out "the commits the push would publish touch CI configuration" && assert_out "--allow-ci-changes"
    ! remote_has_branch feat/x || fail "pushed a workflow change without the flag"
    run_runner --host fake --resume --allow-ci-changes
    assert_rc 0
    remote_has_branch feat/x || fail "the flag did not allow the publish"
    new_repo t20b
    scenario "state:done:ship commit:a.txt pr-body remote-url"
    run_runner --host fake "feature"
    assert_rc 3 && assert_out "push URL"
    ! remote_has_branch feat/x || fail "pushed after the push URL changed"
    new_repo t20c
    scenario "state:done:ship commit:a.txt pr-body prepush-hook"
    run_runner --host fake "feature"
    assert_rc 3 && assert_out "pre-push hook"
    assert_no_file .agent-blueprint/run/hook-ran
    ! remote_has_branch feat/x || fail "pushed with a planted pre-push hook"
}

t21_bad_session_id_status_and_driver_fail() {
    new_repo t21
    scenario "bad-session commit:a.txt" "bad-status commit:b.txt" "bad-driver commit:c.txt" "state:done:ship commit:d.txt pr-body"
    run_runner --host fake "feature"
    assert_out "iteration 1: failed — session_id" && assert_out "iteration 2: failed — status 'finished'" && assert_out "iteration 3: failed — driver 'robot'"
    assert_rc 0 && assert_out "failed iterations: 3"
    assert_no_file pwned
}

t27_wrong_version_and_exit_code_fail_but_interactive_driver_passes() {
    new_repo t27
    scenario "wrong-version commit:a.txt exit:7" "state-driver:interactive commit:b.txt" "state:done:ship commit:c.txt pr-body"
    run_runner --host fake "feature"
    assert_out "fake exited 7 (checking the state file, not the exit code)"
    assert_out "iteration 1: failed — provenance names ab-ship-pipeline 0.0.1"
    assert_out "iteration 2: status running, stage plan"
    assert_rc 0 && assert_out "failed iterations: 1"
}

t28_transient_errors_end_as_needs_human_after_the_cap() {
    new_repo t28
    scenario "quota"
    run_runner --host fake "feature"
    assert_rc 3 && assert_out "failed 6 times in a row with a transient error" && assert_out "transient retries: 6"
    ! remote_has_branch feat/x || fail "published after the transient cap"
}

t29_a_retry_that_fails_differently_is_not_transient() {
    new_repo t29
    scenario "quota" "state:running:plan commit:a.txt exit:7" "state:done:ship commit:b.txt pr-body"
    run_runner --host fake "feature"
    assert_out "fake exited 7 (checking the state file, not the exit code)"
    assert_rc 0 && assert_out "transient retries: 1" && assert_out "iterations: 2"
}

t30_a_long_final_message_does_not_end_the_runner() {
    new_repo t30
    scenario "state:done:ship commit:a.txt pr-body bigmsg"
    run_runner --host fake "feature"
    assert_rc 0 && assert_out "Run complete: published after 1 iteration(s)." && assert_not_out "Illegal byte sequence"
}

t31_scan_reads_hidden_paths_merges_and_commit_messages() {
    new_repo t31a
    scenario "state:done:ship attr-secret pr-body"
    run_runner --host fake "feature"
    assert_rc 3 && assert_out "secret scan" && assert_out "hidden.txt" && assert_not_out "AKIAQQQQ"
    ! remote_has_branch feat/x || fail "pushed a key hidden by a -diff attribute"
    new_repo t31b
    scenario "state:done:ship merge-secret pr-body"
    run_runner --host fake "feature"
    assert_rc 3 && assert_out "secret scan" && assert_out "merged.txt" && assert_not_out "AKIAZZZZ"
    ! remote_has_branch feat/x || fail "pushed a key introduced by a merge"
    new_repo t31c
    scenario "state:done:ship msg-secret pr-body"
    run_runner --host fake "feature"
    assert_rc 3 && assert_out "commit message" && assert_out "GitHub token" && assert_not_out "ghp_BBBB"
    ! remote_has_branch feat/x || fail "pushed a key in a commit message"
}

t32_a_failed_runner_commit_is_needs_human() {
    new_repo t32
    export AGENT_BLUEPRINT_FAKE_GIT_WRITABLE=0
    scenario "state:running:execute change:a.txt commit-msg:feat(fake):_first" "state:done:ship change:b.txt commit-msg:feat(fake):_second pr-body block-commit"
    run_runner --host fake "feature"
    assert_rc 3 && assert_out "could not commit the changes iteration 2 left"
    ! remote_has_branch feat/x || fail "published the earlier commit as finished work"
    assert_file .agent-blueprint/run/state.json
    AGENT_BLUEPRINT_FAKE_GIT_WRITABLE=""
}

t37_a_blank_commit_message_falls_back_to_the_default() {
    new_repo t37
    export AGENT_BLUEPRINT_FAKE_GIT_WRITABLE=0
    scenario "state:done:ship change:a.txt commit-msg:_ pr-body"
    run_runner --host fake "feature"
    assert_rc 0 && assert_out "iteration 1: committed the working tree"
    git --git-dir="$REMOTE" log --format=%s main..feat/x | grep -q "no commit message left by the skill" || fail "the default message was not used"
    AGENT_BLUEPRINT_FAKE_GIT_WRITABLE=""
}

t33_planted_symlinks_are_never_written_through() {
    new_repo t33a
    echo keep > "$D/outside.txt"; mkdir -p "$D/outside-dir"
    scenario "state:running:plan commit:a.txt symlink:.agent-blueprint/run/logs:$D/outside-dir symlink:.agent-blueprint/run/lock:$D/outside.txt symlink:.agent-blueprint/run/commit-msg.md:$D/outside.txt" "state:done:ship commit:b.txt pr-body"
    run_runner --host fake "feature"
    assert_rc 3 && assert_out "commit-msg.md is a symlink"
    assert_eq "$(cat "$D/outside.txt")" keep "the file a planted link points at"
    assert_eq "$(find "$D/outside-dir" -type f | wc -l | tr -d ' ')" 0 "files written through the planted logs link"
    new_repo t33b
    echo keep > "$D/outside.txt"
    export AGENT_BLUEPRINT_FAKE_GIT_WRITABLE=0
    scenario "state:running:execute change:a.txt symlink:.agent-blueprint/run/commit-msg.md:$D/outside.txt" "state:done:ship change:b.txt commit-msg:feat(fake):_second pr-body"
    run_runner --host fake "feature"
    assert_rc 0
    assert_eq "$(cat "$D/outside.txt")" keep "the file the commit-message link points at"
    AGENT_BLUEPRINT_FAKE_GIT_WRITABLE=""
}

t34_resume_at_the_cap_says_how_to_continue() {
    new_repo t34
    scenario "state:running:plan commit:a.txt"
    run_runner --host fake "feature" --max 1
    assert_rc 4 && assert_out "--resume --max 6"
    calls=$(grep -c '^--- call' "$FAKE_LOG")
    run_runner --host fake --resume --max 1
    assert_rc 1 && assert_out "already used 1 iteration(s)"
    assert_eq "$(grep -c '^--- call' "$FAKE_LOG")" "$calls" "host calls made by a resume that cannot run"
}

t35_dry_run_masks_credentials_and_names_the_pr_repository() {
    new_repo t35
    git remote set-url origin "https://bot:s3cr3t-token@github.com/example/repo.git"
    run_runner --host fake "feature" --dry-run
    assert_rc 0 && assert_out "push URL https://***@github.com/example/repo.git" && assert_out "pull requests in github.com/example/repo"
    assert_not_out "s3cr3t-token"
    git remote set-url origin "git@github.example.com:team/tool.git"
    run_runner --host fake "feature" --dry-run
    assert_out "pull requests in github.example.com/team/tool"
    git remote set-url origin "$REMOTE"
    run_runner --host fake "feature" --dry-run
    assert_not_out "pull requests in"
}

t36_every_scan_pattern_is_caught_and_masked() {
    new_repo t36
    rep() { printf "$1%.0s" $(seq 1 "$2"); }
    {
        echo "cloud AKIA$(rep Q 16)"
        echo "github ghp_$(rep a 36)"
        echo "pat github_pat_$(rep b 22)"
        echo "gitlab glpat-$(rep c 20)"
        echo "slack xoxb-$(rep 1 12)"
        echo "stripe sk_live_$(rep d 24)"
        echo "google AIza$(rep e 35)"
        echo "anthropic sk-ant-$(rep f 24)"
        echo "openai sk-$(rep g 40)"
        echo "jwt eyJ$(rep h 12).eyJ$(rep i 12).$(rep j 12)"
        echo "-----BEGIN RSA PRIVATE KEY-----"
        echo "password = \"$(rep k 30)\""
        echo "an ordinary line with commit_sha=0123456789abcdef0123456789abcdef"
    } > "$D/keys.txt"
    out=$(bash "$REPO/skills/ab-ship-pipeline/scripts/scan-secrets.sh" --file "$D/keys.txt" 2>&1) && fail "the scan passed a file full of keys"
    for kind in "cloud access key" "GitHub token" "GitLab token" "Slack token" "Stripe live key" "Google API key" "API key" "JWT" "private key block" "secret assignment"; do
        printf '%s\n' "$out" | grep -Fq "$kind" || fail "no hit labelled '$kind'"
    done
    assert_eq "$(printf '%s\n' "$out" | grep -c '^    ')" 12 "masked lines"
    for raw in QQQQQQQQ aaaaaaaa bbbbbbbb cccccccc 111111111 dddddddd eeeeeeee ffffffff gggggggg hhhhhhhh kkkkkkkk; do
        ! printf '%s\n' "$out" | grep -q "$raw" || fail "the scan printed a raw value ($raw)"
    done
}

t38_a_removed_env_file_still_fails_the_range_scan() {
    new_repo t38
    echo "APP_MODE=placeholder" > .env && git add .env && git commit -q -m "add env"
    git rm -q .env && git commit -q -m "drop env"
    out=$(bash "$REPO/skills/ab-ship-pipeline/scripts/scan-secrets.sh" --range main..HEAD 2>&1) && fail "the scan passed a range that adds .env and deletes it again"
    printf '%s\n' "$out" | grep -Fq ":.env: .env file" || fail "no hit naming .env ($out)"
    ! printf '%s\n' "$out" | grep -Fq "placeholder" || fail "the scan printed the .env file's content"
    echo "APP_MODE=example" > .env.example && git add .env.example && git commit -q -m "add template"
    bash "$REPO/skills/ab-ship-pipeline/scripts/scan-secrets.sh" --range HEAD~1..HEAD > /dev/null 2>&1 || fail ".env.example alone is not clean"
}

t39_an_env_file_under_a_quoted_directory_fails_the_range_scan() {
    new_repo t39
    # git prints a path with a non-ASCII byte as "caf\303\251/.env" unless told not to quote it.
    mkdir -p café && echo "APP_MODE=placeholder" > café/.env && git add café && git commit -q -m "add env"
    git rm -q café/.env && git commit -q -m "drop env"
    out=$(bash "$REPO/skills/ab-ship-pipeline/scripts/scan-secrets.sh" --range main..HEAD 2>&1) && fail "the scan passed a range that adds café/.env and deletes it again"
    printf '%s\n' "$out" | grep -Fq ":café/.env: .env file" || fail "no hit naming café/.env ($out)"
    ! printf '%s\n' "$out" | grep -Fq "placeholder" || fail "the scan printed the .env file's content"
    # A double quote in a directory name makes git quote the path unless it prints it with -z;
    # the sub-case is skipped on a filesystem that refuses the name.
    if mkdir -p 'qu"ote' 2>/dev/null; then
        echo "APP_MODE=placeholder" > 'qu"ote/.env' && git add 'qu"ote' && git commit -q -m "add quoted env"
        out=$(bash "$REPO/skills/ab-ship-pipeline/scripts/scan-secrets.sh" --range HEAD~1..HEAD 2>&1) && fail "the scan passed a range that adds .env under a directory named with a double quote"
        printf '%s\n' "$out" | grep -Fq ':qu"ote/.env: .env file' || fail "no hit naming qu\"ote/.env ($out)"
    fi
}

t40_commits_from_before_the_run_are_scanned_and_checked() {
    # The push publishes every commit the remote lacks, not only the run's own: a key, a .env file
    # or a workflow in a commit the branch carried before the run started stops it the same way.
    new_repo t40a
    printf 'aws_access_key_id = AKIA%s\n' "$(printf 'Q%.0s' {1..16})" > config.ini
    git add config.ini && git commit -q -m "chore: add config"
    scenario "state:done:ship commit:a.txt pr-body"
    run_runner --host fake "feature"
    assert_rc 3 && assert_out "secret scan" && assert_out "cloud access key" && assert_not_out "AKIAQQQQ"
    ! remote_has_branch feat/x || fail "pushed a key committed before the run started"
    new_repo t40b
    echo pushed > pushed.txt && git add pushed.txt && git commit -q -m "feat: pushed before the run"
    git push -q origin feat/x
    local before
    before=$(git --git-dir="$REMOTE" rev-parse feat/x)
    echo "APP_MODE=placeholder" > .env && git add .env && git commit -q -m "chore: local env"
    scenario "state:done:ship commit:a.txt pr-body"
    run_runner --host fake "feature"
    assert_rc 3 && assert_out "secret scan" && assert_out ".env: .env file" && assert_not_out "placeholder"
    assert_eq "$(git --git-dir="$REMOTE" rev-parse feat/x)" "$before" "the remote branch after a refused publish"
    new_repo t40c
    mkdir -p .github/workflows && printf 'name: local\non: push\njobs: {}\n' > .github/workflows/local.yml
    git add .github && git commit -q -m "ci: local workflow"
    scenario "state:done:ship commit:a.txt pr-body"
    run_runner --host fake "feature"
    assert_rc 3 && assert_out "CI configuration" && assert_out "local.yml"
    ! remote_has_branch feat/x || fail "pushed a workflow committed before the run started"
    # A commit the remote already has is not scanned again, even when the remote's branch moved on
    # to a commit this clone never fetched.
    new_repo t40d
    printf 'fixture = AKIA%s\n' "$(printf 'P%.0s' {1..16})" > fixture.txt
    git add fixture.txt && git commit -q -m "test: published fixture"
    git push -q origin feat/x:main
    git clone -q "$REMOTE" "$D/other"
    (cd "$D/other" && echo more >> README.md && git commit -q -am "docs: more" && git push -q origin main)
    git cat-file -e "$(git --git-dir="$REMOTE" rev-parse main)" 2>/dev/null && fail "the clone already has the remote's main; the case needs a tip it never fetched"
    local refs
    refs=$(git for-each-ref --format='%(refname) %(objectname)' | grep -v '^refs/heads/' || true)
    scenario "state:done:ship commit:a.txt pr-body"
    run_runner --host fake "feature"
    assert_rc 0 && assert_out "Opened pull request" && assert_not_out "secret scan found"
    assert_eq "$(remote_commits_ahead feat/x)" 1 "commits pushed past the remote's main"
    # The refresh fetched objects only: no FETCH_HEAD, and no ref outside refs/heads/ was written.
    assert_no_file .git/FETCH_HEAD
    assert_eq "$(git for-each-ref --format='%(refname) %(objectname)' | grep -v '^refs/heads/' || true)" "$refs" "refs outside refs/heads/ after the run"
}

t41_an_env_path_named_like_a_commit_header_fails_the_range_scan() {
    new_repo t41
    mkdir -p "commit secrets" && echo "APP_MODE=placeholder" > "commit secrets/.env"
    git add "commit secrets" && git commit -q -m "add env"
    out=$(bash "$SCAN" --range main..HEAD 2>&1) && fail "the scan passed a range that adds 'commit secrets/.env'"
    printf '%s\n' "$out" | grep -Fq ":commit secrets/.env: .env file" || fail "no hit naming 'commit secrets/.env' ($out)"
    # A newline in a directory name stays inside the one line that reports it; skipped on a
    # filesystem that refuses the name.
    if mkdir -p "$(printf 'two\nlines')" 2>/dev/null; then
        echo "APP_MODE=placeholder" > "$(printf 'two\nlines')/.env" && git add -A && git commit -q -m "add env under a newline"
        out=$(bash "$SCAN" --range HEAD~1..HEAD 2>&1) && fail "the scan passed a range that adds .env under a directory named with a newline"
        printf '%s\n' "$out" | grep -Fq ":two?lines/.env: .env file" || fail "no one-line hit naming two?lines/.env ($out)"
    fi
    # A directory named by a single newline: the paths already reported are compared whole, so
    # this one is not taken for one of them. Added, deleted and added again, it is reported once.
    # Scanned as the runner scans, through --commits.
    local nl=$'\n'
    if mkdir "$nl" 2>/dev/null; then
        local from
        from=$(git rev-parse HEAD)
        echo "APP_MODE=placeholder" > "$nl/.env" && git add -A && git commit -q -m "add env under a newline directory"
        git rm -q "$nl/.env" && git commit -q -m "drop it"
        mkdir "$nl" && echo "APP_MODE=placeholder" > "$nl/.env" && git add -A && git commit -q -m "add it again"
        out=$(git rev-list --reverse "$from..HEAD" | bash "$SCAN" --commits - 2>&1) && fail "the scan passed commits that add .env under a directory named by a newline"
        assert_eq "$(printf '%s\n' "$out" | grep -c '.env file$')" 1 "hits for the .env file under the newline directory ($out)"
        printf '%s\n' "$out" | grep -Fq ":?/.env: .env file" || fail "no one-line hit naming ?/.env ($out)"
    fi
}

t42_the_scanner_reads_a_list_of_commits() {
    new_repo t42
    echo clean > clean.txt && git add clean.txt && git commit -q -m "clean"
    printf 'key = AKIA%s\n' "$(printf 'Q%.0s' {1..16})" > k.txt && git add k.txt && git commit -q -m "add key"
    out=$(git rev-list --reverse main..HEAD | bash "$SCAN" --commits - 2>&1) && fail "the scan passed a list holding the commit that adds a key"
    printf '%s\n' "$out" | grep -Fq ":k.txt: cloud access key" || fail "no hit naming k.txt ($out)"
    git rev-parse HEAD~1 > "$D/clean.list"
    bash "$SCAN" --commits "$D/clean.list" > "$OUT" 2>&1 || fail "a list of one clean commit is not clean ($(cat "$OUT"))"
    # An empty list scans nothing; it never falls back to HEAD, which adds the key.
    RC=0; printf '' | bash "$SCAN" --commits - > "$OUT" 2>&1 || RC=$?
    assert_rc 0
    RC=0; printf 'HEAD\n' | bash "$SCAN" --commits - > "$OUT" 2>&1 || RC=$?
    assert_rc 2 && assert_out "not a full commit hash"
    RC=0; printf -- '--all\n' | bash "$SCAN" --commits - > "$OUT" 2>&1 || RC=$?
    assert_rc 2
}

t43_the_runs_own_commits_are_checked_even_when_a_remote_branch_has_them() {
    # A commit drops out of the remote-relative list once any branch at the push URL holds it; the
    # run's own commits since the recorded base are scanned and checked all the same.
    new_repo t43a
    scenario "state:done:ship secret-commit push:session-copy commit:a.txt pr-body"
    run_runner --host fake "feature"
    assert_rc 3 && assert_out "secret scan" && assert_out "cloud access key" && assert_not_out "AKIAQQQQ"
    ! remote_has_branch feat/x || fail "pushed a key the session had already pushed to another branch"
    ! grep -q "pr create" "$D/gh/calls.log" 2>/dev/null || fail "gh pr create was called"
    new_repo t43b
    git clone -q "$REMOTE" "$D/other"
    (cd "$D/other" && git switch -q -c ci-update && mkdir -p .github/workflows && printf 'name: ci\non: push\njobs: {}\n' > .github/workflows/ci.yml \
        && git add .github && git commit -q -m "ci: add a workflow" && git push -q origin ci-update)
    scenario "state:done:ship ff:ci-update commit:a.txt pr-body"
    run_runner --host fake "feature"
    assert_rc 3 && assert_out "CI configuration" && assert_out "ci.yml"
    ! remote_has_branch feat/x || fail "pushed a workflow the session fast-forwarded onto"
}

t44_an_unreadable_remote_stops_the_publish() {
    new_repo t44
    scenario "state:running:plan commit:a.txt" "state:done:ship commit:b.txt pr-body"
    run_runner --host fake "feature" --max 1
    assert_rc 4
    # The push URL cannot be listed at all.
    mv "$REMOTE" "$REMOTE.away"
    run_runner --host fake --resume
    mv "$REMOTE.away" "$REMOTE"
    assert_rc 3 && assert_out "could not read the branches" && assert_out "nothing was pushed"
    ! remote_has_branch feat/x || fail "pushed although the remote could not be listed"
    # The listing works, but a branch tip this clone lacks cannot be fetched: its object is corrupt.
    git clone -q "$REMOTE" "$D/other"
    (cd "$D/other" && git switch -q -c broken && echo b > b.txt && git add b.txt && git commit -q -m "b" && git push -q origin broken)
    local tip obj
    tip=$(git --git-dir="$REMOTE" rev-parse broken)
    obj="$REMOTE/objects/$(printf '%s' "$tip" | cut -c1-2)/$(printf '%s' "$tip" | cut -c3-)"
    [ -f "$obj" ] || fail "the case needs the broken tip as a loose object ($obj)"
    chmod u+w "$obj" && printf 'corrupt' > "$obj"
    run_runner --host fake --resume
    assert_rc 3 && assert_out "could not read the branches" && assert_out "nothing was pushed"
    ! remote_has_branch feat/x || fail "pushed although a remote branch tip could not be fetched"
    ! grep -q "pr create" "$D/gh/calls.log" 2>/dev/null || fail "gh pr create was called"
    git --git-dir="$REMOTE" update-ref -d refs/heads/broken
    run_runner --host fake --resume
    assert_rc 0 && assert_out "Opened pull request"
}

t45_the_push_sends_the_commit_that_was_scanned() {
    new_repo t45
    # A bash shim on PATH commits once the secret scan has run, as a leftover background process might.
    local real
    real=$(command -v bash)
    mkdir -p "$D/shim"
    cat > "$D/shim/bash" <<EOF
#!$real
case "\${1:-}" in
    *scan-secrets.sh)
        rc=0; "$real" "\$@" || rc=\$?
        echo late >> late.txt && git add late.txt && git commit -q -m "late commit"
        exit "\$rc" ;;
esac
exec "$real" "\$@"
EOF
    chmod +x "$D/shim/bash"
    scenario "state:done:ship commit:a.txt pr-body"
    PATH="$D/shim:$PATH" run_runner --host fake "feature"
    assert_rc 0 && assert_out "Opened pull request" && assert_out "HEAD moved while publishing"
    assert_eq "$(git log -1 --format=%s)" "late commit" "the local branch after the shim ran"
    assert_eq "$(git --git-dir="$REMOTE" rev-parse feat/x)" "$(git rev-parse HEAD~1)" "the pushed commit"
}

t46_outgoing_commits_reads_the_push_url_live() {
    local list="$REPO/skills/ab-ship-pipeline/scripts/outgoing-commits.sh" p c parent
    new_repo t46a
    # A commit whose remote branch was deleted keeps a stale tracking ref after a fetch; the live
    # listing still counts it as unpublished.
    echo p > p.txt && git add p.txt && git commit -q -m "p"
    p=$(git rev-parse HEAD)
    git push -q origin HEAD:refs/heads/gone && git fetch -q origin
    git --git-dir="$REMOTE" update-ref -d refs/heads/gone
    git rev-parse -q --verify refs/remotes/origin/gone > /dev/null || fail "the case needs a stale tracking ref"
    echo c > c.txt && git add c.txt && git commit -q -m "c"
    RC=0; bash "$list" "$(git remote get-url --push origin)" "$p" > "$OUT" 2>&1 || RC=$?
    assert_rc 0 && assert_eq "$(cat "$OUT")" "$(git rev-list --reverse main..HEAD)" "commits a stale tracking ref would hide, oldest first"
    # The push URL is read, not the fetch URL.
    git init -q --bare "$D/fork.git"
    git remote set-url --push origin "$D/fork.git"
    RC=0; bash "$list" "$(git remote get-url --push origin)" "$p" > "$OUT" 2>&1 || RC=$?
    assert_rc 0 && assert_eq "$(cat "$OUT")" "$(git rev-list --reverse HEAD)" "every commit, for an empty push target"
    git remote set-url --push origin "$REMOTE"
    # The range from the base is listed whole, though a branch at the push URL holds part of it.
    git push -q origin HEAD:refs/heads/copy
    echo d > d.txt && git add d.txt && git commit -q -m "d"
    RC=0; bash "$list" "$REMOTE" "$p" > "$OUT" 2>&1 || RC=$?
    assert_rc 0 && assert_eq "$(cat "$OUT")" "$(git rev-list --reverse "$p..HEAD")" "the range from the base"
    # Usage and failures: an unreadable URL is 1; anything else wrong is 2, and an option-shaped
    # URL never reaches git.
    RC=0; bash "$list" "$D/nowhere.git" "$p" > "$OUT" 2>&1 || RC=$?
    assert_rc 1
    RC=0; bash "$list" "$REMOTE" not-a-commit > "$OUT" 2>&1 || RC=$?
    assert_rc 2
    RC=0; bash "$list" "--upload-pack=touch $D/pwned" "$p" > "$OUT" 2>&1 || RC=$?
    assert_rc 2 && assert_no_file "$D/pwned"
    RC=0; bash "$list" "$REMOTE" HEAD "$p" > "$OUT" 2>&1 || RC=$?
    assert_rc 2 && assert_out "not an ancestor"
    # A merge of a published branch: the commits it brings in are in the range though the remote
    # has them, and an unpublished commit from before the base comes first. The list is the union,
    # every commit after the parents it lists.
    new_repo t46b
    git clone -q "$REMOTE" "$D/other"
    (cd "$D/other" && git switch -q -c published && echo o > o.txt && git add o.txt && git commit -q -m "o" && git push -q origin published)
    echo x > x.txt && git add x.txt && git commit -q -m "x"
    p=$(git rev-parse HEAD)
    git fetch -q origin published && git merge -q --no-ff -m "merge published" FETCH_HEAD
    echo c > c.txt && git add c.txt && git commit -q -m "c"
    RC=0; bash "$list" "$REMOTE" "$p" > "$OUT" 2>&1 || RC=$?
    assert_rc 0
    assert_eq "$(LC_ALL=C sort "$OUT" | tr '\n' ' ')" "$(git rev-list main..HEAD | LC_ALL=C sort | tr '\n' ' ')" "the listed commits"
    local listed
    listed=$(cat "$OUT")
    while IFS= read -r c; do
        for parent in $(git log -1 --format=%P "$c"); do
            if printf '%s\n' "$listed" | grep -qx "$parent" && ! printf '%s\n' "$listed" | sed "/^$c\$/,\$d" | grep -qx "$parent"; then
                fail "$c is listed before its parent $parent"
            fi
        done
    done <<EOF
$listed
EOF
}

t47_the_scan_starts_no_process_per_line() {
    # One key among thousands of added lines: the lines are matched in one pass, so the number of
    # grep calls does not grow with the patch (it used to be two per added line).
    new_repo t47
    local real calls
    real=$(command -v grep)
    mkdir -p "$D/shim"
    printf '#!/bin/sh\necho x >> "%s"\nexec "%s" "$@"\n' "$D/grep-calls" "$real" > "$D/shim/grep"
    chmod +x "$D/shim/grep"
    { seq 1 3000 | sed 's/^/line /'; printf 'key = AKIA%s\n' "$(printf 'Q%.0s' {1..16})"; } > big.txt
    git add big.txt && git commit -q -m "feat: big" -m "token: $(printf 'm%.0s' {1..24})"
    RC=0; git rev-parse HEAD | PATH="$D/shim:$PATH" bash "$SCAN" --commits - > "$OUT" 2>&1 || RC=$?
    assert_rc 1 && assert_out "$(git rev-parse --short=12 HEAD):big.txt: cloud access key" && assert_out ":commit message: secret assignment" && assert_out "2 hit(s)"
    calls=$(grep -c . "$D/grep-calls" 2>/dev/null || echo 0)
    [ "$calls" -lt 100 ] || fail "the scan called grep $calls times for one commit"
}

t48_a_merge_is_scanned_for_what_it_adds_itself() {
    # A merge is diffed against all its parents at once: a line or a .env file that no parent has
    # is the merge's own and is reported once, at the merge. One a parent already has is reported
    # through that parent's commit while it is outgoing, and not at all once it is published.
    local k1 k2 k3 m s short
    k1="AKIA$(printf 'Q%.0s' {1..16})"; k2="AKIA$(printf 'Z%.0s' {1..16})"; k3="AKIA$(printf 'Y%.0s' {1..16})"
    new_repo t48
    git switch -q main
    printf 'one\ntwo\nthree\nfour\nfive\n' > f.txt && printf 'l1\nl2\nmid\nl4\nl5\n' > c.txt
    git add f.txt c.txt && git commit -q -m "fixtures" && git push -q origin main
    git switch -q -C feat/x
    edit() { sed "$2" "$1" > "$1.tmp" && mv "$1.tmp" "$1"; }
    # A clean merge of main, which published a key and a .env: nothing is new.
    git switch -q main
    printf 'pub = %s\n' "$k1" > pub.txt && echo "APP_MODE=published" > .env && edit f.txt 's/^one$/ONE/'
    git add -A && git commit -q -m "main: a fixture key and a .env" && git push -q origin main
    git switch -q feat/x
    edit f.txt 's/^five$/FIVE/' && git commit -q -am "feat: five"
    git merge -q --no-ff -m "merge main" main
    RC=0; git rev-parse HEAD | bash "$SCAN" --commits - > "$OUT" 2>&1 || RC=$?
    assert_rc 0
    # An evil merge: a key in a file both sides changed, and a .env file, neither in any parent.
    git switch -q main
    edit f.txt 's/^two$/TWO/' && git commit -q -am "main: two" && git push -q origin main
    git switch -q feat/x
    edit f.txt 's/^four$/FOUR/' && git commit -q -am "feat: four"
    git merge -q --no-ff --no-commit main > /dev/null
    edit f.txt "s/^three\$/three = $k2/" && echo "APP_MODE=merge" > .env.local
    git add -A && git commit -q -m "merge main, with additions"
    short=$(git rev-parse --short=12 HEAD)
    RC=0; git rev-parse HEAD | bash "$SCAN" --commits - > "$OUT" 2>&1 || RC=$?
    assert_rc 1 && assert_out "$short:f.txt: cloud access key" && assert_out "$short:.env.local: .env file" && assert_out "2 hit(s)"
    # A conflict resolved with main's published key kept and a new key added: only the new one.
    git switch -q main
    edit c.txt "s/^mid\$/pub = $k1/" && git commit -q -am "main: c" && git push -q origin main
    git switch -q feat/x
    edit c.txt 's/^mid$/featmid/' && git commit -q -am "feat: c"
    git merge -q main > /dev/null 2>&1 && fail "the case needs a conflict"
    printf 'l1\nl2\nfeatmid\npub = %s\nnew = %s\nl4\nl5\n' "$k1" "$k3" > c.txt
    git add c.txt && git commit -q --no-edit
    short=$(git rev-parse --short=12 HEAD)
    RC=0; git rev-parse HEAD | bash "$SCAN" --commits - > "$OUT" 2>&1 || RC=$?
    assert_rc 1 && assert_out "$short:c.txt: cloud access key" && assert_out "    new = ****" && assert_not_out "pub = ****" && assert_out "1 hit(s)"
    # A .env file a merge brings in from an outgoing branch is reported once, at that branch's commit.
    git switch -q -c side
    echo "APP_MODE=side" > .env.staging && git add .env.staging && git commit -q -m "side: env"
    s=$(git rev-parse HEAD)
    git switch -q feat/x && git merge -q --no-ff -m "merge side" side
    m=$(git rev-parse HEAD)
    RC=0; printf '%s\n%s\n' "$s" "$m" | bash "$SCAN" --commits - > "$OUT" 2>&1 || RC=$?
    assert_rc 1 && assert_out "$(git rev-parse --short=12 "$s"):.env.staging: .env file" && assert_not_out "$(git rev-parse --short=12 "$m"):" && assert_out "1 hit(s)"
    # An octopus merge (three parents, three columns) that adds a key of its own.
    git switch -q -c o1 feat/x && echo o1 > o1.txt && git add o1.txt && git commit -q -m "o1"
    git switch -q -c o2 feat/x && echo o2 > o2.txt && git add o2.txt && git commit -q -m "o2"
    git switch -q feat/x && git merge -q --no-ff --no-commit o1 o2 > /dev/null
    printf 'octo = %s\n' "$k2" > octo.txt && git add octo.txt && git commit -q -m "octopus"
    assert_eq "$(git log -1 --format=%P | wc -w | tr -d ' ')" 3 "parents of the octopus merge"
    short=$(git rev-parse --short=12 HEAD)
    RC=0; git rev-parse HEAD | bash "$SCAN" --commits - > "$OUT" 2>&1 || RC=$?
    assert_rc 1 && assert_out "$short:octo.txt: cloud access key" && assert_out "1 hit(s)"
}

t49_an_unpushed_merge_of_published_work_publishes() {
    # The remote's main published a fixture key and a .env; the branch merged it before the run and
    # never pushed the merge. The merge is outgoing, but what it brings in is not new.
    new_repo t49
    git clone -q "$REMOTE" "$D/other"
    (cd "$D/other" && printf 'fixture = AKIA%s\n' "$(printf 'P%.0s' {1..16})" > fixture.txt && echo "APP_MODE=published" > .env \
        && git add -A && git commit -q -m "test: published fixture" && git push -q origin main)
    echo mine > mine.txt && git add mine.txt && git commit -q -m "feat: mine"
    git fetch -q origin main && git merge -q --no-ff -m "merge main" FETCH_HEAD
    scenario "state:done:ship commit:a.txt pr-body"
    run_runner --host fake "feature"
    assert_rc 0 && assert_out "Opened pull request" && assert_not_out "secret scan found"
    assert_eq "$(remote_commits_ahead feat/x)" 3 "commits pushed past the remote's main"
}

t50_a_change_to_the_global_git_config_stops_the_publish() {
    # The configuration outside the repository can redirect the push or run code during it
    # (url.<base>.pushInsteadOf, core.sshCommand). Each case writes only under $D: its own HOME,
    # XDG_CONFIG_HOME or GIT_CONFIG_GLOBAL, never the shared test HOME, let alone the real one.
    new_repo t50a
    export HOME="$D/home"
    mkdir -p "$HOME" && cp "$WORK/home/.gitconfig" "$HOME/.gitconfig"
    scenario "state:done:ship commit:a.txt pr-body global-config"
    run_runner --host fake "feature"
    assert_rc 3 && assert_out "$HOME/.gitconfig" && assert_out "nothing is pushed"
    ! remote_has_branch feat/x || fail "pushed after ~/.gitconfig changed"
    export HOME="$WORK/home"
    new_repo t50b
    export XDG_CONFIG_HOME="$D/xdg"
    scenario "state:done:ship commit:a.txt pr-body xdg-config"
    run_runner --host fake "feature"
    assert_rc 3 && assert_out "$D/xdg/git/config" && assert_out "nothing is pushed"
    ! remote_has_branch feat/x || fail "pushed after \$XDG_CONFIG_HOME/git/config changed"
    unset XDG_CONFIG_HOME
    new_repo t50c
    export GIT_CONFIG_GLOBAL="$D/global.gitconfig"
    cp "$HOME/.gitconfig" "$GIT_CONFIG_GLOBAL"
    scenario "state:done:ship commit:a.txt pr-body global-config"
    run_runner --host fake "feature"
    assert_rc 3 && assert_out "$D/global.gitconfig" && assert_out "nothing is pushed"
    ! remote_has_branch feat/x || fail "pushed after the GIT_CONFIG_GLOBAL file changed"
    unset GIT_CONFIG_GLOBAL
    ! grep -q planted-by-the-session "$HOME/.gitconfig" || fail "a case wrote the shared test HOME's .gitconfig"
    # A record written before the fingerprint and the push target existed has no line for either:
    # it loads, both are taken on resume, and the run publishes.
    new_repo t50d
    scenario "state:running:plan commit:a.txt" "state:done:ship commit:b.txt pr-body"
    run_runner --host fake "feature" --max 1
    assert_rc 4
    grep -q '^global_config_hash=.' "$(record_file)" || fail "the record holds no fingerprint of the global git config"
    grep -q "^push_target=$REMOTE\$" "$(record_file)" || fail "the record holds no push target"
    sed '/^global_config_hash=/d; /^push_target=/d' "$(record_file)" > "$D/record.old" && cat "$D/record.old" > "$(record_file)"
    run_runner --host fake --resume
    assert_rc 0 && assert_out "Opened pull request" && assert_out "Recorded a fingerprint" && assert_out "Recorded the push target"
}

t51_a_url_rule_that_redirects_the_push_stops_it() {
    # git push applies url.<base>.pushInsteadOf and insteadOf rules, from any configuration file, to
    # the recorded URL itself, so the runner checks where that URL goes, not only what the remote's
    # URL resolves to. The remote is named through an alias that a global insteadOf rule expands;
    # a rule matching the expanded URL changes neither the remote's URL nor .git/config.
    local real
    new_repo t51a
    export GIT_CONFIG_GLOBAL="$D/global.gitconfig"
    cp "$HOME/.gitconfig" "$GIT_CONFIG_GLOBAL"
    git config --global url."$D/".insteadOf ab-alias:
    git remote set-url origin ab-alias:remote.git
    git config extensions.worktreeConfig true
    git init -q --bare "$D/elsewhere-remote.git"
    scenario "state:done:ship commit:a.txt pr-body worktree-config:url.$D/elsewhere-.pushInsteadOf=$D/"
    run_runner --host fake "feature"
    assert_rc 3 && assert_out "pushInsteadOf" && assert_out "nothing is pushed"
    ! git --git-dir="$D/elsewhere-remote.git" show-ref --verify -q refs/heads/feat/x || fail "pushed where the planted rule sends the push"
    ! remote_has_branch feat/x || fail "pushed although a rule redirects the push"
    # The same rule in place before the run, a chained setup: git rewrites the push URL a second
    # time. The run records where the push goes, shows it, lists and scans against it, and publishes there.
    new_repo t51b
    export GIT_CONFIG_GLOBAL="$D/global.gitconfig"
    cp "$HOME/.gitconfig" "$GIT_CONFIG_GLOBAL"
    git config --global url."$D/".insteadOf ab-alias:
    git config --global url."$D/elsewhere-".pushInsteadOf "$D/"
    git remote set-url origin ab-alias:remote.git
    git init -q --bare "$D/elsewhere-remote.git"
    scenario "state:done:ship commit:a.txt pr-body"
    run_runner --host fake "feature"
    assert_rc 0 && assert_out "push URL $D/remote.git, which git sends to $D/elsewhere-remote.git" && assert_out "Opened pull request"
    git --git-dir="$D/elsewhere-remote.git" show-ref --verify -q refs/heads/feat/x || fail "the push did not reach the recorded target"
    ! remote_has_branch feat/x || fail "the push went to the URL before its rewrite"
    # A rule added after the publish checks ran, while the commits were scanned (a leftover process
    # might), that changes only where the recorded URL goes: the checks run again just before the push.
    new_repo t51c
    export GIT_CONFIG_GLOBAL="$D/global.gitconfig"
    cp "$HOME/.gitconfig" "$GIT_CONFIG_GLOBAL"
    git config --global url."$D/".insteadOf ab-alias:
    git remote set-url origin ab-alias:remote.git
    git config extensions.worktreeConfig true
    git init -q --bare "$D/elsewhere-remote.git"
    real=$(command -v bash)
    mkdir -p "$D/shim"
    cat > "$D/shim/bash" <<EOF
#!$real
case "\${1:-}" in
    *scan-secrets.sh)
        rc=0; "$real" "\$@" || rc=\$?
        git config --worktree url."$D/elsewhere-".pushInsteadOf "$D/"
        exit "\$rc" ;;
esac
exec "$real" "\$@"
EOF
    chmod +x "$D/shim/bash"
    scenario "state:done:ship commit:a.txt pr-body"
    PATH="$D/shim:$PATH" run_runner --host fake "feature"
    assert_rc 3 && assert_out "No secrets found" && assert_out "pushInsteadOf" && assert_out "nothing is pushed"
    ! git --git-dir="$D/elsewhere-remote.git" show-ref --verify -q refs/heads/feat/x || fail "pushed where the rule added during the scan sends the push"
    ! remote_has_branch feat/x || fail "pushed although a rule added during the scan redirects the push"
}

t52_added_lines_that_look_like_headers_are_scanned() {
    # "+++ " and "--- " are headers only between a file's diff line and its first hunk: an added
    # line "++ ..." is content, and an added "++ b/x" does not rename the file the hits are in.
    local short
    new_repo t52
    { printf '++ key = AKIA%s\n' "$(printf 'Q%.0s' {1..16})"; echo "++ b/elsewhere.txt"
      printf 'token ghp_%s\n' "$(printf 'a%.0s' {1..36})"; echo "--- a removed-looking line"; } > plus.txt
    git add plus.txt && git commit -q -m "feat: plus lines"
    short=$(git rev-parse HEAD | cut -c1-12)
    RC=0; git rev-parse HEAD | bash "$SCAN" --commits - > "$OUT" 2>&1 || RC=$?
    assert_rc 1 && assert_out "$short:plus.txt: cloud access key" && assert_out "    ++ key = ****" && assert_out "$short:plus.txt: GitHub token"
    assert_not_out "elsewhere.txt:" && assert_out "2 hit(s)"
}

t53_paths_are_labelled_as_they_are_named() {
    # A path with a space carries no tab from the diff header, a path git quotes is unquoted (a
    # control character in it shows as ?), and diff.noprefix in the configuration changes nothing.
    local k short
    k="AKIA$(printf 'Q%.0s' {1..16})"
    new_repo t53
    git config diff.noprefix true
    mkdir -p "sp ace" café && echo "a $k" > "sp ace/f f.txt" && echo "c $k" > café/k.txt
    if mkdir -p 'qu"ote' 2>/dev/null; then echo "b $k" > 'qu"ote/k.txt'; fi
    if mkdir -p "$(printf 'n\nl')" 2>/dev/null; then echo "d $k" > "$(printf 'n\nl')/k.txt"; fi
    git add -A && git commit -q -m "feat: odd paths"
    short=$(git rev-parse HEAD | cut -c1-12)
    RC=0; git rev-parse HEAD | bash "$SCAN" --commits - > "$OUT" 2>&1 || RC=$?
    assert_rc 1 && assert_out "$short:sp ace/f f.txt: cloud access key" && assert_out "$short:café/k.txt: cloud access key"
    if [ -d 'qu"ote' ]; then assert_out "$short:qu\"ote/k.txt: cloud access key"; fi
    if [ -d "$(printf 'n\nl')" ]; then assert_out "$short:n?l/k.txt: cloud access key"; fi
    assert_not_out "$(printf '\t'):"
}

t54_lines_the_locale_cannot_read_are_scanned() {
    # A line with bytes that are not valid UTF-8 is matched byte by byte, so a UTF-8 locale that
    # cannot read it (macOS) does not hide a key, and the value is masked all the same. The output
    # holds those bytes, so it is checked byte by byte too.
    local k short
    k="AKIA$(printf 'Q%.0s' {1..16})"
    new_repo t54
    printf 'bad \377\376 key = %s\n' "$k" > bytes.txt
    git add bytes.txt && git commit -q -m "feat: latin-1 bytes"
    short=$(git rev-parse HEAD | cut -c1-12)
    RC=0; git rev-parse HEAD | LC_ALL=en_US.UTF-8 bash "$SCAN" --commits - > "$OUT" 2>&1 || RC=$?
    assert_rc 1 && assert_out "$short:bytes.txt: cloud access key" && assert_not_out "RE error"
    LC_ALL=C grep -Fq "key = ****" "$OUT" || fail "the line is not shown masked ($OUT)"
    ! LC_ALL=C grep -Fq "AKIAQQQQ" "$OUT" || fail "the scan printed the raw key ($OUT)"
    printf 'Body\nbad \377\376 key = %s\n' "$k" > "$D/body.md"
    RC=0; LC_ALL=en_US.UTF-8 bash "$SCAN" --file "$D/body.md" > "$OUT" 2>&1 || RC=$?
    assert_rc 1 && assert_out "$D/body.md:2: cloud access key"
    ! LC_ALL=C grep -Fq "AKIAQQQQ" "$OUT" || fail "the scan printed the raw key ($OUT)"
    # The locale still counts where it reads more: a private key header spaced with an em space
    # (its [[:space:]]), and an assignment spelled with a long s wherever the locale folds it to s.
    printf -- '-----BEGIN\342\200\203PRIVATE KEY-----\n' > em.txt
    printf 'pa\305\277\305\277word = %s\n' "$(printf 'v%.0s' {1..24})" > longs.txt
    git add em.txt longs.txt && git commit -q -m "feat: unicode"
    short=$(git rev-parse HEAD | cut -c1-12)
    RC=0; git rev-parse HEAD | LC_ALL=en_US.UTF-8 bash "$SCAN" --commits - > "$OUT" 2>&1 || RC=$?
    if printf 'a\342\200\203b\n' | LC_ALL=en_US.UTF-8 grep -qE 'a[[:space:]]b'; then assert_out "$short:em.txt: private key block"; fi
    if printf 'pa\305\277\305\277word\n' | LC_ALL=en_US.UTF-8 grep -qi 'password'; then assert_out "$short:longs.txt: secret assignment" && assert_not_out "vvvvvvvv"; fi
    return 0
}

t55_message_hits_name_their_commit() {
    # The commit a message hit names comes from git, not from the message: a body line that looks
    # like a commit header does not take over the label, and a SHA-256 repository's 64-character
    # hashes are labelled like 40-character ones.
    new_repo t55
    echo m >> m.txt && git add m.txt
    git commit -q -m "feat: m" -m "commit 0123456789abcdef0123456789abcdef01234567" -m "deploy token ghp_$(printf 'B%.0s' {1..36})"
    RC=0; git rev-parse HEAD | bash "$SCAN" --commits - > "$OUT" 2>&1 || RC=$?
    assert_rc 1 && assert_out "$(git rev-parse HEAD | cut -c1-12):commit message: GitHub token" && assert_not_out "0123456789ab:"
    if git init -q --object-format=sha256 "$D/sha256" 2>/dev/null; then
        (cd "$D/sha256" && echo x > x && git add x && git commit -q -m "add x" -m "deploy token ghp_$(printf 'C%.0s' {1..36})")
        RC=0; (cd "$D/sha256" || exit 2; git rev-parse HEAD | bash "$SCAN" --commits -) > "$OUT" 2>&1 || RC=$?
        assert_rc 1 && assert_out "$(git -C "$D/sha256" rev-parse HEAD | cut -c1-12):commit message: GitHub token"
    fi
    return 0
}

t56_a_textconv_filter_does_not_hide_a_key() {
    # A diff driver's textconv in the user's configuration (a pdf or image filter, say) and one line
    # of .gitattributes would show the scan the filter's output instead of the committed text.
    new_repo t56
    export GIT_CONFIG_GLOBAL="$D/global.gitconfig"
    cp "$HOME/.gitconfig" "$GIT_CONFIG_GLOBAL"
    git config --global diff.pdf.textconv true
    printf 'keys.txt diff=pdf\n' > .gitattributes && printf 'key = AKIA%s\n' "$(printf 'Q%.0s' {1..16})" > keys.txt
    git add -A && git commit -q -m "feat: keys behind a textconv"
    RC=0; git rev-parse HEAD | bash "$SCAN" --commits - > "$OUT" 2>&1 || RC=$?
    assert_rc 1 && assert_out ":keys.txt: cloud access key" && assert_not_out "AKIAQQQQ"
}

t57_the_ci_check_reads_merges_like_the_scan() {
    # A merge counts only for the CI files none of its parents has: a clean merge of a published
    # workflow change does not stop the run, an evil merge that edits a workflow does, and so does an
    # outgoing side-branch commit that edits one, through its own commit.
    new_repo t57a
    git clone -q "$REMOTE" "$D/other"
    (cd "$D/other" && mkdir -p .github/workflows && printf 'name: ci\non: push\njobs: {}\n' > .github/workflows/ci.yml \
        && git add .github && git commit -q -m "ci: published workflow" && git push -q origin main)
    echo mine > mine.txt && git add mine.txt && git commit -q -m "feat: mine"
    git fetch -q origin main && git merge -q --no-ff -m "merge main" FETCH_HEAD
    scenario "state:done:ship commit:a.txt pr-body"
    run_runner --host fake "feature"
    assert_rc 0 && assert_out "Opened pull request" && assert_not_out "CI configuration"
    new_repo t57b
    git clone -q "$REMOTE" "$D/other"
    (cd "$D/other" && echo more >> README.md && git commit -q -am "docs: more" && git push -q origin main)
    echo mine > mine.txt && git add mine.txt && git commit -q -m "feat: mine"
    git fetch -q origin main && git merge -q --no-ff --no-commit FETCH_HEAD > /dev/null
    mkdir -p .github/workflows && printf 'name: evil\non: push\njobs: {}\n' > .github/workflows/evil.yml
    git add .github && git commit -q -m "merge main, with a workflow"
    scenario "state:done:ship commit:a.txt pr-body"
    run_runner --host fake "feature"
    assert_rc 3 && assert_out "CI configuration" && assert_out "evil.yml"
    ! remote_has_branch feat/x || fail "pushed a workflow an evil merge added"
    new_repo t57c
    git switch -q -c side
    mkdir -p .github/actions/x && printf 'name: x\nruns: {using: node20, main: x.js}\n' > .github/actions/x/action.yml
    git add .github && git commit -q -m "ci: an action" && git switch -q feat/x
    echo mine > mine.txt && git add mine.txt && git commit -q -m "feat: mine"
    git merge -q --no-ff -m "merge side" side
    scenario "state:done:ship commit:a.txt pr-body"
    run_runner --host fake "feature"
    assert_rc 3 && assert_out "CI configuration" && assert_out "action.yml"
    ! remote_has_branch feat/x || fail "pushed an action an outgoing side branch added"
}

t58_a_byte_read_as_half_a_character_does_not_shift_the_report() {
    # bash 5 in a UTF-8 locale reads a Latin-1 byte at the end of a record as the start of a
    # character and takes the delimiter after it into the same read. A hit line ending in one paired
    # every later hit with the wrong label (a key line was printed unmasked as a label), and a path
    # ending in one hid the .env path after it. The output holds those bytes, so it is read byte by byte.
    local k g short loc label n
    k="AKIA$(printf 'Q%.0s' {1..16})"; g="ghp_$(printf 'a%.0s' {1..36})"
    new_repo t58
    printf 'password = %s\351\nkey %s\ntoken %s\n' "$(printf 'v%.0s' {1..24})" "$k" "$g" > latin1.txt
    # Not every file system takes a name that is not UTF-8, so the path goes into the index directly.
    git update-index --add --cacheinfo "100644,$(echo x | git hash-object -w --stdin),$(printf 'a\351')"
    mkdir -p b && echo X=1 > b/.env
    git add latin1.txt b/.env && git commit -q -m "feat: latin-1 bytes"
    short=$(git rev-parse HEAD | cut -c1-12)
    cp latin1.txt "$D/body.md"
    for loc in en_US.UTF-8 C.UTF-8; do
        RC=0; git rev-parse HEAD | LC_ALL=$loc bash "$SCAN" --commits - > "$OUT" 2>&1 || RC=$?
        assert_rc 1
        LC_ALL=C grep -aFq "4 hit(s)" "$OUT" || fail "$loc: expected 4 hits ($OUT)"
        LC_ALL=C grep -aFq "$short:b/.env: .env file" "$OUT" || fail "$loc: the .env path is not reported ($OUT)"
        for label in "secret assignment" "cloud access key" "GitHub token"; do
            n=$(LC_ALL=C grep -acF -- "$short:latin1.txt: $label" "$OUT" || true)
            assert_eq "$n" 1 "$loc: hits labelled $label in $OUT"
        done
        ! LC_ALL=C grep -aEq 'AKIAQQQQ|ghp_aaaa|vvvvvvvv' "$OUT" || fail "$loc: the scan printed a raw value ($OUT)"
        RC=0; LC_ALL=$loc bash "$SCAN" --file "$D/body.md" > "$OUT" 2>&1 || RC=$?
        assert_rc 1
        LC_ALL=C grep -aFq "$D/body.md:3: GitHub token" "$OUT" || fail "$loc: the third line is not labelled ($OUT)"
        ! LC_ALL=C grep -aEq 'AKIAQQQQ|ghp_aaaa|vvvvvvvv' "$OUT" || fail "$loc: the scan printed a raw value ($OUT)"
    done
}

t59_a_file_named_like_an_option_is_scanned() {
    # A name that starts with - reached grep as an option, so the file went unread and the scan
    # reported it clean.
    new_repo t59
    printf 'key = AKIA%s\n' "$(printf 'Q%.0s' {1..16})" > ./-x.txt
    RC=0; bash "$SCAN" --file -x.txt > "$OUT" 2>&1 || RC=$?
    assert_rc 1 && assert_out "-x.txt:1: cloud access key" && assert_not_out "AKIAQQQQ" && assert_not_out "grep:"
    git add -- -x.txt && git commit -q -m "feat: dash" && git rev-parse HEAD > ./-c.txt
    RC=0; bash "$SCAN" --commits -c.txt > "$OUT" 2>&1 || RC=$?
    assert_rc 1 && assert_out ":-x.txt: cloud access key"
}

t22_resume_takes_the_host_from_the_command_line() {
    new_repo t22
    scenario "state:running:plan commit:a.txt" "state:done:ship commit:b.txt pr-body"
    run_runner --host fake "feature" --max 1
    assert_rc 4
    sed -i.bak 's/"host": "fake"/"host": "pi"/' .agent-blueprint/run/state.json && rm -f .agent-blueprint/run/state.json.bak
    run_runner --host pi --resume
    assert_rc 1 && assert_out "--allow-unguarded"
    assert_eq "$(cat "$SCENARIO.count")" 1 "no host call on the refused resume"
    run_runner --host fake --resume
    assert_rc 0 && assert_out "Resuming after iteration 1"
}

t23_unscaffolded_repo_resume_and_clean_branch() {
    new_repo t23 --unscaffolded
    scenario "state:running:plan commit:a.txt" "state:done:ship commit:b.txt pr-body"
    run_runner --host fake "feature" --max 1
    assert_rc 4 && assert_out "Wrote .agent-blueprint/.gitignore"
    run_runner --host fake --resume
    assert_rc 0 && assert_out "Working tree clean"
    ! git --git-dir="$REMOTE" ls-tree -r --name-only feat/x | grep -q '^\.agent-blueprint/' || fail "run files reached the published branch"
}

t24_needs_human_then_auth_then_resume() {
    new_repo t24
    scenario "state:done:ship commit:a.txt pr-body gh-unauth"
    run_runner --host fake "feature"
    assert_rc 3 && assert_out "gh auth login"
    rm -f "$D/gh/unauth"
    run_runner --host fake --resume
    assert_rc 0 && assert_out "Resuming after iteration 1" && assert_out "done conditions hold"
    assert_eq "$(cat "$SCENARIO.count")" 1 "no new host call: the run was already done"
    assert_eq "$(remote_commits_ahead feat/x)" 1 "the range from the base recorded before the resume"
}

t25_secret_before_resume_still_caught() {
    new_repo t25
    scenario "state:running:plan secret-commit" "state:done:ship commit:a.txt pr-body"
    run_runner --host fake "feature" --max 1
    assert_rc 4
    run_runner --host fake --resume
    assert_rc 3 && assert_out "secret scan" && assert_not_out "AKIAQQQQ"
    ! remote_has_branch feat/x || fail "pushed a key committed before the resume"
}

t26_review_sees_the_diff_with_read_only_git() {
    new_repo t26
    export AGENT_BLUEPRINT_FAKE_GIT_WRITABLE=0
    scenario "state:running:review review-diff" "state:done:ship change:c.txt commit-msg:feat:_done pr-body"
    run_runner --host fake "feature"
    assert_rc 0
    assert_file .agent-blueprint/run/fake-review.txt
    grep -q '^git_writable=0$' .agent-blueprint/run/fake-review.txt || fail "the review did not run in no-commit mode"
    local lines
    lines=$(sed -n 's/^diff_lines=//p' .agent-blueprint/run/fake-review.txt)
    [ "${lines:-0}" -gt 0 ] || fail "the review saw an empty diff"
    AGENT_BLUEPRINT_FAKE_GIT_WRITABLE=""
}

# ─── Runner ───────────────────────────────────────────────────
ALL="t01_done_publishes t02_sentinel_does_not_stop t03_stall_is_blocked t04_transient_error_not_counted
t05_timeout_is_killed t06_denied_command_continues t07_second_runner_sees_lock t08_ctrl_c_then_resume
t09_gh_unauthenticated_at_publish t10_missing_provenance_fails_iteration t11_team_ledger_counts_as_progress
t12_pr_body_symlink_publishes_nothing t13_skill_names_a_runner_that_exists_after_copy_install
t14_state_pr_body_path_is_ignored t15_default_branch_refused t16_unguarded_hosts_need_the_flag
t17_interactive_stop_hook_stands_down t18_no_commit_mode_runner_commits t19_secrets_stop_the_publish
t20_ci_paths_remote_url_and_prepush_hook t21_bad_session_id_status_and_driver_fail
t22_resume_takes_the_host_from_the_command_line t23_unscaffolded_repo_resume_and_clean_branch
t24_needs_human_then_auth_then_resume t25_secret_before_resume_still_caught t26_review_sees_the_diff_with_read_only_git
t27_wrong_version_and_exit_code_fail_but_interactive_driver_passes
t28_transient_errors_end_as_needs_human_after_the_cap t29_a_retry_that_fails_differently_is_not_transient
t30_a_long_final_message_does_not_end_the_runner t31_scan_reads_hidden_paths_merges_and_commit_messages
t32_a_failed_runner_commit_is_needs_human t33_planted_symlinks_are_never_written_through
t34_resume_at_the_cap_says_how_to_continue t35_dry_run_masks_credentials_and_names_the_pr_repository
t36_every_scan_pattern_is_caught_and_masked t37_a_blank_commit_message_falls_back_to_the_default
t38_a_removed_env_file_still_fails_the_range_scan t39_an_env_file_under_a_quoted_directory_fails_the_range_scan
t40_commits_from_before_the_run_are_scanned_and_checked t41_an_env_path_named_like_a_commit_header_fails_the_range_scan
t42_the_scanner_reads_a_list_of_commits t43_the_runs_own_commits_are_checked_even_when_a_remote_branch_has_them
t44_an_unreadable_remote_stops_the_publish t45_the_push_sends_the_commit_that_was_scanned
t46_outgoing_commits_reads_the_push_url_live t47_the_scan_starts_no_process_per_line
t48_a_merge_is_scanned_for_what_it_adds_itself t49_an_unpushed_merge_of_published_work_publishes
t50_a_change_to_the_global_git_config_stops_the_publish t51_a_url_rule_that_redirects_the_push_stops_it
t52_added_lines_that_look_like_headers_are_scanned t53_paths_are_labelled_as_they_are_named
t54_lines_the_locale_cannot_read_are_scanned t55_message_hits_name_their_commit
t56_a_textconv_filter_does_not_hide_a_key t57_the_ci_check_reads_merges_like_the_scan
t58_a_byte_read_as_half_a_character_does_not_shift_the_report t59_a_file_named_like_an_option_is_scanned"

SELECTED="${*:-$ALL}"
PASSED=0 FAILED=0
for t in $SELECTED; do
    : > "$FAIL_FILE"
    cd "$WORK"
    if ( set -e; "$t" ) > "$WORK/test.log" 2>&1 && [ ! -s "$FAIL_FILE" ]; then
        PASSED=$((PASSED + 1)); echo "ok    $t"
        [ -n "${RUNNER_TESTS_SHOW:-}" ] && sed 's/^/      | /' "$WORK/test.log"
    else
        FAILED=$((FAILED + 1)); echo "FAIL  $t"
        cat "$FAIL_FILE"
        [ -s "$WORK/test.log" ] && tail -n 15 "$WORK/test.log" | sed 's/^/      | /'
    fi
done
cd "$WORK"
echo ""
echo "$PASSED passed, $FAILED failed"
[ "$FAILED" -eq 0 ]
