#!/usr/bin/env node
/**
 * TaskCompleted Hook — Quality gate for Agent Teams.
 *
 * Fires when a task is being marked as complete.
 * Verifies that the task's changes meet basic quality standards.
 *
 * Exit codes:
 *   0 — Allow task completion
 *   2 — Prevent completion with feedback (issues found)
 *
 * To enable: Add to your Claude Code settings.json under hooks.TaskCompleted
 */

const { execFileSync } = require('child_process');
const fs = require('fs');

function run(cmd, args) {
  try {
    return execFileSync(cmd, args, { encoding: 'utf-8', timeout: 60000 }).trim();
  } catch (e) {
    return null;
  }
}

const issues = [];

// Get changed files
const changedFiles = run('git', ['diff', '--name-only', 'HEAD']);
const files = changedFiles ? changedFiles.split('\n').filter(f => f.trim()) : [];

if (files.length === 0) {
  // No changed files — task may be documentation or research only
  process.exit(0);
}

// Check for syntax errors in changed files
for (const file of files) {
  if (!fs.existsSync(file)) continue;

  if (file.endsWith('.js') || file.endsWith('.ts') || file.endsWith('.tsx')) {
    const result = run('node', ['--check', file]);
    if (result === null) {
      issues.push('Syntax error in ' + file);
    }
  }
  if (file.endsWith('.rb')) {
    const result = run('ruby', ['-c', file]);
    if (result === null) {
      issues.push('Syntax error in ' + file);
    }
  }
  if (file.endsWith('.py')) {
    const result = run('python', ['-m', 'py_compile', file]);
    if (result === null) {
      issues.push('Syntax error in ' + file);
    }
  }
}

// Check for debugging artifacts left in code
for (const file of files) {
  if (!fs.existsSync(file)) continue;

  try {
    const content = fs.readFileSync(file, 'utf-8');
    if (/\bdebugger\b/.test(content)) {
      issues.push('Debugger statement left in ' + file);
    }
    if (/\bbinding\.pry\b/.test(content) || /\bbyebug\b/.test(content)) {
      issues.push('Debug breakpoint left in ' + file);
    }
    if (/\bbreakpoint\(\)/.test(content) && file.endsWith('.py')) {
      issues.push('Debug breakpoint left in ' + file);
    }
  } catch (e) { /* ignore read errors */ }
}

if (issues.length > 0) {
  console.error('Task cannot be completed:\n- ' + issues.join('\n- '));
  process.exit(2); // Prevent completion
} else {
  process.exit(0); // Allow completion
}
