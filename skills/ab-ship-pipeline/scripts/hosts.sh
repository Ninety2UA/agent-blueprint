#!/usr/bin/env bash
# hosts.sh — the host adapter table for the ship runner and the smoke test (KTD15).
#
# Source this file; it defines functions, never runs anything. One row per host
# (claude, codex, agy, grok, pi, cursor-agent, hermes, amp), each answered by a
# function that takes the host name:
#
#   host_known HOST            0 when HOST is in the table
#   host_bin HOST              the executable (Cursor is always cursor-agent: Grok Build
#                              installs a conflicting `agent` binary)
#   host_posture HOST          the approval posture, in words, for the log
#   host_unguarded HOST        prints 1 when the posture runs with no guard at all, so the
#                              runner requires --allow-unguarded (pi, amp, agy)
#   host_git_writable_default HOST
#                              prints the expected answer to "can this posture write .git";
#                              the runner's preflight probe (host_probe_prompt) decides
#   host_timeout HOST          the default per-iteration timeout, seconds
#   host_max_helpers HOST      helpers per wave, from host-limits.tsv next to this file
#                              (a byte-identical copy of the ab-orchestrate owner, kept by
#                              scripts/sync-shared.py); "-" means no documented cap
#   host_skill_ref HOST        how the prompt names the skill on that host
#   host_preflight HOST        auth and trust checks; prints the fix; non-zero on a hard failure
#   host_run HOST PROMPT PLUGIN_DIR LASTMSG_FILE
#                              exec the host headless on PROMPT; raw output to stdout/stderr
#   host_final_message HOST LOG LASTMSG_FILE
#                              prints the final assistant message from the run's output
#   host_probe_prompt          the prompt the .git-writability probe sends
#
# Verified on this machine (2026-10-01): claude 2.1.284, codex 0.155.1, agy 1.2.12,
# grok 1.0.34, cursor-agent 2026.09.10. pi, hermes and amp are not installed here; their
# rows follow the vendor docs and are marked "unverified" below. The `fake` host is the
# test double in tests/runner/fake-host.sh and exists only while AGENT_BLUEPRINT_FAKE_HOST
# names it, so a real run can never pick it by accident.
#
# Every prompt is passed as one quoted argument; nothing here splices text into a shell string.

AB_HOSTS="claude codex agy grok pi cursor-agent hermes amp"
AB_SKILL_NAME="ab-ship-pipeline"
AB_HOSTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AB_HOST_LIMITS="$AB_HOSTS_DIR/host-limits.tsv"

# Output the runner shares; a sourcing script may define its own first.
type info    >/dev/null 2>&1 || info()    { echo "  - $1"; }
type warn    >/dev/null 2>&1 || warn()    { echo "  ! $1"; }
type error   >/dev/null 2>&1 || error()   { echo "  x $1" >&2; }
type success >/dev/null 2>&1 || success() { echo "  + $1"; }

# Host output that means "try again later", not "the run failed": quota, rate limits,
# overload, and an auth token that needs a refresh. Matched case-insensitively against
# the iteration log when the host exits non-zero. Both constants are read by the sourcing script.
# shellcheck disable=SC2034
HOST_TRANSIENT_ERE='rate[ _-]?limit|quota|too many requests|\b429\b|\b502\b|\b503\b|overloaded|usage limit|at capacity|token (has )?expired|re-?authenticat|refresh(ing)? (the )?(auth|token|credential)|ECONNRESET|ETIMEDOUT|AGY_ERROR'
# A denied destructive command: logged, never fatal.
# shellcheck disable=SC2034
HOST_DENIAL_ERE='"permission_denials": *\[ *\{|permission denied|denied[: ]|was denied|not permitted|blocked by (a )?(deny|policy|hook|rule)'

host_known() {
    case " $AB_HOSTS " in *" $1 "*) return 0 ;; esac
    [ "$1" = fake ] && [ -n "${AGENT_BLUEPRINT_FAKE_HOST:-}" ] && return 0
    return 1
}

host_bin() {
    case "$1" in
        cursor-agent) echo "cursor-agent" ;;
        fake)         echo "${AGENT_BLUEPRINT_FAKE_HOST:-fake-host.sh}" ;;
        *)            echo "$1" ;;
    esac
}

host_posture() {
    case "$1" in
        claude)       echo "claude -p --permission-mode auto (auto-approve safe tools; a dangerous rm is denied)" ;;
        codex)        echo "codex exec --sandbox workspace-write with network on (.git is read-only in this sandbox)" ;;
        agy)          echo "agy -p --dangerously-skip-permissions (no guard: hooks do not fire under this flag)" ;;
        grok)         echo "grok -p --always-approve --sandbox workspace (deny rules and PreToolUse hooks still apply)" ;;
        pi)           echo "pi -p --approve (Pi has no permission system and no sandbox)" ;;
        cursor-agent) echo "cursor-agent -p --force --sandbox enabled --trust (commands allowed unless denied; sandboxed)" ;;
        hermes)       echo "hermes -z one-shot (approvals.single_query_mode deny blocks dangerous commands)" ;;
        amp)          echo "amp -x (no approvals by default)" ;;
        fake)         echo "fake host, scenario-driven (tests only)" ;;
        *)            return 1 ;;
    esac
}

# 1 = the posture has no guard of any kind, so a run needs the explicit opt-in flag.
host_unguarded() {
    case "$1" in
        pi|amp|agy) echo 1 ;;
        fake)       echo "${AGENT_BLUEPRINT_FAKE_UNGUARDED:-0}" ;;
        *)          echo 0 ;;
    esac
}

# Expected .git writability of the posture; the runner's live probe has the last word.
host_git_writable_default() {
    case "$1" in
        codex)        echo 0 ;;   # workspace-write keeps .git read-only (KTD7)
        cursor-agent) echo 0 ;;   # the Cursor sandbox protects .git/hooks; the probe decides the rest
        fake)         echo "${AGENT_BLUEPRINT_FAKE_GIT_WRITABLE:-1}" ;;
        *)            echo 1 ;;
    esac
}

host_timeout() {
    case "$1" in
        agy)  echo 2400 ;;   # headless hang reports (antigravity-cli#548): a shorter leash
        fake) echo 60 ;;
        *)    echo 3600 ;;
    esac
}

# Helpers per wave in a headless run, from the shared table. Prints "-" for no cap,
# and 2 for a host the table does not list (the ab-orchestrate default).
host_max_helpers() {
    local row
    [ -f "$AB_HOST_LIMITS" ] || { echo 2; return 0; }
    row=$(awk -F'\t' -v h="$1" '$1 == h { print $3; exit }' "$AB_HOST_LIMITS")
    [ -n "$row" ] && echo "$row" || echo 2
}

host_skill_ref() {
    case "$1" in
        claude|grok)  echo "/$AB_SKILL_NAME" ;;
        codex)        echo "\$$AB_SKILL_NAME" ;;
        pi)           echo "/skill:$AB_SKILL_NAME" ;;
        *)            echo "the $AB_SKILL_NAME skill" ;;
    esac
}

# The probe: one shell command that touches a marker inside .git, nothing else. The runner
# checks for the marker; the reply text is not trusted.
host_probe_prompt() {
    echo "Run exactly this shell command and nothing else, then reply with the single word OK: touch .git/agent-blueprint-probe"
}

# ── preflight: auth and trust ────────────────────────────────
# Prints what it checked. Returns 1 only on a hard failure the run cannot survive.

_agy_settings() { echo "${AGY_SETTINGS_FILE:-$HOME/.gemini/antigravity-cli/settings.json}"; }

# json_bool FILE KEY: prints true/false/missing for a top-level boolean key.
_json_bool() {
    local file="$1" key="$2"
    [ -f "$file" ] || { echo missing; return 0; }
    if command -v python3 >/dev/null 2>&1; then
        python3 - "$file" "$key" <<'PY'
import json, sys
try:
    v = json.load(open(sys.argv[1], encoding="utf-8")).get(sys.argv[2])
except Exception:
    v = None
print("true" if v is True else "false" if v is False else "missing")
PY
    else
        grep -Eq "\"$key\"[[:space:]]*:[[:space:]]*true" "$file" && echo true || echo missing
    fi
}

host_preflight() {
    local host="$1" repo="${2:-$PWD}" bin out
    bin=$(host_bin "$host")
    if [ "$host" = fake ]; then
        [ -f "$bin" ] || { error "fake host script not found: $bin"; return 1; }
    elif ! command -v "$bin" >/dev/null 2>&1; then
        error "$host is not installed ($bin not on PATH)"
        return 1
    fi
    case "$host" in
        claude)
            out=$(claude auth status 2>/dev/null || true)
            if printf '%s' "$out" | grep -q '"loggedIn": *true'; then
                info "claude: logged in"
            elif [ -n "$out" ]; then
                error "claude: not logged in. Fix: claude auth login"
                return 1
            else
                warn "claude: could not read auth status (older CLI?); continuing"
            fi
            info "claude: -p skips the workspace trust dialog; nothing to trust" ;;
        codex)
            if codex login status >/dev/null 2>&1; then
                info "codex: logged in"
            else
                error "codex: not logged in. Fix: codex login"
                return 1
            fi
            if grep -Fq "[projects.\"$repo\"]" "${CODEX_HOME:-$HOME/.codex}/config.toml" 2>/dev/null; then
                info "codex: project is trusted"
            else
                warn "codex: project not in ${CODEX_HOME:-$HOME/.codex}/config.toml [projects]; AGENTS.md and .codex/ are skipped until you run codex once here and accept trust"
            fi ;;
        agy)
            local settings
            settings=$(_agy_settings)
            if [ -f "$HOME/.gemini/oauth_creds.json" ] || [ -n "${GEMINI_API_KEY:-}" ]; then
                info "agy: credentials found"
            else
                warn "agy: no credentials found; run agy once and sign in"
            fi
            case $(_json_bool "$settings" allowNonWorkspaceAccess) in
                true) info "agy: allowNonWorkspaceAccess is on" ;;
                *)
                    error "agy: allowNonWorkspaceAccess is not true in $settings; headless runs stall when the skill reads plugin files outside the workspace."
                    echo "    Fix: python3 - <<'PY'" >&2
                    echo "import json,os; p=os.path.expanduser('$settings'); d=json.load(open(p)) if os.path.exists(p) else {}" >&2
                    echo "d.update({'allowNonWorkspaceAccess': True, 'toolPermission': 'always-proceed', 'artifactReviewPolicy': 'always-proceed'}); json.dump(d, open(p, 'w'), indent=2)" >&2
                    echo "PY" >&2
                    return 1 ;;
            esac
            if grep -Fq "\"$repo\"" "$settings" 2>/dev/null; then
                info "agy: workspace is trusted"
            else
                warn "agy: $repo is not in trustedWorkspaces of $settings (a parent may be); add it if the first iteration stalls"
            fi ;;
        grok)
            out=$(grok models 2>&1 || true)
            if printf '%s' "$out" | grep -qi 'not authenticated'; then
                error "grok: not authenticated. Fix: grok login"
                return 1
            fi
            info "grok: authenticated; project hooks need /hooks-trust or --trust only when the repo ships its own" ;;
        cursor-agent)
            if [ -n "${CURSOR_API_KEY:-}" ] || cursor-agent status 2>/dev/null | grep -qi 'logged in'; then
                info "cursor-agent: logged in; --trust is passed for the workspace"
            else
                error "cursor-agent: not logged in. Fix: cursor-agent login (or set CURSOR_API_KEY)"
                return 1
            fi ;;
        pi)   # unverified: pi is not installed on the machine this was written on
            warn "pi: no auth status command; a provider key must be configured (run pi once). --approve trusts the project" ;;
        hermes)   # unverified
            if [ -f "$HOME/.hermes/config.yaml" ]; then
                info "hermes: config found; skills load from skills.external_dirs"
            else
                warn "hermes: no ~/.hermes/config.yaml; run hermes once to set up a provider"
            fi ;;
        amp)   # unverified
            if [ -n "${AMP_API_KEY:-}" ] || [ -d "$HOME/.config/amp" ]; then
                info "amp: credentials found"
            else
                warn "amp: no AMP_API_KEY and no ~/.config/amp; run amp login"
            fi ;;
        fake)
            info "fake: no auth" ;;
        *)
            error "unknown host: $host"; return 1 ;;
    esac
    return 0
}

# ── running a prompt ─────────────────────────────────────────
# host_run HOST PROMPT PLUGIN_DIR LASTMSG_FILE: replaces the current process with the host
# (the runner starts it in its own process group and kills that group on timeout).
# Output goes to the caller's stdout/stderr; stdin is closed, since codex exec waits on it.
host_run() {
    local host="$1" prompt="$2" plugin_dir="${3:-}" lastmsg="${4:-}"
    case "$host" in
        claude)
            if [ -n "$plugin_dir" ]; then
                exec claude -p --permission-mode auto --output-format json --plugin-dir "$plugin_dir" "$prompt" </dev/null
            fi
            exec claude -p --permission-mode auto --output-format json "$prompt" </dev/null ;;
        codex)
            # No plugin-dir flag: Codex finds skills in ~/.agents/skills and its plugin cache.
            exec codex exec --skip-git-repo-check -s workspace-write \
                -c sandbox_workspace_write.network_access=true \
                -C "$PWD" -o "${lastmsg:-/dev/null}" "$prompt" </dev/null ;;
        agy)
            if [ -n "$plugin_dir" ]; then
                exec agy -p "$prompt" --output-format json --dangerously-skip-permissions --add-dir "$plugin_dir" </dev/null
            fi
            exec agy -p "$prompt" --output-format json --dangerously-skip-permissions </dev/null ;;
        grok)
            # Plain output hangs after the answer on 1.0.34; json exits. No plugin-dir flag on this version.
            exec grok -p "$prompt" --always-approve --sandbox workspace --output-format json --cwd "$PWD" </dev/null ;;
        pi)   # unverified
            exec pi -p --approve "$prompt" </dev/null ;;
        cursor-agent)
            if [ -n "$plugin_dir" ]; then
                exec cursor-agent -p --force --sandbox enabled --trust --output-format json --plugin-dir "$plugin_dir" "$prompt" </dev/null
            fi
            exec cursor-agent -p --force --sandbox enabled --trust --output-format json "$prompt" </dev/null ;;
        hermes)   # unverified; -s <skill> preload with -z is unconfirmed, so the prompt names the skill
            exec hermes -z "$prompt" </dev/null ;;
        amp)   # unverified
            exec amp -x "$prompt" </dev/null ;;
        fake)
            exec bash "$(host_bin fake)" "$prompt" </dev/null ;;
        *)
            error "unknown host: $host"; return 1 ;;
    esac
}

# host_final_message HOST LOG LASTMSG_FILE: the final assistant text, for the summary only.
host_final_message() {
    local host="$1" log="$2" lastmsg="${3:-}"
    case "$host" in
        codex)
            [ -n "$lastmsg" ] && [ -f "$lastmsg" ] && cat "$lastmsg"; return 0 ;;
        claude|cursor-agent|grok|agy|fake)
            # claude and cursor-agent: .result; grok: .text; agy: unverified, tries the same names.
            if command -v python3 >/dev/null 2>&1; then
                python3 - "$log" <<'PY'
import json, sys
text = open(sys.argv[1], encoding="utf-8", errors="replace").read()
doc = None
try:
    doc = json.loads(text[text.index("{"):]) if "{" in text else None
except Exception:
    for line in reversed(text.splitlines()):
        line = line.strip()
        if line.startswith("{"):
            try:
                doc = json.loads(line); break
            except Exception:
                continue
if isinstance(doc, dict):
    for key in ("result", "text", "response", "content", "message"):
        v = doc.get(key)
        if isinstance(v, str):
            print(v); break
PY
            else
                tail -n 20 "$log"
            fi ;;
        *)
            tail -n 20 "$log" ;;
    esac
    return 0
}
