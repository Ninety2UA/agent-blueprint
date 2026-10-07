#!/usr/bin/env bash
# team seed: the three-task fixture from the U7 runs replaces the notes project (T1 and T3 share
# calc.py and test_calc.py, so they land in different waves).
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK="$1"
rm -rf "$WORK/src" "$WORK/tests" "$WORK/pyproject.toml" "$WORK/README.md" "$WORK/docs/plans"
mkdir -p "$WORK/docs/context" "$WORK/docs/plans"
cp "$HERE/calc.py" "$WORK/calc.py"
cp "$HERE/docs/context/CONVENTIONS.md" "$WORK/docs/context/CONVENTIONS.md"
cp "$HERE/docs/plans/three-task-plan.md" "$WORK/docs/plans/three-task-plan.md"
