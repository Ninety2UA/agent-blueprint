#!/usr/bin/env bash
# ship-loop.sh — Stop hook for /ship-pipeline premature-exit prevention (inner guard)
#
# Prevents Claude from giving up before the pipeline is done.
# This is the INNER guard — it blocks premature exit within a single session.
# It does NOT reset context (the conversation keeps growing).
#
# For true context-exhaustion recovery with fresh 200K context per iteration,
# use the OUTER loop: scripts/ship.sh (Ralph-style external bash loop).
#
# State file: .claude/ship-loop.local.md (YAML frontmatter + prompt body)
# Activation: /ship (interactive mode, no --external flag) creates the state file
# Termination: <promise>DONE</promise> in last assistant output, or max iterations (default 5)
#
# This hook is session-isolated — it only blocks exit for the session that started the loop.
# When --external flag is used, no state file is created, so this hook does nothing.

set -uo pipefail

SHIP_STATE_FILE=".claude/ship-loop.local.md"

# --------------------------------------------------
# 1. Read hook input from stdin (JSON from Claude Code)
# --------------------------------------------------
HOOK_INPUT=$(cat 2>/dev/null || echo "")

# --------------------------------------------------
# 2. Check if a ship loop is active
# --------------------------------------------------
if [[ ! -f "$SHIP_STATE_FILE" ]]; then
  exit 0  # No active loop — allow exit
fi

# --------------------------------------------------
# 3. Parse state file frontmatter
# --------------------------------------------------
FRONTMATTER=$(awk '/^---$/{i++; next} i==1{print} i>=2{exit}' "$SHIP_STATE_FILE")

ACTIVE=$(echo "$FRONTMATTER" | grep '^active:' | sed 's/active: *//')
if [[ "$ACTIVE" != "true" ]]; then
  exit 0  # Loop not active — allow exit
fi

# --------------------------------------------------
# 4. Session isolation — only block the session that started the loop
# --------------------------------------------------
STATE_SESSION=$(echo "$FRONTMATTER" | grep '^session_id:' | sed 's/session_id: *//' | tr -d '"')
# Try python3 first, fall back to grep+sed for systems without python3
HOOK_SESSION=$(echo "$HOOK_INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('session_id',''))" 2>/dev/null || echo "$HOOK_INPUT" | grep -o '"session_id":"[^"]*"' | sed 's/"session_id":"//;s/"//' || echo "")

if [[ -n "$STATE_SESSION" ]] && [[ -n "$HOOK_SESSION" ]] && [[ "$STATE_SESSION" != "$HOOK_SESSION" ]]; then
  exit 0  # Different session — don't interfere
fi

# --------------------------------------------------
# 5. Parse iteration state
# --------------------------------------------------
ITERATION=$(echo "$FRONTMATTER" | grep '^iteration:' | sed 's/iteration: *//')
MAX_ITERATIONS=$(echo "$FRONTMATTER" | grep '^max_iterations:' | sed 's/max_iterations: *//')
COMPLETION_PROMISE=$(echo "$FRONTMATTER" | grep '^completion_promise:' | sed 's/completion_promise: *//' | tr -d '"')

# Validate numeric fields
if ! [[ "$ITERATION" =~ ^[0-9]+$ ]]; then
  rm -f "$SHIP_STATE_FILE"
  exit 0
fi

if ! [[ "$MAX_ITERATIONS" =~ ^[0-9]+$ ]]; then
  rm -f "$SHIP_STATE_FILE"
  exit 0
fi

# --------------------------------------------------
# 6. Check max iterations
# --------------------------------------------------
if [[ "$MAX_ITERATIONS" -gt 0 ]] && [[ "$ITERATION" -ge "$MAX_ITERATIONS" ]]; then
  rm -f "$SHIP_STATE_FILE"
  exit 0  # Allow exit — max iterations reached
fi

# --------------------------------------------------
# 7. Check for completion promise in last assistant output
# --------------------------------------------------
TRANSCRIPT_PATH=$(echo "$HOOK_INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('transcript_path',''))" 2>/dev/null || echo "")

if [[ -n "$TRANSCRIPT_PATH" ]] && [[ -f "$TRANSCRIPT_PATH" ]]; then
  # Extract last assistant text from JSONL transcript
  LAST_OUTPUT=$(grep '"role":"assistant"' "$TRANSCRIPT_PATH" | tail -n 50 | python3 -c "
import sys, json
lines = sys.stdin.readlines()
for line in reversed(lines):
    try:
        msg = json.loads(line)
        contents = msg.get('message', {}).get('content', [])
        for c in contents:
            if c.get('type') == 'text':
                print(c.get('text', ''))
                sys.exit(0)
    except:
        continue
print('')
" 2>/dev/null || echo "")

  # Check for completion promise using exact match
  if [[ -n "$COMPLETION_PROMISE" ]] && [[ -n "$LAST_OUTPUT" ]]; then
    # Extract text between <promise> tags
    PROMISE_TEXT=$(echo "$LAST_OUTPUT" | perl -0777 -pe 's/.*?<promise>(.*?)<\/promise>.*/$1/s; s/^\s+|\s+$//g; s/\s+/ /g' 2>/dev/null || echo "")

    if [[ "$PROMISE_TEXT" = "$COMPLETION_PROMISE" ]]; then
      rm -f "$SHIP_STATE_FILE"
      exit 0  # Allow exit — completion promise fulfilled
    fi
  fi
fi

# --------------------------------------------------
# 8. Increment iteration and re-feed prompt
# --------------------------------------------------
NEXT_ITERATION=$((ITERATION + 1))

# Atomically update iteration counter
TEMP_FILE="${SHIP_STATE_FILE}.tmp.$$"
sed "s/^iteration: .*/iteration: $NEXT_ITERATION/" "$SHIP_STATE_FILE" > "$TEMP_FILE"
mv "$TEMP_FILE" "$SHIP_STATE_FILE"

# Extract prompt text (everything after second ---)
PROMPT_TEXT=$(awk '/^---$/{i++; next} i>=2' "$SHIP_STATE_FILE")

if [[ -z "$PROMPT_TEXT" ]]; then
  rm -f "$SHIP_STATE_FILE"
  exit 0  # No prompt text — cleanup and allow exit
fi

# --------------------------------------------------
# 9. Block exit and re-feed the prompt
# --------------------------------------------------
# JSON-escape the prompt text to prevent malformed output from quotes/backslashes/newlines
ESCAPED_PROMPT=$(printf '%s' "$PROMPT_TEXT" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read())[1:-1])" 2>/dev/null || printf '%s' "$PROMPT_TEXT" | sed 's/\\/\\\\/g; s/"/\\"/g; s/\t/\\t/g' | tr '\n' ' ')
ESCAPED_SYSTEM="Ship loop iteration $NEXT_ITERATION/$MAX_ITERATIONS | To complete: output <promise>$COMPLETION_PROMISE</promise> (ONLY when ALL work is done and verified)"

printf '{\n  "decision": "block",\n  "reason": "%s",\n  "systemMessage": "%s"\n}\n' "$ESCAPED_PROMPT" "$ESCAPED_SYSTEM"
