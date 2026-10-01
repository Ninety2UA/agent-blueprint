#!/usr/bin/env bash
# selftest.sh — checks the smoke harness itself against tests/smoke/fake-host.sh: no real host, no
# tokens, about a minute. Every state the table can show is produced once and asserted from the JSON.
#
# Usage: bash tests/smoke/selftest.sh
# Exit: 0 when every assertion holds. Needs git, python3, network for one `pip install tabulate` per
# build cell (the acceptance venv), and a checkout of main for the eval mechanics (optional:
# SMOKE_SELFTEST_V3_DIR; without it the eval check is skipped).
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

echo "== pass mode: every cell on the fake host (hooks foreign, helpers switch present)"
AGENT_BLUEPRINT_FAKE_HOOKS=foreign AGENT_BLUEPRINT_FAKE_HELPERS_OFF=--no-helpers \
    bash "$HERE/run-smoke.sh" --host fake --plugin-dir "$REPO" --out "$WORK/out" --timeout 60 > "$WORK/pass.log" 2>&1 || { echo "run-smoke.sh failed:"; tail -20 "$WORK/pass.log"; exit 1; }
for c in discovery canary hooks manual-only build review debug ship team; do
    check "fake · $c is pass" [ "$(state_of "$J" fake "$c")" = pass ]
done
check "fake · helpers-off is degraded-pass (inline)" [ "$(state_of "$J" fake helpers-off)" = "degraded-pass (inline)" ]
check "fake · effort is n/a" [ "$(state_of "$J" fake effort)" = n/a ]
check "fake · upgrade is n/a" [ "$(state_of "$J" fake upgrade)" = n/a ]
check "the table lists the fake row" grep -q '^| fake |' "$M"
check "the JSON records tokens for the build cell" [ "$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["hosts"]["fake"]["cells"]["build"]["tokens"])' "$J")" = 150 ]

echo "== fail mode with a vendor-bug row, a not-installed host, a native-hooks fake, and --jobs 2"
printf 'host\tcell\turl\tnote\nfake\tdebug\thttps://example.com/vendor/1\tselftest\n' > "$WORK/bugs.tsv"
AB_SMOKE_VENDOR_BUGS="$WORK/bugs.tsv" AGENT_BLUEPRINT_SMOKE_FAKE_MODE=fail AGENT_BLUEPRINT_FAKE_HOOKS=native AGENT_BLUEPRINT_FAKE_HELPERS_OFF=--no-helpers \
    bash "$HERE/run-smoke.sh" --host fake,pi --jobs 2 --plugin-dir "$REPO" --out "$WORK/out" --timeout 60 \
    --cell canary,hooks,manual-only,build,helpers-off,review,debug,ship,team > "$WORK/fail.log" 2>&1 || { echo "run-smoke.sh failed:"; tail -20 "$WORK/fail.log"; exit 1; }
for c in canary manual-only build helpers-off review ship team; do
    check "fake · $c is fail" [ "$(state_of "$J" fake "$c")" = fail ]
done
check "fake · hooks passes when a native host's handlers write the trace" [ "$(state_of "$J" fake hooks)" = pass ]
check "fake · debug is degraded (vendor bug) with the link" [ "$(state_of "$J" fake debug)" = "degraded (vendor bug)" ]
check "the table links the vendor bug" grep -q 'degraded (vendor bug)](https://example.com/vendor/1)' "$M"
check "a missing provenance record is named" grep -q "no provenance record for ab-build-pipeline" <<<"$(reason_of "$J" fake build)"
check "the manual-only failure is named" grep -q "Upgrading Agent Blueprint" <<<"$(reason_of "$J" fake manual-only)"
for c in canary build ship; do check "pi · $c is not-installed" [ "$(state_of "$J" pi "$c")" = not-installed ]; done
check "the discovery cell from the pass run survived the partial run (merge)" [ "$(state_of "$J" fake discovery)" = pass ]
check "the table shows both hosts" grep -q '^| pi |' "$M"

echo "== hang mode: timeout; a duplicated catalog fails discovery; foreign hooks that fire fail"
AGENT_BLUEPRINT_FAKE_CATALOG="$REPO/skills" AGENT_BLUEPRINT_SMOKE_FAKE_MODE=hang AGENT_BLUEPRINT_FAKE_HOOKS=foreign \
    bash "$HERE/run-smoke.sh" --host fake --plugin-dir "$REPO" --out "$WORK/out" --timeout 3 --cell discovery,canary > "$WORK/hang.log" 2>&1 || { echo "run-smoke.sh failed:"; tail -20 "$WORK/hang.log"; exit 1; }
check "fake · canary is timeout" [ "$(state_of "$J" fake canary)" = timeout ]
check "fake · discovery fails on a name counted twice" grep -q "counted twice" <<<"$(reason_of "$J" fake discovery)"
check "no fake host survived the timeout" [ -z "$(pgrep -f "$AGENT_BLUEPRINT_FAKE_HOST" || true)" ]
AGENT_BLUEPRINT_SMOKE_FAKE_MODE=fail AGENT_BLUEPRINT_FAKE_HOOKS=foreign \
    bash "$HERE/run-smoke.sh" --host fake --plugin-dir "$REPO" --out "$WORK/out" --timeout 30 --cell hooks > "$WORK/hooks.log" 2>&1 || true
check "fake · hooks fails when a foreign host's hook fires" [ "$(state_of "$J" fake hooks)" = fail ]

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
