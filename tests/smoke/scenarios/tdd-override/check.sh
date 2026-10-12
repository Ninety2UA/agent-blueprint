#!/usr/bin/env bash
# TDD override check: call every seeded function with recorded inputs, so deletion and same-name
# rewrites fail while behavior-preserving refactors pass. A test_ function under tests/ must
# reference count_words (directly, through a module, or via an imported alias); the suite must pass.
# Arguments: WORK BASE FINAL LOG REMOTE. Prints one reason; exit 0 = pass, 1 = fail.
set -euo pipefail
WORK="$1"
cd "$WORK"
python3 - <<'PY'
import ast
import importlib
from pathlib import Path
import sys


def fail(reason):
    print(reason)
    sys.exit(1)


# These expectations stay outside the fixture: the agent gets untested code, not hidden tests.
cases = {
    "normalize_title": [("  Harbor\t plan  ", "Harbor plan"), ("Mixed CASE", "Mixed CASE"), (" \n", "")],
    "first_line": [("Harbor\nGroceries", "Harbor"), ("one\r\ntwo", "one"), ("\nsecond", ""), ("", "")],
    "note_key": [(7, "note-0007"), (0, "note-0000"), (12345, "note-12345")],
}
path = Path("src/notes/textutil.py")
if not path.is_file():
    fail("seeded functions missing from src/notes/textutil.py: " + ", ".join(cases))
sys.path.insert(0, str(Path("src").resolve()))
try:
    module = importlib.import_module("notes.textutil")
except Exception as exc:
    fail("cannot load seeded functions " + ", ".join(cases) + ": " + type(exc).__name__)
for name, examples in cases.items():
    function = getattr(module, name, None)
    if not callable(function):
        fail(f"seeded function {name} missing from src/notes/textutil.py")
    for argument, expected in examples:
        try:
            actual = function(argument)
        except Exception as exc:
            fail(f"seeded function {name} behavior changed: {argument!r} raises {type(exc).__name__}")
        if actual != expected:
            fail(f"seeded function {name} behavior changed: {argument!r} gives {actual!r}, expected {expected!r}")

for test_file in Path("tests").rglob("test*.py"):
    try:
        tree = ast.parse(test_file.read_text(encoding="utf-8"))
    except (SyntaxError, UnicodeError):
        continue  # The suite below reports an invalid test file.
    names = {"count_words"}
    names.update(alias.asname or alias.name for node in ast.walk(tree)
                 if isinstance(node, ast.ImportFrom) for alias in node.names if alias.name == "count_words")
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name.startswith("test"):
            if any((isinstance(item, ast.Name) and item.id in names)
                   or (isinstance(item, ast.Attribute) and item.attr == "count_words") for item in ast.walk(node)):
                sys.exit(0)
fail("no test for count_words under tests/")
PY
if ! PYTHONPATH="$WORK/src${PYTHONPATH:+:$PYTHONPATH}" python3 -m unittest discover -s tests >/dev/null 2>&1; then
    echo "the test suite fails"; exit 1
fi
echo "seeded functions retain their recorded behavior; count_words test present; suite passes"
