'use strict';
/**
 * Which host is running this hook (KTD11).
 *
 * Cursor imports Claude Code plugins and runs their hooks, and a shell that
 * launched one tool from inside another inherits the first tool's variables,
 * so every handler decides from the hook payload first and the environment
 * second, and exits without acting when the host is not one it was written for.
 *
 *   claude  transcript under a .claude/ folder, or CLAUDECODE=1
 *   codex   a Codex rollout transcript (rollout-*.jsonl), or a payload with
 *           Codex's model/turn fields, or a CODEX_* session variable
 *   other   anything else, including Cursor and Grok Build environments
 */

const CODEX_ENV = ['CODEX_SANDBOX', 'CODEX_SESSION_ID', 'CODEX_THREAD_ID', 'CODEX_CI', 'CODEX_SANDBOX_NETWORK_DISABLED'];

function detectHost(input) {
  const env = process.env;
  if (env.CURSOR_AGENT || env.CURSOR_CONVERSATION_ID || env.GROK_AGENT === '1' || env.GROK_SESSION_ID) return 'other';
  const transcript = input && typeof input.transcript_path === 'string' ? input.transcript_path : '';
  if (/[\\/]\.claude[\\/]/.test(transcript)) return 'claude';
  if (/[\\/]rollout-[^\\/]*\.jsonl$/.test(transcript)) return 'codex';
  if (input && (typeof input.turn_id === 'string' || typeof input.model === 'string')) return 'codex';
  if (CODEX_ENV.some((k) => env[k])) return 'codex';
  if (env.CLAUDECODE === '1') return 'claude';
  return 'other';
}

/** Read stdin as JSON (or null) within a bounded time, then call done(input) exactly once. */
function readInput(done, timeoutMs) {
  let text = '';
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    let input = null;
    try { input = text.trim() ? JSON.parse(text) : null; } catch { input = null; }
    done(input);
  };
  const timer = setTimeout(finish, timeoutMs || 2000);
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { text += chunk; });
  process.stdin.on('end', finish);
  process.stdin.on('error', finish);
  process.stdin.resume();
}

module.exports = { detectHost, readInput };
