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
FAKE="$HERE/fake-host.sh"
SKILL_VERSION=$(sed -n 's/^  version: *"\{0,1\}\([^"]*\)"\{0,1\}.*/\1/p' "$REPO/skills/ab-ship-pipeline/SKILL.md" | head -1)
[ -n "$SKILL_VERSION" ] || { echo "cannot read the skill version" >&2; exit 1; }

WORK=$(mktemp -d "${TMPDIR:-/tmp}/ab-runner-tests.XXXXXX")
cleanup() {
    # A runner or fake host still alive from a failed scenario
    pkill -f "$RUNNER" 2>/dev/null || true
    pkill -f "$FAKE" 2>/dev/null || true
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
record_file() { echo "$XDG_STATE_HOME/agent-blueprint/$(git -C "$D/work" rev-parse --show-toplevel | tr -d '\n' | sha256_stdin | cut -c1-16)/record"; }
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
    assert_file .agent-blueprint/run/logs/iteration-1.log && assert_file .agent-blueprint/run/logs/iteration-2.log
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
    grep -q "<promise>DONE</promise>" .agent-blueprint/run/logs/iteration-1.log || fail "sentinel not in the log"
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
    grep -q "killed after 2s (timeout)" .agent-blueprint/run/logs/iteration-1.log || fail "timeout not recorded in the log"
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
    assert_no_file .agent-blueprint/run/lock
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
    assert_file "$copy/run.sh" && assert_file "$copy/hosts.sh" && assert_file "$copy/scan-secrets.sh" && assert_file "$copy/host-limits.tsv"
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
    grep -q "stop hook stood down" .agent-blueprint/run/logs/iteration-1.log || fail "the Stop hook blocked the runner's session"
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
    assert_rc 3 && assert_out "CI configuration" && assert_out "--allow-ci-changes"
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
t24_needs_human_then_auth_then_resume t25_secret_before_resume_still_caught t26_review_sees_the_diff_with_read_only_git"

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
