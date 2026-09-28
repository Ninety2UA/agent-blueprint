#!/usr/bin/env node
/**
 * SessionStart Hook — Bootstrap context for new sessions.
 * Checks project state and reminds agent about available skills.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const cwd = process.cwd();
const lines = [];

// Check for project state files
const statusFile = path.join(cwd, 'docs', 'context', 'STATUS.md');
const goalsFile = path.join(cwd, 'docs', 'context', 'GOALS.md');
const backlogFile = path.join(cwd, 'BACKLOG.md');

if (fs.existsSync(statusFile)) {
  lines.push('docs/context/STATUS.md exists — read it for current project state.');
}
if (fs.existsSync(goalsFile)) {
  lines.push('docs/context/GOALS.md exists — read when prioritizing work.');
}

// Check for architecture decision records
const decisionsDir = path.join(cwd, 'docs', 'decisions');
if (fs.existsSync(decisionsDir)) {
  try {
    const adrs = fs.readdirSync(decisionsDir).filter(f => f.endsWith('.md') && f !== 'README.md');
    if (adrs.length > 0) {
      lines.push(adrs.length + ' architecture decision record(s) in docs/decisions/.');
    }
  } catch (e) { /* ignore */ }
}

// Check for pending plans
const plansDir = path.join(cwd, 'docs', 'plans');
if (fs.existsSync(plansDir)) {
  try {
    const plans = fs.readdirSync(plansDir).filter(f => f.endsWith('.md') && f !== 'README.md');
    if (plans.length > 0) {
      lines.push(plans.length + ' plan(s) in docs/plans/ — check for pending implementation.');
    }
  } catch (e) { /* ignore */ }
}

// Check for open backlog items
if (fs.existsSync(backlogFile)) {
  try {
    const content = fs.readFileSync(backlogFile, 'utf-8');
    const unchecked = (content.match(/^- \[ \]/gm) || []).length;
    if (unchecked > 0) {
      lines.push(unchecked + ' open item(s) in BACKLOG.md.');
    }
  } catch (e) { /* ignore */ }
}

// Check for locked decisions from /ab-discuss
const lockedFile = path.join(cwd, 'docs', 'context', 'DECISIONS.md');
if (fs.existsSync(lockedFile)) {
  lines.push('DECISIONS.md exists — locked decisions that MUST be honored during planning.');
}

// Check for past research
const researchDir = path.join(cwd, 'docs', 'research');
if (fs.existsSync(researchDir)) {
  try {
    const docs = fs.readdirSync(researchDir).filter(f => f.endsWith('.md') && f !== 'README.md');
    if (docs.length > 0) {
      lines.push(docs.length + ' research doc(s) in docs/research/ — search before starting new work.');
    }
  } catch (e) { /* ignore */ }
}

// Check for compounded solutions
const solutionsDir = path.join(cwd, 'docs', 'solutions');
if (fs.existsSync(solutionsDir)) {
  try {
    const solutions = fs.readdirSync(solutionsDir).filter(f => f.endsWith('.md') && f !== 'README.md');
    if (solutions.length > 0) {
      lines.push(solutions.length + ' solution(s) in docs/solutions/ — institutional knowledge for planning.');
    }
  } catch (e) { /* ignore */ }
}

// Check for session state (for resume)
const stateFile = path.join(cwd, 'docs', 'context', 'STATE.md');
if (fs.existsSync(stateFile)) {
  lines.push('STATE.md exists — read it to resume in-progress work.');
}

// Reset context monitor state for fresh session
const ctxStateDir = path.join(os.tmpdir(), 'claude-blueprint');
const ctxStateFile = path.join(ctxStateDir, 'ctx-' + Buffer.from(cwd).toString('hex').slice(0, 16) + '.json');
try {
  if (fs.existsSync(ctxStateFile)) fs.unlinkSync(ctxStateFile);
} catch (e) { /* ignore */ }

// Auto-create MEMORY.md if missing
const projectKey = '-' + cwd.slice(1).replace(/\//g, '-');
const memoryDir = path.join(os.homedir(), '.claude', 'projects', projectKey, 'memory');
const memoryFile = path.join(memoryDir, 'MEMORY.md');
try {
  if (!fs.existsSync(memoryFile)) {
    fs.mkdirSync(memoryDir, { recursive: true });
    fs.writeFileSync(memoryFile, '# Project Memory\n\n<!-- Auto-created by Agent Blueprint session-start hook -->\n');
    lines.push('Auto-memory initialized — MEMORY.md created.');
  }
} catch (e) { /* ignore — non-critical */ }

// Remind about skills
lines.push('Skills: /ab-project-start · /ab-ideation · /ab-brainstorming · /ab-build-pipeline · /ab-ship-pipeline · /ab-quick-fix · /ab-discuss · /ab-requesting-code-review · /ab-review-swarm · /ab-deep-research · /ab-knowledge-compounding · /ab-orchestrate · /ab-project-status · /ab-systematic-debugging · /ab-backlog-triage · /ab-session-wrap · /ab-plugin-update');

if (lines.length > 0) {
  console.log(lines.join('\n'));
}
