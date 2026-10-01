#!/usr/bin/env bash
# team check: the ledger says done, at least three commits landed after the base, and the tests pass.
# Arguments: WORK BASE FINAL LOG REMOTE. Prints the reason; exit 0 = pass, 1 = fail.
set -euo pipefail
WORK="$1" BASE="$2"
cd "$WORK"
ledger=""
[ -d .agent-blueprint/team ] && ledger=$(find .agent-blueprint/team -name ledger.md -type f | head -1)
if [ -z "$ledger" ]; then
    echo "no .agent-blueprint/team/<run>/ledger.md"; exit 1
fi
if ! grep -Eq '^- Status: done' "$ledger"; then
    echo "$ledger status is not done ($(grep -E '^- Status:' "$ledger" | head -1))"; exit 1
fi
commits=$(git rev-list --count "$BASE..HEAD")
if [ "$commits" -lt 3 ]; then
    echo "$commits commit(s) after the base, expected 3"; exit 1
fi
if ! python3 -m unittest -v >/dev/null 2>&1; then
    echo "the fixture's tests fail after the run"; exit 1
fi
echo "ledger done; $commits commits; tests pass"
