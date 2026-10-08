// workflow-data.mjs: the facts the Workflow page draws. Plain Node, tested in
// site/test/workflow-data.test.mjs.
//
// From the README, at build time (R13): the steps of "### The development loop" and the rows of the
// "### Quality gates" table. A missing section or table stops the build and names it.
// From getSiteData(): the pipelines (the README "Pipelines" table, in its order) with their summaries,
// the phases and the counts.
// Written here, and checked on every build: which file each skill leaves for the next one (CHAIN) and
// the stages drawn for each pipeline (PIPELINE_STAGES). Every skill they name must exist, every
// stage skill must be named in its pipeline's SKILL.md, and a pipeline with numbered stage headings
// must have as many stages here, so a renamed skill or a changed pipeline stops the build here
// instead of shipping a wrong drawing. A pipeline the README adds later is drawn without stages.
//
// Exports
//   parseLoop(readme)      [{ n, name, optional, text }]; `text` is the step's Markdown after its name.
//   parseGates(readme)     [{ n, rule, enforcedBy, skills }] from the "Gate | Rule | Enforced by" table.
//   inlineHtml(text, isSkill)  README inline Markdown as HTML: text escaped, `code` spans as <code>,
//                          and a span that names a skill linked to /skills/<name>/.
//   CHAIN                  [{ from, leaves, what, to, next? }]: a skill, the file or record it leaves,
//                          and the skills that read it; `next` marks what carries into the next session.
//   PIPELINE_STAGES        { <pipeline>: { checkpoints, stages: [{ label, skills, note?, optional? }] } };
//                          a note is inline Markdown, and an optional stage is one a flag can skip.
//   checkStages(name, stages, skillMd)  throws when a stage skill is not named in the SKILL.md, or when
//                          the SKILL.md has numbered "Stage N:" or "Step N:" headings and their count
//                          differs from the stages listed.
//   getWorkflow(root?)     { loop, gates, pipelines, chain, phases, counts }, everything checked.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { getSection } from '../../lib/readme.mjs';
import { findRepoRoot, getSiteData } from '../../lib/site.mjs';

const HERE = 'site/src/components/workflow/workflow-data.mjs';

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function inlineHtml(text, isSkill) {
  return text
    .split(/(`[^`]+`)/)
    .map((part) => {
      const code = part.match(/^`([^`]+)`$/)?.[1];
      if (code === undefined) return escapeHtml(part);
      const html = `<code>${escapeHtml(code)}</code>`;
      return isSkill(code) ? `<a href="/skills/${code}/">${html}</a>` : html;
    })
    .join('');
}

function sectionLines(readme, heading) {
  try {
    return getSection(readme, heading).lines;
  } catch {
    throw new Error(`Workflow page: README.md has no section "${heading}"; the page draws it (${HERE})`);
  }
}

export function parseLoop(readme) {
  const items = sectionLines(readme, 'The development loop')
    .map((line) => line.match(/^(\d+)\.\s+(.+)$/))
    .filter(Boolean);
  if (!items.length) throw new Error('Workflow page: README "The development loop" has no numbered steps');
  return items.map(([, n, item]) => {
    const m = item.match(/^([^.]+?)(\s*\(optional\))?\.\s+(.+)$/i);
    if (!m) throw new Error(`Workflow page: README "The development loop" step ${n} does not start with "Name." : ${item}`);
    return { n: Number(n), name: m[1].trim(), optional: Boolean(m[2]), text: m[3].trim() };
  });
}

const GATE_HEADER = ['Gate', 'Rule', 'Enforced by'];
const cells = (line) => line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

export function parseGates(readme) {
  const lines = sectionLines(readme, 'Quality gates');
  const start = lines.findIndex((l) => l.trim().startsWith('|') && cells(l).join(' | ') === GATE_HEADER.join(' | '));
  if (start === -1) throw new Error(`Workflow page: README "Quality gates" has no table "${GATE_HEADER.join(' | ')}"`);
  const rows = [];
  for (const line of lines.slice(start + 2)) {
    if (!line.trim().startsWith('|')) break;
    const [n, rule, enforcedBy] = cells(line);
    rows.push({ n: Number(n), rule, enforcedBy, skills: [...enforcedBy.matchAll(/`([^`]+)`/g)].map((m) => m[1]) });
  }
  if (!rows.length) throw new Error('Workflow page: README "Quality gates" table has no rows');
  return rows;
}

// What each skill leaves for the next one. Each line is backed by the skills' own SKILL.md files.
export const CHAIN = [
  {
    from: ['ab-brainstorming'],
    leaves: 'docs/plans/<date>-<topic>-design.md',
    what: 'The design you approved, section by section',
    to: ['ab-writing-plans'],
  },
  {
    from: ['ab-writing-plans'],
    leaves: 'docs/plans/<date>-<feature>.md',
    what: 'The plan, saved for review before anything runs',
    to: ['ab-deepen-plan', 'ab-executing-plans', 'ab-subagent-driven-development', 'ab-orchestrate'],
  },
  {
    from: ['ab-executing-plans', 'ab-subagent-driven-development', 'ab-orchestrate'],
    leaves: 'one commit per task',
    what: 'The work, committed task by task',
    to: ['ab-requesting-code-review', 'ab-review-swarm'],
  },
  {
    from: ['ab-requesting-code-review', 'ab-review-swarm'],
    leaves: 'findings by priority',
    what: 'Each finding ranked from must-fix to suggestion',
    to: ['ab-receiving-code-review'],
  },
  {
    from: ['ab-session-wrap'],
    leaves: 'docs/context/STATUS.md',
    what: 'The handoff note: what was done, what is left, where to start',
    to: ['ab-resume-session', 'ab-project-status'],
    next: true,
  },
  {
    from: ['ab-knowledge-compounding'],
    leaves: 'docs/solutions/',
    what: 'One document per solved problem, with its root cause and search terms',
    to: ['ab-brainstorming', 'ab-deep-research'],
    next: true,
  },
];

// The stages drawn for each pipeline, in the order its SKILL.md runs them.
export const PIPELINE_STAGES = {
  'ab-build-pipeline': {
    checkpoints: true,
    stages: [
      { label: 'Discuss', skills: ['ab-discuss'] },
      { label: 'Brainstorm', skills: ['ab-brainstorming'] },
      { label: 'Plan', skills: ['ab-writing-plans'] },
      { label: 'Execute', skills: ['ab-executing-plans', 'ab-orchestrate'] },
      { label: 'Review', skills: ['ab-review-swarm', 'ab-resolve-in-parallel'] },
      { label: 'Verify', skills: ['ab-verification-before-completion'] },
      { label: 'Deploy check', skills: ['ab-deployment-verification'], optional: true },
      { label: 'Compound', skills: ['ab-knowledge-compounding'] },
    ],
  },
  'ab-ship-pipeline': {
    checkpoints: false,
    stages: [
      { label: 'Initialize', skills: [], note: 'Picks up an earlier run at the stage that needs work' },
      { label: 'Requirements', skills: [], note: 'Locks assumptions as decisions in `docs/context/DECISIONS.md`' },
      { label: 'Plan', skills: ['ab-writing-plans'] },
      { label: 'Deepen plan', skills: ['ab-deepen-plan'] },
      { label: 'Execute', skills: ['ab-orchestrate'] },
      { label: 'Iterative review', skills: ['ab-iterative-refinement'] },
      { label: 'Compound', skills: ['ab-knowledge-compounding'] },
      { label: 'Ship it', skills: [], note: 'Commits and writes the pull request body' },
    ],
  },
  'ab-quick-fix': {
    checkpoints: false,
    stages: [
      { label: 'Qualify', skills: [], note: 'Under three files, obvious approach' },
      { label: 'Failing test', skills: ['ab-test-driven-development'] },
      { label: 'Fix', skills: [], note: 'The least code that makes the test pass' },
      { label: 'Verify', skills: [], note: 'The whole test suite, the build and the linter' },
      { label: 'Commit', skills: [], note: 'One commit on a branch' },
    ],
  },
  'ab-orchestrate': {
    checkpoints: false,
    stages: [
      { label: 'Ledger', skills: [], note: 'The plan as a task list in `.agent-blueprint/team/<run>/`' },
      { label: 'Waves', skills: [], note: 'One helper per task; tasks that share a file never share a wave' },
      { label: 'Lead commits', skills: [], note: 'Only the lead commits each finished task' },
      { label: 'Integration check', skills: [], note: 'After every wave' },
      { label: 'Review', skills: ['ab-review-swarm', 'ab-iterative-refinement'], optional: true },
      { label: 'Sign-off', skills: [], note: 'Once the P1 findings are fixed', optional: true },
    ],
  },
};

export function checkStages(name, stages, skillMd) {
  for (const stage of stages) {
    for (const skill of stage.skills) {
      if (!new RegExp(`\\b${skill}\\b`).test(skillMd)) {
        throw new Error(`Workflow page: ${name} stage "${stage.label}" names ${skill}, which ${name}/SKILL.md does not mention. Update ${HERE}.`);
      }
    }
  }
  const headings = skillMd.match(/^#{2,3} (?:Stage|Step) \d+:/gm) ?? [];
  if (headings.length && headings.length !== stages.length) {
    throw new Error(`Workflow page: ${name}/SKILL.md has ${headings.length} stages, ${HERE} draws ${stages.length}. Update ${HERE}.`);
  }
}

export function getWorkflow(root = findRepoRoot()) {
  const data = getSiteData(root);
  const readme = readFileSync(join(root, 'README.md'), 'utf8');
  const skills = new Map(data.skills.map((s) => [s.name, s]));
  const isSkill = (name) => skills.has(name);
  const need = (name, where) => {
    if (!isSkill(name)) throw new Error(`Workflow page: ${where} names ${name}, which skills/ does not have. Update ${HERE}.`);
  };

  for (const row of CHAIN) [...row.from, ...row.to].forEach((name) => need(name, 'the hand-off chain'));

  const pipelinePhase = data.phases.find((p) => p.slug === 'pipelines');
  if (!pipelinePhase) throw new Error('Workflow page: README "Skills reference" has no "Pipelines" table');
  const pipelines = pipelinePhase.skills.map((name) => {
    const skill = skills.get(name);
    const spec = PIPELINE_STAGES[name];
    if (spec) {
      spec.stages.forEach((stage) => stage.skills.forEach((s) => need(s, `${name} stage "${stage.label}"`)));
      checkStages(name, spec.stages, readFileSync(join(root, 'skills', name, 'SKILL.md'), 'utf8'));
    }
    return {
      name,
      when: skill.when,
      summaryHtml: inlineHtml(skill.summary, isSkill),
      checkpoints: spec?.checkpoints ?? false,
      stages: spec?.stages ?? [],
    };
  });

  return {
    loop: parseLoop(readme).map((step) => ({ ...step, html: inlineHtml(step.text, isSkill) })),
    gates: parseGates(readme).map((gate) => ({ ...gate, ruleHtml: inlineHtml(gate.rule, isSkill), skills: gate.skills.filter(isSkill) })),
    pipelines,
    chain: CHAIN,
    phases: data.phases,
    counts: data.counts,
  };
}
