#!/usr/bin/env bash
# Runs the hook tests (U12). They live with the other gate tests so one command covers everything.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."
python3 -m unittest discover -s tests/gates -p 'test_hooks.py' "$@"
