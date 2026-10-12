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
# Cursor registrations made here are recorded in
# ${XDG_CONFIG_HOME:-$HOME/.config}/agent-blueprint/install-routes.json.
# Copies keep .agent-blueprint-install.json; only recorded skills are replaced or removed.
# Re-runs retire recorded v4.0 copies in ~/.agents/skills, ~/.grok/skills and ~/.pi/agent/skills.
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
# Normalize the GitHub shorthand/URL to one identity; local paths are physical paths.
sources() {
    python3 - "$@" <<'PY'
import json, os, re, sys
from pathlib import Path
host, raw = sys.argv[1:3]
github = "Ninety2UA/agent-blueprint"
def identity(value):
    value = value.strip().rstrip("/")
    if value.endswith(".git") and not value.startswith(("/", "~", ".")):
        value = value[:-4]
    if value in (github, "https://github.com/" + github, "git:github.com/" + github):
        return github
    return os.path.realpath(os.path.expanduser(value)) if value.startswith(("/", "~", ".")) else value
try:
    if raw == "@unknown":
        print(raw)
    elif host == "identity":
        print(identity(raw))
    elif host == "claude":
        lines = raw.splitlines()
        for i, line in enumerate(lines):
            if re.fullmatch(r"\s*[❯>]?\s*agent-blueprint\s*", line):
                source = next((x.strip()[7:].strip() for x in lines[i+1:i+3] if x.strip().startswith("Source:")), None)
                if source:
                    # Claude labels its sources, e.g. GitHub (owner/repo) or Local (/path).
                    m = re.fullmatch(r"(?:GitHub|Git|Local|Directory|Local directory)\s*\((.*)\)", source, re.I)
                    print(identity(m[1] if m else source))
                else:
                    print("@unknown")
    elif host == "codex":
        # plugin list --json carries the original source; marketplace list's ROOT may be a cache.
        data = json.loads(raw or '{"installed": []}')
        found = False
        for plugin in data["installed"]:
            if plugin.get("pluginId") == "agent-blueprint@agent-blueprint":
                source = plugin.get("marketplaceSource", {}).get("source")
                print(identity(source) if isinstance(source, str) else "@unknown")
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
                        print(identity(str(root)) if manifest.get("name") == "agent-blueprint" else "@unknown")
                    except (OSError, ValueError):
                        print("@unknown")
    elif host == "grok":
        for line in raw.splitlines():
            m = re.fullmatch(r"\s*[^:]+:\s*agent-blueprint\s+\[(?:git|local): (.+)\]\s*", line)
            if m:
                print(identity(m[1]))
            elif re.search(r":\s*agent-blueprint(?:\s|$)", line):
                print("@unknown")
    elif host == "cursor-agent":
        for line in raw.splitlines():
            m = re.fullmatch(r"\s*agent-blueprint\s+\S+\s+(.+?)\s*", line)
            if m:
                print(identity(m[1]))
    elif host == "pi":
        base = Path(os.environ["HOME"]) / ".pi/agent"
        settings = base / "settings.json"
        data = json.loads(settings.read_text()) if settings.exists() else {"packages": []}
        for item in data.get("packages", []):
            source = item.get("source") if isinstance(item, dict) else item
            if not isinstance(source, str):
                continue
            if identity(source.split("#", 1)[0]) == github:
                print(source)
            elif not source.startswith(("git:", "npm:", "https://", "git@")):
                path = Path(os.path.expanduser(source))
                if not path.is_absolute():
                    path = base / path
                named = os.path.realpath(path) == os.path.realpath(sys.argv[3])
                for manifest in ("package.json", ".claude-plugin/plugin.json"):
                    try:
                        named = named or json.loads((path / manifest).read_text()).get("name") == "agent-blueprint"
                    except (OSError, ValueError):
                        pass
                if named:
                    print(source)
except (OSError, ValueError, KeyError, TypeError, AttributeError) as exc:
    print("  ! Could not read " + host + " install listing: " + str(exc), file=sys.stderr)
    print("@unknown")
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

# copy_skills DEST HOST...: copies every skill into DEST and keeps an install record there, so a
# re-run removes skills renamed or deleted since and leaves every other skill in DEST alone.
copy_skills() {
    local dest_dir="$1"; shift
    local record="$dest_dir/.agent-blueprint-install.json"
    info "Copying ${SKILL_COUNT} skills into $dest_dir (for: $*)"
    local previous=() name src dest src_real copy_real previous_text stage
    # The copy replaces each skill folder, so a destination that is the source itself (the path,
    # or a symlink to it) would delete the checkout's skills before copying them.
    src_real=$(cd "$SOURCE_DIR/skills" && pwd -P)
    copy_real=$(python3 -c 'import os, sys; print(os.path.realpath(sys.argv[1]))' "$dest_dir")
    case "$copy_real/" in
        "$src_real"/*)
            error "--copy-dir points into this checkout's own skills folder ($src_real); choose another directory"
            exit 2 ;;
    esac
    if [ -f "$record" ]; then
        if ! previous_text=$(recorded_skills "$record"); then return 1; fi
        while IFS= read -r name; do [ -z "$name" ] || previous+=("$name"); done <<< "$previous_text"
    fi
    local current=() recorded=() kept=()
    for src in "$SOURCE_DIR"/skills/*/; do
        name=$(basename "$src")
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
            mkdir -p "$dest_dir"
            # Copy next to the destination first, then swap, so a failed copy leaves the old skill in place.
            stage=$(mktemp -d "$dest_dir/.agent-blueprint-copy.XXXXXX")
            if ! cp -R "$src" "$stage/skill"; then rm -rf "$stage"; return 1; fi
            rm -rf "${dest:?}"
            mv "$stage/skill" "$dest"
            rmdir "$stage"
        fi
    done
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

# Retire only folders an earlier installer recorded, before giving hosts their own routes.
for old_copy in "$HOME/.agents/skills" "$HOME/.grok/skills" "$HOME/.pi/agent/skills"; do
    remove_recorded_copy "$old_copy"
done

claude_plugin=false
if listed claude; then
    markets=$(listing claude plugin marketplace list)
    prior_sources=$(sources claude "$markets")
    plugins=$(listing claude plugin list)
    action=install
    case "$prior_sources" in
        "$SOURCE")
            run claude plugin marketplace update agent-blueprint
            if [[ "$plugins" == *"$PLUGIN"* ]]; then action=update; fi ;;
        '') run claude plugin marketplace add "$SOURCE" ;;
        *'@unknown'*)
            warn "Could not read Claude Code's marketplace source; trying add without removing it."
            run claude plugin marketplace add "$SOURCE" ;;
        *) run claude plugin marketplace remove agent-blueprint
           run claude plugin marketplace add "$SOURCE" ;;
    esac
    run claude plugin "$action" "$PLUGIN"
    if [[ "$plugins" == *'claude-code-blueprint@'* ]]; then
        warn "The v3 plugin is still installed; run the ab-migrate skill to retire it."
    fi
    claude_plugin=true
    success "Claude Code: $PLUGIN"
elif have claude; then
    plugins=$(listing claude plugin list)
    if [[ "$plugins" == *"$PLUGIN"* ]]; then claude_plugin=true; fi
fi

if listed codex; then
    markets=$(listing codex plugin marketplace list)
    plugins=$(listing codex plugin list --json)
    prior_sources=$(sources codex "$plugins" "$markets")
    case "$prior_sources" in
        "$SOURCE")
            if [ "$LOCAL" = false ]; then run codex plugin marketplace upgrade agent-blueprint; fi ;;
        '') run codex plugin marketplace add "$SOURCE" ;;
        *'@unknown'*)
            warn "Could not read Codex's marketplace source; trying add without removing it."
            run codex plugin marketplace add "$SOURCE" ;;
        *) run codex plugin marketplace remove agent-blueprint
           run codex plugin marketplace add "$SOURCE" ;;
    esac
    run codex plugin add "$PLUGIN"
    success "Codex: $PLUGIN. Trust the plugin in /hooks to enable its hooks."
fi

if listed agy; then
    run agy plugin install "$URL_SOURCE"
    success "Antigravity: agent-blueprint"
fi

if listed grok; then
    prior_sources=$(sources grok "$(listing grok plugin list)")
    if [ "$prior_sources" = "$SOURCE" ]; then
        run grok plugin update agent-blueprint
    else
        if [[ "$prior_sources" == *'@unknown'* ]]; then
            warn "Could not read Grok's install source; trying install without removing it."
        else
            # Grok removes only the most recent install for this name. Check progress so a
            # failed/changed listing can never cause an unbounded loop of uninstall commands.
            while [ -n "$prior_sources" ]; do
                run grok plugin uninstall agent-blueprint
                if [ "$DRY_RUN" = true ]; then
                    if [[ "$prior_sources" == *$'\n'* ]]; then prior_sources="${prior_sources#*$'\n'}"; else prior_sources=''; fi
                else
                    remaining=$(sources grok "$(listing grok plugin list)")
                    before_count=$(printf '%s\n' "$prior_sources" | awk 'NF {n++} END {print n+0}')
                    after_count=$(printf '%s\n' "$remaining" | awk 'NF {n++} END {print n+0}')
                    if [[ "$remaining" == *'@unknown'* ]] || [ "$after_count" -ge "$before_count" ]; then
                        error "Could not confirm Grok removed the recorded plugin; stopped before installing a duplicate."
                        exit 1
                    fi
                    prior_sources="$remaining"
                fi
            done
        fi
        run grok plugin install "$SOURCE" --trust
    fi
    success "Grok Build: agent-blueprint"
fi

if listed pi; then
    prior_sources=$(sources pi '' "$SOURCE_DIR")
    same=''
    while IFS= read -r package; do
        [ -n "$package" ] || continue
        if [ "$package" = '@unknown' ]; then
            warn "Could not read Pi's packages; trying install without removing them."
            continue
        fi
        case "$package" in
            git:*) resolved=$(sources identity "$package") ;;
            /*|~*) resolved=$(sources identity "$package") ;;
            *) resolved=$(sources identity "$HOME/.pi/agent/$package") ;;
        esac
        if [ "$resolved" = "$SOURCE" ] && [ -z "$same" ]; then
            same="$package"
        else
            run pi remove "$package"
        fi
    done <<< "$prior_sources"
    if [ -n "$same" ]; then run pi update --extension "$same"; else run pi install "$PI_SOURCE"; fi
    success "Pi: agent-blueprint"
fi

unfinished=()
if listed cursor-agent; then
    if [ "$claude_plugin" = true ]; then
        if cursor_record has; then
            run cursor-agent plugin marketplace remove agent-blueprint
            if [ "$DRY_RUN" = false ]; then cursor_record remove; fi
        fi
        success "Cursor CLI: covered by the Claude Code plugin"
    elif [ "$LOCAL" = true ]; then
        info "Cursor CLI: start a session with:"
        printf '    cursor-agent --plugin-dir %q\n' "$SOURCE_DIR"
        unfinished+=("Cursor CLI (start the printed --plugin-dir session)")
    else
        prior_sources=$(sources cursor-agent "$(listing cursor-agent plugin marketplace list)")
        case "$prior_sources" in
            "$GITHUB") run cursor-agent plugin marketplace update agent-blueprint ;;
            ''|'@unknown') run cursor-agent plugin marketplace add "$GITHUB_URL" ;;
            *) run cursor-agent plugin marketplace remove agent-blueprint
               run cursor-agent plugin marketplace add "$GITHUB_URL" ;;
        esac
        if [ "$DRY_RUN" = false ]; then cursor_record add; fi
        info "Cursor CLI: REQUIRED next step: open a session, run /plugin and install agent-blueprint."
        unfinished+=("Cursor CLI (/plugin installation required)")
    fi
fi

if listed hermes; then copy_skills "$HOME/.hermes/skills" hermes; fi
if listed amp; then
    if [ "$claude_plugin" = true ]; then
        remove_recorded_copy "$HOME/.config/amp/skills"
        success "Amp: covered by the Claude Code plugin"
    else
        copy_skills "$HOME/.config/amp/skills" amp
    fi
fi
if [ "$COPY_DIR_SET" = true ]; then copy_skills "$COPY_DIR" --copy-dir; fi
if [ ${#unfinished[@]} -gt 0 ]; then warn "Unfinished: ${unfinished[*]}"; fi

# ─── Optional project scaffold ────────────────────────────────
if [ -n "$PROJECT_DIR" ]; then
    info "Scaffolding project files into $PROJECT_DIR"
    scaffold_project "$PROJECT_DIR"
    success "Project scaffolded"
fi

echo ""
if [ "$DRY_RUN" = true ]; then
    info "Dry run complete. No files were modified."
else
    success "Done. Start a session in your tool and ask for the ab-project-start skill to set up a project."
fi
