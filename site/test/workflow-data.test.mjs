// Tests for site/src/components/workflow/workflow-data.mjs against the real README.md, the real
// pipeline SKILL.md files and broken copies of them. Expected rows are read from the README
// without the parser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CHAIN,
  PIPELINE_STAGES,
  checkStages,
  getWorkflow,
  inlineHtml,
  parseGates,
  parseLoop,
} from '../src/components/workflow/workflow-data.mjs';
import { getSiteData } from '../src/lib/site.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const README = readFileSync(join(ROOT, 'README.md'), 'utf8');
const isFolder = (name) => existsSync(join(ROOT, 'skills', name, 'SKILL.md'));
const skillMd = (name) => readFileSync(join(ROOT, 'skills', name, 'SKILL.md'), 'utf8');

// Lines of the README between "### <title>" and the next heading, read without the parser.
function rawLines(title) {
  const lines = README.split('\n');
  const start = lines.indexOf(`### ${title}`);
  assert.ok(start >= 0, `README has no "### ${title}" heading`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^#{1,3} /.test(l));
  return end === -1 ? rest : rest.slice(0, end);
}

test('parseLoop reads every numbered step of "The development loop", in order', () => {
  const raw = rawLines('The development loop').filter((l) => /^\d+\. /.test(l));
  const steps = parseLoop(README);
  assert.equal(steps.length, raw.length);
  steps.forEach((step, i) => {
    assert.equal(step.n, i + 1);
    assert.ok(raw[i].startsWith(`${i + 1}. ${step.name}`), `step ${i + 1} name "${step.name}" is not how "${raw[i]}" starts`);
    assert.equal(step.optional, /^\d+\. [^.]*\(optional\)\./.test(raw[i]));
    assert.ok(step.text.length > 0 && raw[i].endsWith(step.text), `step ${i + 1} text`);
    assert.doesNotMatch(step.name, /[.(]/);
  });
  assert.ok(steps.some((s) => s.optional), 'the README marks one step optional');
});

test('parseLoop and parseGates name the README section they could not find', () => {
  const noLoop = README.replace('### The development loop', '### The loop, renamed');
  assert.throws(() => parseLoop(noLoop), /The development loop/);
  const noGates = README.replace('| Gate | Rule | Enforced by |', '| Gate | Rule | Owner |');
  assert.throws(() => parseGates(noGates), /Quality gates.*Gate \| Rule \| Enforced by/);
});

test('parseGates reads every row of the quality gates table with the skills that enforce it', () => {
  const raw = rawLines('Quality gates').filter((l) => /^\|\s*\d+\s*\|/.test(l));
  const gates = parseGates(README);
  assert.equal(gates.length, raw.length);
  gates.forEach((gate, i) => {
    assert.equal(gate.n, i + 1);
    assert.ok(raw[i].includes(gate.rule), `gate ${i + 1} rule "${gate.rule}"`);
    assert.ok(gate.skills.length > 0, `gate ${i + 1} names no skill`);
    for (const name of gate.skills) assert.ok(isFolder(name), `gate ${i + 1} names ${name}, which is not a skill folder`);
  });
});

test('inlineHtml escapes the text and links code spans that name a skill', () => {
  const isSkill = (n) => n === 'ab-quick-fix';
  assert.equal(
    inlineHtml('Use `ab-quick-fix` for <small> & `docs/plans/`, not `ab-nope`.', isSkill),
    'Use <a href="/skills/ab-quick-fix/"><code>ab-quick-fix</code></a> for &lt;small&gt; &amp; <code>docs/plans/</code>, not <code>ab-nope</code>.',
  );
});

test('checkStages fails when a stage names a skill its pipeline does not mention', () => {
  const md = '## Step 1: One\nUse the ab-a skill.\n## Step 2: Two\nDone.';
  assert.doesNotThrow(() => checkStages('ab-p', [{ label: 'One', skills: ['ab-a'] }, { label: 'Two', skills: [] }], md));
  assert.throws(() => checkStages('ab-p', [{ label: 'One', skills: ['ab-b'] }, { label: 'Two', skills: [] }], md), /ab-p.*ab-b/);
});

test('checkStages fails when the pipeline has a different number of stage headings', () => {
  const md = '### Stage 1: One\n### Stage 2: Two\n### Stage 3: Three\n';
  assert.throws(() => checkStages('ab-p', [{ label: 'One', skills: [] }, { label: 'Two', skills: [] }], md), /ab-p.*3.*2/);
  // a pipeline without numbered stage headings is checked by its skills only
  assert.doesNotThrow(() => checkStages('ab-p', [{ label: 'One', skills: [] }], '## Coordinate\n'));
});

test('the stages drawn for each pipeline match its SKILL.md', () => {
  for (const [name, spec] of Object.entries(PIPELINE_STAGES)) {
    assert.ok(isFolder(name), `${name} is not a skill folder`);
    assert.doesNotThrow(() => checkStages(name, spec.stages, skillMd(name)));
    for (const stage of spec.stages) {
      assert.ok(stage.label, `${name}: a stage without a label`);
      assert.ok(stage.skills.length > 0 || stage.note, `${name} "${stage.label}": neither a skill nor a note`);
      stage.skills.forEach((s) => assert.ok(isFolder(s), `${name} "${stage.label}" names ${s}`));
    }
  }
});

test('every skill in the hand-off chain is a skill folder', () => {
  for (const row of CHAIN) {
    for (const name of [...row.from, ...row.to]) assert.ok(isFolder(name), `the chain names ${name}`);
    assert.ok(row.leaves && row.what, 'a chain row without what it leaves');
  }
});

test('getWorkflow draws the README pipelines in table order, each with its summary and stages', () => {
  const data = getSiteData(ROOT);
  const pipelines = data.phases.find((p) => p.slug === 'pipelines').skills;
  const wf = getWorkflow(ROOT);
  assert.deepEqual(wf.pipelines.map((p) => p.name), pipelines);
  for (const p of wf.pipelines) {
    const skill = data.skills.find((s) => s.name === p.name);
    assert.equal(p.when, skill.when);
    assert.ok(p.summaryHtml.length > 0);
    assert.equal(p.stages.length, PIPELINE_STAGES[p.name]?.stages.length ?? 0);
  }
  assert.equal(wf.loop.length, parseLoop(README).length);
  assert.equal(wf.gates.length, parseGates(README).length);
  // every skill the loop text names in code is linked
  for (const step of wf.loop) {
    for (const [, code] of step.text.matchAll(/`([^`]+)`/g)) {
      if (isFolder(code)) assert.ok(step.html.includes(`<a href="/skills/${code}/"><code>${code}</code></a>`), `${step.name}: ${code} not linked`);
    }
  }
});

test('getWorkflow names the data file when a hand-written skill name is not a skill', () => {
  const saved = CHAIN[0].to[0];
  CHAIN[0].to[0] = 'ab-not-a-skill';
  try {
    assert.throws(() => getWorkflow(ROOT), /ab-not-a-skill.*workflow-data\.mjs/);
  } finally {
    CHAIN[0].to[0] = saved;
  }
});
