#!/usr/bin/env node
/**
 * TeammateIdle Hook — Quality gate for Agent Teams.
 *
 * Fires when a teammate is about to go idle (finished all tasks).
 * Checks if modified files pass basic quality checks before allowing idle.
 *
 * Exit codes:
 *   0 — Allow teammate to go idle (all checks pass)
 *   2 — Send feedback and keep teammate working (issues found)
 *
 * To enable: Add to your Claude Code settings.json under hooks.TeammateIdle
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Guard: only run during active /team-execution sessions
const stateFile = path.join(process.cwd(), '.claude', 'team-active.local.md');
if (!fs.existsSync(stateFile)) {
  process.exit(0); // No active team — allow idle silently
}

function run(cmd, args) {
  try {
    return execFileSync(cmd, args, { encoding: 'utf-8', timeout: 30000 }).trim();
  } catch (e) {
    return null;
  }
}

const issues = [];

// Check for modified files with uncommitted changes
const status = run('git', ['status', '--porcelain']);
if (status) {
  issues.push('Uncommitted changes detected. Commit your work before going idle.');
}

// Check if tests pass for the project
const testInfo = detectTestCommand();
if (testInfo) {
  const testResult = run(testInfo.cmd, testInfo.args);
  if (testResult === null) {
    issues.push('Tests are failing. Fix test failures before going idle.');
  }
}

// Check for lint errors
const lintInfo = detectLintCommand();
if (lintInfo) {
  const lintResult = run(lintInfo.cmd, lintInfo.args);
  if (lintResult === null) {
    issues.push('Lint errors found. Fix lint issues before going idle.');
  }
}

if (issues.length > 0) {
  console.error('Quality checks failed:\n- ' + issues.join('\n- '));
  process.exit(2); // Keep teammate working
} else {
  process.exit(0); // Allow idle
}

function detectTestCommand() {
  if (fs.existsSync('package.json')) {
    try {
      const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
      if (pkg.scripts && pkg.scripts.test) {
        return { cmd: 'npm', args: ['test', '--', '--passWithNoTests'] };
      }
    } catch (e) { /* ignore */ }
  }
  if (fs.existsSync('Gemfile')) return { cmd: 'bundle', args: ['exec', 'rake', 'test'] };
  if (fs.existsSync('pytest.ini') || fs.existsSync('pyproject.toml')) {
    return { cmd: 'python', args: ['-m', 'pytest', '--tb=short'] };
  }
  if (fs.existsSync('go.mod')) return { cmd: 'go', args: ['test', './...'] };
  return null;
}

function detectLintCommand() {
  if (fs.existsSync('package.json')) {
    try {
      const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
      if (pkg.scripts && pkg.scripts.lint) {
        return { cmd: 'npm', args: ['run', 'lint'] };
      }
    } catch (e) { /* ignore */ }
  }
  if (fs.existsSync('.rubocop.yml')) return { cmd: 'bundle', args: ['exec', 'rubocop', '--format', 'simple'] };
  if (fs.existsSync('.flake8') || fs.existsSync('setup.cfg')) {
    return { cmd: 'python', args: ['-m', 'flake8'] };
  }
  return null;
}
