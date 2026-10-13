#!/usr/bin/env bash
# Brainstorm override seed: the user already approved this design for implementation.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mkdir -p "$1/docs/designs"
cp "$HERE/note-count.md" "$1/docs/designs/note-count.md"
