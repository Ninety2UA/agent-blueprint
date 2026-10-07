#!/usr/bin/env bash
# review seed: `notes list --filter EXPR` evaluates a user-supplied expression with eval().
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cp "$HERE/cli.py" "$1/src/notes/cli.py"
