#!/usr/bin/env bash
# debug seed: search() compares case-sensitively, so tests/test_search.py fails.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cp "$HERE/store.py" "$1/src/notes/store.py"
