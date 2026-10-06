#!/usr/bin/env bash
# run.sh — the ship runner: drives the ab-ship-pipeline skill through a host's headless mode,
# one fresh session per iteration, until .agent-blueprint/run/state.json says the run is done,
# then publishes the branch and the pull request itself (KTD6, KTD7, KTD15).
#
# Usage: run.sh --host HOST "<feature>" [options]
#   --host HOST              claude, codex, agy, grok, pi, cursor-agent, hermes or amp
#   --max N                  Iterations before the runner stops (default 10, at most 20)
#   --iterations-timeout S   Seconds each iteration may take before its process group is killed
#                            (default: the host's row in hosts.sh)
#   --allow-unguarded        Required for a host whose posture has no guard (pi, amp, agy)
#   --allow-ci-changes       Publish even when the commits to publish touch .github/workflows or .github/actions
#   --resume                 Continue a stopped run from the iteration the runner recorded; the host
#                            and the opt-in flags come from this command line, never from state.json
#   --plugin-dir PATH        A local plugin checkout, passed to hosts that take one (claude, cursor-agent, agy)
#   --dry-run                Run the read-only preflight checks and print what would run; start nothing
#   --swarm, --deploy, --iterations N, --convergence MODE
#                            Forwarded to the skill
#
# The runner keeps its own record of the run (base commit, branch, push URL and the push target git
# resolves it to, a hash of .git/config and a fingerprint of all the git configuration it reads, the
# iteration count) under
# ${XDG_STATE_HOME:-~/.local/state}/agent-blueprint/<repo hash>/, outside the working tree, and never
# takes those values from state.json. Every state.json field is untrusted: it is validated before use
# and only ever passed as a quoted argument.
#
# Exit: 0 published · 1 usage or preflight · 2 blocked · 3 needs-human · 4 max iterations · 130 interrupted
# Environment: AGENT_BLUEPRINT_RUNNER_BACKOFF (seconds between transient retries, default 30).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

if [ -t 1 ]; then
    GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BLUE='\033[0;34m'; DIM='\033[2m'; BOLD='\033[1m'; NC='\033[0m'
else
    GREEN=''; YELLOW=''; RED=''; BLUE=''; DIM=''; BOLD=''; NC=''
fi
# The message is printed with %s: text that came from state.json or the host keeps its
# backslashes literal, so it cannot smuggle escape sequences into the terminal.
info()    { printf '  %b▸%b %s\n' "$BLUE" "$NC" "$1"; }
success() { printf '  %b✓%b %s\n' "$GREEN" "$NC" "$1"; }
warn()    { printf '  %b!%b %s\n' "$YELLOW" "$NC" "$1"; }
error()   { printf '  %b✗%b %s\n' "$RED" "$NC" "$1" >&2; }
transition() { printf '  %b→%b %s\n' "$BOLD" "$NC" "$1"; }
# A push URL may carry credentials (https://user:token@host/...); never print them.
mask_url() { printf '%s' "$1" | sed -E 's#://[^/@]*@#://***@#'; }
# pr_repo_from_url URL: HOST/OWNER/REPO for a hosted remote, empty for a local path. The runner
# passes it to every gh call, so gh's own default repository (which `gh repo set-default` or a
# second remote can point elsewhere) never decides where the pull request goes.
pr_repo_from_url() {
    local u="$1"
    case "$u" in
        file://*|/*|./*|../*|~*) echo ""; return 0 ;;
        *://*) u="${u#*://}"; u="${u#*@}" ;;
        *@*:*) u="${u#*@}"; u="${u/://}" ;;
        *) echo ""; return 0 ;;
    esac
    u="${u%/}"; u="${u%.git}"
    case "$u" in */*/*) echo "$u" ;; *) echo "" ;; esac
}

# shellcheck source=hosts.sh disable=SC1091
. "$SCRIPT_DIR/hosts.sh"
SCAN="$SCRIPT_DIR/scan-secrets.sh"
OUTGOING="$SCRIPT_DIR/outgoing-commits.sh"

RUN_DIR=".agent-blueprint/run"
STATE_FILE="$RUN_DIR/state.json"
PR_BODY="$RUN_DIR/pr-body.md"
COMMIT_MSG="$RUN_DIR/commit-msg.md"
TEAM_DIR=".agent-blueprint/team"
CEILING=20
BACKOFF="${AGENT_BLUEPRINT_RUNNER_BACKOFF:-30}"
MAX_TRANSIENT=5
PROBE_TIMEOUT=180

# ─── Arguments ────────────────────────────────────────────────
RUN_HOST="" FEATURE="" MAX=10 TIMEOUT="" ALLOW_UNGUARDED=false ALLOW_CI=false RESUME=false PLUGIN_DIR="" DRY_RUN=false
SKILL_FLAGS=""
# The header comment from line 2 to its first non-comment line, so the range cannot drift from it.
usage() { sed -n '1d; /^#/!q; s/^# \{0,1\}//p' "$0"; }
while [ $# -gt 0 ]; do
    case "$1" in
        --host)               [ $# -ge 2 ] || { usage; exit 1; }; RUN_HOST="$2"; shift 2 ;;
        --host=*)             RUN_HOST="${1#--host=}"; shift ;;
        --max)                [ $# -ge 2 ] || { usage; exit 1; }; MAX="$2"; shift 2 ;;
        --max=*)              MAX="${1#--max=}"; shift ;;
        --iterations-timeout) [ $# -ge 2 ] || { usage; exit 1; }; TIMEOUT="$2"; shift 2 ;;
        --iterations-timeout=*) TIMEOUT="${1#--iterations-timeout=}"; shift ;;
        --allow-unguarded)    ALLOW_UNGUARDED=true; shift ;;
        --allow-ci-changes)   ALLOW_CI=true; shift ;;
        --resume)             RESUME=true; shift ;;
        --plugin-dir)         [ $# -ge 2 ] || { usage; exit 1; }; PLUGIN_DIR="$2"; shift 2 ;;
        --plugin-dir=*)       PLUGIN_DIR="${1#--plugin-dir=}"; shift ;;
        --dry-run)            DRY_RUN=true; shift ;;
        --swarm|--deploy)     SKILL_FLAGS="$SKILL_FLAGS $1"; shift ;;
        --iterations|--convergence) [ $# -ge 2 ] || { usage; exit 1; }; SKILL_FLAGS="$SKILL_FLAGS $1 $2"; shift 2 ;;
        --iterations=*|--convergence=*) SKILL_FLAGS="$SKILL_FLAGS $1"; shift ;;
        -h|--help)            usage; exit 0 ;;
        --)                   shift; while [ $# -gt 0 ]; do FEATURE="${FEATURE:+$FEATURE }$1"; shift; done ;;
        -*)                   error "Unknown option: $1"; usage; exit 1 ;;
        *)                    FEATURE="${FEATURE:+$FEATURE }$1"; shift ;;
    esac
done
FEATURE=$(printf '%s' "$FEATURE" | tr '\n\r' '  ')

[ -n "$RUN_HOST" ] || { error "--host is required (one of: $AB_HOSTS)"; exit 1; }
host_known "$RUN_HOST" || { error "Unknown host: $RUN_HOST (one of: $AB_HOSTS)"; exit 1; }
case "$MAX" in ''|*[!0-9]*) error "--max wants a number"; exit 1 ;; esac
[ "$MAX" -ge 1 ] || { error "--max must be at least 1"; exit 1; }
if [ "$MAX" -gt "$CEILING" ]; then warn "--max $MAX is above the skill's fixed ceiling of $CEILING; using $CEILING"; MAX=$CEILING; fi
[ -n "$TIMEOUT" ] || TIMEOUT=$(host_timeout "$RUN_HOST")
case "$TIMEOUT" in ''|*[!0-9]*) error "--iterations-timeout wants a number of seconds"; exit 1 ;; esac
if [ -n "$PLUGIN_DIR" ]; then
    PLUGIN_DIR="$(cd "$PLUGIN_DIR" 2>/dev/null && pwd)" || { error "--plugin-dir is not a directory"; exit 1; }
fi

# KTD15: an unguarded posture needs the explicit flag, on a fresh run and on --resume alike.
if [ "$(host_unguarded "$RUN_HOST")" = 1 ] && [ "$ALLOW_UNGUARDED" != true ]; then
    error "$RUN_HOST runs unattended with no guard: $(host_posture "$RUN_HOST")"
    echo "  Pass --allow-unguarded to accept that for this run." >&2
    exit 1
fi
if [ "$RESUME" != true ] && [ -z "$FEATURE" ] && [ "$DRY_RUN" != true ]; then
    error "A feature description is required (or --resume)"; usage; exit 1
fi

# ─── Helpers ──────────────────────────────────────────────────
sha256_stdin() {
    if command -v sha256sum >/dev/null 2>&1; then sha256sum | cut -d' ' -f1
    elif command -v shasum >/dev/null 2>&1; then shasum -a 256 | cut -d' ' -f1
    else openssl dgst -sha256 | sed 's/.*= *//'; fi
}
sha256_file() { [ -f "$1" ] && sha256_stdin < "$1" || echo none; }
now_utc() { date -u +%Y-%m-%dT%H:%M:%SZ; }
# global_config_hash: a fingerprint of every configuration entry git reads for this repository, with
# the file it comes from: the global files (GIT_CONFIG_GLOBAL, or $XDG_CONFIG_HOME/git/config and
# ~/.gitconfig), the system file, .git/config, .git/config.worktree and every file they include.
# A session that writes one can redirect the push (url.<base>.pushInsteadOf) or run code during it
# (core.sshCommand). `git config --global --list` would read only one of the two global files.
global_config_hash() {
    { git config --list --show-origin --includes -z 2>/dev/null || true; } | sha256_stdin
}
global_config_files() {   # the global files as git finds them, for messages
    if [ -n "${GIT_CONFIG_GLOBAL:-}" ]; then echo "$GIT_CONFIG_GLOBAL"
    else echo "${XDG_CONFIG_HOME:-$HOME/.config}/git/config, $HOME/.gitconfig"; fi
}
# push_target URL: where `git push URL` goes once the url.<base>.pushInsteadOf and insteadOf rules of
# every configuration file are applied to URL itself; fails unless that is exactly one URL. `git remote
# -v` applies the rules to a remote defined on the command line, which `git remote get-url` refuses.
# The runner pushes to the remote's push URL as git reports it, already rewritten once, so a chained
# setup (an insteadOf rule and a pushInsteadOf rule matching its result) sends the push further on.
# The remote's name is one no configuration file uses: an existing remote of that name would bring its
# own URLs, and its pushurl would stand in for the push target.
push_target() {
    local name=agent-blueprint-push t
    while git config --get-regexp "^remote\\.$name\\." >/dev/null 2>&1; do name="agent-blueprint-push-$RANDOM$RANDOM"; done
    t=$(git -c "remote.$name.url=$1" remote -v 2>/dev/null | sed -n "s/^${name}[[:space:]]\\(.*\\) (push)\$/\\1/p")
    case "$t" in ''|*$'\n'*) return 1 ;; esac
    printf '%s\n' "$t"
}
# no_push_target URL: stop the run when git names no single push URL for URL.
no_push_target() { error "Cannot tell where a push to $(mask_url "$1") goes: git remote -v shows no single push URL for it"; exit 1; }
# listed_url TARGET: the URL whose branches outgoing-commits.sh reads for TARGET. Its git ls-remote and
# git fetch apply the insteadOf rules to TARGET once more, so a rule that matches the push target itself
# would list the branches of a repository the push never reaches.
listed_url() { git ls-remote --get-url -- "$1" 2>/dev/null; }
# remote_file NAME...: prints the first file under the remotes/ or branches/ git path named after one
# of the NAMEs. git push, git ls-remote and git fetch take a name with no slash in it for a remote
# first and, when no configuration defines that remote, read its URL from such a file, which neither
# git remote -v nor any fingerprint covers.
remote_file() {
    local n p f
    for n in "$@"; do
        case "$n" in ''|.|..|*/*) continue ;; esac
        for p in remotes branches; do
            f=$(git rev-parse --git-path "$p/$n")
            [ -e "$f" ] && { printf '%s\n' "$f"; return 0; }
        done
    done
    return 1
}
# check_push_target URL TARGET: stop the run when a legacy remote file decides where a push to URL goes,
# or when git would read the branches of its push target TARGET from another URL.
check_push_target() {
    local f listed
    if f=$(remote_file "$1" "$2"); then
        error "$f, a legacy remote file named after the push URL $(mask_url "$1") or its target, would make git push or read branches where the file says. Remove it"
        exit 1
    fi
    listed=$(listed_url "$2" || true)
    [ "$listed" = "$2" ] && return 0
    error "Cannot tell which commits a push to $(mask_url "$2") would publish: git reads its branches from $(mask_url "${listed:-<unknown>}"), because a url.<base>.insteadOf rule rewrites it again. Remove that rule (git config --show-origin --get-regexp '^url\\.' lists them)"
    exit 1
}
# via_target URL TARGET: ", which git sends to TARGET" when a rule sends a push to URL elsewhere.
via_target() { [ "$1" = "$2" ] || printf ', which git sends to %s' "$(mask_url "$2")"; }

SKILL_VERSION=$(sed -n 's/^  version: *"\{0,1\}\([^"]*\)"\{0,1\}.*/\1/p' "$SKILL_DIR/SKILL.md" | head -1)
[ -n "$SKILL_VERSION" ] || { error "Cannot read metadata.version from $SKILL_DIR/SKILL.md"; exit 1; }

# ─── Repository ───────────────────────────────────────────────
REPO=$(git rev-parse --show-toplevel 2>/dev/null) || { error "Not inside a git repository"; exit 1; }
cd "$REPO"
BRANCH=$(git symbolic-ref --short -q HEAD || true)
[ -n "$BRANCH" ] || { error "HEAD is detached; check out the feature branch first"; exit 1; }

default_branch() {
    local ref
    ref=$(git symbolic-ref --short -q refs/remotes/origin/HEAD 2>/dev/null || true)
    if [ -n "$ref" ]; then echo "${ref#origin/}"; return; fi
    ref=$(git ls-remote --symref origin HEAD 2>/dev/null | sed -n 's|^ref: refs/heads/\([^[:space:]]*\)[[:space:]]*HEAD$|\1|p' | head -1)
    if [ -n "$ref" ]; then echo "$ref"; return; fi
    ref=$(git config --get init.defaultBranch 2>/dev/null || true)
    if [ -n "$ref" ] && git show-ref --verify -q "refs/heads/$ref"; then echo "$ref"; return; fi
    for ref in main master; do git show-ref --verify -q "refs/heads/$ref" && { echo "$ref"; return; }; done
    echo ""
}
DEFAULT_BRANCH=$(default_branch)
if [ -n "$DEFAULT_BRANCH" ] && [ "$BRANCH" = "$DEFAULT_BRANCH" ]; then
    error "You are on the default branch ($BRANCH). Create a feature branch first: git switch -c feat/<name>"
    exit 1
fi

REMOTE=$(git config --get "branch.$BRANCH.remote" 2>/dev/null || echo origin)
git remote get-url --push "$REMOTE" >/dev/null 2>&1 || { error "Remote '$REMOTE' has no push URL; add one before running"; exit 1; }

REPO_HASH=$(printf '%s' "$REPO" | sha256_stdin | cut -c1-16)
STATE_ROOT="${XDG_STATE_HOME:-$HOME/.local/state}/agent-blueprint/$REPO_HASH"
RECORD="$STATE_ROOT/record"
# Everything the runner itself writes (logs, the lock, the host's last-message file) sits next to
# the record, outside the working tree: the agent can plant a symlink at any path inside the tree,
# and a write through it would land wherever the link points.
LOG_DIR="$STATE_ROOT/logs"
LOCK_FILE="$STATE_ROOT/lock"

# tree_link: prints the first blueprint path that is a symlink; the runner refuses to write below one.
tree_link() {
    local p
    for p in .agent-blueprint "$RUN_DIR" .agent-blueprint/.gitignore "$COMMIT_MSG"; do
        [ -L "$p" ] && { echo "$p"; return 0; }
    done
    return 1
}

echo ""
printf '  %bShip runner%b — %s on %s %b(%s)%b\n' "$BOLD" "$NC" "$RUN_HOST" "$BRANCH" "$DIM" "$REPO" "$NC"
[ "$DRY_RUN" = true ] && info "Dry run: preflight only, nothing starts."

# ─── Preflight ────────────────────────────────────────────────
GIT_WRITABLE=$(host_git_writable_default "$RUN_HOST")
info "Posture: $(host_posture "$RUN_HOST")"
[ "$(host_unguarded "$RUN_HOST")" = 1 ] && warn "Unguarded posture accepted with --allow-unguarded"
HELPERS=$(host_max_helpers "$RUN_HOST"); [ "$HELPERS" = "-" ] && HELPERS="no documented cap"
info "Helpers per wave: $HELPERS · iteration timeout: ${TIMEOUT}s · max iterations: $MAX"
host_preflight "$RUN_HOST" "$REPO" || exit 1

command -v gh >/dev/null 2>&1 || { error "gh is not installed; the runner opens the pull request with it"; exit 1; }
if gh auth status >/dev/null 2>&1; then
    info "gh: authenticated"
else
    error "gh is not authenticated. Fix: gh auth login"
    exit 1
fi

write_gitignore() {
    local link
    if link=$(tree_link); then
        error "$link is a symlink; the runner does not write through links. Replace it with a regular file or folder."
        exit 1
    fi
    [ -f .agent-blueprint/.gitignore ] && return 0
    mkdir -p .agent-blueprint
    cat > .agent-blueprint/.gitignore <<'EOF'
# Agent Blueprint working files. Run state, team ledgers, review artifacts and
# caches are transient; plans and notes stay tracked.
# This file lists itself, so it never shows up as an untracked change.
run/
team/
review-runs/
cache/
.gitignore
EOF
    info "Wrote .agent-blueprint/.gitignore"
    return 0
}
[ "$DRY_RUN" = true ] || write_gitignore

if [ -n "$(git status --porcelain --untracked-files=all)" ]; then
    error "The working tree is not clean. Commit or stash first, so the run's commits are the only ones that ship:"
    git status --short | head -20 | sed 's/^/      /' >&2
    exit 1
fi
info "Working tree clean"

# ─── Dry run stops here ───────────────────────────────────────
if [ "$DRY_RUN" = true ]; then
    DRY_URL=$(git remote get-url --push "$REMOTE")
    DRY_TARGET=$(push_target "$DRY_URL") || no_push_target "$DRY_URL"
    check_push_target "$DRY_URL" "$DRY_TARGET"
    DRY_REPO=$(pr_repo_from_url "$DRY_TARGET")
    info "Would record base $(git rev-parse --short HEAD), branch $BRANCH, push URL $(mask_url "$DRY_URL")$(via_target "$DRY_URL" "$DRY_TARGET")${DRY_REPO:+, pull requests in $DRY_REPO}"
    info "Would run per iteration: $(host_bin "$RUN_HOST") with the skill prompt for: ${FEATURE:-<feature>}"
    info "Skill reference on this host: $(host_skill_ref "$RUN_HOST" "$AB_SKILL_NAME" "$PLUGIN_DIR")${SKILL_FLAGS:+ · flags:$SKILL_FLAGS}"
    success "Dry run complete"
    exit 0
fi

# ─── Lock ─────────────────────────────────────────────────────
mkdir -p "$RUN_DIR"
( umask 077; mkdir -p "$STATE_ROOT" "$LOG_DIR" )
# noclobber makes the create atomic, so two runners started together cannot both take the lock.
take_lock() { ( set -C; echo "$$" > "$LOCK_FILE" ) 2>/dev/null; }
if ! take_lock; then
    OTHER=$(head -1 "$LOCK_FILE" 2>/dev/null | tr -cd '0-9')
    if [ -n "$OTHER" ] && kill -0 "$OTHER" 2>/dev/null; then
        error "Another runner (PID $OTHER) holds the lock for this repository ($LOCK_FILE); wait for it or stop it first"
        exit 1
    fi
    warn "Stale lock from PID ${OTHER:-?}; taking over"
    rm -f "$LOCK_FILE"
    take_lock || { error "Another runner took the lock at the same moment; try again"; exit 1; }
fi
HOLD_LOCK=true
CHILD=""
release_lock() { [ "$HOLD_LOCK" = true ] && rm -f "$LOCK_FILE"; HOLD_LOCK=false; }
kill_child() {
    [ -n "$CHILD" ] || return 0
    kill -TERM -- "-$CHILD" 2>/dev/null || kill -TERM "$CHILD" 2>/dev/null || true
    sleep 1
    kill -KILL -- "-$CHILD" 2>/dev/null || kill -KILL "$CHILD" 2>/dev/null || true
    wait "$CHILD" 2>/dev/null || true
    CHILD=""
}
on_signal() {
    trap - INT TERM
    echo ""
    warn "Interrupted: stopping the host's process group"
    kill_child
    release_lock
    printf '  %bStopped.%b Continue later with: %s --host %s --resume\n' "$BOLD" "$NC" "$0" "$RUN_HOST"
    exit 130
}
trap on_signal INT TERM
trap 'release_lock' EXIT

# ─── Record: the runner's own memory of the run ───────────────
declare REC_base="" REC_branch="" REC_remote="" REC_push_url="" REC_push_target="" REC_pr_repo="" REC_config_hash="" REC_global_config_hash="" REC_prepush_hash="" REC_iteration=0 REC_feature="" REC_git_writable=""
load_record() {
    local k v
    while IFS='=' read -r k v; do
        case "$k" in
            base) REC_base="$v" ;; branch) REC_branch="$v" ;; remote) REC_remote="$v" ;; push_url) REC_push_url="$v" ;; push_target) REC_push_target="$v" ;; pr_repo) REC_pr_repo="$v" ;;
            config_hash) REC_config_hash="$v" ;; global_config_hash) REC_global_config_hash="$v" ;; prepush_hash) REC_prepush_hash="$v" ;; iteration) REC_iteration="$v" ;;
            feature) REC_feature="$v" ;; git_writable) REC_git_writable="$v" ;;
        esac
    done < "$RECORD"
    case "$REC_iteration" in ''|*[!0-9]*) REC_iteration=0 ;; esac
}
save_record() {
    local old_umask
    old_umask=$(umask)
    umask 077   # the record holds the push URL, which may carry a credential
    mkdir -p "$STATE_ROOT"
    {
        echo "repo=$REPO"
        echo "host=$RUN_HOST"
        echo "feature=$REC_feature"
        echo "base=$REC_base"
        echo "branch=$REC_branch"
        echo "remote=$REC_remote"
        echo "push_url=$REC_push_url"
        echo "push_target=$REC_push_target"
        echo "pr_repo=$REC_pr_repo"
        echo "config_hash=$REC_config_hash"
        echo "global_config_hash=$REC_global_config_hash"
        echo "prepush_hash=$REC_prepush_hash"
        echo "iteration=$REC_iteration"
        echo "git_writable=$REC_git_writable"
        echo "updated=$(now_utc)"
    } > "$RECORD.tmp"
    mv "$RECORD.tmp" "$RECORD"
    umask "$old_umask"
}
prepush_hook_path() { echo "$(git rev-parse --git-path hooks)/pre-push"; }

if [ "$RESUME" = true ]; then
    [ -f "$RECORD" ] || { error "Nothing to resume: no runner record for this repository at $RECORD"; exit 1; }
    load_record
    [ "$REC_branch" = "$BRANCH" ] || { error "The recorded run is on branch $REC_branch, not $BRANCH; check it out first"; exit 1; }
    [ -n "$FEATURE" ] || FEATURE="$REC_feature"
    info "Resuming after iteration $REC_iteration (base $(git rev-parse --short "$REC_base"), recorded $(sed -n 's/^updated=//p' "$RECORD"))"
    # A record written before the fingerprint or the push target existed has none: it was not
    # recorded, which is not a change. It is taken now and covers the rest of the run.
    if [ -z "$REC_global_config_hash" ]; then
        REC_global_config_hash=$(global_config_hash)
        save_record
        info "Recorded a fingerprint of the git configuration; a change to it from now on stops the publish"
    fi
    if [ -z "$REC_push_target" ]; then
        REC_push_target=$(push_target "$REC_push_url") || no_push_target "$REC_push_url"
        check_push_target "$REC_push_url" "$REC_push_target"
        save_record
        info "Recorded the push target: $(mask_url "$REC_push_target"); a change to it from now on stops the publish"
    fi
else
    if [ -f "$RECORD" ] && [ -f "$STATE_FILE" ]; then
        error "A runner record exists for this repository (a previous run stopped after iteration $(sed -n 's/^iteration=//p' "$RECORD")). Use --resume to continue it."
        echo "  To start over instead, remove $RECORD and $RUN_DIR/state.json." >&2
        exit 1
    fi
    REC_base=$(git rev-parse HEAD)
    REC_branch="$BRANCH"
    REC_remote="$REMOTE"
    REC_push_url=$(git remote get-url --push "$REMOTE")
    # Where the push really goes: the commits are listed against it, the pull request goes to its
    # repository, and the push stops if it changes during the run.
    REC_push_target=$(push_target "$REC_push_url") || no_push_target "$REC_push_url"
    check_push_target "$REC_push_url" "$REC_push_target"
    REC_pr_repo=$(pr_repo_from_url "$REC_push_target")
    REC_config_hash=$(sha256_file "$(git rev-parse --git-path config)")
    REC_global_config_hash=$(global_config_hash)
    REC_prepush_hash=$(sha256_file "$(prepush_hook_path)")
    REC_iteration=0
    REC_feature="$FEATURE"
    save_record
    info "Recorded base $(git rev-parse --short "$REC_base") on $BRANCH, push URL $(mask_url "$REC_push_url")$(via_target "$REC_push_url" "$REC_push_target")${REC_pr_repo:+, pull requests in $REC_pr_repo}"
fi

# ─── Running the host under a timeout ─────────────────────────
# run_host SECS LOG PROMPT LASTMSG: the host in its own process group; 124 on timeout. The
# deadline is read from the clock ($SECONDS), not counted in sleeps: a counted loop stretches
# with every sleep's start-up cost, by an hour in six under load.
run_host() {
    local secs="$1" log="$2" prompt="$3" lastmsg="$4" started=$SECONDS rc=0
    set -m
    ( host_run "$RUN_HOST" "$prompt" "$PLUGIN_DIR" "$lastmsg" ) >> "$log" 2>&1 </dev/null &
    CHILD=$!
    set +m
    while kill -0 "$CHILD" 2>/dev/null; do
        if [ $((SECONDS - started)) -ge "$secs" ]; then
            kill_child
            return 124
        fi
        sleep 0.25
    done
    if wait "$CHILD"; then rc=0; else rc=$?; fi
    CHILD=""
    return "$rc"
}

# ─── Probe: can this posture write .git? ──────────────────────
probe_git_writable() {
    local marker probe_log rc=0
    marker="$(git rev-parse --git-dir)/agent-blueprint-probe"
    probe_log="$LOG_DIR/probe.log"
    rm -f "$marker"
    : > "$probe_log"
    run_host "$PROBE_TIMEOUT" "$probe_log" "$(host_probe_prompt)" "$LOG_DIR/probe.last" || rc=$?
    if [ -f "$marker" ]; then
        rm -f "$marker"
        GIT_WRITABLE=1
    else
        GIT_WRITABLE=0
    fi
    if [ "$rc" -ne 0 ] && [ "$rc" -ne 124 ] && [ ! -s "$probe_log" ]; then
        error "The host could not run the preflight probe (exit $rc); see $probe_log"
        exit 1
    fi
    [ "$rc" -eq 124 ] && warn "Probe timed out after ${PROBE_TIMEOUT}s; treating .git as not writable"
    REC_git_writable="$GIT_WRITABLE"
    save_record
    if [ "$GIT_WRITABLE" = 1 ]; then
        info "Probe: the posture can write .git; the skill commits"
    else
        info "Probe: the posture cannot write .git; no-commit mode, the runner commits after each iteration"
    fi
}

# ─── State reading and validation ─────────────────────────────
# Prints key=value lines with control characters stripped; every value is checked again below.
read_state() {
    [ -f "$STATE_FILE" ] || { echo "error=missing"; return 0; }
    [ -L "$STATE_FILE" ] && { echo "error=symlink"; return 0; }
    if command -v python3 >/dev/null 2>&1; then
        python3 - "$STATE_FILE" <<'PY'
import json, re, sys
try:
    d = json.load(open(sys.argv[1], encoding="utf-8"))
except Exception:
    print("error=parse"); sys.exit(0)
if not isinstance(d, dict):
    print("error=shape"); sys.exit(0)
def clean(v, n=300):
    return re.sub(r"[\x00-\x1f\x7f]", " ", v)[:n] if isinstance(v, str) else ""
prov = d.get("provenance")
prov = prov if isinstance(prov, dict) else {}
print("status=" + clean(d.get("status"), 64))
print("stage=" + clean(d.get("stage"), 64))
print("driver=" + clean(d.get("driver"), 64))
print("host=" + clean(d.get("host"), 64))
print("session_id=" + clean(d.get("session_id"), 200))
print("prov_skill=" + clean(prov.get("skill"), 64))
print("prov_version=" + clean(prov.get("version"), 64))
print("reason=" + clean(d.get("reason"), 500))
print("has_provenance=" + ("1" if isinstance(d.get("provenance"), dict) else "0"))
PY
    else
        # No python3: a line-based reader for the flat fields; the checks below reject anything odd.
        local text prov
        text=$(tr -d '\000-\037' < "$STATE_FILE")
        # The first match: top-level keys come before the decisions array, whose entries carry their own stage and reason.
        field() { printf '%s' "$text" | grep -o "\"$1\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" | sed -n '1p' | sed 's/^[^:]*:[[:space:]]*"\(.*\)"$/\1/'; }
        prov=$(printf '%s' "$text" | sed -n 's/.*"provenance"[[:space:]]*:[[:space:]]*{\([^}]*\)}.*/\1/p' | head -1)
        echo "status=$(field status)"
        echo "stage=$(field stage)"
        echo "driver=$(field driver)"
        echo "host=$(field host)"
        echo "session_id=$(field session_id)"
        echo "prov_skill=$(printf '%s' "$prov" | sed -n 's/.*"skill"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"
        echo "prov_version=$(printf '%s' "$prov" | sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"
        echo "reason=$(field reason)"
        echo "has_provenance=$([ -n "$prov" ] && echo 1 || echo 0)"
    fi
}

S_status="" S_stage="" S_driver="" S_session="" S_prov_skill="" S_prov_version="" S_reason="" S_has_prov=0 S_error=""
# load_state: fills S_*; returns 1 with S_error set when the file fails a check.
load_state() {
    local k v
    S_status="" S_stage="" S_driver="" S_session="" S_prov_skill="" S_prov_version="" S_reason="" S_has_prov=0 S_error=""
    while IFS='=' read -r k v; do
        case "$k" in
            error) S_error="$v" ;;
            status) S_status="$v" ;; stage) S_stage="$v" ;; driver) S_driver="$v" ;; session_id) S_session="$v" ;;
            prov_skill) S_prov_skill="$v" ;; prov_version) S_prov_version="$v" ;; reason) S_reason="$v" ;;
            has_provenance) S_has_prov="$v" ;;
        esac
    done <<EOF
$(read_state)
EOF
    case "$S_error" in
        missing) S_error="no $STATE_FILE was written"; return 1 ;;
        symlink) S_error="$STATE_FILE is a symlink"; return 1 ;;
        parse)   S_error="$STATE_FILE is not valid JSON"; return 1 ;;
        shape)   S_error="$STATE_FILE is not a JSON object"; return 1 ;;
    esac
    case "$S_status" in running|done|blocked|needs-human) ;; *) S_error="status '$S_status' is not running, done, blocked or needs-human"; return 1 ;; esac
    case "$S_driver" in runner|interactive) ;; *) S_error="driver '$S_driver' is not runner or interactive"; return 1 ;; esac
    if ! printf '%s\n' "$S_session" | grep -Eq '^[A-Za-z0-9._:-]{1,128}$'; then
        S_error="session_id does not match ^[A-Za-z0-9._:-]{1,128}\$"; return 1
    fi
    if [ "$S_has_prov" != 1 ] || [ -z "$S_prov_skill" ]; then
        S_error="state.json carries no provenance marker"; return 1
    fi
    if [ "$S_prov_skill" != "$AB_SKILL_NAME" ] || [ "$S_prov_version" != "$SKILL_VERSION" ]; then
        S_error="provenance names $S_prov_skill $S_prov_version, not $AB_SKILL_NAME $SKILL_VERSION"; return 1
    fi
    return 0
}

# Progress fingerprint: stage, commit history and the team ledger (KTD7).
fingerprint() {
    local stage="$1" ledger
    ledger=$(if [ -d "$TEAM_DIR" ]; then
        find "$TEAM_DIR" -type f 2>/dev/null | LC_ALL=C sort | while IFS= read -r f; do printf '%s\n' "$f"; cat "$f"; done
    fi | sha256_stdin)
    echo "$stage|$(git rev-parse HEAD)|$ledger"
}

# No-commit mode: the runner commits the working tree the skill left (KTD7).
commit_for_skill() {
    local n="$1" msg
    [ -n "$(git status --porcelain --untracked-files=all)" ] || return 0
    msg=""
    if [ -f "$COMMIT_MSG" ] && [ ! -L "$COMMIT_MSG" ]; then
        msg=$(tr -d '\000' < "$COMMIT_MSG")
    fi
    # git refuses an empty or whitespace-only message; fall back rather than lose the commit.
    if [ -z "$(printf '%s' "$msg" | tr -d '[:space:]')" ]; then
        msg="chore(ship): iteration $n changes (no commit message left by the skill)"
    fi
    if git add -A 2>/dev/null && git -c core.hooksPath=/dev/null commit -q -m "$msg"; then
        transition "iteration $n: committed the working tree for the skill ($(git rev-parse --short HEAD))"
        # Consumed; the next message starts clean. A link is removed, never written through.
        if [ -L "$COMMIT_MSG" ]; then rm -f "$COMMIT_MSG"; elif [ -f "$COMMIT_MSG" ]; then : > "$COMMIT_MSG"; fi
    else
        # Publishing now would ship an earlier commit as if it were the finished work.
        needs_human "the runner could not commit the changes iteration $n left in the working tree" "run git status, commit them by hand (or fix what blocks the commit), then re-run"
    fi
    return 0
}

# ─── Publish (KTD7) ───────────────────────────────────────────
needs_human() {
    echo ""
    transition "status: needs-human — $1"
    [ -n "${2:-}" ] && echo "    Fix: $2"
    echo "    Then continue with: $0 --host $RUN_HOST --resume"
    exit 3
}

# done_check: prints why the run is not done. Returns 1 when the skill has more to do, 2 when
# the PR body path was tampered with (a symlink on it), which ends the run as needs-human.
done_check() {
    local p
    for p in .agent-blueprint "$RUN_DIR" "$PR_BODY"; do
        [ -L "$p" ] && { echo "$p is a symlink; the PR body must be a regular file at $PR_BODY"; return 2; }
    done
    if ! git merge-base --is-ancestor "$REC_base" HEAD 2>/dev/null; then
        echo "the branch no longer contains the recorded base $(git rev-parse --short "$REC_base")"; return 1
    fi
    if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
        echo "tracked files still have uncommitted changes"; return 1
    fi
    if [ "$(git rev-list --count "$REC_base..HEAD")" -eq 0 ]; then
        echo "no commits since the recorded base"; return 1
    fi
    [ -f "$PR_BODY" ] || { echo "$PR_BODY is missing or not a regular file"; return 1; }
    [ -s "$PR_BODY" ] || { echo "$PR_BODY is empty"; return 1; }
    return 0
}

# accept_config: how the person running the runner accepts a configuration change they made themselves
# (a credential helper runs commands, so it is fingerprinted like any other entry). A resume whose record
# has no fingerprint takes it again, so it covers the configuration as it is at that resume.
accept_config() { printf 'delete the global_config_hash= line from %s before the re-run with --resume, which then fingerprints the configuration as it is now' "$RECORD"; }

# push_guard: stops as needs-human when anything that decides where the push goes, or what runs
# during it, changed since the run was recorded. publish calls it first and again just before the
# push, so a change made while the commits are listed and scanned is caught as well.
push_guard() {
    local url_now target file listed cfg_now global_now hook_now
    url_now=$(git remote get-url --push "$REC_remote" 2>/dev/null || true)
    [ "$url_now" = "$REC_push_url" ] || needs_human "the push URL of $REC_remote changed from $(mask_url "$REC_push_url") to $(mask_url "${url_now:-<none>}")" "set it back with git remote set-url --push $REC_remote <the recorded URL>"
    # The remote's URL above misses a rule that matches only the recorded URL, which git push rewrites too.
    target=$(push_target "$REC_push_url" || true)
    [ "$target" = "$REC_push_target" ] || needs_human "a url.<base>.pushInsteadOf or insteadOf rule changed where a push to $(mask_url "$REC_push_url") goes, from $(mask_url "$REC_push_target") to $(mask_url "${target:-<unknown>}"); nothing is pushed" "remove the rule (git config --show-origin --get-regexp '^url\\.' lists them), then re-run"
    if file=$(remote_file "$REC_push_url" "$REC_push_target"); then
        needs_human "$file, a legacy remote file named after the push URL or its target, would make git push or read branches where the file says; nothing is pushed" "inspect it, remove it, then re-run"
    fi
    listed=$(listed_url "$REC_push_target" || true)
    [ "$listed" = "$REC_push_target" ] || needs_human "git reads the branches of the push target $(mask_url "$REC_push_target") from $(mask_url "${listed:-<unknown>}"), because a url.<base>.insteadOf rule rewrites it again, so the commits the push would publish cannot be listed; nothing is pushed" "remove the rule (git config --show-origin --get-regexp '^url\\.' lists them), then re-run"
    cfg_now=$(sha256_file "$(git rev-parse --git-path config)")
    [ "$cfg_now" = "$REC_config_hash" ] || needs_human ".git/config changed during the run; nothing is pushed until it is reviewed" "inspect $(git rev-parse --git-path config), restore it, then re-run"
    global_now=$(global_config_hash)
    [ "$global_now" = "$REC_global_config_hash" ] || needs_human "the git configuration outside .git/config changed during the run ($(global_config_files), the system file, .git/config.worktree or a file one of them includes); nothing is pushed until it is reviewed" "git config --list --show-origin lists every entry with its file; restore the change, then re-run. If you made the change yourself (a credential helper, say) and that list shows nothing else new, $(accept_config)"
    hook_now=$(sha256_file "$(prepush_hook_path)")
    [ "$hook_now" = "$REC_prepush_hash" ] || needs_human "a pre-push hook appeared or changed during the run ($(prepush_hook_path)); it did not run" "inspect it, remove it, then re-run"
}

publish() {
    local body_copy ci_files out number title outgoing count head rc
    echo ""
    info "Publishing $BRANCH"
    gh auth status >/dev/null 2>&1 || needs_human "gh is not authenticated, so the pull request cannot be opened" "gh auth login"

    push_guard
    [ "$(git symbolic-ref --short -q HEAD)" = "$REC_branch" ] || needs_human "HEAD is no longer on $REC_branch" "git switch $REC_branch"
    # The checks from here on read the commits themselves: a replace ref (git replace) shows git log and
    # rev-list another commit in place of one, while git push sends the commit as it is. outgoing-commits.sh
    # sets GIT_NO_REPLACE_OBJECTS=1 itself; the other commands get it one by one, so the environment the
    # host sessions run in stays as it was.
    GIT_NO_REPLACE_OBJECTS=1 git merge-base --is-ancestor "$REC_base" HEAD 2>/dev/null || needs_human "the branch moved away from the recorded base $(git rev-parse --short "$REC_base")" "rebase onto it or start a new run"

    # The CI check and the secret scan cover what outgoing-commits.sh lists: the run's own commits
    # since the recorded base, whatever the remote holds, and every older one no branch at the push
    # target has. They are listed for the commit HEAD names now, and that commit is what gets pushed,
    # so a commit added after this point is never published unscanned.
    head=$(git rev-parse HEAD)
    rc=0
    outgoing=$(bash "$OUTGOING" "$REC_push_target" "$REC_base" "$head") || rc=$?
    case "$rc" in
        0) ;;
        1) needs_human "could not read the branches of $(mask_url "$REC_push_target") to tell which commits the push would publish; nothing was pushed" "check the network and the git credential, then re-run. If you set up a credential helper for it in your global git configuration and git config --list --show-origin shows nothing else new, $(accept_config)" ;;
        *) needs_human "could not list the commits the push would publish; nothing was pushed" "check the repository with git log, then re-run" ;;
    esac

    # --cc, as in the secret scan: a merge counts for the CI files none of its parents has, so a clean
    # merge of a published workflow change passes, while an evil merge that edits one, and every
    # outgoing commit that edits one on its own, stop the publish.
    ci_files=""
    if [ -n "$outgoing" ]; then
        ci_files=$(printf '%s\n' "$outgoing" | GIT_NO_REPLACE_OBJECTS=1 git log --no-walk=unsorted --stdin --format= --name-only --no-renames --cc -- .github/workflows .github/actions | sed '/^$/d' | LC_ALL=C sort -u) \
            || needs_human "could not list the files the commits to publish change" "check the repository with git log, then re-run"
    fi
    if [ -n "$ci_files" ] && [ "$ALLOW_CI" != true ]; then
        needs_human "the commits the push would publish touch CI configuration: $(printf '%s' "$ci_files" | tr '\n' ' ')" "review it, then re-run with --allow-ci-changes"
    fi

    # The PR body: the fixed path only, no symlink on it, read once into a runner-owned copy.
    local p
    for p in .agent-blueprint "$RUN_DIR" "$PR_BODY"; do
        [ -L "$p" ] && needs_human "$p is a symlink; the PR body must be a regular file at $PR_BODY" "replace it with a regular file"
    done
    [ -f "$PR_BODY" ] || needs_human "$PR_BODY is not a regular file" "write the PR body there"
    body_copy="$STATE_ROOT/pr-body.md"
    cat "$PR_BODY" > "$body_copy"

    count=$(printf '%s' "$outgoing" | grep -c . || true)
    info "Scanning the $count commit(s) the push would publish and the PR body for secrets"
    if ! out=$(printf '%s\n' "$outgoing" | GIT_NO_REPLACE_OBJECTS=1 bash "$SCAN" --commits - --file "$body_copy" 2>&1); then
        printf '%s\n' "$out" | sed 's/^/      /'
        needs_human "the secret scan found key-shaped values or a .env file (listed above, values masked); nothing was pushed" "remove them from the commits and the PR body, then re-run. A hit in upstream commits that a fork's out-of-date default branch lacks clears once the fork is synced"
    fi
    success "No secrets found"

    # Push the scanned commit to the recorded URL and branch only, with every git hook disabled.
    push_guard
    if ! out=$(git -c core.hooksPath=/dev/null push "$REC_push_url" "$head:refs/heads/$REC_branch" 2>&1); then
        printf '%s\n' "$out" | tail -5 | sed 's/^/      /'
        case "$out" in
            *rotected*branch*|*GH006*)   needs_human "the remote refused the push: branch protection on $REC_branch" "push through a reviewer or adjust the protection rule, then re-run" ;;
            *uthentication*|*"ould not read Username"*|*"ermission denied"*) needs_human "the remote refused the push: not authenticated" "gh auth login (or fix the git credential), then re-run. If that sets a credential helper in your global git configuration (gh auth setup-git does) and git config --list --show-origin shows nothing else new, $(accept_config)" ;;
            *) needs_human "git push failed" "read the message above, fix it, then re-run" ;;
        esac
    fi
    success "Pushed $REC_branch to $(mask_url "$REC_push_target")"
    [ "$(git rev-parse HEAD)" = "$head" ] || warn "HEAD moved while publishing; pushed $(git rev-parse --short "$head"), the commit the scan covered, and left the newer commits unpublished"

    title=$(printf '%s' "$FEATURE" | cut -c1-72)
    [ -n "$title" ] || title="$REC_branch"
    # Every gh call names the repository the branch was pushed to, and only a pull request whose
    # head is a branch of that same repository is updated (a fork's branch can share the name).
    local gh_repo=()
    [ -n "$REC_pr_repo" ] && gh_repo=(--repo "$REC_pr_repo")
    number=$(gh pr list ${gh_repo[@]+"${gh_repo[@]}"} --head "$REC_branch" --state open --json number,isCrossRepository --jq '[.[] | select(.isCrossRepository == false)][0].number // empty' 2>/dev/null || true)
    number=$(printf '%s' "$number" | tr -cd '0-9')
    if [ -n "$number" ]; then
        if ! out=$(gh pr edit "$number" ${gh_repo[@]+"${gh_repo[@]}"} --body-file "$body_copy" 2>&1); then
            printf '%s\n' "$out" | tail -5 | sed 's/^/      /'
            needs_human "gh pr edit #$number failed" "gh auth status; then re-run"
        fi
        success "Updated pull request #$number"
    else
        if ! out=$(gh pr create ${gh_repo[@]+"${gh_repo[@]}"} --head "$REC_branch" --title "$title" --body-file "$body_copy" 2>&1); then
            printf '%s\n' "$out" | tail -5 | sed 's/^/      /'
            needs_human "gh pr create failed" "gh auth status; then re-run"
        fi
        success "Opened pull request: $(printf '%s' "$out" | grep -Eo 'https?://[^[:space:]]+' | tail -1)"
    fi

    # Only the runner deletes run files, and only here. Logs stay.
    rm -f "$STATE_FILE" "$PR_BODY" "$COMMIT_MSG" "$RUN_DIR/stop-guard.json"
    rm -rf "$RUN_DIR/provenance"
    rm -f "$RECORD" "$body_copy"
    release_lock
}

# ─── Resume straight into publish when the run already finished ──
if [ "$RESUME" = true ] && load_state && [ "$S_status" = "done" ]; then
    if reason=$(done_check); then
        GIT_WRITABLE="${REC_git_writable:-$GIT_WRITABLE}"
        info "state.json says done and the done conditions hold; publishing"
        publish
        echo ""
        success "Run complete after $REC_iteration iteration(s); logs in $LOG_DIR/"
        exit 0
    else
        [ $? -eq 2 ] && needs_human "$reason" "replace it with a regular file"
        info "state.json says done, but $reason; running another iteration"
    fi
fi

# ─── Preflight probe and environment ──────────────────────────
if [ "$RESUME" = true ] && [ "$REC_iteration" -ge "$MAX" ]; then
    error "The run already used $REC_iteration iteration(s) and --max is $MAX; pass --max N with N above $REC_iteration (the skill's ceiling is $CEILING)"
    exit 1
fi
probe_git_writable
export AGENT_BLUEPRINT_RUNNER=1
export AGENT_BLUEPRINT_GIT_WRITABLE="$GIT_WRITABLE"

# ─── The loop ─────────────────────────────────────────────────
ITER="$REC_iteration"
TRANSIENT=0 STALL=0 TIMEOUTS=0 FAILED=0 DENIALS=0 RETRIES=0
PREV_FP=$(fingerprint "${S_stage:-}")
STARTED=$(date +%s)

finish() {   # CODE LINE: the summary, then exit
    local code="$1" line="$2" secs
    secs=$(( $(date +%s) - STARTED ))
    echo ""
    printf '  %b%s%b\n' "$BOLD" "$line" "$NC"
    echo "    iterations: $ITER · transient retries: $RETRIES · timeouts: $TIMEOUTS · failed iterations: $FAILED · denials logged: $DENIALS · $((secs / 60))m$((secs % 60))s"
    echo "    logs: $LOG_DIR/"
    if [ "$code" -eq 4 ] && [ "$ITER" -ge "$CEILING" ]; then
        echo "    the skill's ceiling of $CEILING iterations is reached; review the branch and start a new run for what is left"
    elif [ "$code" -eq 4 ] && [ -f "$RECORD" ]; then
        local more=$((ITER + 5)); [ "$more" -gt "$CEILING" ] && more=$CEILING
        echo "    continue with: $0 --host $RUN_HOST --resume --max $more"
    elif [ "$code" -ne 0 ] && [ -f "$RECORD" ]; then
        echo "    continue with: $0 --host $RUN_HOST --resume"
    fi
    exit "$code"
}

while :; do
    if [ "$ITER" -ge "$MAX" ]; then
        finish 4 "Stopped: reached --max $MAX iterations without finishing."
    fi
    N=$((ITER + 1))
    LOG="$LOG_DIR/iteration-$N.log"
    LASTMSG="$LOG_DIR/iteration-$N.last"
    PROMPT="$(host_skill_ref "$RUN_HOST" "$AB_SKILL_NAME" "$PLUGIN_DIR") $FEATURE --external$SKILL_FLAGS

Ship runner iteration $N of at most $MAX. Use the $AB_SKILL_NAME skill for the feature above. The run state file is $STATE_FILE: if it exists, read it first and continue from the stage it names; otherwise start at Stage 0. AGENT_BLUEPRINT_RUNNER=1 and AGENT_BLUEPRINT_GIT_WRITABLE=$GIT_WRITABLE are set in the environment. Leave publishing to the runner: when the work is finished, set status done in $STATE_FILE with the commits (or $COMMIT_MSG) and $PR_BODY in place, then stop. Never delete a file under $RUN_DIR."

    echo ""
    if LINK=$(tree_link); then
        needs_human "$LINK is a symlink; the runner does not write through links" "replace it with a regular file or folder"
    fi
    transition "iteration $N: starting $RUN_HOST ($(date '+%H:%M:%S'))"
    {
        echo "=== iteration $N · $(now_utc) · host=$RUN_HOST · timeout ${TIMEOUT}s ==="
    } >> "$LOG"
    # A transient retry appends to the same log; classify only what this attempt wrote.
    OFFSET=$(wc -c < "$LOG" | tr -d ' ')
    attempt_output() { tail -c +$((OFFSET + 1)) "$LOG"; }
    RC=0
    run_host "$TIMEOUT" "$LOG" "$PROMPT" "$LASTMSG" || RC=$?

    if [ "$RC" -eq 124 ]; then
        TIMEOUTS=$((TIMEOUTS + 1))
        echo "=== killed after ${TIMEOUT}s (timeout) ===" >> "$LOG"
        transition "iteration $N: timeout after ${TIMEOUT}s; the process group was killed"
    elif [ "$RC" -ne 0 ] && attempt_output | grep -Eiq "$HOST_TRANSIENT_ERE"; then
        TRANSIENT=$((TRANSIENT + 1))
        RETRIES=$((RETRIES + 1))
        if [ "$TRANSIENT" -gt "$MAX_TRANSIENT" ]; then
            finish 3 "status: needs-human — the host failed $TRANSIENT times in a row with a transient error (see $LOG)."
        fi
        transition "iteration $N: transient host error (exit $RC: $(attempt_output | grep -Eio "$HOST_TRANSIENT_ERE" | sed -n '1p')); backing off ${BACKOFF}s, not counted"
        sleep "$BACKOFF"
        continue
    fi
    TRANSIENT=0
    if attempt_output | grep -Eiq "$HOST_DENIAL_ERE"; then
        DENIALS=$((DENIALS + 1))
        transition "iteration $N: the host denied a command (logged in $LOG); continuing"
    fi
    [ "$RC" -ne 0 ] && [ "$RC" -ne 124 ] && warn "iteration $N: $RUN_HOST exited $RC (checking the state file, not the exit code)"
    # `cut` closes the pipe early on a long message; `|| true` keeps that from ending the runner. The
    # two tr calls work on bytes (LC_ALL=C) so a stray byte in the host's text cannot fail them, and
    # the cut counts characters, so it never ends inside one.
    LAST=$(host_final_message "$RUN_HOST" "$LOG" "$LASTMSG" 2>/dev/null | LC_ALL=C tr -d '\000-\010\013-\037\177' | LC_ALL=C tr '\n' ' ' | cut -c1-160 || true)
    [ -n "$LAST" ] && printf '    %blast message: %s%b\n' "$DIM" "$LAST" "$NC"

    [ "$GIT_WRITABLE" = 0 ] && commit_for_skill "$N"

    ITER="$N"
    REC_iteration="$ITER"
    save_record

    if ! load_state; then
        FAILED=$((FAILED + 1))
        transition "iteration $N: failed — $S_error"
        S_stage="invalid"
    else
        transition "iteration $N: status $S_status, stage $S_stage${S_reason:+ — $S_reason}"
    fi

    FP=$(fingerprint "$S_stage")
    if [ "$FP" = "$PREV_FP" ]; then STALL=$((STALL + 1)); else STALL=0; fi
    PREV_FP="$FP"

    if [ -z "$S_error" ]; then
        case "$S_status" in
            "done")
                if reason=$(done_check); then
                    publish
                    finish 0 "Run complete: published after $ITER iteration(s)."
                else
                    [ $? -eq 2 ] && needs_human "$reason" "replace it with a regular file"
                fi
                FAILED=$((FAILED + 1))
                transition "iteration $N: done claimed, but $reason; not done"
                ;;
            blocked)     finish 2 "status: blocked — ${S_reason:-no reason given}" ;;
            needs-human) finish 3 "status: needs-human — ${S_reason:-no reason given}" ;;
        esac
    fi
    if [ "$STALL" -ge 2 ]; then
        finish 2 "status: blocked — no progress for two iterations: stage, commits and team ledger unchanged (stage ${S_stage})."
    fi
done
