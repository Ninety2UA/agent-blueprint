#!/usr/bin/env bash
# fake-host.sh — the test double for the ship runner's host adapter (hosts.sh row `fake`).
#
# The runner calls it like any host: one prompt argument, cwd = the repository. What it does
# comes from a scenario file, never from the prompt, so a test can make it misbehave in every
# way the plan lists: write a state.json of any shape, commit, hang, fail with a quota error,
# print the old DONE sentinel, plant hooks, and so on.
#
# Environment (set by tests/runner/run-tests.sh):
#   AGENT_BLUEPRINT_FAKE_SCENARIO   file with one line per call; a line is a space-separated list
#                                   of steps (below). The last line repeats once the file runs out.
#   AGENT_BLUEPRINT_FAKE_COUNTER    file that counts the calls (default: <scenario>.count)
#   AGENT_BLUEPRINT_FAKE_VERSION    the provenance version to write (the skill's metadata.version)
#   AGENT_BLUEPRINT_FAKE_GIT_WRITABLE  0 = the probe leaves .git alone (no-commit mode)
#   AGENT_BLUEPRINT_FAKE_GH_DIR     the gh shim's control directory (step gh-unauth)
#   AGENT_BLUEPRINT_FAKE_HOOKS_DIR  the repository's hooks/handlers (step stop-hook)
#   AGENT_BLUEPRINT_FAKE_LOG        a file that records every call: prompt and the runner's variables
#
# Steps:
#   state:STATUS:STAGE     write a valid state.json (driver runner, session fake-0001)
#   state-driver:DRIVER    state.json with that driver (running, stage plan)
#   no-provenance | bad-status | bad-driver | bad-session | wrong-version | state-other-path
#   commit:FILE            append to FILE and commit it        change:FILE   append without committing
#   commit-msg:TEXT        write commit-msg.md (underscores become spaces)
#   pr-body | pr-body-secret | pr-body-symlink:TARGET
#   sentinel               print the literal old completion sentinel
#   quota                  print a quota error and exit 1      hang          record the PID and sleep
#   denied                 print a denied rm                   exit:N        exit with N after the other steps
#   ledger:TASK            mark TASK done in .agent-blueprint/team/run1/ledger.md
#   workflow | remote-url | prepush-hook | secret-commit | gh-unauth | stop-hook | review-diff
#   attr-secret            a key in a path that .gitattributes marks -diff
#   merge-secret           a key introduced by a merge commit's own resolution
#   msg-secret             a key in a commit message
#   symlink:PATH:TARGET    plant PATH as a symlink to TARGET
#   block-commit           leave .git/index.lock behind, so the runner's own commit fails
#   bigmsg                 end with one 100,000-character line (put it last)
#
# The probe prompt (it names agent-blueprint-probe) is answered without consuming a scenario line.

set -euo pipefail

PROMPT="${1:-}"
RUN_DIR=".agent-blueprint/run"
SCENARIO="${AGENT_BLUEPRINT_FAKE_SCENARIO:-}"
COUNTER="${AGENT_BLUEPRINT_FAKE_COUNTER:-$SCENARIO.count}"
VERSION="${AGENT_BLUEPRINT_FAKE_VERSION:-0.0.0}"
LOG="${AGENT_BLUEPRINT_FAKE_LOG:-/dev/null}"

mkdir -p "$RUN_DIR"
{
    echo "--- call $(date -u +%H:%M:%S) RUNNER=${AGENT_BLUEPRINT_RUNNER:-unset} GIT_WRITABLE=${AGENT_BLUEPRINT_GIT_WRITABLE:-unset}"
    printf '%s\n' "$PROMPT"
} >> "$LOG"

case "$PROMPT" in
    *agent-blueprint-probe*)
        if [ "${AGENT_BLUEPRINT_FAKE_GIT_WRITABLE:-1}" != 0 ]; then
            touch "$(git rev-parse --git-dir)/agent-blueprint-probe"
        fi
        echo '{"result": "OK"}'
        exit 0 ;;
esac

if [ -z "$SCENARIO" ] || [ ! -f "$SCENARIO" ]; then echo "fake-host: no scenario file" >&2; exit 1; fi
N=$(cat "$COUNTER" 2>/dev/null || echo 0)
N=$((N + 1))
echo "$N" > "$COUNTER"
TOTAL=$(grep -c '' "$SCENARIO")
[ "$N" -le "$TOTAL" ] && LINE=$(sed -n "${N}p" "$SCENARIO") || LINE=$(tail -n 1 "$SCENARIO")

write_state() {   # STATUS STAGE DRIVER SESSION PROVENANCE_JSON [EXTRA_JSON]
    local tmp="$RUN_DIR/state.json.tmp"
    printf '{\n  "status": "%s",\n  "stage": "%s",\n  "iteration": %s,\n  "host": "fake",\n  "driver": "%s",\n  "session_id": "%s",\n  "decisions": [],\n  %s%s\n  "reason": "%s",\n  "updated_at": "%s"\n}\n' \
        "$1" "$2" "$N" "$3" "$4" "$5" "${6:-}" "${REASON:-}" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$tmp"
    mv "$tmp" "$RUN_DIR/state.json"
}
PROV="\"provenance\": {\"skill\": \"ab-ship-pipeline\", \"version\": \"$VERSION\"},"

EXIT_CODE=0
BIGMSG=0
for step in $LINE; do
    arg="${step#*:}"
    case "$step" in
        state:*)
            status="${arg%%:*}"; stage="${arg#*:}"
            [ "$status" = blocked ] && REASON="fake host set blocked"
            [ "$status" = needs-human ] && REASON="fake host wants a human"
            write_state "$status" "$stage" runner fake-0001 "$PROV" ;;
        state-driver:*)  write_state running plan "$arg" fake-0001 "$PROV" ;;
        no-provenance)   write_state running plan runner fake-0001 "" ;;
        bad-status)      write_state finished plan runner fake-0001 "$PROV" ;;
        bad-driver)      write_state running plan robot fake-0001 "$PROV" ;;
        bad-session)     write_state running plan runner "fake-0001; touch pwned \$(id)" "$PROV" ;;
        wrong-version)   write_state running plan runner fake-0001 "\"provenance\": {\"skill\": \"ab-ship-pipeline\", \"version\": \"0.0.1\"}," ;;
        state-other-path)
            mkdir -p "$RUN_DIR/elsewhere"
            printf '# Wrong body\n\nThis body must never be published.\n' > "$RUN_DIR/elsewhere/body.md"
            write_state "done" ship runner fake-0001 "$PROV" " \"pr_body\": \"$RUN_DIR/elsewhere/body.md\", \"base\": \"0000000\"," ;;
        commit:*)
            echo "line from call $N" >> "$arg"
            git add "$arg"
            git commit -q -m "feat(fake): $arg from call $N" ;;
        change:*)        echo "change from call $N" >> "$arg" ;;
        commit-msg:*)    printf '%s\n' "$(printf '%s' "$arg" | tr '_' ' ')" > "$RUN_DIR/commit-msg.md" ;;
        pr-body)         printf '# Fake feature\n\nBody written by the fake host on call %s.\n' "$N" > "$RUN_DIR/pr-body.md" ;;
        pr-body-secret)  printf '# Fake feature\n\nToken for the reviewer: ghp_%s\n' "$(printf 'A%.0s' {1..36})" > "$RUN_DIR/pr-body.md" ;;
        pr-body-symlink:*)
            rm -f "$RUN_DIR/pr-body.md"
            ln -s "$arg" "$RUN_DIR/pr-body.md" ;;
        sentinel)        echo "<promise>DONE</promise>" ;;
        quota)           echo "Error: quota exceeded for this account (429 Too Many Requests)"; exit 1 ;;
        hang)
            echo "$$" > "$RUN_DIR/fake-hang.pid"
            sleep 300
            exit 0 ;;
        denied)          echo "Command denied by policy: rm -rf ./build (destructive)" ;;
        exit:*)          EXIT_CODE="$arg" ;;
        ledger:*)
            mkdir -p .agent-blueprint/team/run1
            [ -f .agent-blueprint/team/run1/ledger.md ] || printf '# Team run run1\n\n- Status: running\n\n## Tasks\n\n| ID | Task | Needs | Files | Wave | Status | Result |\n|----|------|-------|-------|------|--------|--------|\n' > .agent-blueprint/team/run1/ledger.md
            printf '| %s | task %s | - | src/%s.txt | 1 | done | uncommitted |\n' "$arg" "$arg" "$arg" >> .agent-blueprint/team/run1/ledger.md ;;
        workflow)
            mkdir -p .github/workflows
            printf 'name: planted\non: push\njobs: {}\n' > .github/workflows/planted.yml
            git add .github/workflows/planted.yml
            git commit -q -m "ci: planted workflow" ;;
        remote-url)      git remote set-url --push origin "$(git remote get-url --push origin).elsewhere" ;;
        prepush-hook)
            hooks="$(git rev-parse --git-path hooks)"
            mkdir -p "$hooks"
            printf '#!/bin/sh\ntouch "%s/hook-ran"\nexit 0\n' "$PWD/$RUN_DIR" > "$hooks/pre-push"
            chmod +x "$hooks/pre-push" ;;
        secret-commit)
            printf 'aws_access_key_id = AKIA%s\n' "$(printf 'Q%.0s' {1..16})" > config.ini
            git add config.ini
            git commit -q -m "chore: add config" ;;
        attr-secret)
            printf 'hidden.txt -diff\n' > .gitattributes
            printf 'key = AKIA%s\n' "$(printf 'Q%.0s' {1..16})" > hidden.txt
            git add .gitattributes hidden.txt
            git commit -q -m "chore: add hidden" ;;
        merge-secret)
            start=$(git symbolic-ref --short HEAD)
            git switch -q -c fake-side
            echo side >> side.txt; git add side.txt; git commit -q -m "feat(fake): side"
            git switch -q "$start"
            echo main >> mainline.txt; git add mainline.txt; git commit -q -m "feat(fake): mainline"
            git merge -q --no-ff --no-commit fake-side
            printf 'token = AKIA%s\n' "$(printf 'Z%.0s' {1..16})" > merged.txt
            git add merged.txt
            git commit -q -m "merge: fake-side" ;;
        msg-secret)
            echo "line from call $N" >> msg.txt
            git add msg.txt
            git commit -q -m "feat(fake): msg" -m "deploy token ghp_$(printf 'B%.0s' {1..36})" ;;
        symlink:*)
            link="${arg%%:*}"; target="${arg#*:}"
            mkdir -p "$(dirname "$link")"
            rm -rf "$link"
            ln -s "$target" "$link" ;;
        block-commit)    : > "$(git rev-parse --git-dir)/index.lock" ;;
        bigmsg)          BIGMSG=1 ;;
        gh-unauth)       touch "${AGENT_BLUEPRINT_FAKE_GH_DIR:?}/unauth" ;;
        stop-hook)
            # An interactive-only Stop hook: with the runner's variable set it must stand down.
            write_state running review interactive fake-0001 "$PROV"
            out=$(printf '%s' '{"session_id":"fake-0001","transcript_path":"/tmp/.claude/t.jsonl","hook_event_name":"Stop"}' \
                | CLAUDECODE=1 bash "${AGENT_BLUEPRINT_FAKE_HOOKS_DIR:?}/ship-loop.sh" 2>/dev/null || true)
            if printf '%s' "$out" | grep -q '"decision"'; then
                echo "stop hook blocked the session: $out"
                exit 1
            fi
            echo "stop hook stood down" ;;
        review-diff)
            # The review in the same iteration as the changes, in no-commit mode: diff the working
            # tree and untracked files against the merge base, as the skill does.
            echo "reviewed change from call $N" >> reviewed.txt
            echo "new file from call $N" > untracked-$N.txt
            base=$(git merge-base HEAD main)
            lines=$(( $(git diff "$base" -- . ':!.agent-blueprint' | grep -c '^[+-]' || true) + $(git ls-files --others --exclude-standard | grep -c '' || true) ))
            printf 'git_writable=%s\ndiff_lines=%s\n' "${AGENT_BLUEPRINT_GIT_WRITABLE:-unset}" "$lines" > "$RUN_DIR/fake-review.txt" ;;
        *)               echo "fake-host: unknown step: $step" >&2; exit 1 ;;
    esac
done

echo '{"result": "fake host finished call '"$N"'"}'
if [ "$BIGMSG" = 1 ]; then head -c 100000 /dev/zero | tr '\0' 'x'; echo; fi
exit "$EXIT_CODE"
