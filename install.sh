#!/usr/bin/env bash
# install.sh — Agent Blueprint installer for the eight supported coding CLIs.
#
# Run it from a checkout of the repository:
#   git clone https://github.com/Ninety2UA/agent-blueprint.git && bash agent-blueprint/install.sh
#
# It detects the installed tools and gives each one its single install route:
#   Claude Code   claude plugin marketplace add <checkout>; claude plugin install agent-blueprint@agent-blueprint
#   Antigravity   agy plugin install <checkout>
#   Codex, Grok Build, Pi, Cursor CLI, Amp
#                 one copy of skills/ into ~/.agents/skills, which all five scan (Amp also
#                 reads Claude Code's plugin cache, so a Claude Code install already covers it)
#   Hermes        the same copy, listed under skills.external_dirs in ~/.hermes/config.yaml
#   Beside Claude Code, Cursor CLI and Amp read its plugin too, so then nothing goes into ~/.agents/skills:
#                 Codex gets its own plugin, and Grok Build, Pi and Hermes a copy in their own skills folders
# Copy installs keep an install record, so a re-run removes skills that were renamed or
# deleted since and leaves every other skill in that folder alone.
#
# Usage: bash install.sh [options] [PROJECT_DIR]
#   --dry-run          Print what would run or be copied; change nothing
#   --only HOSTS       Comma-separated hosts to install for (claude,codex,agy,grok,pi,cursor-agent,hermes,amp);
#                      the default is every installed tool
#   --copy-dir DIR     Copy the skills into DIR instead of ~/.agents/skills (a machine with no tools can
#                      still copy-install this way)
#   --scaffold DIR     Only scaffold the project files into DIR, through skills/ab-project-start/scripts/scaffold.py
#   PROJECT_DIR        After installing, scaffold this project too
#   --legacy           Retired in v4: the flat copy into a project's .claude/ is gone; see the message it prints
#   --local, --force, --no-overwrite   Accepted for v3 compatibility and ignored: the script always installs from
#                      its own checkout, and the scaffold merges instead of overwriting

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

SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# The host list is the ship runner's adapter table (AB_HOSTS), so the two never drift.
# shellcheck source=skills/ab-ship-pipeline/scripts/hosts.sh disable=SC1091
. "$SOURCE_DIR/skills/ab-ship-pipeline/scripts/hosts.sh"
# shellcheck disable=SC2153   # AB_HOSTS comes from hosts.sh, sourced above
read -r -a ALL_HOSTS <<< "$AB_HOSTS"
COPY_HOSTS=(codex grok pi cursor-agent amp)      # scan ~/.agents/skills
DRY_RUN=false
ONLY=""
COPY_DIR="${AGENT_BLUEPRINT_COPY_DIR:-$HOME/.agents/skills}"
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
        --local|--force|--no-overwrite) shift ;;
        -h|--help)      sed -n '2,29p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
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

# ─── Native installs ──────────────────────────────────────────
run() {
    if [ "$DRY_RUN" = true ]; then plan "$*"; else "$@"; fi
}

if listed claude; then
    info "Claude Code: plugin install through its marketplace commands"
    if claude plugin marketplace list 2>/dev/null | grep -q 'agent-blueprint'; then
        run claude plugin marketplace update agent-blueprint
    else
        run claude plugin marketplace add "$SOURCE_DIR"
    fi
    plugins=$(claude plugin list 2>/dev/null || true)
    if printf '%s' "$plugins" | grep -q 'agent-blueprint@agent-blueprint'; then
        run claude plugin update agent-blueprint@agent-blueprint
    else
        run claude plugin install agent-blueprint@agent-blueprint
    fi
    if printf '%s' "$plugins" | grep -q 'claude-code-blueprint@'; then
        warn "The v3 plugin claude-code-blueprint is still installed; run the ab-migrate skill so the two sets of skills do not both load."
    fi
    success "Claude Code: agent-blueprint@agent-blueprint"
fi

if listed agy; then
    info "Antigravity: agy plugin install from this checkout (a copy in ~/.agents/skills would not cover it)"
    run agy plugin install "$SOURCE_DIR"
    success "Antigravity: agent-blueprint"
fi

# ─── Skills for the hosts that read a plain skills folder ─────
# Cursor CLI and Amp read Claude Code's plugin as well as ~/.agents/skills, so beside that plugin a
# shared copy would show them every skill twice. Then they use the Claude Code plugin, Codex gets a
# plugin of its own, and Grok Build, Pi and Hermes each get a copy in a folder only they read.
# Otherwise one shared copy covers every host that scans it. The machine decides, not the --only
# list: the Claude Code plugin is installed (or is being installed now) and Cursor CLI or Amp is on PATH.
claude_plugin=false
if listed claude; then
    claude_plugin=true
elif have claude && claude plugin list 2>/dev/null | grep -q 'agent-blueprint@agent-blueprint'; then
    claude_plugin=true
fi
SPLIT=false
if [ "$claude_plugin" = true ] && { have cursor-agent || have amp; } && [ "$COPY_DIR_SET" = false ]; then
    SPLIT=true
fi
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
    local previous=() name src dest src_real copy_real
    # The copy replaces each skill folder, so a destination that is the source itself (the path,
    # or a symlink to it) would delete the checkout's skills before copying them.
    src_real=$(cd "$SOURCE_DIR/skills" && pwd -P)
    copy_real=""
    if [ -d "$dest_dir" ]; then copy_real=$(cd "$dest_dir" && pwd -P); fi
    case "$copy_real/" in
        "$src_real"/*)
            error "--copy-dir points into this checkout's own skills folder ($src_real); choose another directory"
            exit 2 ;;
    esac
    if [ -f "$record" ]; then
        while IFS= read -r name; do previous+=("$name"); done < <(sed -n 's/^ *"\(ab-[a-z0-9-]*\)".*/\1/p' "$record")
    fi
    local current=() recorded=() kept=()
    for src in "$SOURCE_DIR"/skills/*/; do
        name=$(basename "$src")
        current+=("$name")
        dest="$dest_dir/$name"
        # A folder of that name that this destination's record does not list is someone else's:
        # leave it as it is rather than replace it.
        if [ -e "$dest" ] && ! in_list "$name" "${previous[@]:-}"; then
            kept+=("$name")
            continue
        fi
        recorded+=("$name")
        if [ "$DRY_RUN" = true ]; then
            echo -e "    ${DIM}copy  $name${NC}"
        else
            mkdir -p "$dest_dir"
            # Copy next to the destination first, then swap, so a failed copy leaves the old skill in place.
            rm -rf "${dest:?}.new"
            cp -R "$src" "$dest.new"
            rm -rf "${dest:?}"
            mv "$dest.new" "$dest"
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
        {
            echo "{"
            echo "  \"plugin\": \"agent-blueprint\","
            echo "  \"version\": \"$VERSION\","
            echo "  \"source\": \"$SOURCE_DIR\","
            echo "  \"skills\": ["
            local i=0
            for name in "${recorded[@]:-}"; do
                [ -n "$name" ] || continue
                i=$((i + 1))
                if [ "$i" -lt ${#recorded[@]} ]; then echo "    \"$name\","; else echo "    \"$name\""; fi
            done
            echo "  ]"
            echo "}"
        } > "$record"
    fi
    success "Skills copied to $dest_dir"
    if [ ${#kept[@]} -gt 0 ]; then
        warn "Kept ${#kept[@]} folder(s) in $dest_dir that this installer did not put there: ${kept[*]}. Remove them and run install.sh again to install the blueprint's."
    fi
}

# remove_recorded_copy DIR: removes the skills an earlier copy install recorded in DIR, and its
# record; every other folder in DIR stays.
remove_recorded_copy() {
    local dir="$1" record="$1/.agent-blueprint-install.json" name
    [ -f "$record" ] || return 0
    if ! grep -q '^ *"plugin": *"agent-blueprint",* *$' "$record"; then
        warn "Left $dir as it is: its install record does not name agent-blueprint"
        return 0
    fi
    # Names come only from the skills list, one per line as copy_skills writes them; the record's
    # other values (the checkout path among them) never name a folder to remove.
    while IFS= read -r name; do
        if [ "$DRY_RUN" = true ]; then
            echo -e "    ${DIM}remove $name${NC}"
        else
            rm -rf "${dir:?}/$name"
        fi
    done < <(sed -n 's/^ *"\(ab-[a-z0-9-]*\)",* *$/\1/p' "$record")
    if [ "$DRY_RUN" = true ]; then
        info "Would remove the earlier shared copy in $dir: Cursor CLI and Amp would list its skills a second time"
    else
        rm -f "$record"
        info "Removed the earlier shared copy in $dir: Cursor CLI and Amp would list its skills a second time"
    fi
}

if [ "$SPLIT" = true ]; then
    if listed cursor-agent; then success "Cursor CLI: covered by the Claude Code plugin (it imports Claude Code plugins)"; fi
    if listed amp; then success "Amp: covered by the Claude Code plugin (it reads Claude Code's plugin cache)"; fi
    if listed codex; then
        info "Codex: plugin install through its marketplace commands (a shared copy would reach Cursor CLI and Amp too)"
        run codex plugin marketplace add "$SOURCE_DIR"
        run codex plugin add agent-blueprint@agent-blueprint
        success "Codex: agent-blueprint@agent-blueprint"
    fi
    if listed grok; then copy_skills "$HOME/.grok/skills" grok; fi
    if listed pi; then copy_skills "$HOME/.pi/agent/skills" pi; fi
    if listed hermes; then copy_skills "$HOME/.hermes/skills" hermes; fi
    # The shared copy goes only when every host on PATH that read it has its own route now.
    stranded=()
    for h in codex grok pi hermes; do
        if have "$h" && ! listed "$h"; then stranded+=("$h"); fi
    done
    if [ ${#stranded[@]} -eq 0 ]; then
        remove_recorded_copy "$COPY_DIR"
    elif [ -f "$COPY_DIR/.agent-blueprint-install.json" ]; then
        warn "Kept the shared copy in $COPY_DIR: ${stranded[*]} still read it. Run install.sh without --only to give them their own routes."
    fi
else
    copy_reasons=()
    for h in "${COPY_HOSTS[@]}"; do
        listed "$h" || continue
        if [ "$h" = amp ] && listed claude; then
            info "Amp: covered by the Claude Code install (Amp reads Claude Code's plugin cache); no copy needed for it"
            continue
        fi
        copy_reasons+=("$h")
    done
    if listed hermes; then copy_reasons+=(hermes); fi
    [ "$COPY_DIR_SET" = true ] && copy_reasons+=("--copy-dir")
    if [ ${#copy_reasons[@]} -gt 0 ]; then
        copy_skills "$COPY_DIR" "${copy_reasons[@]}"
        for h in "${copy_reasons[@]}"; do
            case "$h" in
                hermes)
                    if [ -f "$HOME/.hermes/config.yaml" ] && grep -q -F "$COPY_DIR" "$HOME/.hermes/config.yaml"; then
                        success "Hermes: $COPY_DIR is already under skills.external_dirs"
                    else
                        warn "Hermes: add this to ~/.hermes/config.yaml so it indexes the copy (bare skill names, slash commands):"
                        echo "      skills:"
                        echo "        external_dirs:"
                        echo "          - $COPY_DIR"
                    fi ;;
                --copy-dir) ;;
                *) success "$h: covered by the copy in $COPY_DIR" ;;
            esac
        done
        if listed cursor-agent && listed claude; then
            warn "Cursor CLI can also import Claude Code plugins; keep one route or it lists every skill twice."
        fi
    fi
fi

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
