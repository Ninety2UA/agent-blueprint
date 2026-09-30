#!/usr/bin/env bash
# Which host is running this hook (KTD11); the bash twin of host.js.
# Usage: source it, then `HOST=$(detect_host "$HOOK_INPUT")` where HOOK_INPUT is the stdin JSON.
# Prints claude, codex or other. Payload first, environment second, for the reasons in host.js.

# require_host INPUT HOST...: exit 0 quietly unless the detected host is one of HOST...
require_host() {
  local input="$1" host
  shift
  host=$(detect_host "$input")
  for h in "$@"; do [ "$host" = "$h" ] && return 0; done
  exit 0
}

detect_host() {
  local input="$1" transcript=""
  if [ -n "${CURSOR_AGENT:-}${CURSOR_CONVERSATION_ID:-}${GROK_SESSION_ID:-}" ] || [ "${GROK_AGENT:-}" = "1" ]; then
    echo other; return
  fi
  transcript=$(printf '%s' "$input" | sed -n 's/.*"transcript_path"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)
  case "$transcript" in
    */.claude/*) echo claude; return ;;
    */rollout-*.jsonl) echo codex; return ;;
  esac
  if printf '%s' "$input" | grep -Eq '"(turn_id|model)"[[:space:]]*:[[:space:]]*"'; then echo codex; return; fi
  if [ -n "${CODEX_SANDBOX:-}${CODEX_SESSION_ID:-}${CODEX_THREAD_ID:-}${CODEX_CI:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}" ]; then
    echo codex; return
  fi
  if [ "${CLAUDECODE:-}" = "1" ]; then echo claude; return; fi
  echo other
}
