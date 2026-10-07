#!/usr/bin/env bash
# gh-shim.sh — stands in for `gh` during the smoke test's ship cells, so nothing reaches GitHub.
#
# Installed as `gh` first on PATH by lib.sh (setup_gh_shim). Every call is appended to
# $GH_SHIM_LOG. Answers: `auth status` succeeds; `pr list` prints []; `pr create` prints a fake
# pull request URL and logs the path of the body file (a copy is kept next to the log);
# `pr edit` prints the same URL. Anything else is logged and answered with an empty line, so a
# pipeline that asks gh a question it does not need is not stopped by the shim.
set -euo pipefail

LOG="${GH_SHIM_LOG:?GH_SHIM_LOG is not set}"
echo "gh $*" >> "$LOG"

case "${1:-} ${2:-}" in
    "auth status")
        echo "github.com: Logged in to github.com account smoke-test (keyring)" ;;
    "pr list")
        echo "[]" ;;
    "pr create")
        body=""
        while [ $# -gt 0 ]; do
            [ "$1" = --body-file ] && [ $# -ge 2 ] && body="$2"
            shift
        done
        if [ -n "$body" ] && [ -f "$body" ]; then
            cp "$body" "$LOG.pr-body.md"
            echo "pr create body-file: $body (copy: $LOG.pr-body.md)" >> "$LOG"
        fi
        echo "https://github.com/example/notes/pull/1" ;;
    "pr edit")
        echo "https://github.com/example/notes/pull/1" ;;
    "--version "|"version ")
        echo "gh version 0.0.0-smoke-shim" ;;
    *)
        echo "" ;;
esac
