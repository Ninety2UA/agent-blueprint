#!/usr/bin/env node
// Prompt Injection Guard — PreToolUse hook
// Scans file content being written to docs/ and planning artifacts for prompt
// injection patterns. Defense-in-depth: catches injected instructions before
// they enter agent context.
//
// Triggers on: Write, Edit and apply_patch tool calls targeting docs/, CLAUDE.md, or
//              any file that becomes part of agent context
// Action: Advisory warning (does not block) — logs detection for awareness
//
// Why advisory-only: Blocking would prevent legitimate workflow operations.
// The goal is to surface suspicious content so the operator can inspect it,
// not to create false-positive deadlocks.

const fs = require('fs');
const path = require('path');
const { detectHost, traceAction } = require('./host');

// Prompt injection patterns — catches obvious injection attempts. Each word-led pattern refuses a letter
// or digit just before it, so a word that only ends in a trigger ("Blueprint instructions", "slideshow
// prompt") is not a finding. An underscore is allowed there (Markdown emphasis: _ignore ..._), and the
// output verbs also match with a "re" prefix ("reprint your system prompt").
const INJECTION_PATTERNS = [
  /(?<![A-Za-z0-9])ignore\s+(all\s+)?previous\s+instructions/i,
  /(?<![A-Za-z0-9])ignore\s+(all\s+)?above\s+instructions/i,
  /(?<![A-Za-z0-9])disregard\s+(all\s+)?previous/i,
  /(?<![A-Za-z0-9])forget\s+(all\s+)?(your\s+)?instructions/i,
  /(?<![A-Za-z0-9])override\s+(system|previous)\s+(prompt|instructions)/i,
  /(?<![A-Za-z0-9])you\s+are\s+now\s+(?:a|an|the)\s+/i,
  /(?<![A-Za-z0-9])pretend\s+(?:you(?:'re| are)\s+|to\s+be\s+)/i,
  /(?<![A-Za-z0-9])from\s+now\s+on,?\s+you\s+(?:are|will|should|must)/i,
  /(?<![A-Za-z0-9])(?:re)?(?:print|output|reveal|show|display|repeat)\s+(?:your\s+)?(?:system\s+)?(?:prompt|instructions)/i,
  /<\/?(?:system|assistant|human)>/i,
  /\[SYSTEM\]/i,
  /\[INST\]/i,
  /<<\s*SYS\s*>>/i,
];

// Files/directories that become agent context
const CONTEXT_PATHS = [
  'docs/',
  'AGENTS.md',
  'CLAUDE.md',
  'BACKLOG.md',
  'blueprint.local.md',
  '.agent-blueprint/',
  '.agents/skills/',
  '.claude/skills/',
];
const isContextPath = p => CONTEXT_PATHS.some(c => p.includes(c));

function isContextSource(source, cwd) {
  const root = path.resolve(cwd);
  const relative = path.relative(root, path.resolve(root, source));
  if (relative.startsWith('..') || path.isAbsolute(relative)) return false;
  const normalized = relative.split(path.sep).join('/');
  return CONTEXT_PATHS.some(c => c.endsWith('/') ? normalized.startsWith(c) : normalized === c);
}

// Keep the synchronous read well inside the hook's time budget.
const MAX_MOVE_SOURCE_BYTES = 1024 * 1024;

// Codex sends apply_patch as tool_input.command. Scan added lines, plus retained
// source text for moves into context. Keep ordered hunks to reconstruct moves,
// and removals for the fallback when a hunk cannot be located in the source.
function patchWrites(command) {
  const writes = [];
  let section = null;
  let updatePath = null;
  for (const line of command.split(/\r?\n/)) {
    const header = line.match(/^\*\*\* (Add File|Update File|Move to): (.+)$/);
    if (header) {
      section = {
        filePath: header[2],
        moveSource: header[1] === 'Move to' ? updatePath : null,
        lines: [],
        removedLines: [],
        hunks: [],
        unhunkedChanges: false,
      };
      updatePath = header[1] === 'Update File' ? header[2] : null;
      writes.push(section);
    } else if (line.startsWith('*** Delete File: ') || line === '*** End Patch') {
      section = null;
      updatePath = null;
    } else if (section && line.startsWith('@@')) {
      section.hunks.push({ anchor: line.startsWith('@@ ') ? line.slice(3) : null, lines: [] });
    } else if (section && ([' ', '-', '+'].includes(line[0]) || (line === '' && section.hunks.length))) {
      if (line[0] === '+') section.lines.push(line.slice(1));
      if (line[0] === '-') section.removedLines.push(line.slice(1));
      if (section.hunks.length) section.hunks[section.hunks.length - 1].lines.push(line || ' ');
      else if (line[0] !== ' ') section.unhunkedChanges = true;
    }
  }
  return writes.map(({ filePath, moveSource, lines, removedLines, hunks, unhunkedChanges }) => ({
    filePath, moveSource, removedLines, hunks, unhunkedChanges, content: lines.join('\n'),
  }));
}

// KMP keeps a duplicate-heavy old block from causing repeated full comparisons.
function findBlock(lines, block, start, normalize = null) {
  if (block.length === 0) return start;
  const needle = normalize ? block.map(normalize) : block;
  const prefixes = new Array(needle.length).fill(0);
  for (let i = 1, matched = 0; i < needle.length; i++) {
    while (matched > 0 && needle[i] !== needle[matched]) matched = prefixes[matched - 1];
    if (needle[i] === needle[matched]) matched++;
    prefixes[i] = matched;
  }
  for (let i = start, matched = 0; i < lines.length; i++) {
    const line = normalize ? normalize(lines[i]) : lines[i];
    while (matched > 0 && line !== needle[matched]) matched = prefixes[matched - 1];
    if (line === needle[matched]) matched++;
    if (matched === needle.length) return i - matched + 1;
  }
  return -1;
}

function seekBlock(lines, block, start) {
  for (const normalize of [null, line => line.trimEnd(), line => line.trim()]) {
    const match = findBlock(lines, block, start, normalize);
    if (match !== -1) return match;
  }
  return -1;
}

// Return the patched source, retained lines plus every addition if placement fails, or only additions if unreadable.
function movedFileText({ moveSource, removedLines, hunks, unhunkedChanges, content }, cwd) {
  try {
    const sourcePath = path.resolve(cwd, moveSource);
    const stat = fs.statSync(sourcePath);
    if (!stat.isFile() || stat.size > MAX_MOVE_SOURCE_BYTES) return content;

    const sourceLines = fs.readFileSync(sourcePath, 'utf8').split(/\r?\n/);
    // Codex's line reader omits the final newline delimiter.
    const patchLines = sourceLines[sourceLines.length - 1] === '' ? sourceLines.slice(0, -1) : sourceLines;
    const replacements = [];
    let lineIndex = 0;
    let applied = hunks.length > 0 && !unhunkedChanges;
    for (const hunk of hunks) {
      if (hunk.anchor !== null) {
        const anchor = seekBlock(patchLines, [hunk.anchor], lineIndex);
        if (anchor === -1) {
          applied = false;
          break;
        }
        lineIndex = anchor + 1;
      }
      const oldBlock = hunk.lines.filter(line => line[0] !== '+').map(line => line.slice(1));
      const newBlock = hunk.lines.filter(line => line[0] !== '-').map(line => line.slice(1));
      if (oldBlock.length === 0) {
        const end = patchLines.length - (patchLines[patchLines.length - 1] === '' ? 1 : 0);
        replacements.push({ match: end, oldLength: 0, newBlock });
        continue;
      }
      const match = seekBlock(patchLines, oldBlock, lineIndex);
      if (match === -1) {
        applied = false;
        break;
      }
      replacements.push({ match, oldLength: oldBlock.length, newBlock });
      lineIndex = match + oldBlock.length;
    }
    if (applied) {
      // EOF insertions may precede earlier replacements; stable sorting preserves their hunk order.
      replacements.sort((a, b) => a.match - b.match);
      const chunks = [];
      let cursor = 0;
      for (const { match, oldLength, newBlock } of replacements) {
        chunks.push(patchLines.slice(cursor, match), newBlock);
        cursor = match + oldLength;
      }
      chunks.push(patchLines.slice(cursor));
      const text = chunks.flat().join('\n');
      return text && !text.endsWith('\n') ? text + '\n' : text;
    }

    // An unexpected patch still gets the original count-based scan, including
    // every added line, even if some earlier hunks could be located.
    const removedCounts = new Map();
    for (const removed of removedLines) {
      removedCounts.set(removed, (removedCounts.get(removed) || 0) + 1);
    }
    const retainedLines = sourceLines.filter(line => {
      const count = removedCounts.get(line) || 0;
      if (count > 0) {
        removedCounts.set(line, count - 1);
        return false;
      }
      return true;
    });
    return retainedLines.join('\n') + '\n' + content;
  } catch { /* Keep scanning added lines when the source cannot be read. */ }
  return content;
}

let input = '';
// Exit before the hook timeout (3 s in the hook files) to avoid timeout errors
const stdinTimeout = setTimeout(() => process.exit(0), 2500);
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('error', () => { clearTimeout(stdinTimeout); process.exit(0); });
process.stdin.on('end', () => {
  clearTimeout(stdinTimeout);
  try {
    const data = JSON.parse(input);
    if (detectHost(data) === 'other') process.exit(0);
    const toolName = data.tool_name;

    // Write and Edit carry one file's content; a Codex apply_patch can write several files.
    let writes;
    if (toolName === 'apply_patch') {
      writes = patchWrites(data.tool_input?.command || '');
    } else if (toolName === 'Write' || toolName === 'Edit') {
      writes = [{
        filePath: data.tool_input?.file_path || '',
        content: data.tool_input?.content || data.tool_input?.new_string || '',
      }];
    } else {
      process.exit(0);
    }

    const warnings = [];
    for (const write of writes) {
      const { filePath, moveSource } = write;
      // Only scan files that become agent context
      if (!isContextPath(filePath)) continue;

      let content = write.content;
      const cwd = data.cwd || process.cwd();
      if (moveSource && !isContextSource(moveSource, cwd)) content = movedFileText(write, cwd);
      if (!content) continue;

      const findings = [];

      // Scan for injection patterns
      for (const pattern of INJECTION_PATTERNS) {
        if (pattern.test(content)) {
          findings.push(pattern.source);
        }
      }

      // Check for suspicious invisible Unicode (zero-width chars, BOM, soft hyphen)
      if (/[\u200B-\u200F\u2028-\u202F\uFEFF\u00AD]/.test(content)) {
        findings.push('invisible-unicode-characters');
      }

      if (findings.length === 0) continue;
      warnings.push(
        `PROMPT INJECTION WARNING: Content being written to ${path.basename(filePath)} ` +
        `triggered ${findings.length} injection detection pattern(s): ${findings.join(', ')}. ` +
        'This content will become part of agent context. Review the text for embedded ' +
        'instructions that could manipulate agent behavior. If the content is legitimate ' +
        '(e.g., documentation about prompt injection), proceed normally.'
      );
      traceAction('warned', data);
    }
    if (warnings.length === 0) process.exit(0);

    // Advisory warning — does not block the operation
    const output = {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        additionalContext: warnings.join('\n\n'),
      },
    };

    process.stdout.write(JSON.stringify(output));
  } catch {
    // Silent fail — never block tool execution
    process.exit(0);
  }
});
