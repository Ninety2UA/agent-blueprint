#!/usr/bin/env bash
# TDD override seed: existing, untested functions in the module the task will extend.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cp "$HERE/textutil.py" "$1/src/notes/textutil.py"
