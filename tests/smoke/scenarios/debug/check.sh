#!/usr/bin/env bash
# debug check: the suite passes, src/notes/store.py changed, and a regression test is kept or added.
# Arguments: WORK BASE FINAL LOG REMOTE. Prints the reason; exit 0 = pass, 1 = fail.
set -euo pipefail
WORK="$1" BASE="$2"
cd "$WORK"
if ! python3 -m unittest discover -s tests >/dev/null 2>&1; then
    echo "the test suite still fails"; exit 1
fi
if git diff --quiet "$BASE" -- src/notes/store.py; then
    echo "src/notes/store.py is unchanged"; exit 1
fi
if [ -z "$(git diff --name-only "$BASE" -- tests)" ] && [ -z "$(git ls-files --others --exclude-standard -- tests)" ] \
    && ! grep -q "test_search_is_case_insensitive" tests/test_search.py; then
    echo "no regression test kept or added under tests/"; exit 1
fi
echo "suite passes; store.py fixed; regression test present"
