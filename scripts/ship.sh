#!/usr/bin/env bash
# ship.sh — External loop for /ship pipeline (Ralph-style fresh context per iteration)
#
# Spawns a fresh Claude process per iteration, giving each run a clean 200K context.
# State persists via git (commits, branches), plan files, and progress.txt.
# This is the outer loop; ship-loop.sh (Stop hook) is the inner guard against premature exit.
#
# Usage: ./scripts/ship.sh "add user authentication with JWT" [--max N] [--swarm] [--iterations N]
#
# All flags after the feature description are forwarded to /ship.

set -euo pipefail

# ──────────────────────────────────────────────
# Terminal colors (tput-based, graceful fallback)
# ──────────────────────────────────────────────
setup_colors() {
  if [[ -t 1 ]] && command -v tput &>/dev/null && [[ $(tput colors 2>/dev/null || echo 0) -ge 8 ]]; then
    RED=$(tput setaf 1)     GREEN=$(tput setaf 2)
    YELLOW=$(tput setaf 3)  BLUE=$(tput setaf 4)
    MAGENTA=$(tput setaf 5) CYAN=$(tput setaf 6)
    BOLD=$(tput bold)       DIM=$(tput dim)
    NC=$(tput sgr0)
    CR=$(tput cr 2>/dev/null || printf '\r')
    EL=$(tput el 2>/dev/null || printf '\033[K')
  else
    RED="" GREEN="" YELLOW="" BLUE="" MAGENTA="" CYAN=""
    BOLD="" DIM="" NC="" CR=$'\r' EL=$'\033[K'
  fi
}
setup_colors

# Braille spinner characters
SPIN='⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'

# ──────────────────────────────────────────────
# Helper functions
# ──────────────────────────────────────────────
info()    { echo "  ${BLUE}▸${NC} $1"; }
success() { echo "  ${GREEN}✓${NC} $1"; }
warn()    { echo "  ${YELLOW}!${NC} $1"; }
fail()    { echo "  ${RED}✗${NC} $1"; }

elapsed_fmt() {
  local diff=$(( $(date +%s) - $1 ))
  printf "%02d:%02d" $((diff / 60)) $((diff % 60))
}

# ──────────────────────────────────────────────
# Stage detection — reads tail of Claude output
# ──────────────────────────────────────────────
detect_stage() {
  local lines
  lines=$(tail -30 "$1" 2>/dev/null || true)

  if echo "$lines" | grep -qi "Stage 7\|create PR\|Ship It\|push.*remote\|gh pr"; then
    echo "Shipping"
  elif echo "$lines" | grep -qi "Stage 6\|Compound\|knowledge\|/compound"; then
    echo "Capturing"
  elif echo "$lines" | grep -qi "Stage 5\|iterative.refinement\|review-swarm\|findings-synth\|P1=\|P2="; then
    echo "Reviewing"
  elif echo "$lines" | grep -qi "Stage 4\|Execute\|orchestrate\|team-lead\|Wave [0-9]\|/team\|implement"; then
    echo "Executing"
  elif echo "$lines" | grep -qi "Stage 3\|Deepen\|enrich\|/deepen"; then
    echo "Deepening"
  elif echo "$lines" | grep -qi "Stage 2\|Plan\|plan-checker\|writing-plans\|docs/plans"; then
    echo "Planning"
  elif echo "$lines" | grep -qi "Stage 1\|Requirements\|DECISIONS\|CONVENTIONS"; then
    echo "Requirements"
  elif echo "$lines" | grep -qi "Stage 0\|continuation\|Initialize\|Detect"; then
    echo "Initializing"
  else
    echo "Thinking"
  fi
}

stage_color() {
  case $1 in
    Initializing) printf '%s' "$BLUE" ;;
    Requirements) printf '%s' "$CYAN" ;;
    Planning)     printf '%s' "$CYAN" ;;
    Deepening)    printf '%s' "$MAGENTA" ;;
    Executing)    printf '%s' "$MAGENTA" ;;
    Reviewing)    printf '%s' "$YELLOW" ;;
    Capturing)    printf '%s' "$GREEN" ;;
    Shipping)     printf '%s' "$GREEN" ;;
    *)            printf '%s' "$DIM" ;;
  esac
}

# ──────────────────────────────────────────────
# Spinner — runs while Claude is working
# ──────────────────────────────────────────────
run_with_spinner() {
  local pid=$1 outfile=$2 start=$3
  local feature_short="${FEATURE:0:40}"
  local spin_idx=0 last_stage="" stage="Thinking" color check_counter=0

  while kill -0 "$pid" 2>/dev/null; do
    # Detect stage every ~1s (8 cycles * 0.12s) to avoid process spam
    if (( check_counter % 8 == 0 )); then
      stage=$(detect_stage "$outfile")
      color=$(stage_color "$stage")
    fi
    check_counter=$((check_counter + 1))

    # Stage transition — log completed stage
    if [[ "$stage" != "$last_stage" && -n "$last_stage" ]]; then
      local t
      t=$(elapsed_fmt "$start")
      printf "${CR}${EL}  ${GREEN}✓${NC} %-16s ${DIM}%s${NC}\n" "$last_stage" "[$t]"
    fi
    last_stage="$stage"

    # Animate spinner on current line
    local char="${SPIN:spin_idx:1}"
    local t
    t=$(elapsed_fmt "$start")
    printf "${CR}${EL}  %s %s%-16s%s │ %s %s[%s]%s" \
      "$char" "$color" "$stage" "$NC" \
      "$feature_short" "$DIM" "$t" "$NC"

    spin_idx=$(( (spin_idx + 1) % ${#SPIN} ))
    sleep 0.12
  done

  # Clear spinner, log final stage
  printf '%s%s' "$CR" "$EL"
  if [[ -n "$last_stage" ]]; then
    local t
    t=$(elapsed_fmt "$start")
    printf "  ${GREEN}✓${NC} %-16s ${DIM}%s${NC}\n" "$last_stage" "[$t]"
  fi
}

# ──────────────────────────────────────────────
# Parse arguments
# ──────────────────────────────────────────────
MAX_ITERATIONS=10
FEATURE_PARTS=()
SHIP_FLAGS=()

while [[ $# -gt 0 ]]; do
  case $1 in
    --max|--max-iterations)
      MAX_ITERATIONS="$2"
      shift 2
      ;;
    --max=*|--max-iterations=*)
      MAX_ITERATIONS="${1#*=}"
      shift
      ;;
    --swarm|--deploy)
      SHIP_FLAGS+=("$1")
      shift
      ;;
    --iterations|--convergence)
      SHIP_FLAGS+=("$1" "$2")
      shift 2
      ;;
    --iterations=*|--convergence=*)
      SHIP_FLAGS+=("$1")
      shift
      ;;
    *)
      FEATURE_PARTS+=("$1")
      shift
      ;;
  esac
done

FEATURE="${FEATURE_PARTS[*]}"

if [[ -z "$FEATURE" ]]; then
  echo ""
  echo "  ${BOLD}ship.sh${NC} — Autonomous development pipeline"
  echo ""
  echo "  ${DIM}Usage:${NC}  ./scripts/ship.sh \"<feature>\" [flags]"
  echo ""
  echo "  ${DIM}Flags:${NC}"
  echo "    --max N              Max outer loop iterations ${DIM}(default: 10)${NC}"
  echo "    --swarm              Use parallel team execution"
  echo "    --iterations N       Max review-improve iterations"
  echo "    --convergence MODE   ${DIM}fast${NC} | ${DIM}deep${NC} | ${DIM}perfect${NC}"
  echo ""
  echo "  ${DIM}Examples:${NC}"
  echo "    ./scripts/ship.sh \"add JWT authentication\""
  echo "    ./scripts/ship.sh \"refactor payments\" --max 5 --swarm"
  echo "    ./scripts/ship.sh \"add search\" --iterations 5 --convergence deep"
  echo ""
  exit 1
fi

# Build the /ship command with all flags
SHIP_CMD="/ship ${FEATURE} --external ${SHIP_FLAGS[*]:-}"

# ──────────────────────────────────────────────
# Pre-flight checks
# ──────────────────────────────────────────────
if ! command -v claude &>/dev/null; then
  fail "claude CLI not found. Install: https://docs.anthropic.com/en/docs/claude-code"
  exit 1
fi

# ──────────────────────────────────────────────
# Progress tracking
# ──────────────────────────────────────────────
PROGRESS_FILE=".claude/ship-progress.local.md"
LOG_DIR=".claude/ship-logs"
mkdir -p "$LOG_DIR"

if [[ ! -f "$PROGRESS_FILE" ]]; then
  cat > "$PROGRESS_FILE" << EOF
# Ship Progress Log
Started: $(date)
Feature: ${FEATURE}
Flags: ${SHIP_FLAGS[*]:-none}
---
EOF
fi

# Cleanup on exit
OUTFILE=$(mktemp)
CLAUDE_PID=""
cleanup_ship() {
  # Kill Claude if still running
  if [[ -n "$CLAUDE_PID" ]] && kill -0 "$CLAUDE_PID" 2>/dev/null; then
    kill "$CLAUDE_PID" 2>/dev/null || true
    wait "$CLAUDE_PID" 2>/dev/null || true
  fi
  rm -f "$OUTFILE"
  # Restore cursor visibility
  printf '\033[?25h' 2>/dev/null || true
}
trap cleanup_ship EXIT INT TERM

# ──────────────────────────────────────────────
# Banner
# ──────────────────────────────────────────────
MODE="sequential"
[[ " ${SHIP_FLAGS[*]:-} " == *" --swarm "* ]] && MODE="swarm"

echo ""
echo "  ${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo "  ${BOLD}ship.sh${NC} — Autonomous Pipeline ${DIM}(Ralph-style)${NC}"
echo ""
echo "  ${DIM}Feature:${NC}    ${FEATURE:0:50}$([ ${#FEATURE} -gt 50 ] && echo "${DIM}...${NC}" || echo "")"
echo "  ${DIM}Engine:${NC}     ${MAGENTA}Claude Code${NC}"
echo "  ${DIM}Mode:${NC}       ${MODE} │ max ${MAX_ITERATIONS} iterations"
[[ ${#SHIP_FLAGS[@]} -gt 0 ]] && echo "  ${DIM}Flags:${NC}      ${SHIP_FLAGS[*]}"
echo "  ${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

GLOBAL_START=$(date +%s)

# Hide cursor during spinner
printf '\033[?25l'

# ──────────────────────────────────────────────
# Main loop — fresh Claude process per iteration
# ──────────────────────────────────────────────
for i in $(seq 1 "$MAX_ITERATIONS"); do
  ITER_START=$(date +%s)

  echo "  ${BOLD}━━━ Iteration $i of $MAX_ITERATIONS${NC} ${DIM}$(date '+%H:%M:%S')${NC}"
  echo ""

  # Spawn fresh Claude with clean context — output to file only
  : > "$OUTFILE"
  claude --print --dangerously-skip-permissions --verbose "$SHIP_CMD" > "$OUTFILE" 2>&1 &
  CLAUDE_PID=$!

  # Run spinner while Claude works
  run_with_spinner "$CLAUDE_PID" "$OUTFILE" "$ITER_START"

  # Wait for exit code
  CLAUDE_EXIT=0
  wait "$CLAUDE_PID" || CLAUDE_EXIT=$?
  CLAUDE_PID=""

  # Save iteration log
  cp "$OUTFILE" "$LOG_DIR/iteration-${i}.log" 2>/dev/null || true

  ITER_ELAPSED=$(elapsed_fmt "$ITER_START")

  # Check for completion signal
  if grep -q "<promise>DONE</promise>" "$OUTFILE" 2>/dev/null; then
    echo ""
    TOTAL_ELAPSED=$(elapsed_fmt "$GLOBAL_START")
    echo "  ${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo "  ${GREEN}${BOLD}Ship complete!${NC}"
    echo ""
    echo "  ${DIM}Iteration:${NC}  $i of $MAX_ITERATIONS"
    echo "  ${DIM}Duration:${NC}   $TOTAL_ELAPSED"
    echo "  ${DIM}Log:${NC}        $LOG_DIR/iteration-${i}.log"
    echo "  ${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    # Append final status and clean up
    {
      echo ""
      echo "## Iteration $i — $(date) — COMPLETE"
      echo "Pipeline finished successfully."
      echo "---"
    } >> "$PROGRESS_FILE"

    rm -f "$PROGRESS_FILE"
    printf '\033[?25h'
    exit 0
  fi

  # Iteration ended without completion
  if [[ $CLAUDE_EXIT -ne 0 ]]; then
    fail "Claude exited with code $CLAUDE_EXIT ${DIM}[$ITER_ELAPSED]${NC}"
    echo "  ${DIM}  Log: $LOG_DIR/iteration-${i}.log${NC}"
  else
    warn "Context exhausted — no completion signal ${DIM}[$ITER_ELAPSED]${NC}"
  fi

  # Log incomplete iteration
  {
    echo ""
    echo "## Iteration $i — $(date)"
    echo "Status: incomplete (exit=$CLAUDE_EXIT). Continuing with fresh context..."
    echo "---"
  } >> "$PROGRESS_FILE"

  echo ""
  if [[ $i -lt $MAX_ITERATIONS ]]; then
    info "Refreshing context for iteration $((i + 1))..."
    sleep 2
  fi
done

echo ""
TOTAL_ELAPSED=$(elapsed_fmt "$GLOBAL_START")
echo "  ${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
fail "${BOLD}Reached max iterations ($MAX_ITERATIONS) without completing.${NC}"
echo ""
echo "  ${DIM}Duration:${NC}   $TOTAL_ELAPSED"
echo "  ${DIM}Logs:${NC}       $LOG_DIR/"
echo "  ${DIM}Progress:${NC}   $PROGRESS_FILE"
echo "  ${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
printf '\033[?25h'
exit 1
