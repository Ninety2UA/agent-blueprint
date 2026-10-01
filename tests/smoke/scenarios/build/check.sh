#!/usr/bin/env bash
# build check: the hidden acceptance test passes in a venv built from the project's declared
# dependencies. A run that changed nothing fails here even though the existing tests pass.
# Arguments: WORK BASE FINAL LOG REMOTE. Prints the reason; exit 0 = pass, 1 = fail.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../../lib.sh disable=SC1091
. "$HERE/../../lib.sh"
acceptance_test "$1"
