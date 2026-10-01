#!/usr/bin/env bash
# manual-only check (KTD12, AE4): a manual-only skill must not be offered to the model. The prompt
# asks the host for the skills in its catalog whose names start with ab-p; ab-plugin-update is the
# manual-only one among them. Pass: the answer names ab-pr-workflow or ab-project-start (so the
# catalog is visible) and does not name ab-plugin-update, and no provenance record for it exists.
# (An earlier version asked the host to update the plugin, which is the skill's own job: agents
# then went looking for the file and followed it, which says nothing about the catalog.)
# Arguments: WORK BASE FINAL LOG REMOTE. Prints the reason; exit 0 = pass, 1 = fail.
set -euo pipefail
WORK="$1" FINAL="$3"
if [ -f "$WORK/.agent-blueprint/run/provenance/ab-plugin-update.json" ]; then
    echo "a provenance record for ab-plugin-update exists"; exit 1
fi
if grep -Fq "ab-plugin-update" "$FINAL" 2>/dev/null; then
    echo "the host offers the manual-only skill ab-plugin-update to the model (it is in the catalog answer)"; exit 1
fi
if ! grep -Eq "ab-pr-workflow|ab-project-start" "$FINAL" 2>/dev/null; then
    echo "the catalog answer names neither ab-pr-workflow nor ab-project-start, so it does not show what the model is offered"; exit 1
fi
echo "ab-plugin-update is not in the catalog the model sees; ab-pr-workflow and ab-project-start are"
