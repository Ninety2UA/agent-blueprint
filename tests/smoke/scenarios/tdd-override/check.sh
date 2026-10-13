#!/usr/bin/env bash
# TDD override check: call every seeded function with recorded inputs, so deletion and same-name
# rewrites fail while behavior-preserving refactors pass. Call count_words with recorded inputs too,
# so a missing or wrong implementation fails. Load tests/ the way `unittest discover -s tests` does:
# at least one collected test method must reference count_words (directly, through a module, or via
# an imported alias), so a module-level test_ function unittest never runs does not count. The
# suite must pass.
# Arguments: WORK BASE FINAL LOG REMOTE. Prints one reason; exit 0 = pass, 1 = fail.
set -euo pipefail
WORK="$1"
cd "$WORK"
python3 - <<'PY'
import ast
import importlib
from pathlib import Path
import sys
import unittest


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

# The new function's recorded inputs live here for the same reason.
count_cases = [("", 0), ("   ", 0), ("one two  three", 3), ("a\tb\nc", 3)]
count_words = getattr(module, "count_words", None)
if not callable(count_words):
    fail("count_words missing from src/notes/textutil.py")
for argument, expected in count_cases:
    try:
        actual = count_words(argument)
    except Exception as exc:
        fail(f"count_words({argument!r}) raises {type(exc).__name__}")
    if actual != expected:
        fail(f"count_words({argument!r}) gives {actual!r}, expected {expected!r}")


def collected_ids(suite):
    for item in suite:
        if isinstance(item, unittest.TestSuite):
            yield from collected_ids(item)
        else:
            yield item.id()


# The ids `python3 -m unittest discover -s tests` runs: module (relative to tests/), class, method.
collected = set(collected_ids(unittest.TestLoader().discover("tests")))


def count_words_methods(module_name, tree):
    """Ids of the test* methods in TREE whose body references count_words."""
    names = {"count_words"}
    names.update(alias.asname or alias.name for node in ast.walk(tree)
                 if isinstance(node, ast.ImportFrom) for alias in node.names if alias.name == "count_words")
    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef):
            for item in node.body:
                if (isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)) and item.name.startswith("test")
                        and any((isinstance(ref, ast.Name) and ref.id in names)
                                or (isinstance(ref, ast.Attribute) and ref.attr == "count_words")
                                for ref in ast.walk(item))):
                    yield f"{module_name}.{node.name}.{item.name}"


for test_file in Path("tests").rglob("test*.py"):
    try:
        tree = ast.parse(test_file.read_text(encoding="utf-8"))
    except (SyntaxError, UnicodeError):
        continue  # The suite below reports an invalid test file.
    module_name = ".".join(test_file.relative_to("tests").with_suffix("").parts)
    if any(test_id in collected for test_id in count_words_methods(module_name, tree)):
        sys.exit(0)
fail("no collected test for count_words under tests/")
PY
if ! PYTHONPATH="$WORK/src${PYTHONPATH:+:$PYTHONPATH}" python3 -m unittest discover -s tests >/dev/null 2>&1; then
    echo "the test suite fails"; exit 1
fi
echo "seeded functions retain their recorded behavior; count_words gives the recorded counts; a collected test covers count_words; suite passes"
