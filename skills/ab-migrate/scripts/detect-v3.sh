#!/usr/bin/env bash
# detect-v3.sh — find and, on request, remove what Agent Blueprint v3 (and v2) left in a project.
#
# Usage: bash detect-v3.sh [--apply] [--keep-instructions] [PROJECT_DIR]
#   default   report every v3 trace, one line each, and exit 0 (exit 3 when there is none)
#   --apply   remove the blueprint's own copies, rename CLAUDE.md to AGENTS.md with a pointer
#             CLAUDE.md, move ship state files aside; user files are never touched
#   --keep-instructions   leave CLAUDE.md and AGENTS.md exactly as they are (no rename)
#
# Other skill packs use some of the same names (brainstorming, writing-plans, code-reviewer),
# so a name alone proves nothing. Files matched by name are removed only when the project also
# shows the blueprint installed them: its plugin manifest, its ship.sh, its ship state files, a
# hooks.json wired to its handlers, or one of the skills only the blueprint ships. Without that
# evidence the matches are listed as `unsure` and left alone.
#
# What counts as a v3 trace (only files the blueprint itself installed):
#   .claude/skills/<v3 skill name>/        the 55 v3 skill names in references/v4-skill-names.tsv
#   .claude/commands/<v3 skill name>.md    v2 commands, same names
#   .claude/agents/<v3 agent name>.md      the 29 v3 agent names below
#   .claude/hooks/<blueprint handler>      the v3 handler file names
#   hooks/hooks.json, hooks/handlers/      a --legacy copy's hook files, when the handlers match
#   scripts/ship.sh                        when it is the blueprint's (carries its marker line)
#   .claude-plugin/plugin.json             when its name is claude-code-blueprint
#   .claude/ship-*.local.md, .claude/team-active.local.md   v3 run state
#   CLAUDE.md as a regular file with no AGENTS.md            the v3 instructions layout
#   the Claude Code plugin claude-code-blueprint, when `claude plugin list` shows it (reported, not removed)
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NAME_MAP="$HERE/../references/v4-skill-names.tsv"
APPLY=false
KEEP_INSTRUCTIONS=false
PROJECT="."
for arg in "$@"; do
    case "$arg" in
        --apply) APPLY=true ;;
        --keep-instructions) KEEP_INSTRUCTIONS=true ;;
        -*) echo "unknown option: $arg" >&2; exit 2 ;;
        *) PROJECT="$arg" ;;
    esac
done
cd "$PROJECT"

V3_AGENTS="architecture-strategist best-practices-researcher bug-reproduction-validator code-reviewer code-simplicity-reviewer codebase-context-mapper codebase-mapper convention-enforcer data-integrity-guardian deployment-verifier doc-claim-verifier findings-synthesizer findings-validator framework-docs-researcher frontend-reviewer git-history-analyzer integration-checker integration-verifier learnings-researcher pattern-mapper performance-oracle plan-checker pr-comment-resolver research-synthesizer schema-drift-detector security-sentinel team-lead test-coverage-reviewer test-gap-analyzer"
V3_HANDLERS="context-monitor.js prompt-guard.js read-injection-scanner.js sdd-cache-post.sh sdd-cache-pre.sh session-start.js ship-loop.sh task-completed.js teammate-idle.js validate-commit.js"

# The v3 skill names, read from the name map once (first column, header skipped).
V3_SKILLS=$([ -f "$NAME_MAP" ] && awk -F'\t' 'NR > 1 { printf "%s ", $1 }' "$NAME_MAP")
in_list() { case " $2 " in *" $1 "*) return 0 ;; esac; return 1; }
v3_skill() { in_list "$1" "$V3_SKILLS"; }   # is $1 one of the v3 skill names?

# Skills that only the blueprint ships; one of them in .claude/skills is evidence of a legacy copy.
V3_ONLY_SKILLS="build-pipeline ship-pipeline quick-fix review-swarm knowledge-compounding project-start session-wrap"
is_blueprint_ship() { [ -f scripts/ship.sh ] && grep -q -i 'blueprint\|ship-pipeline\|<promise>DONE</promise>' scripts/ship.sh; }
is_blueprint_manifest() { [ -f .claude-plugin/plugin.json ] && grep -q '"claude-code-blueprint"' .claude-plugin/plugin.json; }
blueprint_installed() {
    local n f
    is_blueprint_manifest && return 0
    is_blueprint_ship && return 0
    for f in .claude/ship-*.local.md .claude/team-active.local.md; do [ -f "$f" ] && return 0; done
    [ -f hooks/hooks.json ] && grep -q 'ship-loop.sh' hooks/hooks.json && return 0
    for n in $V3_ONLY_SKILLS; do [ -d ".claude/skills/$n" ] && return 0; done
    return 1
}
OWNED=false
blueprint_installed && OWNED=true

found=0
unsure=0
remove_paths=()
note() { found=$((found + 1)); echo "$1"; }
# A name match is removed only in a project the blueprint demonstrably installed into.
plan_rm() {
    if [ "$OWNED" = true ]; then
        remove_paths+=("$1"); note "remove  $1"
    else
        unsure=$((unsure + 1)); echo "unsure  $1  (a v3 blueprint name, but nothing else here shows the blueprint installed it; left alone)"
    fi
}

if [ -d .claude/skills ]; then
    for d in .claude/skills/*/; do
        [ -d "$d" ] || continue
        n=${d%/}; n=${n##*/}
        if v3_skill "$n"; then plan_rm "${d%/}"; fi
    done
fi
if [ -d .claude/commands ]; then
    for f in .claude/commands/*.md; do
        [ -f "$f" ] || continue
        n=${f##*/}; n=${n%.md}
        if v3_skill "$n"; then plan_rm "$f"; fi
    done
fi
if [ -d .claude/agents ]; then
    for f in .claude/agents/*.md; do
        [ -f "$f" ] || continue
        n=${f##*/}; n=${n%.md}
        if in_list "$n" "$V3_AGENTS"; then plan_rm "$f"; fi
    done
fi
for hookdir in .claude/hooks hooks/handlers; do
    [ -d "$hookdir" ] || continue
    for f in "$hookdir"/*; do
        [ -f "$f" ] || continue
        if in_list "${f##*/}" "$V3_HANDLERS"; then plan_rm "$f"; fi
    done
done
if [ -f hooks/hooks.json ] && grep -q 'CLAUDE_PLUGIN_ROOT\|hooks/handlers' hooks/hooks.json; then plan_rm hooks/hooks.json; fi
if is_blueprint_ship; then plan_rm scripts/ship.sh; fi
if is_blueprint_manifest; then plan_rm .claude-plugin/plugin.json; fi
for f in .claude/ship-*.local.md .claude/team-active.local.md; do
    [ -f "$f" ] && note "aside   $f -> .agent-blueprint/run/v3/${f##*/}"
done
rename_claude=false
if [ "$KEEP_INSTRUCTIONS" = false ] && [ -f CLAUDE.md ] && [ ! -L CLAUDE.md ] && [ ! -e AGENTS.md ] && [ ! -L AGENTS.md ]; then
    rename_claude=true
    note "rename  CLAUDE.md -> AGENTS.md, then CLAUDE.md becomes the one-line import @AGENTS.md"
fi
if command -v claude >/dev/null 2>&1 && claude plugin list 2>/dev/null | grep -q 'claude-code-blueprint@'; then
    note "plugin  claude-code-blueprint is still installed in Claude Code: run  claude plugin uninstall claude-code-blueprint@claude-code-blueprint"
fi

if [ "$found" -eq 0 ]; then
    echo "nothing to migrate: no v3 traces found"
    exit 3
fi
[ "$APPLY" = true ] || exit 0

echo "--- applying"
for p in "${remove_paths[@]:-}"; do
    [ -n "$p" ] || continue
    rm -rf "${p:?}"
    echo "removed $p"
done
for d in .claude/skills .claude/commands .claude/agents .claude/hooks hooks/handlers hooks .claude-plugin; do
    [ -d "$d" ] && [ -z "$(ls -A "$d")" ] && rmdir "$d" && echo "removed $d (empty)"
done
for f in .claude/ship-*.local.md .claude/team-active.local.md; do
    [ -f "$f" ] || continue
    mkdir -p .agent-blueprint/run/v3
    mv "$f" ".agent-blueprint/run/v3/${f##*/}"
    echo "moved $f aside"
done
if [ "$rename_claude" = true ]; then
    # The v3 instructions file becomes the canonical one; the old name keeps a one-line import.
    old_name="CLAUDE.md"; new_name="AGENTS.md"
    mv "$old_name" "$new_name"
    printf '@%s\n' "$new_name" > "$old_name"
    echo "renamed $old_name to $new_name; $old_name now imports it"
fi
exit 0
