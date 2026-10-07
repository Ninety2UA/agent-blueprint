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
#   host_skill_ref HOST [SKILL] [PLUGIN_DIR]
#                              how the prompt names the skill on that host (default: this skill)
#   host_preflight HOST        auth and trust checks; prints the fix; non-zero on a hard failure
#   host_run HOST PROMPT PLUGIN_DIR LASTMSG_FILE [FLAG...]
#                              exec the host headless on PROMPT; raw output to stdout/stderr;
#                              extra FLAGs go to the host first (the smoke test's helpers-off run)
#   host_final_message HOST LOG LASTMSG_FILE
#                              prints the final assistant message from the run's output
#   host_probe_prompt          the prompt the .git-writability probe sends
#
# Rows the smoke test reads (tests/smoke/run-smoke.sh, U15), so the two never disagree:
#   host_version HOST          the installed version, one line
#   host_helpers_off_args HOST the flags that disable helpers for one run, one per line; empty = no switch
#   host_hooks HOST            native (the plugin declares hooks there), foreign (may import Claude Code
#                              plugins and their hooks, which must stand down), none
#   host_manual_only HOST      1 when the host enforces disable-model-invocation (KTD12)
#   host_catalog_dirs HOST [PLUGIN_DIR]
#                              every skills directory the host scans, one per line (KTD18)
#   host_usage HOST LOG        "tokens=N cost=USD" from the run's output where the host reports it
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
    local host="$1" skill="${2:-$AB_SKILL_NAME}" plugin_dir="${3:-}"
    case "$host" in
        claude)
            # A plugin loaded with --plugin-dir is namespaced by its name (/agent-blueprint:ab-...).
            if [ -n "$plugin_dir" ]; then echo "/agent-blueprint:$skill"; else echo "/$skill"; fi ;;
        grok|agy)     echo "/$skill" ;;
        codex)        echo "\$$skill" ;;
        pi)           echo "/skill:$skill" ;;
        *)            echo "the $skill skill" ;;
    esac
}

host_version() {
    local bin
    bin=$(host_bin "$1")
    case "$1" in
        fake) echo "fake" ;;
        *)    command -v "$bin" >/dev/null 2>&1 && "$bin" --version 2>/dev/null | head -1 | tr -d '\r' || echo "not installed" ;;
    esac
    return 0
}

# The flags that disable helpers (subagents) for one run, one per line; nothing when the host has
# no switch, and the smoke test renders n/a. Codex has none that can be checked: with
# `-c features.multi_agent=false` (0.155.1) the agent still reported helper runs, and `codex exec`
# prints no tool calls that would settle it, so the smoke test does not claim a Codex switch.
host_helpers_off_args() {
    case "$1" in
        claude) printf '%s\n' --disallowedTools Agent Task ;;
        fake)   [ -n "${AGENT_BLUEPRINT_FAKE_HELPERS_OFF:-}" ] && printf '%s\n' "$AGENT_BLUEPRINT_FAKE_HELPERS_OFF" ;;
        *) ;;
    esac
    return 0
}

# Where the plugin's hooks stand on each host (KTD11): native = declared in this host's manifest;
# foreign = the host imports Claude Code plugins and could run their hooks, so every handler must
# stand down there; none = no hook path at all.
host_hooks() {
    case "$1" in
        claude|codex)          echo native ;;
        agy|grok|cursor-agent) echo foreign ;;
        fake)                  echo "${AGENT_BLUEPRINT_FAKE_HOOKS:-none}" ;;
        *)                     echo none ;;
    esac
}

# 1 when the host honors disable-model-invocation (KTD12); Amp and Hermes cannot enforce it.
host_manual_only() {
    case "$1" in
        amp|hermes) echo 0 ;;
        *)          echo 1 ;;
    esac
}

# Every skills directory the host scans, one existing path per line, from the U11 fact sheet
# (KTD18: the smoke test counts each ab- name across them). Claude Code counts the installs
# enabled in settings.json (installed_plugins.json gives their paths) plus PLUGIN_DIR; Codex counts
# the plugins enabled in config.toml plus the shared folders. A path that does not exist is skipped.
host_catalog_dirs() {
    local host="$1" plugin_dir="${2:-}" d cfg
    case "$host" in
        claude)
            cfg="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
            _enabled_plugin_skill_dirs claude "$cfg"
            _existing "$cfg/skills" ".claude/skills"
            [ -n "$plugin_dir" ] && _existing "$plugin_dir/skills" ;;
        codex)
            cfg="${CODEX_HOME:-$HOME/.codex}"
            _enabled_plugin_skill_dirs codex "$cfg"
            _existing "$HOME/.agents/skills" "$cfg/skills" ".agents/skills" ".codex/skills" ;;
        agy)
            for d in "$HOME"/.gemini/config/plugins/*/skills "$HOME"/.gemini/antigravity-cli/plugins/*/skills .agents/plugins/*/skills; do
                _existing "$d"
            done
            _existing "$HOME/.gemini/antigravity-cli/skills" "$HOME/.gemini/config/skills" ".agents/skills" ".agent/skills" ;;
        grok)
            for d in "$HOME"/.grok/plugins/*/skills .grok/plugins/*/skills; do _existing "$d"; done
            _existing "$HOME/.agents/skills" "$HOME/.grok/skills" ".grok/skills" "$HOME/.claude/skills" ".claude/skills" ;;
        pi)
            _existing "$HOME/.pi/agent/skills" ".pi/skills" "$HOME/.agents/skills" ".agents/skills" ;;
        cursor-agent)
            for d in "$HOME"/.cursor/plugins/local/*/skills; do _existing "$d"; done
            # Cursor imports the plugins Claude Code has enabled, with their skills.
            _enabled_plugin_skill_dirs claude "${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
            _existing ".agents/skills" ".cursor/skills" "$HOME/.agents/skills" "$HOME/.cursor/skills" \
                      ".claude/skills" ".codex/skills" "$HOME/.claude/skills" "$HOME/.codex/skills"
            [ -n "$plugin_dir" ] && _existing "$plugin_dir/skills" ;;
        hermes)
            _existing "$HOME/.hermes/skills" ".hermes/skills" ".agents/skills"
            # skills.external_dirs from ~/.hermes/config.yaml: the "- path" lines under that key.
            if [ -f "$HOME/.hermes/config.yaml" ]; then
                sed -n '/^[[:space:]]*external_dirs:/,/^[[:space:]]*[a-z_]*:/p' "$HOME/.hermes/config.yaml" \
                    | sed -n 's/^[[:space:]]*-[[:space:]]*"\{0,1\}\([^"]*\)"\{0,1\}[[:space:]]*$/\1/p' \
                    | while IFS= read -r d; do _existing "${d/#\~/$HOME}"; done
            fi ;;
        amp)
            for d in "$HOME"/.claude/plugins/cache/*/*/*/skills; do _existing "$d"; done
            _existing "$HOME/.config/agents/skills" "$HOME/.agents/skills" "$HOME/.config/amp/skills" \
                      ".agents/skills" ".claude/skills" "$HOME/.claude/skills" ;;
        fake)
            printf '%s\n' "${AGENT_BLUEPRINT_FAKE_CATALOG:-}" | tr ':' '\n' | while IFS= read -r d; do _existing "$d"; done
            [ -n "$plugin_dir" ] && _existing "$plugin_dir/skills" ;;
        *) ;;
    esac
    return 0
}
_existing() { local p; for p in "$@"; do [ -d "$p" ] && echo "$p"; done; return 0; }
# The skills directories of the plugins a host has enabled: Claude Code from settings.json +
# installed_plugins.json, Codex from config.toml [plugins."name@marketplace"] enabled = true
# with the newest cached version under plugins/cache/<marketplace>/<name>/.
_enabled_plugin_skill_dirs() {
    command -v python3 >/dev/null 2>&1 || return 0
    python3 - "$1" "$2" <<'PY'
import json, os, re, sys
host, cfg = sys.argv[1], sys.argv[2]
dirs = []
try:
    if host == "claude":
        settings = json.load(open(os.path.join(cfg, "settings.json"), encoding="utf-8"))
        enabled = {k for k, v in (settings.get("enabledPlugins") or {}).items() if v is True}
        installed = json.load(open(os.path.join(cfg, "plugins", "installed_plugins.json"), encoding="utf-8")).get("plugins", {})
        for key, entries in installed.items():
            if key not in enabled:
                continue
            for e in (entries if isinstance(entries, list) else [entries]):
                p = e.get("installPath") if isinstance(e, dict) else None
                if p:
                    dirs.append(os.path.join(p, "skills"))
    else:
        text = open(os.path.join(cfg, "config.toml"), encoding="utf-8").read()
        for m in re.finditer(r'^\[plugins\."([^"@]+)@([^"]+)"\]\n((?:(?!^\[).*\n?)*)', text, re.M):
            name, market, body = m.group(1), m.group(2), m.group(3)
            if not re.search(r"^\s*enabled\s*=\s*true", body, re.M):
                continue
            base = os.path.join(cfg, "plugins", "cache", market, name)
            if os.path.isdir(base):
                versions = sorted(os.listdir(base), key=lambda v: [int(x) if x.isdigit() else x for x in re.split(r"[.-]", v)])
                if versions:
                    dirs.append(os.path.join(base, versions[-1], "skills"))
except Exception:
    pass
for d in dirs:
    if os.path.isdir(d):
        print(d)
PY
    return 0
}

# Token use and cost from the run's output, as "tokens=N cost=USD"; a missing figure prints n/a.
# Claude Code and Cursor: usage.{input,output,cache_*} and total_cost_usd in the JSON result;
# Codex -o holds only the last message, so n/a; grok and agy: the same keys if their JSON has them.
host_usage() {
    local host="$1" log="$2"
    case "$host" in
        codex|pi|hermes|amp) echo "tokens=n/a cost=n/a"; return 0 ;;
    esac
    command -v python3 >/dev/null 2>&1 || { echo "tokens=n/a cost=n/a"; return 0; }
    host_last_json "$log" | python3 -c '
import json, sys
raw = sys.stdin.read().strip()
doc = json.loads(raw) if raw else None
tokens = cost = "n/a"
if isinstance(doc, dict):
    usage = doc.get("usage")
    if isinstance(usage, dict):
        keys = ("input_tokens", "output_tokens", "cache_creation_input_tokens", "cache_read_input_tokens")
        vals = [usage.get(k) for k in keys if isinstance(usage.get(k), (int, float))]
        if vals:
            tokens = int(sum(vals))
        elif isinstance(usage.get("total_tokens"), (int, float)):
            tokens = int(usage["total_tokens"])
    for k in ("total_cost_usd", "cost_usd"):
        if isinstance(doc.get(k), (int, float)):
            cost = "%.4f" % doc[k]; break
print("tokens=%s cost=%s" % (tokens, cost))
'
    return 0
}

# host_last_json LOG: the last JSON object a host wrote to LOG (a JSON result after the prompt
# header, or the last line that is one), compact, or nothing. Needs python3.
host_last_json() {
    python3 - "$1" <<'PY'
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
    print(json.dumps(doc))
PY
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
            # Antigravity 1.2.16 reads and writes outside the workspace and runs commands in a headless
            # run with --dangerously-skip-permissions alone (verified 2026-10-04); 1.2.12 stalled on a read
            # outside the workspace without allowNonWorkspaceAccess, so an unset key is a warning only.
            case $(_json_bool "$settings" allowNonWorkspaceAccess) in
                true) info "agy: allowNonWorkspaceAccess is on" ;;
                *) warn "agy: allowNonWorkspaceAccess is not set in $settings; not needed on 1.2.16 and later, but set it if a run stalls reading a file outside the workspace" ;;
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
# host_run HOST PROMPT PLUGIN_DIR LASTMSG_FILE [FLAG...]: replaces the current process with the
# host (the runner starts it in its own process group and kills that group on timeout).
# Output goes to the caller's stdout/stderr; stdin is closed, since codex exec waits on it.
# Extra FLAGs come right after the binary, before the prompt and the fixed flags, so a
# variadic option such as --disallowedTools ends at the next flag and cannot swallow the prompt.
host_run() {
    local host="$1" prompt="$2" plugin_dir="${3:-}" lastmsg="${4:-}"
    if [ $# -ge 4 ]; then shift 4; else shift $#; fi
    case "$host" in
        claude)
            if [ -n "$plugin_dir" ]; then
                exec claude "$@" -p --permission-mode auto --output-format json --plugin-dir "$plugin_dir" "$prompt" </dev/null
            fi
            exec claude "$@" -p --permission-mode auto --output-format json "$prompt" </dev/null ;;
        codex)
            # No plugin-dir flag: Codex finds skills in ~/.agents/skills and its plugin cache.
            exec codex exec "$@" --skip-git-repo-check -s workspace-write \
                -c sandbox_workspace_write.network_access=true \
                -C "$PWD" -o "${lastmsg:-/dev/null}" "$prompt" </dev/null ;;
        agy)
            if [ -n "$plugin_dir" ]; then
                exec agy "$@" -p "$prompt" --output-format json --dangerously-skip-permissions --add-dir "$plugin_dir" </dev/null
            fi
            exec agy "$@" -p "$prompt" --output-format json --dangerously-skip-permissions </dev/null ;;
        grok)
            # Plain output hangs after the answer on 1.0.34; json exits. No plugin-dir flag on this version.
            exec grok "$@" -p "$prompt" --always-approve --sandbox workspace --output-format json --cwd "$PWD" </dev/null ;;
        pi)   # unverified
            exec pi "$@" -p --approve "$prompt" </dev/null ;;
        cursor-agent)
            if [ -n "$plugin_dir" ]; then
                exec cursor-agent "$@" -p --force --sandbox enabled --trust --output-format json --plugin-dir "$plugin_dir" "$prompt" </dev/null
            fi
            exec cursor-agent "$@" -p --force --sandbox enabled --trust --output-format json "$prompt" </dev/null ;;
        hermes)   # unverified; -s <skill> preload with -z is unconfirmed, so the prompt names the skill
            exec hermes "$@" -z "$prompt" </dev/null ;;
        amp)   # unverified
            exec amp "$@" -x "$prompt" </dev/null ;;
        fake)
            exec bash "$(host_bin fake)" "$prompt" "$@" </dev/null ;;
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
                host_last_json "$log" | python3 -c '
import json, sys
raw = sys.stdin.read().strip()
doc = json.loads(raw) if raw else None
if isinstance(doc, dict):
    for key in ("result", "text", "response", "content", "message"):
        v = doc.get(key)
        if isinstance(v, str):
            print(v); break
'
            else
                tail -n 20 "$log"
            fi ;;
        *)
            tail -n 20 "$log" ;;
    esac
    return 0
}
