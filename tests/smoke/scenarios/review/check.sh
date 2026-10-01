#!/usr/bin/env bash
# review check: the review output names eval and cli.py. The output is the final message plus any
# file the skill wrote under .agent-blueprint/review-runs/ or docs/ since the base commit.
# Arguments: WORK BASE FINAL LOG REMOTE. Prints the reason; exit 0 = pass, 1 = fail.
set -euo pipefail
WORK="$1" BASE="$2" FINAL="$3"
cd "$WORK"
TEXT=$(mktemp "${TMPDIR:-/tmp}/ab-smoke-review.XXXXXX")
trap 'rm -f "$TEXT"' EXIT
cat "$FINAL" > "$TEXT" 2>/dev/null || true
if [ -d .agent-blueprint/review-runs ]; then
    find .agent-blueprint/review-runs -type f -exec cat {} + >> "$TEXT" 2>/dev/null || true
fi
{ git diff --name-only "$BASE" -- docs; git ls-files --others --exclude-standard -- docs; } | while IFS= read -r f; do
    [ -f "$f" ] && cat "$f" >> "$TEXT"
done
missing=""
grep -Eq '(^|[^A-Za-z0-9_])eval([^A-Za-z0-9_]|$)' "$TEXT" || missing="eval"
grep -Fq 'cli.py' "$TEXT" || missing="${missing:+$missing, }cli.py"
if [ -n "$missing" ]; then
    echo "the review output does not name: $missing"; exit 1
fi
echo "the review names eval and cli.py"
