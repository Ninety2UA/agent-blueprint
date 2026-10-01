#!/usr/bin/env bash
# ship check: the runner published (its output says so), the gh shim saw `pr create`, the bare
# remote holds the branch, and the acceptance test passes on the pushed branch.
# Arguments: WORK BASE FINAL LOG REMOTE. Prints the reason; exit 0 = pass, 1 = fail.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../../lib.sh disable=SC1091
. "$HERE/../../lib.sh"
WORK="$1" LOG="$4" REMOTE="$5"
BRANCH=$(git -C "$WORK" symbolic-ref --short -q HEAD)
if ! grep -Eq "Opened pull request|Updated pull request" "$LOG"; then
    echo "the runner did not report a publish (see the log)"; exit 1
fi
if ! grep -q "^gh pr create" "${GH_SHIM_LOG:?}"; then
    echo "the gh shim never saw 'pr create'"; exit 1
fi
if ! git --git-dir="$REMOTE" show-ref --verify -q "refs/heads/$BRANCH"; then
    echo "the bare remote has no branch $BRANCH"; exit 1
fi
CLONE=$(mktemp -d "${TMPDIR:-/tmp}/ab-smoke-pushed-XXXXXX")
trap 'rm -rf "$CLONE"' EXIT
git clone -q --branch "$BRANCH" "$REMOTE" "$CLONE/work" 2>/dev/null
if ! reason=$(acceptance_test "$CLONE/work"); then
    echo "on the pushed branch: $reason"; exit 1
fi
echo "published; pr create recorded; $reason on the pushed branch"
