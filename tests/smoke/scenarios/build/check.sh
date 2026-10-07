#!/usr/bin/env bash
# build check: the hidden acceptance test passes in a venv built from the project's declared
# dependencies, and the work landed: the prompt asks for a commit when the tests pass, so at least
# one commit after the base, or, on a host whose sandbox cannot write .git (Codex), the no-commit
# shape the team check accepts: changes left in the tree with the message in commit-msg.md.
# A run that changed nothing fails here even though the existing tests pass.
# Arguments: WORK BASE FINAL LOG REMOTE. Prints the reason; exit 0 = pass, 1 = fail.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../../lib.sh disable=SC1091
. "$HERE/../../lib.sh"
WORK="$1" BASE="$2"
# Counted before the acceptance test, which itself adds files to the tree.
commits=$(git -C "$WORK" rev-list --count "$BASE..HEAD")
changed=$(git -C "$WORK" status --porcelain --untracked-files=all | grep -c . || true)
reason=$(acceptance_test "$WORK") || { echo "$reason"; exit 1; }
landed="$commits commit(s) after the base"
if [ "$commits" -eq 0 ]; then
    if [ "$changed" -gt 0 ] && [ -s "$WORK/.agent-blueprint/run/commit-msg.md" ]; then
        landed="no-commit mode ($changed changed files in the tree, commit-msg.md written)"
    else
        echo "$reason, but nothing was committed after the base"; exit 1
    fi
fi
echo "$reason; $landed"
