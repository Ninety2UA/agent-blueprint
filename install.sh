#!/usr/bin/env bash
set -euo pipefail

# ╔══════════════════════════════════════════════════════════════╗
# ║  Agent Blueprint — Plugin Installer                    ║
# ║  Installs the blueprint as a Claude Code plugin              ║
# ╚══════════════════════════════════════════════════════════════╝

REPO_URL="https://github.com/Ninety2UA/agent-blueprint"
TEMP_DIR=""
VERSION="3.8.0"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
DIM='\033[2m'
BOLD='\033[1m'
NC='\033[0m'

print_banner() {
    echo ""
    echo -e "${BOLD}  Agent Blueprint${NC} ${DIM}v${VERSION}${NC}"
    echo -e "${DIM}  Production-grade AI-assisted development toolkit${NC}"
    echo ""
}

info()    { echo -e "  ${BLUE}▸${NC} $1"; }
success() { echo -e "  ${GREEN}✓${NC} $1"; }
warn()    { echo -e "  ${YELLOW}!${NC} $1"; }
error()   { echo -e "  ${RED}✗${NC} $1"; }

cleanup() {
    if [ -n "$TEMP_DIR" ] && [ -d "$TEMP_DIR" ]; then
        rm -rf "$TEMP_DIR"
    fi
}
trap cleanup EXIT

usage() {
    echo "Usage: $0 [OPTIONS] [TARGET_DIR]"
    echo ""
    echo "Install the Agent Blueprint plugin and optionally scaffold a project."
    echo ""
    echo "Arguments:"
    echo "  TARGET_DIR          Project directory to scaffold (optional)"
    echo ""
    echo "Options:"
    echo "  --scaffold          Scaffold project files only (plugin already installed)"
    echo "  --legacy            Legacy mode: copy all files into project (no plugin)"
    echo "  --no-overwrite      Skip files that already exist"
    echo "  --local             Install from local repo (for development)"
    echo "  --force             Overwrite all existing files without prompting"
    echo "  --dry-run           Show what would be installed without making changes"
    echo "  -v, --version       Show version and exit"
    echo "  -h, --help          Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0                              # Install plugin (user-wide)"
    echo "  $0 ~/projects/my-app            # Install plugin + scaffold project"
    echo "  $0 --scaffold ~/projects/my-app # Scaffold only (plugin already installed)"
    echo "  $0 --legacy ~/projects/my-app   # Legacy: copy everything into project"
    echo ""
}

# Parse arguments
TARGET_DIR=""
SCAFFOLD_ONLY=false
LEGACY=false
LOCAL_SOURCE=false
NO_OVERWRITE=false
FORCE=false
DRY_RUN=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --scaffold)     SCAFFOLD_ONLY=true; shift ;;
        --legacy)       LEGACY=true; shift ;;
        --local)        LOCAL_SOURCE=true; shift ;;
        --no-overwrite) NO_OVERWRITE=true; shift ;;
        --force)        FORCE=true; shift ;;
        --dry-run)      DRY_RUN=true; shift ;;
        -v|--version)   echo "agent-blueprint v${VERSION}"; exit 0 ;;
        -h|--help)      usage; exit 0 ;;
        -*)             error "Unknown option: $1"; usage; exit 1 ;;
        *)              TARGET_DIR="$1"; shift ;;
    esac
done

print_banner

# Validate
if [ "$SCAFFOLD_ONLY" = true ] && [ "$LEGACY" = true ]; then
    error "--scaffold and --legacy are mutually exclusive"
    exit 1
fi

# Resolve source
if [ "$LOCAL_SOURCE" = true ]; then
    # Use the directory containing this script as the source
    SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
    SOURCE_DIR="$SCRIPT_DIR"
    info "Using local source: $SOURCE_DIR"
else
    info "Downloading blueprint..."
    TEMP_DIR=$(mktemp -d)

    if command -v git &>/dev/null; then
        git clone --depth 1 --quiet "$REPO_URL" "$TEMP_DIR/template" 2>/dev/null || {
            error "Failed to clone repository. Check your internet connection."
            exit 1
        }
    else
        error "git is required. Please install git and try again."
        exit 1
    fi

    SOURCE_DIR="$TEMP_DIR/template"
fi

# The repository root is the plugin root.
PLUGIN_DIR="$SOURCE_DIR"
# Scripts that ship with the plugin (scripts/ also holds repo-only CI gates).
PLUGIN_SCRIPTS=(ship.sh)

# ─── Copy function with conflict handling ─────────────────────
copy_item() {
    local src="$1"
    local dest="$2"
    local rel_path="${dest#"$TARGET_DIR"/}"

    if [ -d "$src" ]; then
        if [ "$DRY_RUN" = true ]; then
            echo -e "  ${DIM}  mkdir $rel_path/${NC}"
        else
            mkdir -p "$dest"
        fi
        return
    fi

    if [ -f "$dest" ]; then
        if [ "$NO_OVERWRITE" = true ]; then
            echo -e "  ${DIM}  skip  $rel_path (exists)${NC}"
            return
        fi
        if [ "$FORCE" = false ] && [ "$DRY_RUN" = false ]; then
            case "$rel_path" in
                CLAUDE.md|BACKLOG.md|docs/context/*)
                    warn "$rel_path already exists"
                    read -p "    Overwrite? [y/N] " -n 1 -r </dev/tty
                    echo
                    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                        echo -e "  ${DIM}  skip  $rel_path${NC}"
                        return
                    fi
                    ;;
            esac
        fi
    fi

    if [ "$DRY_RUN" = true ]; then
        echo -e "  ${DIM}  copy  $rel_path${NC}"
    else
        mkdir -p "$(dirname "$dest")"
        cp "$src" "$dest"
    fi
}

# ─── Legacy mode: copy everything into the project ───────────
if [ "$LEGACY" = true ]; then
    if [ -z "$TARGET_DIR" ]; then
        TARGET_DIR="."
    fi
    TARGET_DIR="$(cd "$TARGET_DIR" 2>/dev/null && pwd || echo "$TARGET_DIR")"

    if [ ! -d "$TARGET_DIR" ]; then
        info "Creating target directory: $TARGET_DIR"
        if [ "$DRY_RUN" = false ]; then
            mkdir -p "$TARGET_DIR"
        fi
    fi

    info "Legacy mode — installing all files into ${BOLD}$TARGET_DIR${NC}"
    echo ""

    # Install engine files (skills, agents, hooks)
    for dir in skills agents; do
        if [ -d "$PLUGIN_DIR/$dir" ]; then
            find "$PLUGIN_DIR/$dir" -type f | while read -r file; do
                rel="${file#"$PLUGIN_DIR"/}"
                copy_item "$file" "$TARGET_DIR/.claude/$rel"
            done
            success ".claude/$dir/ installed"
        fi
    done

    # Hook handlers
    if [ -d "$PLUGIN_DIR/hooks/handlers" ]; then
        find "$PLUGIN_DIR/hooks/handlers" -type f | while read -r file; do
            rel="${file#"$PLUGIN_DIR/hooks/handlers"/}"
            copy_item "$file" "$TARGET_DIR/.claude/hooks/$rel"
        done
        success ".claude/hooks/ installed"
    fi

    # hooks.json, plugin manifest, scripts
    if [ -d "$PLUGIN_DIR/hooks" ]; then
        copy_item "$PLUGIN_DIR/hooks/hooks.json" "$TARGET_DIR/hooks/hooks.json"
        success "hooks/ installed"
    fi
    # The repo root is the plugin root, so its .claude-plugin/ and scripts/ also
    # hold repo-only files (marketplace manifest, CI gates); copy only what ships.
    if [ -f "$PLUGIN_DIR/.claude-plugin/plugin.json" ]; then
        copy_item "$PLUGIN_DIR/.claude-plugin/plugin.json" "$TARGET_DIR/.claude-plugin/plugin.json"
        success ".claude-plugin/ installed"
    fi
    for script in "${PLUGIN_SCRIPTS[@]}"; do
        if [ -f "$PLUGIN_DIR/scripts/$script" ]; then
            copy_item "$PLUGIN_DIR/scripts/$script" "$TARGET_DIR/scripts/$script"
        fi
    done
    if [ "$DRY_RUN" = false ] && [ -d "$TARGET_DIR/scripts" ]; then
        find "$TARGET_DIR/scripts" -name "*.sh" -type f -exec chmod +x {} \; 2>/dev/null || true
    fi
    success "scripts/ installed"

    # Template/project files
    if [ -d "$PLUGIN_DIR/templates" ]; then
        find "$PLUGIN_DIR/templates" -type f | while read -r file; do
            rel="${file#"$PLUGIN_DIR/templates"/}"
            copy_item "$file" "$TARGET_DIR/$rel"
        done
        success "Project files installed (CLAUDE.md, docs/, etc.)"
    fi

    # Settings
    if [ -f "$PLUGIN_DIR/.claude/settings.json" ]; then
        copy_item "$PLUGIN_DIR/.claude/settings.json" "$TARGET_DIR/.claude/settings.json"
    fi

    # Placeholder directories
    if [ "$DRY_RUN" = false ]; then
        for dir in src tests infra; do
            mkdir -p "$TARGET_DIR/$dir"
            if [ ! -f "$TARGET_DIR/$dir/.gitkeep" ]; then
                touch "$TARGET_DIR/$dir/.gitkeep"
            fi
        done
    fi

    echo ""
    if [ "$DRY_RUN" = true ]; then
        info "Dry run complete. No files were modified."
    else
        echo -e "  ${GREEN}${BOLD}Installation complete!${NC} (legacy mode)"
        echo ""
        echo -e "  ${BOLD}Next steps:${NC}"
        echo -e "  ${DIM}1.${NC} cd $TARGET_DIR"
        echo -e "  ${DIM}2.${NC} claude"
        echo -e "  ${DIM}3.${NC} /ab-project-start ${DIM}← interactive project setup${NC}"
    fi
    echo ""
    exit 0
fi

# ─── Plugin mode (default) ────────────────────────────────────
CLAUDE_DIR="$HOME/.claude"
SETTINGS_FILE="$CLAUDE_DIR/settings.json"
KNOWN_FILE="$CLAUDE_DIR/plugins/known_marketplaces.json"
INSTALLED_FILE="$CLAUDE_DIR/plugins/installed_plugins.json"
MARKETPLACE_NAME="agent-blueprint"
PLUGIN_NAME="agent-blueprint"

if [ "$SCAFFOLD_ONLY" = false ]; then
    info "Installing as Claude Code plugin..."

    # Ensure directories exist
    mkdir -p "$CLAUDE_DIR/plugins/cache/$MARKETPLACE_NAME/$PLUGIN_NAME"

    # Copy plugin to cache
    CACHE_DIR="$CLAUDE_DIR/plugins/cache/$MARKETPLACE_NAME/$PLUGIN_NAME/$VERSION"
    if [ -d "$CACHE_DIR" ]; then
        rm -rf "$CACHE_DIR"
    fi

    if [ "$DRY_RUN" = false ]; then
        mkdir -p "$CACHE_DIR"
        # Copy the plugin engine files from the repository root
        for dir in skills agents hooks templates; do
            if [ -d "$PLUGIN_DIR/$dir" ]; then
                cp -R "$PLUGIN_DIR/$dir" "$CACHE_DIR/$dir"
            fi
        done
        mkdir -p "$CACHE_DIR/.claude-plugin" "$CACHE_DIR/scripts"
        cp "$PLUGIN_DIR/.claude-plugin/plugin.json" "$CACHE_DIR/.claude-plugin/plugin.json"
        for script in "${PLUGIN_SCRIPTS[@]}"; do
            cp "$PLUGIN_DIR/scripts/$script" "$CACHE_DIR/scripts/$script"
        done
        # Make scripts executable
        find "$CACHE_DIR" -name "*.sh" -type f -exec chmod +x {} \; 2>/dev/null || true
        success "Plugin cached at $CACHE_DIR"
    fi

    # Register marketplace in known_marketplaces.json
    if [ "$DRY_RUN" = false ]; then
        if [ ! -f "$KNOWN_FILE" ]; then
            echo '{}' > "$KNOWN_FILE"
        fi

        # Use Python to safely update JSON
        python3 -c "
import json, sys
with open('$KNOWN_FILE', 'r') as f:
    data = json.load(f)
data['$MARKETPLACE_NAME'] = {
    'source': {'source': 'github', 'repo': 'Ninety2UA/agent-blueprint'},
    'installLocation': '$CACHE_DIR',
    'lastUpdated': '$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")',
    'autoUpdate': True
}
with open('$KNOWN_FILE', 'w') as f:
    json.dump(data, f, indent=2)
    f.write('\n')
" 2>/dev/null || warn "Could not update known_marketplaces.json — update manually"
        success "Marketplace registered"
    fi

    # Register plugin in installed_plugins.json
    if [ "$DRY_RUN" = false ]; then
        if [ ! -f "$INSTALLED_FILE" ]; then
            echo '{"version": 2, "plugins": {}}' > "$INSTALLED_FILE"
        fi

        python3 -c "
import json
with open('$INSTALLED_FILE', 'r') as f:
    data = json.load(f)
key = '$PLUGIN_NAME@$MARKETPLACE_NAME'
data['plugins'][key] = [{
    'scope': 'user',
    'installPath': '$CACHE_DIR',
    'version': '$VERSION',
    'installedAt': '$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")',
    'lastUpdated': '$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")'
}]
with open('$INSTALLED_FILE', 'w') as f:
    json.dump(data, f, indent=2)
    f.write('\n')
" 2>/dev/null || warn "Could not update installed_plugins.json — update manually"
        success "Plugin registered"
    fi

    # Enable plugin in settings.json
    if [ "$DRY_RUN" = false ]; then
        if [ ! -f "$SETTINGS_FILE" ]; then
            echo '{}' > "$SETTINGS_FILE"
        fi

        python3 -c "
import json
with open('$SETTINGS_FILE', 'r') as f:
    data = json.load(f)
if 'enabledPlugins' not in data:
    data['enabledPlugins'] = {}
data['enabledPlugins']['$PLUGIN_NAME@$MARKETPLACE_NAME'] = True
with open('$SETTINGS_FILE', 'w') as f:
    json.dump(data, f, indent=2)
    f.write('\n')
" 2>/dev/null || warn "Could not update settings.json — enable plugin manually"
        success "Plugin enabled"
    fi
fi

# ─── Scaffold project (if target dir provided) ────────────────
if [ -n "$TARGET_DIR" ]; then
    TARGET_DIR="$(cd "$TARGET_DIR" 2>/dev/null && pwd || echo "$TARGET_DIR")"

    if [ ! -d "$TARGET_DIR" ]; then
        info "Creating target directory: $TARGET_DIR"
        if [ "$DRY_RUN" = false ]; then
            mkdir -p "$TARGET_DIR"
        fi
    fi

    info "Scaffolding project at ${BOLD}$TARGET_DIR${NC}..."

    if [ -d "$PLUGIN_DIR/templates" ]; then
        find "$PLUGIN_DIR/templates" -type f | while read -r file; do
            rel="${file#"$PLUGIN_DIR/templates"/}"
            copy_item "$file" "$TARGET_DIR/$rel"
        done
        success "Project files scaffolded"
    fi

    # Placeholder directories
    if [ "$DRY_RUN" = false ]; then
        for dir in src tests infra; do
            mkdir -p "$TARGET_DIR/$dir"
            if [ ! -f "$TARGET_DIR/$dir/.gitkeep" ]; then
                touch "$TARGET_DIR/$dir/.gitkeep"
            fi
        done
    fi
fi

echo ""

if [ "$DRY_RUN" = true ]; then
    info "Dry run complete. No files were modified."
elif [ "$SCAFFOLD_ONLY" = true ]; then
    echo -e "  ${GREEN}${BOLD}Project scaffolded!${NC}"
    echo ""
    echo -e "  ${BOLD}Next steps:${NC}"
    echo -e "  ${DIM}1.${NC} cd $TARGET_DIR"
    echo -e "  ${DIM}2.${NC} claude"
    echo -e "  ${DIM}3.${NC} /ab-project-start ${DIM}← interactive project setup${NC}"
elif [ -n "$TARGET_DIR" ]; then
    echo -e "  ${GREEN}${BOLD}Plugin installed + project scaffolded!${NC}"
    echo ""
    echo -e "  ${BOLD}Next steps:${NC}"
    echo -e "  ${DIM}1.${NC} cd $TARGET_DIR"
    echo -e "  ${DIM}2.${NC} claude"
    echo -e "  ${DIM}3.${NC} /ab-project-start ${DIM}← interactive project setup${NC}"
    echo ""
    echo -e "  ${DIM}Plugin provides: 55 skills · 29 agents · 10 hooks${NC}"
    echo -e "  ${DIM}Quick start: /ab-build-pipeline · /ab-ship-pipeline · /ab-brainstorming · /ab-review-swarm · /ab-deep-research${NC}"
else
    echo -e "  ${GREEN}${BOLD}Plugin installed!${NC}"
    echo ""
    echo -e "  ${BOLD}Next steps:${NC}"
    echo -e "  ${DIM}1.${NC} cd your-project"
    echo -e "  ${DIM}2.${NC} claude"
    echo -e "  ${DIM}3.${NC} /ab-project-start ${DIM}← scaffolds project + interactive setup${NC}"
    echo ""
    echo -e "  ${DIM}Plugin provides: 55 skills · 29 agents · 10 hooks${NC}"
    echo -e "  ${DIM}Available in all projects — no per-project installation needed${NC}"
fi

echo ""
