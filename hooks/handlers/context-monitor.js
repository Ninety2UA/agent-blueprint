#!/usr/bin/env node
/**
 * PostToolUse Hook — Context Monitor & Analysis Paralysis Guard.
 *
 * Tracks tool calls and warns the agent when context is running low or when
 * consecutive read-only operations indicate analysis paralysis.
 *
 * Refinements over the prior version (imported from gsd-build/get-shit-done):
 *   - Severity escalation: NONE → WARNING → CRITICAL. State stores last severity
 *     so we can detect transitions.
 *   - Debounce: a warning at the same severity is suppressed unless 5 tool calls
 *     have passed since the last emission (prevents repeat-fire spam after every
 *     tool call once the threshold is crossed).
 *   - Escalation always fires: WARNING→CRITICAL emits immediately even if the
 *     debounce window hasn't elapsed.
 *   - Single guard flag prevents the double-trigger bug from the prior
 *     implementation (stdin end + error race).
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const cwd = process.cwd();
const stateDir = path.join(os.tmpdir(), 'claude-blueprint');
const stateFile = path.join(
  stateDir,
  'ctx-' + Buffer.from(cwd).toString('hex').slice(0, 16) + '.json'
);

const READ_TOOLS = new Set(['Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch']);
const SEVERITY_LEVELS = { NONE: 0, WARNING: 1, CRITICAL: 2 };
const DEBOUNCE_CALLS = 5;
const PARALYSIS_THRESHOLD = 8;
const WARNING_CALLS = 150;
const CRITICAL_CALLS = 200;

let state = {
  calls: 0,
  reads: 0,
  lastSeverity: 'NONE',
  lastEmitAtCall: -Infinity,
};
try {
  state = { ...state, ...JSON.parse(fs.readFileSync(stateFile, 'utf-8')) };
} catch {
  /* fresh state */
}

let processed = false;
const chunks = [];
const stdinTimeout = setTimeout(finishOnce, 2000);

process.stdin.setEncoding('utf-8');
process.stdin.on('data', (chunk) => chunks.push(chunk));
process.stdin.on('end', finishOnce);
process.stdin.on('error', finishOnce);
process.stdin.resume();

function finishOnce() {
  if (processed) return;
  processed = true;
  clearTimeout(stdinTimeout);
  try {
    runMonitor();
  } finally {
    process.exit(0);
  }
}

function runMonitor() {
  let toolName = '';
  try {
    const input = chunks.join('').trim();
    if (input) {
      const data = JSON.parse(input);
      toolName = data.tool_name || data.toolName || '';
    }
  } catch {
    /* not JSON */
  }

  state.calls++;
  if (READ_TOOLS.has(toolName)) {
    state.reads++;
  } else if (toolName) {
    state.reads = 0;
  }

  const severity = computeSeverity(state);
  const callsSinceEmit = state.calls - (state.lastEmitAtCall ?? -Infinity);
  const escalated = SEVERITY_LEVELS[severity] > SEVERITY_LEVELS[state.lastSeverity];
  const sameOrLower = SEVERITY_LEVELS[severity] <= SEVERITY_LEVELS[state.lastSeverity];

  let shouldEmit = false;
  if (severity === 'NONE') {
    shouldEmit = false;
  } else if (escalated) {
    shouldEmit = true;
  } else if (sameOrLower && callsSinceEmit >= DEBOUNCE_CALLS) {
    shouldEmit = true;
  }

  // Independent: paralysis warning fires on its own debounce
  const paralysisActive = state.reads >= PARALYSIS_THRESHOLD;
  const paralysisShouldEmit =
    paralysisActive && callsSinceEmit >= DEBOUNCE_CALLS;

  if (shouldEmit || paralysisShouldEmit) {
    state.lastEmitAtCall = state.calls;
  }
  state.lastSeverity = severity;
  saveState();

  const lines = [];
  if (paralysisShouldEmit) {
    lines.push(
      `ANALYSIS PARALYSIS: ${state.reads} consecutive read-only operations without writing code. Either write code now or report what is blocking you.`
    );
  }
  if (shouldEmit) {
    if (severity === 'CRITICAL') {
      lines.push(
        `CONTEXT CRITICAL (${state.calls} tool calls): tell the user you are at high context usage and pause to wrap up the current task. Spawn subagents for any remaining substantial work.`
      );
    } else if (severity === 'WARNING') {
      lines.push(
        `CONTEXT NOTE (${state.calls} tool calls): approaching high usage. Plan to delegate remaining work to subagents or wrap up soon.`
      );
    }
  }

  if (lines.length) console.log(lines.join('\n'));
}

function computeSeverity(s) {
  if (s.calls >= CRITICAL_CALLS) return 'CRITICAL';
  if (s.calls >= WARNING_CALLS) return 'WARNING';
  return 'NONE';
}

function saveState() {
  try {
    fs.mkdirSync(stateDir, { recursive: true });
    const tmp = stateFile + '.' + process.pid + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(state));
    fs.renameSync(tmp, stateFile);
  } catch {
    /* ignore */
  }
}
