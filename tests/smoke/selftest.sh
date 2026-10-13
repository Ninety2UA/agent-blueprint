#!/usr/bin/env bash
# selftest.sh — checks the smoke harness itself against tests/smoke/fake-host.sh: no real host, no
# tokens, about a minute. Every state the table can show is produced once and asserted from the JSON.
#
# Usage: bash tests/smoke/selftest.sh
# Exit: 0 when every assertion holds. Needs git, python3, network for one `pip install tabulate` per
# build cell (the acceptance venv), and a checkout of main for the eval mechanics (optional:
# SMOKE_SELFTEST_V3_DIR; without it the eval check is skipped). SMOKE_SELFTEST_NO_LINT=1 skips the
# markdownlint check (npx), as CI does.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
WORK=$(mktemp -d "${TMPDIR:-/tmp}/ab-smoke-selftest-XXXXXX")
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$WORK/tmp"
# Failed cells keep their working copies on purpose; under this TMPDIR the trap removes them all.
export AGENT_BLUEPRINT_FAKE_HOST="$HERE/fake-host.sh" AB_SMOKE_LOGS="$WORK/logs" TMPDIR="$WORK/tmp"
FAILS=0
check() {   # DESCRIPTION CONDITION...
    local what="$1"; shift
    if "$@"; then echo "ok    $what"; else echo "FAIL  $what"; FAILS=$((FAILS + 1)); fi
}
state_of() {   # JSON HOST CELL
    python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print(d["hosts"].get(sys.argv[2],{}).get("cells",{}).get(sys.argv[3],{}).get("state","<none>"))' "$@"
}
no_match() { ! grep -q "$1" "$2"; }
reason_of() { python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print(d["hosts"].get(sys.argv[2],{}).get("cells",{}).get(sys.argv[3],{}).get("reason",""))' "$@"; }
J="$WORK/out/v$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["version"])' "$REPO/.claude-plugin/plugin.json")-smoke.json"
M="${J%.json}.md"

echo "== Codex hooks: five handlers, two actions, a work-local trace, and the commit-check opt-in"
mkdir -p "$WORK/codex-bin" "$WORK/codex-home/.codex"
cat > "$WORK/codex-bin/codex" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
case "$1" in
    --version) echo "codex fake"; exit 0 ;;
    login) exit 0 ;;
    exec)
        python3 - "$@" <<'PY'
import json, os, sys
with open(os.environ["AB_SMOKE_CODEX_ARGS"], "a") as f:
    f.write(json.dumps(sys.argv[1:]) + "\n")
PY
        # The adapter passes the prompt last and closes stdin.
        if IFS= read -r unexpected; then echo "Codex stdin was not closed" >&2; exit 1; fi
        lastmsg="" previous=""
        for arg in "$@"; do
            if [ "$previous" = -o ]; then lastmsg="$arg"; fi
            prompt="$arg"; previous="$arg"
        done
        bash "$AGENT_BLUEPRINT_FAKE_HOST" "$prompt" | tee "$lastmsg" ;;
    *) exit 1 ;;
esac
SH
chmod +x "$WORK/codex-bin/codex"
codex_hooks_run() {
    HOME="$WORK/codex-home" CODEX_HOME="$WORK/codex-home/.codex" PATH="$WORK/codex-bin:$PATH" \
        AB_SMOKE_CODEX_ARGS="$WORK/codex-args.jsonl" AGENT_BLUEPRINT_SMOKE_FAKE_MODE="$1" \
        bash "$HERE/run-smoke.sh" --host codex --jobs 2 --plugin-dir "$REPO" --out "$WORK/out" \
        --timeout 30 --cell "$2"
}
codex_hooks_run pass canary,hooks,manual-only > "$WORK/codex-hooks.log" 2>&1 || { cat "$WORK/codex-hooks.log"; exit 1; }
check "Codex hooks passes with five codex handler lines and both action records" [ "$(state_of "$J" codex hooks)" = pass ]
for c in canary manual-only; do check "Codex · $c still passes around the hooks run" [ "$(state_of "$J" codex "$c")" = pass ]; done
check "the Codex cell seeded the commit-check opt-in and an ignored work-local trace" \
    grep -q "Codex hooks seed: validateCommit=true; trace ignored in work folder" "$WORK"/logs/*/codex/hooks.log
check "Codex hooks uses its own run; only that invocation bypasses hook trust" python3 - "$WORK/codex-args.jsonl" <<'PY'
import json, sys
runs = [json.loads(line) for line in open(sys.argv[1])]
assert len(runs) == 3, runs
for args in runs:
    hooks = "Codex hooks smoke check" in args[-1]
    assert ("--dangerously-bypass-hook-trust" in args) == hooks, args
    assert args[args.index("-s") + 1] == "workspace-write", args
assert sum("Codex hooks smoke check" in args[-1] for args in runs) == 1, runs
prompt = next(args[-1] for args in runs if "Codex hooks smoke check" in args[-1])
assert "file-edit tool (apply_patch)" in prompt and "docs/hook-smoke.md" in prompt, prompt
assert "[SYSTEM]" in prompt and "git commit -m 'smoke check'" in prompt, prompt
assert "even if this sandbox cannot write .git" in prompt, prompt
PY
codex_hooks_run codex-four hooks > "$WORK/codex-four.log" 2>&1 || { cat "$WORK/codex-four.log"; exit 1; }
check "Codex hooks fails with only four codex handler lines" [ "$(state_of "$J" codex hooks)" = fail ]
check "the missing Codex handler is named" grep -q "missing.*prompt-guard.js" <<<"$(reason_of "$J" codex hooks)"
codex_hooks_run codex-wrong-host hooks > "$WORK/codex-wrong-host.log" 2>&1 || { cat "$WORK/codex-wrong-host.log"; exit 1; }
check "a write guard trace line naming another host does not pass Codex hooks" [ "$(state_of "$J" codex hooks)" = fail ]
check "the handler without a codex line is named" grep -q "missing.*prompt-guard.js" <<<"$(reason_of "$J" codex hooks)"
codex_hooks_run codex-entry-only hooks > "$WORK/codex-entry-only.log" 2>&1 || { cat "$WORK/codex-entry-only.log"; exit 1; }
check "Codex hooks fails when every handler entered but neither action was recorded" [ "$(state_of "$J" codex hooks)" = fail ]
for action in prompt-guard.js:warned validate-commit.js:flagged; do
    check "the missing Codex action $action is named" grep -q "missing.*$action" <<<"$(reason_of "$J" codex hooks)"
done
for mode in codex-no-warning codex-no-flag; do
    codex_hooks_run "$mode" hooks > "$WORK/$mode.log" 2>&1 || { cat "$WORK/$mode.log"; exit 1; }
    check "Codex hooks fails with just one action missing ($mode)" [ "$(state_of "$J" codex hooks)" = fail ]
    if [ "$mode" = codex-no-warning ]; then action=prompt-guard.js:warned; else action=validate-commit.js:flagged; fi
    check "the single missing Codex action $action is named" grep -q "missing.*$action" <<<"$(reason_of "$J" codex hooks)"
done

echo "== override cells: existing code survives TDD and an approved design needs no new approval"
AGENT_BLUEPRINT_SMOKE_FAKE_MODE=pass \
    bash "$HERE/run-smoke.sh" --host fake --plugin-dir "$REPO" --out "$WORK/out" --timeout 30 \
    --cell tdd-override,brainstorm-override > "$WORK/overrides.log" 2>&1 || { echo "run-smoke.sh failed:"; tail -20 "$WORK/overrides.log"; exit 1; }
for c in tdd-override brainstorm-override; do
    check "fake · $c is pass" [ "$(state_of "$J" fake "$c")" = pass ]
done
check "the compliant answer mentions the approved design" grep -q "the approved design" "$WORK"/logs/*/fake/brainstorm-override.final
override_suite() { ( cd "$1" && python3 -m unittest discover -s tests ); }
# The report replaces the temporary root with the literal $TMPDIR; the folder name survives.
override_work_of() { local root="${1##* · work: }"; printf '%s\n' "$TMPDIR/${root##*/}/work"; }
for mode in tdd-delete tdd-rewrite tdd-refactor; do
    AGENT_BLUEPRINT_SMOKE_FAKE_MODE="$mode" \
        bash "$HERE/run-smoke.sh" --host fake --plugin-dir "$REPO" --out "$WORK/out" --timeout 30 --keep \
        --cell tdd-override > "$WORK/$mode.log" 2>&1 || { echo "run-smoke.sh failed:"; tail -20 "$WORK/$mode.log"; exit 1; }
    reason=$(reason_of "$J" fake tdd-override)
    override_work=$(override_work_of "$reason")
    check "$mode keeps the new function's test" test -f "$override_work/tests/test_textutil.py"
    check "$mode has a passing suite despite the seed edit" override_suite "$override_work"
    if [ "$mode" = tdd-refactor ]; then
        check "a harmless refactor of a seeded function passes" [ "$(state_of "$J" fake tdd-override)" = pass ]
    else
        check "$mode fails even with the new test present" [ "$(state_of "$J" fake tdd-override)" = fail ]
        check "$mode names the affected seeded function" grep -q "normalize_title" <<<"$reason"
        if [ "$mode" = tdd-delete ]; then
            check "the deleted function is reported missing" grep -q "missing" <<<"$reason"
        else
            check "the same-name rewrite is reported as changed behavior" grep -q "behavior changed" <<<"$reason"
        fi
    fi
done
for mode in tdd-uncollected tdd-no-count; do
    AGENT_BLUEPRINT_SMOKE_FAKE_MODE="$mode" \
        bash "$HERE/run-smoke.sh" --host fake --plugin-dir "$REPO" --out "$WORK/out" --timeout 30 --keep \
        --cell tdd-override > "$WORK/$mode.log" 2>&1 || { echo "run-smoke.sh failed:"; tail -20 "$WORK/$mode.log"; exit 1; }
    reason=$(reason_of "$J" fake tdd-override)
    override_work=$(override_work_of "$reason")
    check "$mode has a passing suite (its count_words test is never collected)" override_suite "$override_work"
    check "$mode fails the TDD cell" [ "$(state_of "$J" fake tdd-override)" = fail ]
    if [ "$mode" = tdd-uncollected ]; then
        check "a count_words test unittest never collects is reported" grep -q "no test calls count_words" <<<"$reason"
    else
        check "a missing count_words is reported" grep -q "count_words missing" <<<"$reason"
    fi
done
override_suite_fails() { ! override_suite "$1" > /dev/null 2>&1; }
for mode in tdd-skipped tdd-wrong-count tdd-helper tdd-import-error; do
    AGENT_BLUEPRINT_SMOKE_FAKE_MODE="$mode" \
        bash "$HERE/run-smoke.sh" --host fake --plugin-dir "$REPO" --out "$WORK/out" --timeout 30 --keep \
        --cell tdd-override > "$WORK/$mode.log" 2>&1 || { echo "run-smoke.sh failed:"; tail -20 "$WORK/$mode.log"; exit 1; }
    reason=$(reason_of "$J" fake tdd-override)
    override_work=$(override_work_of "$reason")
    state=$(state_of "$J" fake tdd-override)
    case "$mode" in
        tdd-skipped)
            check "tdd-skipped has a passing suite (its count_words test never runs)" override_suite "$override_work"
            check "a skipped count_words test fails the TDD cell" [ "$state" = fail ]
            check "the skipped count_words test is reported" grep -q "count_words test was skipped" <<<"$reason" ;;
        tdd-wrong-count)
            check "tdd-wrong-count has a passing suite (its test uses an input the wrong count gets right)" override_suite "$override_work"
            check "a wrong count_words with a passing test fails the TDD cell" [ "$state" = fail ]
            check "the wrong count is reported against a recorded input" grep -q "count_words(.*expected" <<<"$reason" ;;
        tdd-helper)
            check "tdd-helper has a passing suite" override_suite "$override_work"
            check "an inherited test method that calls count_words through a helper passes" [ "$state" = pass ] ;;
        tdd-import-error)
            check "tdd-import-error has a failing suite" override_suite_fails "$override_work"
            check "a test module that fails to import fails the TDD cell" [ "$state" = fail ]
            check "the module that fails to import is named" grep -q "test module test_startup failed to import" <<<"$reason" ;;
    esac
done
for mode in brainstorm-approval brainstorm-please-approve brainstorm-looks-good brainstorm-no-plan; do
    AGENT_BLUEPRINT_SMOKE_FAKE_MODE="$mode" \
        bash "$HERE/run-smoke.sh" --host fake --plugin-dir "$REPO" --out "$WORK/out" --timeout 30 \
        --cell brainstorm-override > "$WORK/$mode.log" 2>&1 || { echo "run-smoke.sh failed:"; tail -20 "$WORK/$mode.log"; exit 1; }
    check "$mode fails the brainstorming cell" [ "$(state_of "$J" fake brainstorm-override)" = fail ]
    if [ "$mode" = brainstorm-no-plan ]; then expected="no plan or code"; else expected="design approval request"; fi
    check "$mode is reported as $expected" grep -q "$expected" <<<"$(reason_of "$J" fake brainstorm-override)"
done

echo "== pass mode: every cell on the fake host (hooks foreign, helpers switch present)"
AGENT_BLUEPRINT_FAKE_HOOKS=foreign AGENT_BLUEPRINT_FAKE_HELPERS_OFF=--no-helpers \
    bash "$HERE/run-smoke.sh" --host fake --plugin-dir "$REPO" --out "$WORK/out" --timeout 60 > "$WORK/pass.log" 2>&1 || { echo "run-smoke.sh failed:"; tail -20 "$WORK/pass.log"; exit 1; }
for c in discovery canary hooks manual-only build review debug tdd-override brainstorm-override ship team; do
    check "fake · $c is pass" [ "$(state_of "$J" fake "$c")" = pass ]
done
check "fake · helpers-off is degraded-pass (inline)" [ "$(state_of "$J" fake helpers-off)" = "degraded-pass (inline)" ]
check "fake · effort is n/a" [ "$(state_of "$J" fake effort)" = n/a ]
check "fake · upgrade is n/a" [ "$(state_of "$J" fake upgrade)" = n/a ]
check "the table lists the fake row" grep -q '^| fake |' "$M"
check "the JSON records tokens for the build cell" [ "$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["hosts"]["fake"]["cells"]["build"]["tokens"])' "$J")" = 150 ]

echo "== fail mode with a vendor-bug row, a not-installed host, a native-hooks fake, and --jobs 2"
# Pi stands in for a host that is not installed. Mirror each PATH folder that holds pi without it,
# so the run sees no pi even where Pi is installed, and every other tool stays reachable.
nopi_path=""
IFS=: read -r -a path_dirs <<< "$PATH"
for d in "${path_dirs[@]}"; do
    if [ -n "$d" ] && [ -e "$d/pi" ]; then
        mirror="$WORK/nopi/${#nopi_path}"
        mkdir -p "$mirror"
        for entry in "$d"/*; do
            [ "$(basename "$entry")" = pi ] || ln -s "$entry" "$mirror/"
        done
        d="$mirror"
    fi
    nopi_path="${nopi_path:+$nopi_path:}$d"
done
printf 'host\tcell\turl\tnote\nfake\tdebug\thttps://example.com/vendor/1\tselftest\n' > "$WORK/bugs.tsv"
AB_SMOKE_VENDOR_BUGS="$WORK/bugs.tsv" AGENT_BLUEPRINT_SMOKE_FAKE_MODE=fail AGENT_BLUEPRINT_FAKE_HOOKS=native AGENT_BLUEPRINT_FAKE_HELPERS_OFF=--no-helpers \
    PATH="$nopi_path" bash "$HERE/run-smoke.sh" --host fake,pi --jobs 2 --plugin-dir "$REPO" --out "$WORK/out" --timeout 60 \
    --cell canary,hooks,manual-only,build,helpers-off,review,debug,ship,team > "$WORK/fail.log" 2>&1 || { echo "run-smoke.sh failed:"; tail -20 "$WORK/fail.log"; exit 1; }
for c in canary manual-only build helpers-off review ship team; do
    check "fake · $c is fail" [ "$(state_of "$J" fake "$c")" = fail ]
done
check "fake · hooks passes when a native host's handlers write the trace" [ "$(state_of "$J" fake hooks)" = pass ]
check "fake · debug is degraded (vendor bug) with the link" [ "$(state_of "$J" fake debug)" = "degraded (vendor bug)" ]
check "the table links the vendor bug" grep -q 'degraded (vendor bug)](https://example.com/vendor/1)' "$M"
check "a missing provenance record is named" grep -q "no provenance record for ab-build-pipeline" <<<"$(reason_of "$J" fake build)"
check "the manual-only failure is named" grep -q "offers the manual-only skill ab-plugin-update" <<<"$(reason_of "$J" fake manual-only)"
for c in canary build ship; do check "pi · $c is not-installed" [ "$(state_of "$J" pi "$c")" = not-installed ]; done
check "the discovery cell from the pass run survived the partial run (merge)" [ "$(state_of "$J" fake discovery)" = pass ]
check "the table shows both hosts" grep -q '^| pi |' "$M"

echo "== hang mode: timeout; a duplicated catalog fails discovery; an unfinished canary proves nothing to hooks"
ln -sfn "$REPO/skills" "$WORK/second-catalog"   # the same skills reachable through a second catalog location
AGENT_BLUEPRINT_FAKE_CATALOG="$REPO/skills:$WORK/second-catalog" AGENT_BLUEPRINT_SMOKE_FAKE_MODE=hang AGENT_BLUEPRINT_FAKE_HOOKS=foreign \
    bash "$HERE/run-smoke.sh" --host fake --plugin-dir "$REPO" --out "$WORK/out" --timeout 3 --cell discovery,canary,hooks > "$WORK/hang.log" 2>&1 || { echo "run-smoke.sh failed:"; tail -20 "$WORK/hang.log"; exit 1; }
check "fake · canary is timeout" [ "$(state_of "$J" fake canary)" = timeout ]
check "fake · discovery fails on a name counted twice" grep -q "counted twice" <<<"$(reason_of "$J" fake discovery)"
check "no fake host survived the timeout" [ -z "$(pgrep -f "$AGENT_BLUEPRINT_FAKE_HOST" || true)" ]
check "fake · hooks fails when the reused canary did not complete" [ "$(state_of "$J" fake hooks)" = fail ]
check "the unfinished canary is named" grep -q "did not complete" <<<"$(reason_of "$J" fake hooks)"
check "the installed copy that won over --plugin-dir is named" grep -q "wins over --plugin-dir" "$WORK/hang.log"

echo "== foreign hooks: a handler that acts fails the cell; one that stands down passes it"
AGENT_BLUEPRINT_SMOKE_FAKE_MODE=fail AGENT_BLUEPRINT_FAKE_HOOKS=foreign \
    bash "$HERE/run-smoke.sh" --host fake --plugin-dir "$REPO" --out "$WORK/out" --timeout 30 --cell hooks > "$WORK/hooks.log" 2>&1 || true
check "fake · hooks fails when a foreign host's hook fires" [ "$(state_of "$J" fake hooks)" = fail ]
check "the misfiring handler and its host are named" grep -q "session-start.js as claude" <<<"$(reason_of "$J" fake hooks)"
AGENT_BLUEPRINT_SMOKE_FAKE_MODE=stand-down AGENT_BLUEPRINT_FAKE_HOOKS=foreign \
    bash "$HERE/run-smoke.sh" --host fake --plugin-dir "$REPO" --out "$WORK/out" --timeout 30 --cell hooks > "$WORK/stand-down.log" 2>&1 || true
check "fake · hooks passes when a foreign host's handlers run and stand down" [ "$(state_of "$J" fake hooks)" = pass ]
check "the stand-down is named" grep -q "stood down" <<<"$(reason_of "$J" fake hooks)"

echo "== an installed copy of another version wins over --plugin-dir: every cell fails and the row names it"
stale="$WORK/stale"
mkdir -p "$stale/skills/ab-ship-pipeline" "$stale/.claude-plugin"
: > "$stale/skills/ab-ship-pipeline/SKILL.md"
printf '{"name": "agent-blueprint", "version": "0.0.1"}\n' > "$stale/.claude-plugin/plugin.json"
AGENT_BLUEPRINT_FAKE_CATALOG="$stale/skills" \
    bash "$HERE/run-smoke.sh" --host fake --plugin-dir "$REPO" --out "$WORK/out" --timeout 30 --cell canary > "$WORK/stale.log" 2>&1 || true
check "fake · canary fails on an installed copy of another version" [ "$(state_of "$J" fake canary)" = fail ]
check "the version mismatch is named" grep -q "version 0.0.1, not" <<<"$(reason_of "$J" fake canary)"
check "the result row carries the installed copy as plugin_dir" grep -qF "\"plugin_dir\": \"$stale/skills\"" "$WORK"/logs/*/fake/results.jsonl

echo "== a copy-route install (install record, no manifest) of this checkout runs its cells"
copy="$WORK/copy/skills"
mkdir -p "$copy"
cp -R "$REPO/skills/." "$copy/"
printf '{"plugin": "agent-blueprint", "version": "%s"}\n' "$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["version"])' "$REPO/.claude-plugin/plugin.json")" > "$copy/.agent-blueprint-install.json"
AGENT_BLUEPRINT_FAKE_CATALOG="$copy" \
    bash "$HERE/run-smoke.sh" --host fake --plugin-dir "$REPO" --out "$WORK/out" --timeout 30 --cell canary > "$WORK/copy.log" 2>&1 || true
check "fake · canary runs against a copy-route install of this checkout" [ "$(state_of "$J" fake canary)" = pass ]

echo "== an installed copy of this version with other skill content: every cell fails and the row names it"
echo "edited after the install" >> "$copy/ab-ship-pipeline/SKILL.md"
AGENT_BLUEPRINT_FAKE_CATALOG="$copy" \
    bash "$HERE/run-smoke.sh" --host fake --plugin-dir "$REPO" --out "$WORK/out" --timeout 30 --cell canary > "$WORK/drift.log" 2>&1 || true
check "fake · canary fails on an installed copy whose skills differ from the checkout" [ "$(state_of "$J" fake canary)" = fail ]
check "the differing skill folder is named" grep -q "differ.*ab-ship-pipeline" <<<"$(reason_of "$J" fake canary)"

echo "== an installed plugin of this version with other hooks or manifests: every cell fails and the row names it"
plug="$WORK/plug"
mkdir -p "$plug/.claude-plugin"
cp -R "$REPO/skills" "$REPO/hooks" "$plug/"
cp "$REPO/.claude-plugin/plugin.json" "$plug/.claude-plugin/plugin.json"
AGENT_BLUEPRINT_FAKE_CATALOG="$plug/skills" \
    bash "$HERE/run-smoke.sh" --host fake --plugin-dir "$REPO" --out "$WORK/out" --timeout 30 --cell canary > "$WORK/plug.log" 2>&1 || true
check "fake · canary runs against an installed plugin that matches the checkout" [ "$(state_of "$J" fake canary)" = pass ]
echo "// edited after the install" >> "$plug/hooks/handlers/session-start.js"
AGENT_BLUEPRINT_FAKE_CATALOG="$plug/skills" \
    bash "$HERE/run-smoke.sh" --host fake --plugin-dir "$REPO" --out "$WORK/out" --timeout 30 --cell canary > "$WORK/plug-hooks.log" 2>&1 || true
check "fake · canary fails on an installed plugin whose hooks differ from the checkout" [ "$(state_of "$J" fake canary)" = fail ]
check "the differing hook file is named" grep -q "hooks.*session-start.js" <<<"$(reason_of "$J" fake canary)"
cp "$REPO/hooks/handlers/session-start.js" "$plug/hooks/handlers/session-start.js"
python3 -c 'import json,sys; m=json.load(open(sys.argv[1])); m["description"]="an older description"; json.dump(m, open(sys.argv[1], "w"))' "$plug/.claude-plugin/plugin.json"
AGENT_BLUEPRINT_FAKE_CATALOG="$plug/skills" \
    bash "$HERE/run-smoke.sh" --host fake --plugin-dir "$REPO" --out "$WORK/out" --timeout 30 --cell canary > "$WORK/plug-manifest.log" 2>&1 || true
check "fake · canary fails on an installed plugin whose manifest differs from the checkout" [ "$(state_of "$J" fake canary)" = fail ]
check "the differing manifest is named" grep -q "\.claude-plugin/plugin.json" <<<"$(reason_of "$J" fake canary)"

echo "== the skill-folder comparison names a folder the copy lacks and one the checkout lacks"
content_diff_out() {   # INSTALLED CHECKOUT: lib.sh's skills_content_diff, in a subshell as installed_out does
    # shellcheck source=lib.sh disable=SC1091
    ( . "$HERE/lib.sh" && skills_content_diff "$1" "$2" )
}
cmp_root="$WORK/content-diff"
for d in checkout/ab-a checkout/ab-b older/ab-a newer/ab-a newer/ab-b newer/ab-c; do
    mkdir -p "$cmp_root/$d"
    printf 'same\n' > "$cmp_root/$d/SKILL.md"
done
check "an identical copy shows no difference" [ -z "$(content_diff_out "$cmp_root/checkout" "$cmp_root/checkout")" ]
check "a copy from before a skill was added names the missing folder" [ "$(content_diff_out "$cmp_root/older" "$cmp_root/checkout")" = "1 missing (ab-b)" ]
check "a copy with a folder the checkout lacks names the extra folder" [ "$(content_diff_out "$cmp_root/newer" "$cmp_root/checkout")" = "1 not in the checkout (ab-c)" ]

echo "== a host without a plugin directory (Codex) reads the shared copy, so the installed-copy check covers it"
installed_out() {   # HOST HOME: lib.sh's host_installed_copies under another HOME, in a subshell as effort_out does
    # shellcheck source=lib.sh disable=SC1091
    ( . "$HERE/lib.sh" && HOME="$2" CODEX_HOME="$2/.codex" host_installed_copies "$1" )
}
home="$WORK/home"
mkdir -p "$home/.agents/skills/ab-ship-pipeline"
: > "$home/.agents/skills/ab-ship-pipeline/SKILL.md"
check "codex: the shared copy in ~/.agents/skills is the installed copy" [ "$(installed_out codex "$home")" = "$home/.agents/skills" ]

echo "== the review check: a finding on eval in cli.py passes; a clean verdict that names them fails"
review_check() {   # FINAL_TEXT [ARTIFACT_JSON]: scenarios/review/check.sh on a scratch repository
    local d="$WORK/review-check"
    rm -rf "$d"; mkdir -p "$d/docs"
    printf 'old\n' > "$d/docs/old.md"   # deleted after the base: the check lists it and must not stop there
    # shellcheck source=lib.sh disable=SC1091
    ( . "$HERE/lib.sh" && git_h -C "$d" init -q && git_h -C "$d" add docs/old.md && git_h -C "$d" commit -q -m base )
    rm "$d/docs/old.md"
    printf '%s\n' "$1" > "$WORK/review-check.final"
    if [ -n "${2:-}" ]; then
        mkdir -p "$d/.agent-blueprint/review-runs/r1"
        printf '%s\n' "$2" > "$d/.agent-blueprint/review-runs/r1/security-sentinel.json"
    fi
    bash "$HERE/scenarios/review/check.sh" "$d" "$(git -C "$d" rev-parse HEAD)" "$WORK/review-check.final" /dev/null "" > "$WORK/review-check.reason" 2>&1
}
fails() { ! "$@"; }
check "a clean verdict that names eval and cli.py fails" fails review_check "No findings: eval in cli.py is safe"
check "a clean security verdict fails" fails review_check "No security issues. The eval in src/notes/cli.py only sees the operator's own filter, so it is fine."
check "a zero count of critical findings fails" fails review_check "P1 Critical: 0, High: none. The eval in src/notes/cli.py was reviewed."
check "no critical findings fails" fails review_check "No critical findings. The eval in src/notes/cli.py was reviewed."
check "a finding the swarm discarded fails" fails review_check "## Review Swarm Synthesis

### Summary
- P1 Critical: 0 | P2 Important: 0 | P3 Suggestion: 0

### Discarded (false positives)
- **eval() in src/notes/cli.py runs arbitrary code** — reported by security-sentinel, discarded because the filter is the operator's own input"
check "a P2 note on eval's scoping beside a security non-finding fails" fails review_check "1. **P2 — Valid nested expressions crash** — src/notes/cli.py:45. \`note\` is passed only in eval's locals.

Security assessment: filters execute unrestricted Python, but this was not classified as an injection vulnerability."
check "an empty JSON finding list with eval only in residual risks fails" fails review_check "No findings." \
    '{"reviewer": "security-sentinel", "findings": [], "residual_risks": ["eval in src/notes/cli.py is acceptable for a local CLI"], "testing_gaps": []}'
check "a swarm P1 on eval in cli.py passes" review_check "## Review Swarm Synthesis

### P1 — Critical (must fix)
1. **\`--filter\` is passed to eval()** — \`src/notes/cli.py:45\` — Confidence: 100 — Tier: gated_auto
   - Impact: any expression the caller supplies runs in the CLI process.
   - Fix: parse the expression with ast and allow only comparisons."
check "a finding under a title that starts with Filtered passes" review_check "## Filtered listing runs arbitrary code

- \`src/notes/cli.py:45\` hands the --filter text to eval(), so a caller can run arbitrary code."
check "a finding below the swarm's confidence gate fails" fails review_check "### Filtered (below confidence gate)
- **eval() in src/notes/cli.py runs arbitrary code** — P1 at confidence 25, gate requires 50"
check "a reviewer's JSON finding on eval in cli.py passes" review_check "Review done; the findings are in the run folder." \
    '{"reviewer": "security-sentinel", "findings": [{"title": "Code injection through --filter", "severity": "P1", "file": "src/notes/cli.py", "line": 45, "why_it_matters": "eval() runs any Python the caller passes", "confidence": 100, "tier": "gated_auto", "evidence": ["src/notes/cli.py:45 -- eval(args.filter, {}, {\"note\": note})"], "pre_existing": false, "requires_verification": true}], "residual_risks": [], "testing_gaps": []}'
raw_p1='{"reviewer": "security-sentinel", "findings": [{"title": "Code injection through --filter", "severity": "P1", "file": "src/notes/cli.py", "line": 45, "why_it_matters": "eval() runs any Python the caller passes", "confidence": 100, "tier": "gated_auto"}], "residual_risks": [], "testing_gaps": []}'
check "a reviewer's raw P1 does not outvote a final verdict with no findings" fails review_check "No findings survived validation." "$raw_p1"
check "a reviewer's raw P1 does not stand in for a final message that names eval in cli.py without a finding" fails review_check "The eval in src/notes/cli.py was reviewed; the reviewers' notes are in the run folder." "$raw_p1"
check "a JSON finding under a discarded list fails" fails review_check "Review done; the findings are in the run folder." \
    '{"reviewer": "security-sentinel", "findings": [], "discarded": [{"title": "Code injection through --filter", "severity": "P1", "file": "src/notes/cli.py", "line": 45, "why_it_matters": "eval() runs any Python the caller passes", "confidence": 100}]}'
check "a JSON finding the validator rejected fails" fails review_check "Review done; the findings are in the run folder." \
    '{"reviewer": "security-sentinel", "findings": [{"title": "Code injection through --filter", "severity": "P1", "file": "src/notes/cli.py", "line": 45, "why_it_matters": "eval() runs any Python the caller passes", "confidence": 100, "validation_status": "rejected"}]}'
check "a JSON finding below its confidence gate fails" fails review_check "Review done; the findings are in the run folder." \
    '{"reviewer": "security-sentinel", "findings": [{"title": "Code injection through --filter", "severity": "P1", "file": "src/notes/cli.py", "line": 45, "why_it_matters": "eval() runs any Python the caller passes", "confidence": 25}]}'
check "a block that says it is not a security issue fails" fails review_check "- P2 cli.py: --filter goes through eval. This isn't a security issue, since only the local user supplies the value; validate the expression anyway."
check "a block that says it poses no security risk fails" fails review_check "- P2 cli.py: --filter is passed to eval. It doesn’t pose a security risk for a local CLI; add tests."
check "a block that rates the security impact low fails" fails review_check "- P2 cli.py: eval on --filter has low security impact here; scope it."
check "a sentence that calls the security risk low fails" fails review_check "The security risk of the eval in src/notes/cli.py is low."
check "a block that says eval is not a P1 fails" fails review_check "The eval in src/notes/cli.py is not a P1: only the operator types the filter."
check "a negation in another clause does not cancel the finding" review_check "- P2 cli.py:45: --filter is not validated, so eval runs arbitrary code from any caller."
check "a scope line beside a verdict of no findings fails" fails review_check "Security review of src/notes/cli.py and its eval call is complete.

No findings."
check "a scope line naming injection beside no issues found fails" fails review_check "I reviewed the --filter path in src/notes/cli.py (it calls eval) for injection risks.

No issues found."
check "a scope line beside a Findings section that says None fails" fails review_check "## Summary
Reviewed src/notes/cli.py, including the eval used by --filter, with the security-sentinel lens.

## Findings
None."
check "a rated finding passes beside another reviewer's verdict of no issues" review_check "### Code reviewer
No issues found.

### Security sentinel
1. **P1** eval in src/notes/cli.py: --filter runs arbitrary code."
check "a rated finding that also hedges passes" review_check "**P1** eval() in cli.py: --filter text runs as Python (arbitrary code execution). This looks fine otherwise."
check "an unrated finding that calls itself acceptable fails" fails review_check "\`--filter\` in src/notes/cli.py reaches eval(), which can run arbitrary code, but that is acceptable for a local tool."

echo "== the upgrade scenario deletes only the folder it made inside --work"
up="$WORK/upgrade-work"
mkdir -p "$up" "$WORK/stub-bin" "$WORK/v3/plugins/claude-code-blueprint/.claude-plugin"
printf 'keep\n' > "$up/caller-file"
printf '{"name": "claude-code-blueprint", "version": "3.8.0"}\n' > "$WORK/v3/plugins/claude-code-blueprint/.claude-plugin/plugin.json"
printf '#!/bin/sh\nexit 1\n' > "$WORK/stub-bin/claude"   # fails the first step, so the scenario exits through its cleanup
cp "$WORK/stub-bin/claude" "$WORK/stub-bin/node"
chmod +x "$WORK/stub-bin/claude" "$WORK/stub-bin/node"
PATH="$WORK/stub-bin:$PATH" bash "$HERE/scenarios/upgrade/run-upgrade.sh" --v3-dir "$WORK/v3" --v4-dir "$REPO" --work "$up" > "$WORK/upgrade.log" 2>&1 || true
check "the stubbed claude fails the first upgrade step" grep -q '^FAIL: add the v3.8.0 marketplace' "$WORK/upgrade.log"
check "the caller's file in --work survives the scenario" [ -f "$up/caller-file" ]
check "the scenario removed the folder it made inside --work" [ "$(ls -A "$up" 2>/dev/null)" = caller-file ]

echo "== the effort check (AE2) on synthetic transcripts: a helper without an effort field is not a match"
effort_out() {   # SESSION CONFIG_DIR: lib.sh's effort_check, in a subshell so lib.sh's globals (WORK) stay out of this script
    # shellcheck source=lib.sh disable=SC1091
    ( . "$HERE/lib.sh" && effort_check "$1" "$2" )
}
cfg="$WORK/cfg"; subs="$cfg/projects/p/s1/subagents"
mkdir -p "$subs"
printf '{"type":"assistant","effort":"high"}\n' > "$cfg/projects/p/s1.jsonl"
printf '{"type":"assistant"}\n' > "$subs/a.jsonl"
check "effort is n/a when a helper transcript carries no effort field" [ "$(effort_out s1 "$cfg" | cut -f1)" = n/a ]
check "the blind helper transcript is named" grep -q "a.jsonl" <<<"$(effort_out s1 "$cfg")"
printf '{"type":"assistant","effort":"high"}\n' > "$subs/a.jsonl"
check "effort passes when every helper carries the session's effort" [ "$(effort_out s1 "$cfg" | cut -f1)" = pass ]
printf '{"type":"assistant","effort":"low"}\n' > "$subs/b.jsonl"
check "effort fails when a helper runs at another effort" [ "$(effort_out s1 "$cfg" | cut -f1)" = fail ]

if command -v npx >/dev/null 2>&1 && [ -z "${SMOKE_SELFTEST_NO_LINT:-}" ]; then
    echo "== the rendered table passes markdownlint"
    cp "$M" "$REPO/docs/releases/.selftest-lint.md"
    check "markdownlint on the rendered table" npx --yes markdownlint-cli "$REPO/docs/releases/.selftest-lint.md"
    rm -f "$REPO/docs/releases/.selftest-lint.md"
fi

if [ -n "${SMOKE_SELFTEST_V3_DIR:-}" ]; then
    echo "== eval mechanics against the fake host"
    AB_EVAL_HOST=fake bash "$HERE/eval.sh" --v3-dir "$SMOKE_SELFTEST_V3_DIR" --v4-dir "$REPO" --runs 1 --out "$WORK/out" --timeout 60 > "$WORK/eval.log" 2>&1 || { echo "eval.sh failed:"; tail -20 "$WORK/eval.log"; exit 1; }
    E="${J%-smoke.json}-eval.json"
    check "eval recorded eight runs" [ "$(python3 -c 'import json,sys; print(len(json.load(open(sys.argv[1]))["runs"]))' "$E")" = 8 ]
    check "every eval run passed" [ "$(python3 -c 'import json,sys; print(sum(1 for r in json.load(open(sys.argv[1]))["runs"] if r["state"]=="pass"))' "$E")" = 8 ]
    check "the eval table has no regression" no_match '\*\*yes\*\*' "${E%.json}.md"
else
    echo "== eval mechanics skipped (set SMOKE_SELFTEST_V3_DIR to a checkout of main to include them)"
fi

echo ""
if [ "$FAILS" -eq 0 ]; then echo "selftest: all checks passed"; else echo "selftest: $FAILS check(s) failed"; exit 1; fi
