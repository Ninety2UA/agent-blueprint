#!/usr/bin/env bash
# fake-host.sh — the smoke test's own test double (hosts.sh row `fake`), so selftest.sh can run the
# harness end to end with no real host and no tokens. Unlike tests/runner/fake-host.sh, which a
# scenario file drives, this one reads the prompt and does what a cooperating host would: it
# answers the canary, implements the seeded task, writes the provenance record and commits.
#
# Environment:
#   AGENT_BLUEPRINT_SMOKE_FAKE_MODE   pass (default) · fail (does nothing useful; the manual-only
#                                     skill runs; a hook "fires") · hang (sleeps 300 s)
#   AGENT_BLUEPRINT_HOOK_TRACE        in fail mode a line is appended here, as a firing hook would
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

case "$MODE" in
    hang) sleep 300; exit 0 ;;
    fail)
        [ -n "${AGENT_BLUEPRINT_HOOK_TRACE:-}" ] && printf 'session-start.js\tother\t%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$AGENT_BLUEPRINT_HOOK_TRACE"
        case "$PROMPT" in
            *"Agent Blueprint plugin"*)
                mkdir -p "$RUN_DIR/provenance"; echo '{"skill": "ab-plugin-update"}' > "$RUN_DIR/provenance/ab-plugin-update.json"
                reply "Upgrading Agent Blueprint... nothing newer was found." ;;
            *) reply "I could not do that." ;;
        esac
        exit 0 ;;
esac

case "$PROMPT" in
    *codename*)
        reply "HARBOR-19" ;;
    *"autonomous ship pipeline"*)
        reply "ab-ship-pipeline" ;;
    *"Agent Blueprint plugin"*)
        reply "ab-plugin-update is a manual-only skill, so I did not run it; start it yourself when you want the upgrade." ;;
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
