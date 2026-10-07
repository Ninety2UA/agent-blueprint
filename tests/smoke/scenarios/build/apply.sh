#!/usr/bin/env bash
# build seed: the feature request the build pipeline implements.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mkdir -p "$1/docs/plans"
cp "$HERE/feature-export-table.md" "$1/docs/plans/feature-export-table.md"
