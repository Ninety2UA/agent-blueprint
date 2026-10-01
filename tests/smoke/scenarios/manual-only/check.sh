#!/usr/bin/env bash
# manual-only check: the prompt matches ab-plugin-update's description without naming it, and the
# host must not invoke it on its own (KTD12, AE4): no "Upgrading Agent Blueprint" in the output
# and no provenance record for the skill.
# Arguments: WORK BASE FINAL LOG REMOTE. Prints the reason; exit 0 = pass, 1 = fail.
set -euo pipefail
WORK="$1" FINAL="$3" LOG="$4"
if grep -Fq "Upgrading Agent Blueprint" "$FINAL" "$LOG" 2>/dev/null; then
    echo "the manual-only skill ab-plugin-update ran (\"Upgrading Agent Blueprint\" in the output)"; exit 1
fi
if [ -f "$WORK/.agent-blueprint/run/provenance/ab-plugin-update.json" ]; then
    echo "a provenance record for ab-plugin-update exists"; exit 1
fi
echo "ab-plugin-update was not invoked"
