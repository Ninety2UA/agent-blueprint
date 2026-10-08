// Tests for site/src/components/skills/outline.mjs: what a skill page derives from its SKILL.md
// (the steps, what it returns, the body as rendered) and from its description.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  formatText,
  inlineCode,
  parseStep,
  prepareBody,
  skillOutline,
  splitDescription,
} from '../src/components/skills/outline.mjs';

// Rendered SKILL.md HTML as the Satteri pipeline emits it, with its heading metadata.
const h = (depth, slug, text) => ({ depth, slug, text });
const doc = (parts) => parts.join('\n');

test('parseStep reads Step, Stage, Phase, Pass and numbered headings, and nothing else', () => {
  assert.deepEqual(parseStep('Step 1: Determine Scope'), { label: '1', title: 'Determine Scope' });
  assert.deepEqual(parseStep('Step 0.5: Deslop pass'), { label: '0.5', title: 'Deslop pass' });
  assert.deepEqual(parseStep('Stage 7: Deploy Check (Optional)'), { label: '7', title: 'Deploy Check (Optional)' });
  assert.deepEqual(parseStep('Phase 1: Root Cause Investigation'), { label: '1', title: 'Root Cause Investigation' });
  assert.deepEqual(parseStep('Pass 2: Clarity'), { label: '2', title: 'Clarity' });
  assert.deepEqual(parseStep('3. Ask clarifying questions'), { label: '3', title: 'Ask clarifying questions' });
  assert.deepEqual(parseStep('2a. Review'), { label: '2a', title: 'Review' });
  assert.deepEqual(parseStep('5a: Validation (above 5 findings)'), { label: '5a', title: 'Validation (above 5 findings)' });
  assert.equal(parseStep('Step N: [description]'), null);
  assert.equal(parseStep('RED - Write Failing Test'), null);
  assert.equal(parseStep('Option 1: Merge Locally'), null);
  assert.equal(parseStep('The Iron Law'), null);
});

test('steps come from the shallowest level with two or more step headings, with any shallower step', () => {
  const headings = [
    h(1, 'review-swarm', 'Review Swarm'),
    h(2, 'step-0-classify', 'Step 0: Classify'),
    h(2, 'the-four-phases', 'The Four Phases'),
    h(3, 'phase-1-root-cause', 'Phase 1: Root Cause'),
    h(3, 'phase-2-pattern', 'Phase 2: Pattern'),
    h(4, 'step-1-inner', 'Step 1: Inner'),
    h(4, 'step-2-inner', 'Step 2: Inner'),
    h(2, 'long-bugs', 'Long bugs'),
  ];
  const html = doc([
    '<h1 id="review-swarm">Review Swarm</h1>',
    '<h2 id="step-0-classify">Step 0: Classify</h2>',
    '<p>Name the <code>error</code> class first.</p>',
    '<p>Second paragraph.</p>',
    '<h2 id="the-four-phases">The Four Phases</h2>',
    '<h3 id="phase-1-root-cause">Phase 1: Root Cause</h3>',
    '<ul><li><p>A list first</p></li></ul>',
    '<h3 id="phase-2-pattern">Phase 2: Pattern</h3>',
    '<h4 id="step-1-inner">Step 1: Inner</h4>',
    '<h4 id="step-2-inner">Step 2: Inner</h4>',
    '<h2 id="long-bugs">Long bugs</h2>',
  ]);
  const { kind, steps } = skillOutline(html, headings);
  assert.equal(kind, 'steps');
  assert.deepEqual(
    steps.map((s) => [s.label, s.title, s.id]),
    [
      ['0', 'Classify', 'md-step-0-classify'],
      ['1', 'Root Cause', 'md-phase-1-root-cause'],
      ['2', 'Pattern', 'md-phase-2-pattern'],
    ],
  );
  // the intro is the first block under the heading when that block is a paragraph
  assert.equal(steps[0].intro, 'Name the <code>error</code> class first.');
  assert.equal(steps[1].intro, null);
  assert.equal(steps[2].intro, null);
});

test('a SKILL.md without step headings lists its H2 sections; one without H2s has no outline', () => {
  const headings = [h(1, 'tdd', 'TDD'), h(2, 'when-to-use', 'When to Use'), h(2, 'the-iron-law', 'The Iron Law')];
  const html = doc([
    '<h1 id="tdd">TDD</h1>',
    '<h2 id="when-to-use">When to Use</h2>',
    '<p>Always.</p>',
    '<h2 id="the-iron-law">The Iron Law</h2>',
    '<pre><code>NO CODE</code></pre>',
  ]);
  const outline = skillOutline(html, headings);
  assert.equal(outline.kind, 'sections');
  assert.deepEqual(
    outline.steps.map((s) => [s.label, s.title, s.intro]),
    [
      ['1', 'When to Use', 'Always.'],
      ['2', 'The Iron Law', null],
    ],
  );
  assert.deepEqual(skillOutline('<h1 id="x">X</h1><p>Only text.</p>', [h(1, 'x', 'X')]), {
    kind: null,
    steps: [],
    report: null,
  });
});

test('what you get back: the last report-like section, its headings moved under the page section', () => {
  const headings = [
    h(1, 'deepen', 'Deepen'),
    h(2, 'step-1-load', 'Step 1: Load'),
    h(2, 'step-2-collect-results', 'Step 2: Collect results'),
    h(2, 'step-3-report', 'Step 3: Report'),
    h(3, 'format', 'Format'),
    h(2, 'notes', 'Notes'),
  ];
  const html = doc([
    '<h1 id="deepen">Deepen</h1>',
    '<h2 id="step-1-load">Step 1: Load</h2>',
    '<p>Load it.</p>',
    '<h2 id="step-2-collect-results">Step 2: Collect results</h2>',
    '<p>Collect.</p>',
    '<h2 id="step-3-report">Step 3: Report</h2>',
    '<p>Report the <strong>verdict</strong>.</p>',
    '<h3 id="format">Format</h3>',
    '<pre><code>## Verdict\n&lt;GO&gt;</code></pre>',
    '<h2 id="notes">Notes</h2>',
    '<p>Not part of it.</p>',
  ]);
  const { report } = skillOutline(html, headings);
  assert.equal(report.id, 'md-step-3-report');
  assert.equal(report.title, 'Report');
  assert.equal(
    report.html,
    doc(['<p>Report the <strong>verdict</strong>.</p>', '<h3>Format</h3>', '<pre><code>## Verdict\n&lt;GO&gt;</code></pre>']),
  );
});

test('report-like headings: Report, Final report, Report Format, Present Results, Produce report', () => {
  for (const text of ['Report', 'Step 3: Final report', 'Report Format', 'Step 6: Present Results', 'Step 4: Produce report', 'Step 4: Write the Spike Report']) {
    const html = `<h2 id="r">${text}</h2>\n<p>Out.</p>`;
    assert.equal(skillOutline(html, [h(2, 'r', text)]).report?.id, 'md-r', text);
  }
  for (const text of ['Step 4: Collect results', 'Step 2: Review the Report', 'Step 3: Report progress, check stop signals', 'Report Location']) {
    const html = `<h2 id="r">${text}</h2>\n<p>Out.</p>`;
    assert.equal(skillOutline(html, [h(2, 'r', text)]).report, null, text);
  }
});

test('prepareBody prefixes heading ids and moves the levels in use under an h2, without gaps', () => {
  const headings = [h(1, 'title', 'Title'), h(3, 'step-1', 'Step 1'), h(4, 'option-1', 'Option 1')];
  const html = doc([
    '<h1 id="title">Title</h1>',
    '<p>Text with &lt;h1&gt; escaped.</p>',
    '<h3 id="step-1">Step 1</h3>',
    '<h4 id="option-1">Option 1</h4>',
  ]);
  assert.equal(
    prepareBody(html, headings),
    doc([
      '<h3 id="md-title">Title</h3>',
      '<p>Text with &lt;h1&gt; escaped.</p>',
      '<h4 id="md-step-1">Step 1</h4>',
      '<h5 id="md-option-1">Option 1</h5>',
    ]),
  );
});

test('splitDescription separates what it does, when to use it and what it is not for', () => {
  const parts = splitDescription(
    'Reviews a change in parallel. Merges findings. Use when a change is large; before a merge; or when asked. Not for a quick review (use ab-requesting-code-review).',
  );
  assert.equal(parts.what, 'Reviews a change in parallel. Merges findings.');
  assert.deepEqual(parts.use, ['When a change is large', 'Before a merge', 'When asked']);
  assert.equal(parts.not, 'Not for a quick review (use ab-requesting-code-review).');

  const noNot = splitDescription('Backs every claim. Use before saying work is done. A run from an earlier message does not count.');
  assert.deepEqual(noNot.use, ['Before saying work is done', 'A run from an earlier message does not count']);
  assert.equal(noNot.not, null);
});

test('inlineCode escapes HTML and turns backticks into code', () => {
  assert.equal(inlineCode('Keeps `docs/<x>.md` & more'), 'Keeps <code>docs/&lt;x&gt;.md</code> &amp; more');
});

test('formatText escapes HTML and sets the names of known skills as code', () => {
  assert.equal(
    formatText('Not for <small> fixes (use ab-quick-fix); ab-unknown stays text.', new Set(['ab-quick-fix'])),
    'Not for &lt;small&gt; fixes (use <code>ab-quick-fix</code>); ab-unknown stays text.',
  );
});

test('a step intro is the first sentence of its first plain paragraph', () => {
  const headings = [h(2, 'step-1-a', 'Step 1: A'), h(2, 'step-2-b', 'Step 2: B'), h(2, 'step-3-c', 'Step 3: C')];
  const html = doc([
    '<h2 id="step-1-a">Step 1: A</h2>',
    '<p><strong>Working folder.</strong> A note every skill carries.</p>',
    '<p>Run <code>npm test. Then</code> read it. Then commit, e.g. with a message.</p>',
    '<h2 id="step-2-b">Step 2: B</h2>',
    '<p>Present the findings to the user:</p>',
    '<ul><li>one</li></ul>',
    '<h2 id="step-3-c">Step 3: C</h2>',
    '<p>Ask \u201cwhy?\u201d first. Then the rest.</p>',
  ]);
  const { steps } = skillOutline(html, headings);
  assert.equal(steps[0].intro, 'Run <code>npm test. Then</code> read it.');
  assert.equal(steps[1].intro, null);
  assert.equal(steps[2].intro, 'Ask \u201cwhy?\u201d first.');
});

test('a sentence end inside a quotation does not end the intro', () => {
  const html = '<h2 id="step-1-a">Step 1: A</h2>\n<p>Tell the user: \u201cSaved. Run it.\u201d Then go.</p>';
  const { steps } = skillOutline(html, [h(2, 'step-1-a', 'Step 1: A'), h(2, 'step-1-a', 'Step 1: A')]);
  assert.equal(steps[0].intro, 'Tell the user: \u201cSaved. Run it.\u201d');
});
