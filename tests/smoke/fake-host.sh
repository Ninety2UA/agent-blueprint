#!/usr/bin/env bash
# fake-host.sh — the smoke test's own test double (hosts.sh row `fake`), so selftest.sh can run the
# harness end to end with no real host and no tokens. Unlike tests/runner/fake-host.sh, which a
# scenario file drives, this one reads the prompt and does what a cooperating host would: it
# answers the canary, implements the seeded task, writes the provenance record and commits.
#
# Environment:
#   AGENT_BLUEPRINT_SMOKE_FAKE_MODE   pass (default) · fail (does nothing useful; the manual-only
#                                     skill runs; a hook "fires") · hang (sleeps 300 s) · stand-down
#                                     (pass, after the trace line of a handler that ran and stood down)
#                                     · tdd-delete/tdd-rewrite (lose a seeded function or its behavior,
#                                     with the new test present) · tdd-refactor (same behavior)
#                                     · tdd-uncollected (a correct count_words; its only test is a
#                                     module-level function unittest never collects) · tdd-no-count
#                                     (that uncollected test and no count_words at all) · tdd-skipped
#                                     (a correct count_words; its only test is @unittest.skip, beside a
#                                     passing unrelated test) · tdd-wrong-count (count_words splits on
#                                     single spaces; its passing test uses an input where that agrees)
#                                     · tdd-helper (a correct count_words; the collected test method,
#                                     inherited from a mixin, reaches it through a helper method)
#                                     · tdd-import-error (the pass-mode test, plus a test module that
#                                     raises on import) · tdd-src-import (a correct count_words; its
#                                     test puts the work root on sys.path and imports it as
#                                     src.notes.textutil) · tdd-subtest-skip (a correct count_words;
#                                     its test has a passing count_words subtest and an unrelated
#                                     skipped one)
#                                     · brainstorm-approval (ask for approval despite writing a plan)
#                                     · brainstorm-please-approve ("Please approve the design." after
#                                     writing a plan) · brainstorm-looks-good ("Does this design look
#                                     good?" after writing a plan) · brainstorm-no-plan (no approval
#                                     request, but no plan, no code and no commit)
#                                     · codex-four (omit the write guard from the Codex hook trace)
#                                     · codex-wrong-host (the write guard trace names another host)
#                                     · codex-entry-only (all Codex handler entries, neither action)
#                                     · codex-no-warning/codex-no-flag (omit one Codex action)
#   AGENT_BLUEPRINT_HOOK_TRACE        a trace line (handler, host, timestamp) is appended here: in
#                                     fail mode one naming claude, as a handler that acted on a
#                                     foreign host would; in stand-down mode one naming other
#   AGENT_BLUEPRINT_RUNNER            set by the ship runner; the fake then leaves publishing to it
# Extra flags after the prompt (host_run passes them): --no-helpers makes every helper step inline.
#
# Selected with: AGENT_BLUEPRINT_FAKE_HOST=tests/smoke/fake-host.sh run-smoke.sh --host fake ...
set -euo pipefail

PROMPT="${1:-}"
shift || true
MODE="${AGENT_BLUEPRINT_SMOKE_FAKE_MODE:-pass}"
HELPER_PATH="helper"
for flag in "$@"; do [ "$flag" = --no-helpers ] && HELPER_PATH="inline"; done

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
RUN_DIR=".agent-blueprint/run"
version_of() { sed -n 's/^  version: *"\{0,1\}\([^"]*\)"\{0,1\}.*/\1/p' "$REPO/skills/$1/SKILL.md" | head -1; }

reply() { printf '{"type":"result","subtype":"success","is_error":false,"result":%s,"session_id":"fake-0001","total_cost_usd":0.0123,"usage":{"input_tokens":100,"output_tokens":50,"cache_creation_input_tokens":0,"cache_read_input_tokens":0}}\n' "$(python3 -c 'import json,sys; print(json.dumps(sys.argv[1]))' "$1")"; }

provenance() {   # SKILL STEP...
    local skill="$1" steps="" step
    shift
    mkdir -p "$RUN_DIR/provenance"
    for step in "$@"; do
        steps="${steps:+$steps, }{\"step\": \"$step\", \"prompt\": \"references/agents/$step.md\", \"path\": \"$HELPER_PATH\"}"
    done
    printf '{"skill": "%s", "version": "%s", "started_at": "%s", "helper_steps": [%s]}\n' \
        "$skill" "$(version_of "$skill")" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$steps" > "$RUN_DIR/provenance/$skill.json"
}
commit_all() { git add -A && git -c user.name="Fake Host" -c user.email="fake@example.invalid" -c commit.gpgsign=false commit -q -m "$1"; }
trace_line() {   # HOST: the line a handler writes before deciding whether to act (hooks/handlers/host.sh)
    [ -n "${AGENT_BLUEPRINT_HOOK_TRACE:-}" ] || return 0
    printf 'session-start.js\t%s\t%s\n' "$1" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$AGENT_BLUEPRINT_HOOK_TRACE"
}

case "$MODE" in
    hang) sleep 300; exit 0 ;;
    stand-down) trace_line other ;;
    fail)
        trace_line claude
        case "$PROMPT" in
            *"names start with ab-p"*)
                reply "ab-pause-checkpoint ab-plugin-update ab-pr-workflow ab-project-start" ;;
            *) reply "I could not do that." ;;
        esac
        exit 0 ;;
esac

case "$PROMPT" in
    *"Codex hooks smoke check"*)
        python3 - <<'PY'
import json
import os
from pathlib import Path
import subprocess

assert json.loads(Path(".agent-blueprint/config.json").read_text())["hooks"]["validateCommit"] is True
trace = Path(os.environ["AGENT_BLUEPRINT_HOOK_TRACE"]).resolve()
assert Path.cwd().resolve() in trace.parents, trace
assert subprocess.run(["git", "check-ignore", "-q", str(trace)]).returncode == 0, trace
print("Codex hooks seed: validateCommit=true; trace ignored in work folder")
PY
        for handler in session-start.js prompt-guard.js validate-commit.js context-monitor.js ship-loop.sh; do
            if [ "$MODE" = codex-four ] && [ "$handler" = prompt-guard.js ]; then continue; fi
            trace_host=codex
            if [ "$MODE" = codex-wrong-host ] && [ "$handler" = prompt-guard.js ]; then trace_host=other; fi
            printf '%s\t%s\t%s\n' "$handler" "$trace_host" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$AGENT_BLUEPRINT_HOOK_TRACE"
        done
        for action in prompt-guard.js:warned validate-commit.js:flagged; do
            if [ "$MODE" = codex-entry-only ]; then continue; fi
            if [ "$MODE" = codex-no-warning ] && [ "$action" = prompt-guard.js:warned ]; then continue; fi
            if [ "$MODE" = codex-no-flag ] && [ "$action" = validate-commit.js:flagged ]; then continue; fi
            printf '%s\tcodex\t%s\n' "$action" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$AGENT_BLUEPRINT_HOOK_TRACE"
        done
        reply "Codex hooks smoke check finished." ;;
    *codename*)
        reply "HARBOR-19" ;;
    *"autonomous ship pipeline"*)
        reply "ab-ship-pipeline" ;;
    *"names start with ab-p"*)
        reply "ab-pause-checkpoint ab-performance-profiling ab-pr-workflow ab-project-start ab-project-status" ;;
    *"Ship runner iteration"*)
        # The runner's prompt: implement the feature, commit, write the PR body, set done.
        cp "$HERE/fake-solution/cli.py" src/notes/cli.py
        cp "$HERE/fake-solution/pyproject.toml" pyproject.toml
        cp "$HERE/fake-solution/test_export_table_fake.py" tests/test_export_table_fake.py
        commit_all "feat(cli): export notes as a table with tabulate"
        mkdir -p "$RUN_DIR"
        printf '# Export notes as a table\n\nAdds notes export --format table on top of tabulate.\n' > "$RUN_DIR/pr-body.md"
        printf '{"status": "done", "stage": "ship", "iteration": 1, "host": "fake", "driver": "runner", "session_id": "fake-0001", "decisions": [], "provenance": {"skill": "ab-ship-pipeline", "version": "%s"}, "reason": "", "updated_at": "%s"}\n' \
            "$(version_of ab-ship-pipeline)" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$RUN_DIR/state.json"
        reply "Feature implemented and committed; state.json says done." ;;
    "/ship "*)
        # v3's ship.sh prompt (the eval's mechanics check): implement, push, open the PR, print the old sentinel.
        cp "$HERE/fake-solution/cli.py" src/notes/cli.py
        cp "$HERE/fake-solution/pyproject.toml" pyproject.toml
        cp "$HERE/fake-solution/test_export_table_fake.py" tests/test_export_table_fake.py
        commit_all "feat(cli): export notes as a table with tabulate"
        git push -q origin HEAD
        printf '# Export notes as a table\n' > .pr-body.md
        gh pr create --head "$(git symbolic-ref --short HEAD)" --title "export table" --body-file .pr-body.md
        rm -f .pr-body.md
        echo "<promise>DONE</promise>" ;;
    *"feature-export-table"*)
        provenance ab-build-pipeline plan-checker code-reviewer
        cp "$HERE/fake-solution/cli.py" src/notes/cli.py
        cp "$HERE/fake-solution/pyproject.toml" pyproject.toml
        cp "$HERE/fake-solution/test_export_table_fake.py" tests/test_export_table_fake.py
        commit_all "feat(cli): export notes as a table with tabulate"
        reply "Starting the build pipeline. Implemented export --format table; tests pass; committed." ;;
    *"test suite fails"*)
        provenance ab-systematic-debugging code-reviewer
        cp "$REPO/tests/smoke/fixture/src/notes/store.py" src/notes/store.py
        commit_all "fix(store): search ignores case again"
        reply "Root cause: search() compared case-sensitively. Fixed in store.py; the suite passes." ;;
    *"Add count_words(text)"*)
        provenance ab-test-driven-development
        case "$MODE" in
            tdd-uncollected|tdd-no-count)
                # The TestCase covers another function; the count_words test is a module-level
                # function, which unittest discover never collects, so the suite passes without it.
                imports="from notes.textutil import count_words, normalize_title" call="count_words"
                if [ "$MODE" = tdd-no-count ]; then   # nothing to import: reach it through the module
                    imports="from notes import textutil
from notes.textutil import normalize_title" call="textutil.count_words"
                fi
                cat > tests/test_textutil.py <<PY
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))
$imports


class NormalizeTitleTests(unittest.TestCase):
    def test_normalize_title(self):
        self.assertEqual(normalize_title("  Harbor\t plan  "), "Harbor plan")


def test_count_words():
    assert $call("a b") == 2
PY
                ;;
            tdd-skipped)
                # The count_words test is collected but never runs; the suite still passes.
                cat > tests/test_textutil.py <<'PY'
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))
from notes.textutil import count_words, normalize_title


class NormalizeTitleTests(unittest.TestCase):
    def test_normalize_title(self):
        self.assertEqual(normalize_title("  Harbor\t plan  "), "Harbor plan")


class CountWordsTests(unittest.TestCase):
    @unittest.skip("count_words is not written yet")
    def test_count_words(self):
        self.assertEqual(count_words("Harbor plan"), 2)
PY
                ;;
            tdd-wrong-count)
                # One input where splitting on single spaces gives the right answer.
                cat > tests/test_textutil.py <<'PY'
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))
from notes.textutil import count_words


class CountWordsTests(unittest.TestCase):
    def test_count_words(self):
        self.assertEqual(count_words("Harbor plan"), 2)
PY
                ;;
            tdd-helper)
                # No test* method names count_words, and the collected class defines no method itself.
                cat > tests/test_textutil.py <<'PY'
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))
from notes.textutil import count_words


class WordCountChecks:
    def assert_words(self, text, expected):
        self.assertEqual(count_words(text), expected)

    def test_count_words(self):
        self.assert_words("Harbor plan", 2)
        self.assert_words(" one\t two\nthree ", 3)
        self.assert_words("", 0)


class CountWordsTests(WordCountChecks, unittest.TestCase):
    pass
PY
                ;;
            tdd-src-import)
                # The same file under a second module name: src.notes.textutil, not notes.textutil.
                cat > tests/test_textutil.py <<'PY'
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from src.notes.textutil import count_words


class CountWordsTests(unittest.TestCase):
    def test_count_words(self):
        self.assertEqual(count_words("Harbor plan"), 2)
        self.assertEqual(count_words(" one\t two\nthree "), 3)
        self.assertEqual(count_words(""), 0)
PY
                ;;
            tdd-subtest-skip)
                # The count_words subtest passes; a subtest about something else skips.
                cat > tests/test_textutil.py <<'PY'
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))
from notes.textutil import count_words


class CountWordsTests(unittest.TestCase):
    def test_count_words(self):
        with self.subTest("whitespace"):
            self.assertEqual(count_words(" one\t two\nthree "), 3)
            self.assertEqual(count_words(""), 0)
        with self.subTest("locale"):
            self.skipTest("locale-aware splitting is out of scope")
PY
                ;;
            *)
                cat > tests/test_textutil.py <<'PY'
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))
from notes.textutil import count_words


class CountWordsTests(unittest.TestCase):
    def test_count_words(self):
        self.assertEqual(count_words("Harbor plan"), 2)
        self.assertEqual(count_words(" one\t two\nthree "), 3)
        self.assertEqual(count_words(""), 0)
        self.assertEqual(count_words(" \t\n"), 0)
PY
                ;;
        esac
        if [ "$MODE" = tdd-import-error ]; then
            cat > tests/test_startup.py <<'PY'
import unittest

raise RuntimeError("NOTES_HOME is not set")


class StartupTests(unittest.TestCase):
    def test_starts(self):
        pass
PY
        fi
        if [ "$MODE" != tdd-no-count ]; then
            split='text.split()'
            [ "$MODE" = tdd-wrong-count ] && split='text.split(" ")'
            cat >> src/notes/textutil.py <<PY


def count_words(text):
    return len($split)
PY
        fi
        python3 - "$MODE" <<'PY'
import ast
from pathlib import Path
import sys

replacements = {
    "tdd-delete": "",
    "tdd-rewrite": 'def normalize_title(text):\n    return text.strip().lower()\n',
    "tdd-refactor": 'def normalize_title(text):\n    words = text.split()\n    return " ".join(word for word in words)\n',
}
if sys.argv[1] in replacements:
    path = Path("src/notes/textutil.py")
    source = path.read_text()
    node = next(node for node in ast.parse(source).body
                if isinstance(node, ast.FunctionDef) and node.name == "normalize_title")
    lines = source.splitlines(keepends=True)
    lines[node.lineno - 1:node.end_lineno] = [replacements[sys.argv[1]]]
    path.write_text("".join(lines))
PY
        commit_all "feat(textutil): count words with a test"
        reply "Added count_words test-first; the suite passes." ;;
    *"Implement the design in docs/designs/note-count.md"*)
        provenance ab-brainstorming
        if [ "$MODE" != brainstorm-no-plan ]; then
            mkdir -p docs/plans
            cat > docs/plans/note-count-plan.md <<'MD'
# Implement note count

The user approved the design in docs/designs/note-count.md for implementation.

1. Add tests for an empty store and a store with two notes.
2. Add NoteStore.count() returning len(self._notes) without saving the store.
3. Run python3 -m unittest discover -s tests.
MD
        fi
        case "$MODE" in
            brainstorm-approval)
                reply "I wrote the implementation plan. Do you approve the design before I continue?" ;;
            brainstorm-please-approve)
                reply "I wrote docs/plans/note-count-plan.md for implementation.
Please approve the design." ;;
            brainstorm-looks-good)
                reply "I wrote docs/plans/note-count-plan.md for implementation. Does this design look good?" ;;
            brainstorm-no-plan)
                reply "I read the approved design in docs/designs/note-count.md." ;;
            *)
                reply "I followed the approved design and wrote docs/plans/note-count-plan.md for implementation." ;;
        esac ;;
    *"Review the changes"*)
        provenance ab-requesting-code-review code-reviewer
        reply "Critical: src/notes/cli.py evaluates the user's --filter expression with eval(), which runs arbitrary code. Use a safe matcher instead." ;;
    *"three-task-plan"*)
        provenance ab-orchestrate
        run=".agent-blueprint/team/fake-three-task-plan"
        mkdir -p "$run"
        printf 'def add(a, b):\n    return a + b\n' >> calc.py
        printf 'import unittest\nfrom calc import add\n\n\nclass TestAdd(unittest.TestCase):\n    def test_add(self):\n        self.assertEqual(add(2, 3), 5)\n' > test_calc.py
        commit_all "feat(calc): add()"
        printf 'def greet(name):\n    return "Hello, %%s!" %% name\n' > greet.py
        printf 'import unittest\nfrom greet import greet\n\n\nclass TestGreet(unittest.TestCase):\n    def test_greet(self):\n        self.assertEqual(greet("Ada"), "Hello, Ada!")\n' > test_greet.py
        commit_all "feat(greet): greet()"
        printf '\n\ndef sub(a, b):\n    return a - b\n' >> calc.py
        printf '\nfrom calc import sub\n\n\nclass TestSub(unittest.TestCase):\n    def test_sub(self):\n        self.assertEqual(sub(5, 3), 2)\n' >> test_calc.py
        commit_all "feat(calc): sub()"
        printf '# Team run fake\n\n- Plan: docs/plans/three-task-plan.md\n- Status: done\n\n## Tasks\n\n| ID | Task | Needs | Files | Wave | Status | Result |\n|----|------|-------|-------|------|--------|--------|\n| T1 | add() | - | calc.py, test_calc.py | 1 | done | %s |\n' "$(git rev-parse --short HEAD)" > "$run/ledger.md"
        reply "All three tasks done; ledger status done; 4/4 tests." ;;
    *)
        reply "fake host: no answer for this prompt" ;;
esac
