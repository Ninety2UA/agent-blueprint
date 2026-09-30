#!/usr/bin/env bash
# detect-v3.sh — find and, on request, remove what Agent Blueprint v3 (and v2) left in a project.
#
# Usage: bash detect-v3.sh [--apply] [PROJECT_DIR]
#   default   report every v3 trace, one line each, and exit 0 (exit 3 when there is none)
#   --apply   remove the blueprint's own copies, rename CLAUDE.md to AGENTS.md with a pointer
#             CLAUDE.md, move ship state files aside; user files are never touched
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
PROJECT="."
for arg in "$@"; do
    case "$arg" in
        --apply) APPLY=true ;;
        -*) echo "unknown option: $arg" >&2; exit 2 ;;
        *) PROJECT="$arg" ;;
    esac
done
cd "$PROJECT"

V3_AGENTS="architecture-strategist best-practices-researcher bug-reproduction-validator code-reviewer code-simplicity-reviewer codebase-context-mapper codebase-mapper convention-enforcer data-integrity-guardian deployment-verifier doc-claim-verifier findings-synthesizer findings-validator framework-docs-researcher frontend-reviewer git-history-analyzer integration-checker integration-verifier learnings-researcher pattern-mapper performance-oracle plan-checker pr-comment-resolver research-synthesizer schema-drift-detector security-sentinel team-lead test-coverage-reviewer test-gap-analyzer"
V3_HANDLERS="context-monitor.js prompt-guard.js read-injection-scanner.js sdd-cache-post.sh sdd-cache-pre.sh session-start.js ship-loop.sh task-completed.js teammate-idle.js validate-commit.js"

v3_skill() {   # is $1 one of the v3 skill names?
    [ -f "$NAME_MAP" ] || return 1
    awk -F'\t' -v n="$1" 'NR > 1 && $1 == n { found = 1 } END { exit !found }' "$NAME_MAP"
}
in_list() { case " $2 " in *" $1 "*) return 0 ;; esac; return 1; }

found=0
remove_paths=()
note() { found=$((found + 1)); echo "$1"; }
plan_rm() { remove_paths+=("$1"); note "remove  $1"; }

if [ -d .claude/skills ]; then
    for d in .claude/skills/*/; do
        [ -d "$d" ] || continue
        n=$(basename "$d")
        if v3_skill "$n" || v3_skill "${n#ab-}"; then plan_rm "${d%/}"; fi
    done
fi
if [ -d .claude/commands ]; then
    for f in .claude/commands/*.md; do
        [ -f "$f" ] || continue
        n=$(basename "$f" .md)
        if v3_skill "$n"; then plan_rm "$f"; fi
    done
fi
if [ -d .claude/agents ]; then
    for f in .claude/agents/*.md; do
        [ -f "$f" ] || continue
        if in_list "$(basename "$f" .md)" "$V3_AGENTS"; then plan_rm "$f"; fi
    done
fi
for hookdir in .claude/hooks hooks/handlers; do
    [ -d "$hookdir" ] || continue
    for f in "$hookdir"/*; do
        [ -f "$f" ] || continue
        if in_list "$(basename "$f")" "$V3_HANDLERS"; then plan_rm "$f"; fi
    done
done
if [ -f hooks/hooks.json ] && grep -q 'CLAUDE_PLUGIN_ROOT\|hooks/handlers' hooks/hooks.json; then plan_rm hooks/hooks.json; fi
if [ -f scripts/ship.sh ] && grep -q -i 'blueprint\|ship-pipeline\|<promise>DONE</promise>' scripts/ship.sh; then plan_rm scripts/ship.sh; fi
if [ -f .claude-plugin/plugin.json ] && grep -q '"claude-code-blueprint"' .claude-plugin/plugin.json; then plan_rm .claude-plugin/plugin.json; fi
for f in .claude/ship-*.local.md .claude/team-active.local.md; do
    [ -f "$f" ] && note "aside   $f -> .agent-blueprint/run/v3/$(basename "$f")"
done
rename_claude=false
if [ -f CLAUDE.md ] && [ ! -L CLAUDE.md ] && [ ! -e AGENTS.md ]; then
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
    mv "$f" ".agent-blueprint/run/v3/$(basename "$f")"
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
