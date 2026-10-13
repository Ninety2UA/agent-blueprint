#!/usr/bin/env bash
# TDD override check: call every seeded function with recorded inputs, so deletion and same-name
# rewrites fail while behavior-preserving refactors pass. Call count_words with recorded inputs too,
# so a missing or wrong implementation fails. Then replace notes.textutil.count_words with a probe
# that records the running test, load tests/ the way `unittest discover -s tests` does (src on
# sys.path), probe every other loaded copy of src/notes/textutil.py too (such as src.notes.textutil),
# rebind the names test modules bound to an unprobed count_words, and run that suite in this process:
# at least one test must call count_words, directly or through a helper, and pass. A skipped or
# expected-failure test, or a module-level test_ function unittest never collects, does not count; a
# skipped subtest does not stop its test from passing; a test module that fails to import is named.
# Limits: a call made only in setUpClass runs outside any test and is not seen, nor is one through a
# copy of the module first imported while the suite runs.
# The suite must also pass when `python3 -m unittest discover -s tests` runs it on its own.
# Arguments: WORK BASE FINAL LOG REMOTE. Prints one reason; exit 0 = pass, 1 = fail.
set -euo pipefail
WORK="$1"
cd "$WORK"
python3 - <<'PY'
import contextlib
import functools
import importlib
import inspect
import io
from pathlib import Path
import re
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


class Recorder(unittest.TestResult):
    """Tracks the running test, so a probe knows which tests call count_words."""

    def __init__(self):
        super().__init__()
        self.current = None
        self.callers = []
        self.started = []

    def startTest(self, test):
        super().startTest(test)
        self.current = test
        self.started.append(test)

    def stopTest(self, test):
        super().stopTest(test)
        self.current = None


result = Recorder()
probes = []   # (a copy's original count_words, its probe)


def probe_of(function):
    """FUNCTION's probe, made on first use: it records the running test, then calls FUNCTION."""
    for original, probe in probes:
        if function is original or function is probe:
            return probe

    @functools.wraps(function)
    def probe(*args, **kwargs):
        if result.current is not None and result.current not in result.callers:
            result.callers.append(result.current)
        return function(*args, **kwargs)

    probes.append((function, probe))
    return probe


# Patched before discovery imports a test module, so `from notes.textutil import count_words` binds
# the probe, and so does a call through the module.
module.count_words = probe_of(count_words)


def quietly(call):
    """CALL's result, with whatever the tests print kept out of the reason."""
    with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
        return call()


def tests_in(suite):
    for item in suite:
        if isinstance(item, unittest.TestSuite):
            yield from tests_in(item)
        else:
            yield item


def load_failure(test):
    """What discovery recorded for a test module it could not load: the module and the error."""
    message = str(getattr(test, "_exception", "")).strip()
    error = message.splitlines()[-1].strip() if message else "no error recorded"
    verb = "import" if not message or message.startswith("Failed to import") else "load"
    return f"test module {test._testMethodName} failed to {verb} ({error[:120]})"


def case_of(test):
    """The test case a subtest belongs to; any other test is its own case."""
    return test.test_case if type(test).__name__ == "_SubTest" else test


def names_count_words(test):
    """True when the source of TEST's method names count_words (for a test that never called it)."""
    method = getattr(type(test), getattr(test, "_testMethodName", "") or "", None)
    try:
        return method is not None and re.search(r"\bcount_words\b", inspect.getsource(method)) is not None
    except (OSError, TypeError):
        return False


def expects_failure(test):
    """True when TEST or its method is marked expectedFailure."""
    method = getattr(test, getattr(test, "_testMethodName", "") or "", None)
    return bool(getattr(test, "__unittest_expecting_failure__", False)
                or getattr(method, "__unittest_expecting_failure__", False))


def file_of(loaded):
    """The resolved file a loaded module came from, or None."""
    name = getattr(loaded, "__file__", None)
    return Path(name).resolve() if isinstance(name, str) else None


# Discovered the way `python3 -m unittest discover -s tests` does: module (relative to tests/),
# class, method.
try:
    suite = quietly(lambda: unittest.TestLoader().discover("tests"))
except Exception as exc:
    fail(f"cannot discover tests under tests/ ({type(exc).__name__}: {str(exc)[:120]}), so no count_words test runs")
tests = list(tests_in(suite))
broken = [load_failure(test) for test in tests if type(test).__name__ == "_FailedTest"]
if broken:
    fail("; ".join(broken) + ", so a count_words test there cannot run")

# A test can load the same file under another name (the work root on sys.path, then
# `from src.notes.textutil import count_words`): probe every loaded copy, then rebind each name a
# test module bound to a copy's original count_words.
seeded, tests_root = path.resolve(), Path("tests").resolve()
loaded = list(sys.modules.values())
for copy in loaded:
    if file_of(copy) == seeded and callable(getattr(copy, "count_words", None)):
        copy.count_words = probe_of(copy.count_words)
for test_module in loaded:
    where = file_of(test_module)
    if where is None or tests_root not in where.parents:
        continue
    for name, value in list(vars(test_module).items()):
        for original, probe in probes:
            if value is original:
                setattr(test_module, name, probe)
quietly(lambda: suite.run(result))

# A subtest's failure or error counts against its test; a skipped subtest does not. unittest never
# reports success for a test with a skipped subtest, so a test passed when it ran and nothing else
# was recorded against it; an expected failure with a skipped subtest records nothing either.
outcomes = {}
for label, entries in (("fails", result.failures), ("raises an error", result.errors),
                       ("is marked expectedFailure", result.expectedFailures),
                       ("is marked expectedFailure", [(test, "") for test in result.unexpectedSuccesses]),
                       ("was skipped", result.skipped)):
    for test, _ in entries:
        if label == "was skipped" and case_of(test) is not test:
            continue
        outcomes.setdefault(case_of(test), label)
for test in result.started:
    if test not in outcomes and expects_failure(test):
        outcomes[test] = "is marked expectedFailure"
passed = [test for test in result.started if test not in outcomes]
if any(test in passed for test in result.callers):
    sys.exit(0)
# No caller passed. Name the count_words tests that did not pass: those that called it, and those
# that never got to (skipped, or stopped before the call) but whose source names it. Name, too, a
# passing test whose source names count_words though no probe saw it call.
named = result.callers + [test for test in tests
                          if test in outcomes and test not in result.callers and names_count_words(test)]
unseen = [test.id() for test in passed if test not in result.callers and names_count_words(test)]
groups = {}
for test in named:
    groups.setdefault(outcomes.get(test, "did not pass"), []).append(test.id())
reasons = [f"the count_words test {label}: {', '.join(ids)}" for label, ids in groups.items()]
if unseen:
    reasons.append("the count_words test passes without a call the check saw (it may import the module"
                   " under another name, or call count_words only in setUpClass): " + ", ".join(unseen))
fail("; ".join(reasons) or "no test calls count_words under tests/")
PY
if ! PYTHONPATH="$WORK/src${PYTHONPATH:+:$PYTHONPATH}" python3 -m unittest discover -s tests >/dev/null 2>&1; then
    echo "the test suite fails"; exit 1
fi
echo "seeded functions retain their recorded behavior; count_words gives the recorded counts; a collected test calls count_words and passes; suite passes"
