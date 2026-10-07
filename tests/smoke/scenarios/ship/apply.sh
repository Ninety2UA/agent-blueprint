#!/usr/bin/env bash
# ship seed: the same feature request as the build cell, shipped through the runner.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mkdir -p "$1/docs/plans"
cp "$HERE/../build/feature-export-table.md" "$1/docs/plans/feature-export-table.md"
