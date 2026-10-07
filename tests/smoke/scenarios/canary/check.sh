#!/usr/bin/env bash
# canary check: the final message carries the codename from AGENTS.md.
# Arguments: WORK BASE FINAL LOG REMOTE. Prints the reason; exit 0 = pass, 1 = fail.
set -euo pipefail
FINAL="$3"
if grep -q "HARBOR-19" "$FINAL"; then
    echo "final message names HARBOR-19"
else
    echo "final message lacks HARBOR-19: $(tr '\n' ' ' < "$FINAL" | cut -c1-120)"; exit 1
fi
