#!/usr/bin/env bash
# install.sh — Install Agent Blueprint for every supported tool found on PATH.
#
# Default routes install straight from GitHub and use each tool's own updater:
#   Claude Code / Codex   marketplace add Ninety2UA/agent-blueprint, then plugin install / add
#   Antigravity          agy plugin install https://github.com/Ninety2UA/agent-blueprint
#   Grok Build           grok plugin install Ninety2UA/agent-blueprint --trust
#   Pi                   pi install git:github.com/Ninety2UA/agent-blueprint
#   Cursor CLI           marketplace add the GitHub URL, then /plugin inside a session
#   Hermes / Amp         recorded copies in ~/.hermes/skills / ~/.config/amp/skills
# Cursor and Amp use Claude Code's plugin when present. Recorded standalone routes are retired.
# A tool whose route fails is reported at the end (exit 1); the other tools still install.
# Ctrl-C, or a tool that exits 130 or 143, stops the whole run with that status.
# Cursor registrations made here are recorded in
# ${XDG_CONFIG_HOME:-$HOME/.config}/agent-blueprint/install-routes.json.
# Copies keep .agent-blueprint-install.json; only recorded skills are replaced or removed.
# Re-runs retire recorded v4.0 copies only when their installed readers are in this run.
# Python 3 (also used by the scaffold and host catalog) reads and writes the JSON records.
#
# Usage: bash install.sh [options] [PROJECT_DIR]
#   --local            Use this checkout instead of GitHub, replacing a differing source;
#                      Cursor prints cursor-agent --plugin-dir <checkout>, with no marketplace call
#   --dry-run          Print commands and copy/removal actions; change nothing
#   --only HOSTS       Comma-separated claude,codex,agy,grok,pi,cursor-agent,hermes,amp
#   --copy-dir DIR     Explicit extra skills copy with its own record (also AGENT_BLUEPRINT_COPY_DIR)
#   --scaffold DIR     Only scaffold project files, merging into DIR
#   PROJECT_DIR        After installing, scaffold this project too
#   --legacy           Retired in v4; prints migration guidance and exits 2
#   --force, --no-overwrite   Accepted for v3 compatibility and ignored

set -euo pipefail

if [ -t 1 ]; then
    GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BLUE='\033[0;34m'; DIM='\033[2m'; BOLD='\033[1m'; NC='\033[0m'
else
    GREEN=''; YELLOW=''; RED=''; BLUE=''; DIM=''; BOLD=''; NC=''
fi
info()    { echo -e "  ${BLUE}▸${NC} $1"; }
success() { echo -e "  ${GREEN}✓${NC} $1"; }
warn()    { echo -e "  ${YELLOW}!${NC} $1"; }
error()   { echo -e "  ${RED}✗${NC} $1" >&2; }
plan()    { echo -e "  ${DIM}would run:${NC} $1"; }

SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
# The host list is the ship runner's adapter table (AB_HOSTS), so the two never drift.
# shellcheck source=skills/ab-ship-pipeline/scripts/hosts.sh disable=SC1091
. "$SOURCE_DIR/skills/ab-ship-pipeline/scripts/hosts.sh"
# shellcheck disable=SC2153   # AB_HOSTS comes from hosts.sh, sourced above
read -r -a ALL_HOSTS <<< "$AB_HOSTS"
DRY_RUN=false
LOCAL=false
ONLY=""
COPY_DIR="${AGENT_BLUEPRINT_COPY_DIR:-}"
COPY_DIR_SET=false
if [ -n "${AGENT_BLUEPRINT_COPY_DIR:-}" ]; then COPY_DIR_SET=true; fi
SCAFFOLD_ONLY=""
PROJECT_DIR=""

while [ $# -gt 0 ]; do
    case "$1" in
        --dry-run)      DRY_RUN=true; shift ;;
        --only)         ONLY="$2"; shift 2 ;;
        --only=*)       ONLY="${1#--only=}"; shift ;;
        --copy-dir)     COPY_DIR="$2"; COPY_DIR_SET=true; shift 2 ;;
        --copy-dir=*)   COPY_DIR="${1#--copy-dir=}"; COPY_DIR_SET=true; shift ;;
        --scaffold)     SCAFFOLD_ONLY="$2"; shift 2 ;;
        --scaffold=*)   SCAFFOLD_ONLY="${1#--scaffold=}"; shift ;;
        --legacy)
            error "--legacy is retired in v4: the plugin no longer copies itself into a project's .claude/."
            echo "  Install the plugin for your tool with this script, then clean an old copy out of the" >&2
            echo "  project with the ab-migrate skill." >&2
            exit 2 ;;
        --local)        LOCAL=true; shift ;;
        --force|--no-overwrite) shift ;;
        -h|--help)      sed -n '2,/^$/p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
        -*)             error "Unknown option: $1"; exit 2 ;;
        *)              PROJECT_DIR="$1"; shift ;;
    esac
done

# ─── Checkout sanity ──────────────────────────────────────────
for required in skills .claude-plugin/plugin.json skills/ab-project-start/scripts/scaffold.py; do
    if [ ! -e "$SOURCE_DIR/$required" ]; then
        error "$SOURCE_DIR is not an Agent Blueprint checkout (missing $required)"
        exit 1
    fi
done
VERSION=$(sed -n 's/^ *"version": *"\([^"]*\)".*/\1/p' "$SOURCE_DIR/.claude-plugin/plugin.json" | head -1)
SKILL_COUNT=$(find "$SOURCE_DIR/skills" -mindepth 2 -maxdepth 2 -name SKILL.md | wc -l | tr -d ' ')

echo ""
echo -e "  ${BOLD}Agent Blueprint ${VERSION}${NC} — ${SKILL_COUNT} skills, from ${SOURCE_DIR}"
[ "$DRY_RUN" = true ] && info "Dry run: nothing is changed."

# ─── Scaffold (merges into an existing project, never overwrites) ──
scaffold_project() {
    local target="$1" py
    py="$(command -v python3 || command -v python || true)"
    if [ -z "$py" ]; then
        error "Scaffolding needs python3 (or python) to merge the project files"
        exit 1
    fi
    local args=("$SOURCE_DIR/skills/ab-project-start/scripts/scaffold.py" "$target")
    [ "$DRY_RUN" = true ] && args+=(--dry-run)
    "$py" "${args[@]}" | sed 's/^/    /'
}

if [ -n "$SCAFFOLD_ONLY" ]; then
    info "Scaffolding project files into $SCAFFOLD_ONLY"
    scaffold_project "$SCAFFOLD_ONLY"
    success "Project scaffolded"
    exit 0
fi

# ─── Which hosts ──────────────────────────────────────────────
have() { command -v "$1" >/dev/null 2>&1; }
wanted() {   # host named in --only, or every host when --only is unset
    [ -z "$ONLY" ] && return 0
    case ",$ONLY," in *",$1,"*) return 0 ;; esac
    return 1
}
if [ -n "$ONLY" ]; then
    IFS=',' read -r -a requested <<< "$ONLY"
    for h in "${requested[@]}"; do
        case " ${ALL_HOSTS[*]} " in *" $h "*) ;; *) error "Unknown host in --only: $h (choose from ${ALL_HOSTS[*]})"; exit 2 ;; esac
    done
fi

installed=()
for h in "${ALL_HOSTS[@]}"; do
    if wanted "$h"; then
        if have "$h"; then installed+=("$h"); else info "$h: not installed on this machine, skipped"; fi
    fi
done
if [ ${#installed[@]} -eq 0 ] && [ "$COPY_DIR_SET" = false ]; then
    warn "No supported tool found on PATH (${ALL_HOSTS[*]})."
    info "Install one, or copy the skills somewhere with --copy-dir DIR."
    [ -n "$PROJECT_DIR" ] || exit 1
fi

listed() { local h; for h in "${installed[@]:-}"; do [ "$h" = "$1" ] && return 0; done; return 1; }

# ─── Route and record helpers ─────────────────────────────────
# Use the same Python runtime as the scaffold/catalog to parse JSON rather than treating
# paths or CLI output as shell code. No third-party package is needed.
have python3 || { error "Installing needs python3 to read the tools' install records"; exit 1; }
GITHUB="Ninety2UA/agent-blueprint"
GITHUB_URL="https://github.com/$GITHUB"
PLUGIN="agent-blueprint@agent-blueprint"
SOURCE="$GITHUB"
URL_SOURCE="$GITHUB_URL"
PI_SOURCE="git:github.com/$GITHUB"
if [ "$LOCAL" = true ]; then SOURCE="$SOURCE_DIR"; URL_SOURCE="$SOURCE_DIR"; PI_SOURCE="$SOURCE_DIR"; fi
ROUTES="${XDG_CONFIG_HOME:-$HOME/.config}/agent-blueprint/install-routes.json"

run() {
    if [ "$DRY_RUN" = true ]; then
        local command
        printf -v command '%q ' "$@"
        plan "${command% }"
    else
        "$@"
    fi
}
listing() {
    local output
    if output=$("$@" 2>/dev/null); then printf '%s\n' "$output"; else
        warn "Could not read $*: falling back to install; no unknown registration will be removed." >&2
        printf '%s\n' '@unknown'
    fi
}

# Sources belonging to agent-blueprint, one per line. @unknown never authorizes removal.
# Normalize the GitHub shorthand/URL to one identity; local paths are physical paths. Pi's
# package sources are parsed by pi_source.py, the parser hosts.sh's host catalog uses too.
# Each unreadable listing, of marketplaces or of installed sources, is warned about once: by
# listing() when the command fails, or here (unknown()) when an entry cannot be attributed or the
# listing cannot be parsed, so the routes act on @unknown silently.
sources() {
    AB_HOST_LABEL="$(host_label "$1")" AB_PI_SOURCE="$SOURCE_DIR/skills/ab-ship-pipeline/scripts/pi_source.py" \
        python3 - "$@" <<'PY'
import importlib.util, json, os, re, sys
from pathlib import Path
host, raw = sys.argv[1:3]
github = "Ninety2UA/agent-blueprint"
def identity(value):
    value = value.strip().rstrip("/")
    if value.startswith(("/", "~", ".")):
        return os.path.realpath(os.path.expanduser(value))
    if value.endswith(".git"):
        value = value[:-4]
    if value in (github, "https://github.com/" + github):
        return github
    return value
def unknown(why):
    print("  ! Could not read " + os.environ["AB_HOST_LABEL"] + "'s source for agent-blueprint (" + why +
          "); installing without removing the current one.", file=sys.stderr)
    print("@unknown")
try:
    if raw == "@unknown":
        print(raw)
    elif host == "claude":
        lines = raw.splitlines()
        for i, line in enumerate(lines):
            if re.fullmatch(r"\s*[❯>]?\s*agent-blueprint\s*", line):
                source = next((x.strip()[7:].strip() for x in lines[i+1:i+3] if x.strip().startswith("Source:")), None)
                if source:
                    # Claude labels its sources, e.g. GitHub (owner/repo) or Local (/path).
                    m = re.fullmatch(r"(?:GitHub|Git|Local|Folder|Directory|Local directory)\s*\((.*)\)", source, re.I)
                    print(identity(m[1] if m else source))
                else:
                    unknown("agent-blueprint is listed without one")
    elif host == "codex":
        # plugin list --json carries the original source; marketplace list's ROOT may be a cache.
        data = json.loads(raw or '{"installed": []}')
        found = False
        for plugin in data["installed"]:
            if plugin.get("pluginId") == "agent-blueprint@agent-blueprint":
                source = plugin.get("marketplaceSource", {}).get("source")
                if isinstance(source, str):
                    print(identity(source))
                else:
                    unknown("the plugin list names none")
                found = True
        if not found:
            markets = sys.argv[3]
            for line in markets.splitlines():
                m = re.fullmatch(r"\s*agent-blueprint\s+(.+?)\s*", line)
                if m:
                    root = Path(m[1]).expanduser()
                    # A local root is attributable when its own marketplace manifest names it.
                    try:
                        manifest = json.loads((root / ".agents/plugins/marketplace.json").read_text())
                    except (OSError, ValueError):
                        manifest = {}
                    if manifest.get("name") == "agent-blueprint":
                        print(identity(str(root)))
                    else:
                        unknown(str(root) + " has no marketplace manifest naming agent-blueprint")
    elif host == "grok":
        for line in raw.splitlines():
            m = re.fullmatch(r"\s*[^:]+:\s*agent-blueprint\s+\[(?:git|local): (.+)\]\s*", line)
            if m:
                print(identity(m[1]))
            elif re.search(r":\s*agent-blueprint(?:\s|$)", line):
                unknown("agent-blueprint is listed without a git or local source")
    elif host == "cursor-agent":
        for line in raw.splitlines():
            m = re.fullmatch(r"\s*agent-blueprint\s+\S+\s+(.+?)\s*", line)
            if m:
                print(identity(m[1]))
    elif host == "pi":
        sys.dont_write_bytecode = True   # no __pycache__ inside the skill's folder
        spec = importlib.util.spec_from_file_location("pi_source", os.environ["AB_PI_SOURCE"])
        pi_source = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(pi_source)
        base = Path(os.environ["HOME"]) / ".pi/agent"
        settings = base / "settings.json"
        data = json.loads(settings.read_text()) if settings.exists() else {"packages": []}
        for item in data.get("packages", []):
            source = item.get("source") if isinstance(item, dict) else item
            if not isinstance(source, str):
                continue
            # Each line: resolved, package, Pi's identity for the package, and "pinned" for a pinned one.
            # Pi removes every package of one identity together: a git repository's host and path, or a
            # local path resolved against ~/.pi/agent.
            git = pi_source.parse(source)
            if git:
                # GitHub names are case-insensitive. A pinned ref (@ref, #ref or /tree/<ref>) is not the
                # plain source, so the installer replaces it and says so.
                if git.host.lower() == "github.com" and git.path.lower() == github.lower():
                    key = "git:" + git.host + "/" + git.path
                    print("\t".join((source, source, key, "pinned") if git.pinned else (github, source, key, "")))
            elif pi_source.is_local(source):
                path = Path(os.path.expanduser(source))
                if not path.is_absolute():
                    path = base / path
                # Pi resolves a relative path lexically, so normalize before following symlinks.
                path = Path(os.path.normpath(str(path)))
                named = os.path.realpath(path) == os.path.realpath(sys.argv[3])
                for manifest in ("package.json", ".claude-plugin/plugin.json"):
                    try:
                        named = named or json.loads((path / manifest).read_text()).get("name") == "agent-blueprint"
                    except (OSError, ValueError):
                        pass
                if named:
                    print("\t".join((os.path.realpath(path), str(path), "local:" + str(path), "")))
except (OSError, ValueError, KeyError, TypeError, AttributeError) as exc:
    unknown("the listing could not be parsed: " + str(exc))
PY
}

# Read only this plugin's safe, immediate child names. Older records could have an unescaped
# quote in source; that legacy format is recoverable from its strictly formatted skills array.
recorded_skills() {
    python3 - "$1" <<'PY'
import json, re, sys
from pathlib import Path
path = Path(sys.argv[1])
if not path.exists():
    sys.exit(0)
try:
    text = path.read_text()
    try:
        data = json.loads(text)
    except ValueError:
        if not re.search(r'^ *"plugin": *"agent-blueprint",? *$', text, re.M):
            raise ValueError("not an Agent Blueprint record")
        match = re.search(r'^ *"skills": *\[\n(.*?)^ *\]', text, re.M | re.S)
        if not match:
            raise ValueError("no skills list")
        data = {"plugin": "agent-blueprint", "skills": re.findall(r'^ *"(ab-[a-z0-9-]+)",? *$', match[1], re.M)}
    if data.get("plugin") != "agent-blueprint" or not isinstance(data.get("skills"), list):
        raise ValueError("not an Agent Blueprint skills record")
    for name in data["skills"]:
        if isinstance(name, str) and re.fullmatch(r"ab-[a-z0-9-]+", name):
            print(name)
except (OSError, ValueError, AttributeError) as exc:
    print("  ! Left " + str(path) + " as it is: " + str(exc), file=sys.stderr)
    sys.exit(1)
PY
}

cursor_record() {
    python3 - "$ROUTES" "$1" "$GITHUB_URL" <<'PY'
import json, os, sys, tempfile
from pathlib import Path
path, action, source = Path(sys.argv[1]), sys.argv[2], sys.argv[3]
try:
    data = json.loads(path.read_text()) if path.exists() else {"plugin": "agent-blueprint"}
    if data.get("plugin") != "agent-blueprint":
        raise ValueError("record does not name agent-blueprint")
except (OSError, ValueError, AttributeError) as exc:
    print("  ! Could not read route record: " + str(exc), file=sys.stderr)
    sys.exit(1)
if action == "has":
    route = data.get("cursor-agent", {})
    sys.exit(0 if isinstance(route, dict) and route.get("marketplace") == "agent-blueprint" else 1)
if action == "add":
    data["cursor-agent"] = {"marketplace": "agent-blueprint", "source": source}
else:
    data.pop("cursor-agent", None)
path.parent.mkdir(parents=True, exist_ok=True)
with tempfile.NamedTemporaryFile(mode="w", dir=path.parent, delete=False) as f:
    json.dump(data, f, indent=2)
    f.write("\n")
os.replace(f.name, path)
PY
}

in_list() {   # in_list WORD ITEM...: true when WORD is one of the items
    local word="$1" item; shift
    for item in "$@"; do [ "$item" = "$word" ] && return 0; done
    return 1
}

# real_path PATH: PATH with every symlink resolved, whether or not it exists yet.
real_path() { python3 -c 'import os, sys; print(os.path.realpath(sys.argv[1]))' "$1"; }

# inside_own_skills DIR: true when DIR is this checkout's own skills folder, or resolves into it.
# The copy replaces each skill folder, so such a destination would delete the checkout's skills
# before copying them.
inside_own_skills() {
    local src_real copy_real
    src_real=$(cd "$SOURCE_DIR/skills" && pwd -P)
    copy_real=$(real_path "$1")
    case "$copy_real/" in "$src_real"/*) return 0 ;; esac
    return 1
}

# copy_skills DEST HOST...: copies every skill into DEST and keeps an install record there, so a
# re-run removes skills renamed or deleted since and leaves every other skill in DEST alone. HOST is
# hermes, amp or --copy-dir, whose route (copy-dir for the last) gets the removal marker.
copy_skills() {
    local dest_dir="$1"; shift
    local record="$dest_dir/.agent-blueprint-install.json" route="${1#--}" swapped=false
    info "Copying ${SKILL_COUNT} skills into $dest_dir (for: $*)"
    local previous=() name src dest previous_text stage=''
    if inside_own_skills "$dest_dir"; then
        error "$dest_dir points into this checkout's own skills folder; choose another directory"
        return 1
    fi
    if [ -f "$record" ]; then
        if ! previous_text=$(recorded_skills "$record"); then return 1; fi
        while IFS= read -r name; do [ -z "$name" ] || previous+=("$name"); done <<< "$previous_text"
    fi
    local current=() recorded=() kept=()
    for src in "$SOURCE_DIR"/skills/*/; do
        name=${src%/}; name=${name##*/}
        current+=("$name")
        dest="$dest_dir/$name"
        # A folder of that name that this destination's record does not list is someone else's:
        # leave it as it is rather than replace it.
        if { [ -e "$dest" ] || [ -L "$dest" ]; } && ! in_list "$name" "${previous[@]:-}"; then
            kept+=("$name")
            continue
        fi
        recorded+=("$name")
        if [ "$DRY_RUN" = true ]; then
            echo -e "    ${DIM}copy  $name${NC}"
        else
            if [ -z "$stage" ]; then
                mkdir -p "$dest_dir"
                # Copy next to the destination first, then swap, so a failed copy leaves the old skill in place.
                stage=$(mktemp -d "$dest_dir/.agent-blueprint-copy.XXXXXX")
            fi
            if ! cp -R "$src" "$stage/$name"; then rm -rf "$stage"; return 1; fi
            # The skills are swapped one at a time, so a failure from here on leaves old and new mixed.
            if [ "$swapped" = false ]; then mark_removed "$route"; swapped=true; fi
            rm -rf "${dest:?}"
            mv "$stage/$name" "$dest"
        fi
    done
    if [ -n "$stage" ]; then rmdir "$stage"; fi
    # A skill in the last record that no longer exists in the source was renamed or deleted.
    for name in "${previous[@]:-}"; do
        [ -n "$name" ] || continue
        case " ${current[*]} " in *" $name "*) continue ;; esac
        if [ "$DRY_RUN" = true ]; then
            echo -e "    ${DIM}remove $name (no longer shipped)${NC}"
        elif [ -d "$dest_dir/$name" ]; then
            rm -rf "${dest_dir:?}/$name"
            info "Removed $name: it is no longer shipped"
        fi
    done
    if [ "$DRY_RUN" = false ]; then
        mkdir -p "$dest_dir"
        python3 - "$record" "$VERSION" "$SOURCE_DIR" "${recorded[@]:-}" <<'PY'
import json, os, sys, tempfile
record, version, source = sys.argv[1:4]
with tempfile.NamedTemporaryFile(mode="w", dir=os.path.dirname(record), delete=False) as f:
    json.dump({"plugin": "agent-blueprint", "version": version, "source": source,
               "skills": [name for name in sys.argv[4:] if name]}, f, indent=2)
    f.write("\n")
os.replace(f.name, record)
PY
    fi
    success "Skills copied to $dest_dir"
    if [ ${#kept[@]} -gt 0 ]; then
        warn "Kept ${#kept[@]} folder(s) in $dest_dir that this installer did not put there: ${kept[*]}. Remove them and run install.sh again to install the blueprint's."
    fi
}

# remove_recorded_copy DIR: removes the skills an earlier copy install recorded in DIR, and its
# record; every other folder in DIR stays.
remove_recorded_copy() {
    local dir="$1" record="$1/.agent-blueprint-install.json" name names
    [ -f "$record" ] || return 0
    if ! names=$(recorded_skills "$record"); then return 0; fi
    while IFS= read -r name; do
        [ -n "$name" ] || continue
        run rm -rf "$dir/$name"
    done <<< "$names"
    run rm -f "$record"
    if [ "$DRY_RUN" = true ]; then info "Would remove the recorded copy in $dir"; else info "Removed the recorded copy in $dir"; fi
}

# github_answers LABEL: succeeds when the GitHub source answers. It runs before a route removes an
# install it will replace from GitHub: removing a marketplace uninstalls its plugin (Claude Code
# 2.1.296 also deletes the plugin's data), and Grok and Pi remove the old install before
# installing, so a swap while GitHub is unreachable would leave the tool without the plugin.
# It runs inside a route's subshell, whose INT and TERM traps it sets and clears.
github_answers() {
    local ssh_cmd pid status=0 tenths=0 limit=300
    local check=(env GIT_TERMINAL_PROMPT=0 GIT_HTTP_LOW_SPEED_LIMIT=1000 GIT_HTTP_LOW_SPEED_TIME=30)
    if ! have git; then
        error "$1: git is needed to check that $GITHUB_URL answers before the current install is replaced; left it as it was."
        return 1
    fi
    if [ "$DRY_RUN" = true ]; then
        plan "git ls-remote --exit-code $GITHUB_URL HEAD"
        return 0
    fi
    # No credential or passphrase prompt, also when url.insteadOf rewrites the URL to ssh: the batch
    # options join the user's own ssh command, so its key still counts. GIT_SSH alone names a program
    # that takes no options, and git runs it as it is.
    ssh_cmd=${GIT_SSH_COMMAND:-$(git config --get core.sshCommand || true)}
    if [ -n "$ssh_cmd" ] || [ -z "${GIT_SSH:-}" ]; then
        check+=("GIT_SSH_COMMAND=${ssh_cmd:-ssh} -o BatchMode=yes -o ConnectTimeout=20")
    fi
    # HTTPS has no connect timeout, so the check's own git is stopped after 30 s and the source counts
    # as unreachable. AGENT_BLUEPRINT_TEST_REACH_TIMEOUT shortens the limit for the tests only.
    case "${AGENT_BLUEPRINT_TEST_REACH_TIMEOUT:-}" in
        ''|*[!0-9]*) ;;
        *) limit=$((AGENT_BLUEPRINT_TEST_REACH_TIMEOUT * 10)) ;;
    esac
    "${check[@]}" git ls-remote --exit-code "$GITHUB_URL" HEAD >/dev/null 2>&1 &
    pid=$!
    # A command run in the background ignores Ctrl-C, so an interrupt stops this git here.
    trap 'kill "$pid" 2>/dev/null; exit 130' INT
    trap 'kill "$pid" 2>/dev/null; exit 143' TERM
    while kill -0 "$pid" 2>/dev/null; do
        if [ "$tenths" -ge "$limit" ]; then
            kill "$pid" 2>/dev/null || true
            break
        fi
        sleep 0.1
        tenths=$((tenths + 1))
    done
    wait "$pid" || status=$?
    trap - INT TERM
    if [ "$status" -ne 0 ]; then
        error "$1: could not reach $GITHUB_URL, so its current install was left as it was. Check the connection and run install.sh again."
        return 1
    fi
}

# mark_removed HOST: records, once a route's destructive step has succeeded, that HOST's old install
# is gone, so run_route's failure line can say so. A dry run removes nothing.
mark_removed() { if [ "$DRY_RUN" = false ]; then : > "$RUN_STATE/$1.removed"; fi; }

# reconcile_marketplace TOOL PRIOR SAME ADD [REFRESH...]: points TOOL's agent-blueprint
# marketplace at ADD. PRIOR is what sources() read: SAME runs the refresh command, if any;
# nothing, or an unreadable listing (@unknown, already warned about), adds without removing;
# any other source is removed and replaced, once the GitHub source answers.
reconcile_marketplace() {
    local tool="$1" prior="$2" same="$3" add="$4"
    shift 4
    case "$prior" in
        "$same")
            if [ $# -gt 0 ]; then run "$tool" "$@"; fi ;;
        ''|*'@unknown'*)
            run "$tool" plugin marketplace add "$add" ;;
        *)
            # Under --local the new source is this checkout, so there is nothing remote to check.
            if [ "$LOCAL" = false ]; then github_answers "$(host_label "$tool")"; fi
            run "$tool" plugin marketplace remove agent-blueprint
            mark_removed "$tool"
            run "$tool" plugin marketplace add "$add" ;;
    esac
}

# ─── Routes, one per tool ─────────────────────────────────────
# run_route runs each in a subshell under set -e, so a failing command ends that route alone.
route_claude() {
    local markets prior_sources plugins action=install
    markets=$(listing claude plugin marketplace list)
    prior_sources=$(sources claude "$markets")
    plugins=$(listing claude plugin list)
    if [ "$prior_sources" = "$SOURCE" ] && [[ "$plugins" == *"$PLUGIN"* ]]; then action=update; fi
    reconcile_marketplace claude "$prior_sources" "$SOURCE" "$SOURCE" \
        plugin marketplace update agent-blueprint
    run claude plugin "$action" "$PLUGIN"
    if [[ "$plugins" == *'claude-code-blueprint@'* ]]; then
        warn "The v3 plugin is still installed; run the ab-migrate skill to retire it."
    fi
    success "Claude Code: $PLUGIN"
}

route_codex() {
    local markets plugins prior_sources
    markets=$(listing codex plugin marketplace list)
    plugins=$(listing codex plugin list --json)
    prior_sources=$(sources codex "$plugins" "$markets")
    if [ "$LOCAL" = true ]; then
        # The marketplace is this checkout, so there is nothing to upgrade.
        reconcile_marketplace codex "$prior_sources" "$SOURCE" "$SOURCE"
    else
        reconcile_marketplace codex "$prior_sources" "$SOURCE" "$SOURCE" \
            plugin marketplace upgrade agent-blueprint
    fi
    run codex plugin add "$PLUGIN"
    success "Codex: $PLUGIN. Trust the plugin in /hooks to enable its hooks."
}

route_agy() {
    run agy plugin install "$URL_SOURCE"
    success "Antigravity: agent-blueprint"
}

route_grok() {
    local prior_sources remaining before_count after_count removed=false
    prior_sources=$(sources grok "$(listing grok plugin list)")
    # A local install is a copy that grok plugin update reports as live without refreshing it.
    if [ "$prior_sources" = "$SOURCE" ] && [ "$LOCAL" = false ]; then
        run grok plugin update agent-blueprint
    else
        # An unreadable listing (@unknown, already warned about) installs without removing.
        if [ -n "$prior_sources" ] && [[ "$prior_sources" != *'@unknown'* ]]; then
            if [ "$LOCAL" = false ]; then github_answers "$(host_label grok)"; fi
            # Grok removes only the most recent install for this name. Check progress so a
            # failed/changed listing can never cause an unbounded loop of uninstall commands.
            while [ -n "$prior_sources" ]; do
                run grok plugin uninstall agent-blueprint
                mark_removed grok
                if [ "$DRY_RUN" = true ]; then
                    if [[ "$prior_sources" == *$'\n'* ]]; then prior_sources="${prior_sources#*$'\n'}"; else prior_sources=''; fi
                else
                    remaining=$(sources grok "$(listing grok plugin list)")
                    before_count=$(printf '%s\n' "$prior_sources" | awk 'NF {n++} END {print n+0}')
                    after_count=$(printf '%s\n' "$remaining" | awk 'NF {n++} END {print n+0}')
                    if [[ "$remaining" == *'@unknown'* ]] || [ "$after_count" -ge "$before_count" ]; then
                        # Grok still lists every install it had, so none of them was removed.
                        if [ "$removed" = false ] && [[ "$remaining" != *'@unknown'* ]]; then
                            rm -f "$RUN_STATE/grok.removed"
                        fi
                        error "Could not confirm Grok removed the recorded plugin; stopped before installing a duplicate."
                        exit 1   # ends this route only
                    fi
                    removed=true
                    prior_sources="$remaining"
                fi
            done
        fi
        run grok plugin install "$SOURCE" --trust
    fi
    remove_recorded_copy "$HOME/.grok/skills"
    success "Grok Build: agent-blueprint"
}

route_pi() {
    local prior_sources resolved package key pin same='' same_key='' i=0 removals=() keys=() pinned=() removed=()
    prior_sources=$(sources pi '' "$SOURCE_DIR")
    while IFS=$'\t' read -r resolved package key pin; do
        # An unreadable settings file (@unknown, already warned about) installs without removing.
        if [ -z "$resolved" ] || [ "$resolved" = '@unknown' ]; then continue; fi
        if [ "$resolved" = "$SOURCE" ] && [ -z "$same" ]; then
            same="$package"
            same_key="$key"
        else
            removals+=("$package")
            keys+=("$key")
            if [ "$pin" = pinned ]; then pinned+=("$package"); fi
        fi
    done <<< "$prior_sources"
    # Pi removes a package with every other of the same identity (sources()), so a removal that shares
    # the kept package's identity removes it too: the run installs the current source afterwards.
    while [ -n "$same" ] && [ "$i" -lt "${#removals[@]}" ]; do
        if [ "${keys[$i]}" = "$same_key" ]; then
            info "Pi: removing ${removals[$i]} also removes $same (Pi treats them as one package), so $PI_SOURCE is installed afterwards."
            same=''
        fi
        i=$((i + 1))
    done
    # Without a kept package, the removals are followed by an install from GitHub: check it first.
    if [ "${#removals[@]}" -gt 0 ] && [ -z "$same" ] && [ "$LOCAL" = false ]; then github_answers "$(host_label pi)"; fi
    for package in ${pinned[@]+"${pinned[@]}"}; do
        warn "Pi: replacing the pinned source $package with ${same:-$PI_SOURCE}; pin it again in Pi if you need that version."
    done
    i=0
    while [ "$i" -lt "${#removals[@]}" ]; do
        # A source whose identity went with an earlier removal is no longer there to remove.
        if ! in_list "${keys[$i]}" ${removed[@]+"${removed[@]}"}; then
            run pi remove "${removals[$i]}"
            removed+=("${keys[$i]}")
            # agent-blueprint has left Pi once nothing was kept, or the kept package went with this one.
            if [ -z "$same_key" ] || [ "${keys[$i]}" = "$same_key" ]; then mark_removed pi; fi
        fi
        i=$((i + 1))
    done
    if [ -n "$same" ]; then run pi update --extension "$same"; else run pi install "$PI_SOURCE"; fi
    remove_recorded_copy "$HOME/.pi/agent/skills"
    success "Pi: agent-blueprint"
}

# Cursor and Amp lean on the Claude Code plugin when claude_plugin is true. When Claude Code's
# route failed in this run, that plugin may be one the run could not refresh, so each keeps the
# install it has of its own.
route_cursor_agent() {
    local prior_sources
    if [ "$claude_plugin" = true ]; then
        if cursor_record has; then
            if failed_route claude; then
                warn "Cursor CLI: kept its own marketplace because Claude Code's route failed; run install.sh again once Claude Code installs."
                return 0
            fi
            run cursor-agent plugin marketplace remove agent-blueprint
            mark_removed cursor-agent
            if [ "$DRY_RUN" = false ]; then cursor_record remove; fi
            warn "Cursor CLI: if /plugin still lists agent-blueprint from Cursor's own marketplace, uninstall it there, so Cursor reads only the Claude Code plugin."
        fi
        success "Cursor CLI: covered by the Claude Code plugin"
    elif [ "$LOCAL" = true ]; then
        info "Cursor CLI: start a session with:"
        printf '    cursor-agent --plugin-dir %q\n' "$SOURCE_DIR"
    else
        prior_sources=$(sources cursor-agent "$(listing cursor-agent plugin marketplace list)")
        reconcile_marketplace cursor-agent "$prior_sources" "$GITHUB" "$GITHUB_URL" \
            plugin marketplace update agent-blueprint
        if [ "$DRY_RUN" = false ]; then cursor_record add; fi
        info "Cursor CLI: REQUIRED next step: open a session, run /plugin and install agent-blueprint."
    fi
}

route_hermes() { copy_skills "$HOME/.hermes/skills" hermes; }

route_amp() {
    local copy="$HOME/.config/amp/skills"
    if [ "$claude_plugin" = true ]; then
        if failed_route claude && [ -f "$copy/.agent-blueprint-install.json" ]; then
            warn "Amp: kept its own copy in $copy because Claude Code's route failed; run install.sh again once Claude Code installs."
            return 0
        fi
        remove_recorded_copy "$copy"
        success "Amp: covered by the Claude Code plugin"
    else
        copy_skills "$copy" amp
    fi
}

route_copy_dir() { copy_skills "$COPY_DIR" --copy-dir; }

host_label() {
    case "$1" in
        claude) echo "Claude Code" ;;  codex) echo "Codex" ;;  agy) echo "Antigravity" ;;
        grok) echo "Grok Build" ;;  pi) echo "Pi" ;;  cursor-agent) echo "Cursor CLI" ;;
        hermes) echo "Hermes" ;;  amp) echo "Amp" ;;  copy-dir) echo "the copy in $COPY_DIR" ;;
        *) echo "$1" ;;
    esac
}
labels() {   # labels HOST...: their display names, comma-separated
    local list='' host
    for host in "$@"; do list="${list:+$list, }$(host_label "$host")"; done
    printf '%s' "$list"
}

# run_route HOST: runs route_HOST and records whether it finished. Never call it, or a route, as
# a condition (if, ||, &&): bash ignores set -e inside a function or subshell run that way, so a
# failing command would not stop the route. A route that removed its old install before failing
# left a marker in RUN_STATE (mark_removed), so the failure line says what is left. Ctrl-C or a
# TERM during a route stops the whole run after that route's line, whatever status the interrupted
# tool exits with (the parent's traps set interrupted), and so does a route that exits 130 or 143.
finished_hosts=()
failed_hosts=()
run_route() {
    local status label
    stop_if_interrupted
    set +e
    ( set -e; "route_${1//-/_}" )
    status=$?
    set -e
    if [ "$status" -eq 0 ]; then
        finished_hosts+=("$1")
    else
        failed_hosts+=("$1")
        label="$(host_label "$1")"
        if [ -e "$RUN_STATE/$1.removed" ]; then
            error "$label did not finish (exit $status) after its old install was removed; run install.sh again to install it."
        else
            error "$label did not finish (exit $status); its current install and recorded copies stay as they were."
        fi
    fi
    stop_if_interrupted
    if [ "$status" -eq 130 ] || [ "$status" -eq 143 ]; then exit "$status"; fi
}
stop_if_interrupted() { if [ -n "$interrupted" ]; then exit "$interrupted"; fi; }
finished_route() { in_list "$1" ${finished_hosts[@]+"${finished_hosts[@]}"}; }
failed_route() { in_list "$1" ${failed_hosts[@]+"${failed_hosts[@]}"}; }

# ─── Run the routes ───────────────────────────────────────────
# A --copy-dir inside the checkout is a usage error, so it stops the run before any route.
if [ "$COPY_DIR_SET" = true ] && inside_own_skills "$COPY_DIR"; then
    error "--copy-dir points into this checkout's own skills folder ($SOURCE_DIR/skills); choose another directory"
    exit 2
fi

# Private per-run state the routes' subshells write to (mark_removed); gone when the run ends.
RUN_STATE=$(mktemp -d "${TMPDIR:-/tmp}/agent-blueprint-install.XXXXXX")
trap 'rm -rf "$RUN_STATE"' EXIT
# While the routes run, Ctrl-C or a TERM is noted here and run_route stops the run; the routes'
# subshells reset these traps, so the tool a route runs gets the signal as usual.
interrupted=''
trap 'interrupted=130' INT
trap 'interrupted=143' TERM

if listed claude; then run_route claude; fi
# Only the Cursor and Amp routes read claude_plugin. A route's subshell cannot hand it back, so
# it is set here: true after Claude Code's route finished, otherwise read from claude plugin list.
claude_plugin=false
if finished_route claude; then
    claude_plugin=true
elif have claude && { listed cursor-agent || listed amp; }; then
    plugins=$(listing claude plugin list)
    if [[ "$plugins" == *"$PLUGIN"* ]]; then claude_plugin=true; fi
fi
# Every other host in AB_HOSTS order; one without a route_ function fails in run_route.
for h in "${ALL_HOSTS[@]}"; do
    if [ "$h" != claude ] && listed "$h"; then run_route "$h"; fi
done
if [ "$COPY_DIR_SET" = true ]; then run_route copy-dir; fi
stop_if_interrupted
trap - INT TERM

# Cursor without the Claude Code plugin still needs a step of the user's: it is listed under
# Unfinished rather than Finished.
cursor_note=''
if finished_route cursor-agent && [ "$claude_plugin" = false ]; then
    if [ "$LOCAL" = true ]; then
        cursor_note="Cursor CLI (start the printed --plugin-dir session)"
    else
        cursor_note="Cursor CLI (/plugin installation required)"
    fi
fi

# Retire the 4.0 shared copy only once every installed reader has its own route in this run and
# that route finished. 4.0 pointed Hermes at it through skills.external_dirs in ~/.hermes/config.yaml.
# A --copy-dir there is this run's own copy, which the retirement would delete.
hermes_reads_shared=false
if grep -qs '\.agents/skills' "$HOME/.hermes/config.yaml"; then hermes_reads_shared=true; fi
if [ -f "$HOME/.agents/skills/.agent-blueprint-install.json" ] && [ "$COPY_DIR_SET" = true ] &&
        [ "$(real_path "$COPY_DIR")" = "$(real_path "$HOME/.agents/skills")" ]; then
    info "Skipped retiring the shared copy in $HOME/.agents/skills: it is this run's --copy-dir."
elif [ -f "$HOME/.agents/skills/.agent-blueprint-install.json" ]; then
    readers=(codex grok pi cursor-agent amp)
    if [ "$hermes_reads_shared" = true ]; then readers+=(hermes); fi
    outside=()
    failed_readers=()
    for h in "${readers[@]}"; do
        if ! have "$h"; then continue; fi
        if ! listed "$h"; then outside+=("$h"); elif failed_route "$h"; then failed_readers+=("$h"); fi
    done
    if [ ${#outside[@]} -eq 0 ] && [ ${#failed_readers[@]} -eq 0 ]; then
        remove_recorded_copy "$HOME/.agents/skills"
    else
        reasons=''
        advice="Run install.sh again once their routes finish to retire it."
        if [ ${#outside[@]} -gt 0 ]; then
            reasons="tools still reading it outside this run: ${outside[*]}"
            advice="Run install.sh without --only (or with those tools) to retire it."
        fi
        if [ ${#failed_readers[@]} -gt 0 ]; then
            reasons="${reasons:+$reasons; }tools still reading it whose route failed in this run: ${failed_readers[*]}"
        fi
        warn "Keeping the recorded copy in $HOME/.agents/skills: $reasons. $advice Until then, a tool given its own route in this run may list each skill twice."
    fi
fi
if [ "$hermes_reads_shared" = true ] && finished_route hermes; then
    warn "Hermes: ~/.hermes/config.yaml still lists ~/.agents/skills under skills.external_dirs. Remove that entry; Hermes now reads its own copy in ~/.hermes/skills."
fi
if [ -n "$cursor_note" ]; then warn "Unfinished: $cursor_note"; fi

# ─── Optional project scaffold ────────────────────────────────
if [ -n "$PROJECT_DIR" ]; then
    info "Scaffolding project files into $PROJECT_DIR"
    scaffold_project "$PROJECT_DIR"
    success "Project scaffolded"
fi

echo ""
done_hosts=()
for h in ${finished_hosts[@]+"${finished_hosts[@]}"}; do
    if [ "$h" = cursor-agent ] && [ -n "$cursor_note" ]; then continue; fi
    done_hosts+=("$h")
done
if [ ${#done_hosts[@]} -gt 0 ]; then success "Finished: $(labels "${done_hosts[@]}")"; fi
if [ ${#failed_hosts[@]} -gt 0 ]; then
    # Each failed tool's own line above says whether its old install is still there.
    error "Failed: $(labels "${failed_hosts[@]}"). Fix the errors above and run install.sh again."
    exit 1
fi
if [ "$DRY_RUN" = true ]; then
    info "Dry run complete. No files were modified."
else
    success "Done. Start a session in your tool and ask for the ab-project-start skill to set up a project."
fi
