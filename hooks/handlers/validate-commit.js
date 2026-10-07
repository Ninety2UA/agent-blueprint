#!/usr/bin/env node
/**
 * PreToolUse Hook — Conventional Commits validator (opt-in).
 *
 * Triggers on Bash tool calls that look like a commit invocation. Validates
 * the message conforms to Conventional Commits (`type(scope): subject`, with
 * subject <= 72 chars). Advisory by default — never blocks. Opt-in via
 * `~/.claude/blueprint.local.json` or `.claude/blueprint.local.json` with:
 *
 *   { "hooks": { "validateCommit": true } }
 *
 * Disabled by default to avoid friction during AI-driven loops.
 *
 * Note: this script does not invoke any subprocess — it reads JSON from stdin
 * and writes JSON to stdout. No spawn / no shell.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const VALID_TYPES = new Set([
  'feat',
  'fix',
  'docs',
  'style',
  'refactor',
  'perf',
  'test',
  'build',
  'ci',
  'chore',
]);
const MAX_SUBJECT_LEN = 72;

let input = '';
const stdinTimeout = setTimeout(() => process.exit(0), 2500);
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => (input += c));
process.stdin.on('error', () => {
  clearTimeout(stdinTimeout);
  process.exit(0);
});
process.stdin.on('end', () => {
  clearTimeout(stdinTimeout);
  try {
    if (!isEnabled()) process.exit(0);

    const data = JSON.parse(input);
    if (data.tool_name !== 'Bash') process.exit(0);

    const cmd = data.tool_input?.command || '';
    const message = extractMessage(cmd);
    if (!message) process.exit(0);

    const issues = validate(message);
    if (issues.length === 0) process.exit(0);

    const output = {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        additionalContext:
          `COMMIT MESSAGE ADVISORY: ${issues.join('; ')}. ` +
          `Format: type(scope): subject. ` +
          `Valid types: ${[...VALID_TYPES].join(', ')}. Subject <= ${MAX_SUBJECT_LEN} chars. ` +
          'This is advisory — the operation will proceed.',
      },
    };
    process.stdout.write(JSON.stringify(output));
  } catch {
    process.exit(0);
  }
});

function isEnabled() {
  const candidates = [
    path.join(process.cwd(), '.claude', 'blueprint.local.json'),
    path.join(os.homedir(), '.claude', 'blueprint.local.json'),
  ];
  for (const p of candidates) {
    try {
      const cfg = JSON.parse(fs.readFileSync(p, 'utf-8'));
      if (cfg?.hooks?.validateCommit === true) return true;
    } catch {
      /* missing or invalid */
    }
  }
  return false;
}

function extractMessage(cmd) {
  // Only inspect commands that look like git commit invocations.
  // Skip interactive (no -m) — nothing to validate.
  if (!/^\s*(?:[A-Z_]+=\S+\s+)*git\s+commit\b/.test(cmd)) return null;

  // -m "..." or -m '...'
  const dashM = cmd.match(/-m\s+(?:(["'])((?:\\.|(?!\1).)*)\1)/);
  if (dashM) {
    return dashM[2].split('\n')[0]; // first line is the subject
  }

  // HEREDOC: -m "$(cat <<'EOF' ... EOF)"  → grab first non-empty line of body
  const heredoc = cmd.match(/<<['"]?(\w+)['"]?\s*\n([\s\S]*?)\n\s*\1\b/);
  if (heredoc) {
    const body = heredoc[2].split('\n').find((l) => l.trim().length > 0);
    return body || null;
  }

  return null;
}

function validate(subject) {
  const issues = [];
  const conventional = /^(?<type>[a-z]+)(?:\((?<scope>[^)]+)\))?(!)?:\s+(?<rest>.+)$/;
  const m = conventional.exec(subject);
  if (!m) {
    issues.push('subject does not match `type(scope): description`');
    return issues;
  }
  const { type, rest } = m.groups;
  if (!VALID_TYPES.has(type)) {
    issues.push(`unknown type "${type}" (expected: ${[...VALID_TYPES].join(', ')})`);
  }
  if (subject.length > MAX_SUBJECT_LEN) {
    issues.push(`subject is ${subject.length} chars (max ${MAX_SUBJECT_LEN})`);
  }
  if (!rest || rest.length < 3) {
    issues.push('subject body too short');
  }
  return issues;
}
