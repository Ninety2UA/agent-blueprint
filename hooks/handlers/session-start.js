#!/usr/bin/env node
/**
 * SessionStart Hook — Bootstrap context for new sessions (Claude Code and Codex).
 *
 * Points the agent at the project's state files and warns when the v3 plugin
 * (claude-code-blueprint) is still enabled next to this one. It names no
 * skills: every host lists them itself, and a hardcoded list drifts.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { detectHost, readInput } = require('./host');

readInput((input) => {
  const host = detectHost(input);
  if (host === 'other') process.exit(0);
  const cwd = process.cwd();
  const lines = [];

  const exists = (rel) => fs.existsSync(path.join(cwd, rel));
  const mdCount = (rel) => {
    try {
      return fs.readdirSync(path.join(cwd, rel)).filter((f) => f.endsWith('.md') && f !== 'README.md').length;
    } catch (e) { return 0; }
  };

  if (exists('docs/context/STATUS.md')) {
    lines.push('docs/context/STATUS.md holds the current project state and where the last session stopped: read it first.');
  } else if (!exists('docs/context')) {
    lines.push('No docs/context/ yet: the ab-project-start skill sets the project up.');
  }
  if (exists('docs/context/GOALS.md')) lines.push('docs/context/GOALS.md exists; read it when prioritizing work.');
  if (exists('docs/context/DECISIONS.md')) lines.push('docs/context/DECISIONS.md holds locked decisions to honor during planning.');
  if (exists('docs/context/STATE.md')) lines.push('docs/context/STATE.md exists; read it to resume in-progress work.');
  const adrs = mdCount('docs/decisions');
  if (adrs) lines.push(adrs + ' architecture decision record(s) in docs/decisions/.');
  const plans = mdCount('docs/plans');
  if (plans) lines.push(plans + ' plan(s) in docs/plans/; check for pending implementation.');
  const research = mdCount('docs/research');
  if (research) lines.push(research + ' research doc(s) in docs/research/; search them before starting new work.');
  const solutions = mdCount('docs/solutions');
  if (solutions) lines.push(solutions + ' solution(s) in docs/solutions/: institutional knowledge for planning.');
  if (exists('BACKLOG.md')) {
    try {
      const open = (fs.readFileSync(path.join(cwd, 'BACKLOG.md'), 'utf-8').match(/^- \[ \]/gm) || []).length;
      if (open) lines.push(open + ' open item(s) in BACKLOG.md.');
    } catch (e) { /* ignore */ }
  }
  if (exists('.agent-blueprint/run/state.json')) {
    try {
      const state = JSON.parse(fs.readFileSync(path.join(cwd, '.agent-blueprint/run/state.json'), 'utf-8'));
      if (state.status === 'running') {
        lines.push('A ship-pipeline run is still running (stage ' + state.stage + '); the ab-ship-pipeline skill resumes it from .agent-blueprint/run/state.json.');
      }
    } catch (e) { /* ignore */ }
  }

  // Reset the context monitor for a fresh session.
  const ctxStateFile = path.join(os.tmpdir(), 'claude-blueprint', 'ctx-' + Buffer.from(cwd).toString('hex').slice(0, 16) + '.json');
  try { if (fs.existsSync(ctxStateFile)) fs.unlinkSync(ctxStateFile); } catch (e) { /* ignore */ }

  if (host === 'claude') {
    // The v3 plugin still enabled would load a second set of skills next to the ab- ones.
    const configDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
    try {
      const settings = JSON.parse(fs.readFileSync(path.join(configDir, 'settings.json'), 'utf-8'));
      const enabled = settings.enabledPlugins || {};
      if (Object.keys(enabled).some((k) => k.startsWith('claude-code-blueprint@') && enabled[k] === true)) {
        lines.push('The v3 plugin claude-code-blueprint is still enabled, so two sets of blueprint skills load. Run the ab-migrate skill, or `claude plugin uninstall claude-code-blueprint@claude-code-blueprint`.');
      }
    } catch (e) { /* no settings, or not readable */ }
  }

  if (lines.length > 0) console.log(lines.join('\n'));
  process.exit(0);
}, 2000);
