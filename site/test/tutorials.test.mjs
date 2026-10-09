// Tests for the tutorials (R5): site/src/components/tutorials/tutorial-md.mjs reads a tutorial's
// Markdown into its run facts, steps and recap, and the three real tutorials hold to the page's
// rules: every step has something to paste, what happens, why it matters and a checkpoint; every
// skill a step names is one of its chips and links to a skill page; the recap names only skills
// the steps name. The built-site test runs after `npm run build` and is skipped without one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { skillsNamed } from '../src/components/guides/guide-html.mjs';
import { parseTutorial } from '../src/components/tutorials/tutorial-md.mjs';
import { TUTORIALS } from '../src/lib/tutorials-order.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SKILLS = readdirSync(join(ROOT, 'skills')).filter((d) => existsSync(join(ROOT, 'skills', d, 'SKILL.md')));
const DIST = join(ROOT, 'site', 'dist');
const noBuild = !existsSync(join(DIST, 'index.html')) && 'site/dist is not built (run npm run build in site/)';

const tutorials = TUTORIALS.map(({ slug }) => {
  const file = `src/content/tutorials/${slug}.md`;
  return { slug, ...parseTutorial(readFileSync(join(ROOT, 'site', file), 'utf8'), file) };
});

test('parseTutorial reads the run facts, the intro, each step in order and the recap', () => {
  const md = [
    '---',
    'description: A tutorial used by the test.',
    'recorded: 2026-10-08',
    'project: demo, a small app',
    'tool: Claude Code 2.1.291',
    'model: Opus 5.5, xhigh effort',
    'mode: auto',
    'took: 5 min',
    '---',
    '',
    'Intro naming `ab-brainstorming`.',
    '',
    '## Design it',
    '',
    'Skills: `ab-brainstorming`, `ab-writing-plans`',
    'Time: 2 min',
    '',
    'Type:',
    '',
    '```prompt',
    '/ab-brainstorming Add a thing',
    '```',
    '',
    'Then, in a terminal:',
    '',
    '```bash',
    'git log --oneline',
    '## not a heading inside a fence',
    '```',
    '',
    '### What happens',
    '',
    'It asks.',
    '',
    '```text',
    '### output, not a part',
    '```',
    '',
    '### Why it matters',
    '',
    'Design first.',
    '',
    '### Checkpoint',
    '',
    'A file exists.',
    '',
    '## Recap',
    '',
    '| Skill | What it produced |',
    '|---|---|',
    '| `ab-brainstorming` | A design |',
    '',
  ].join('\n');
  const t = parseTutorial(md, 'demo.md');
  assert.deepEqual(t.meta, {
    description: 'A tutorial used by the test.',
    recorded: '2026-10-08',
    project: 'demo, a small app',
    tool: 'Claude Code 2.1.291',
    model: 'Opus 5.5, xhigh effort',
    mode: 'auto',
    took: '5 min',
  });
  assert.equal(t.intro, 'Intro naming `ab-brainstorming`.');
  assert.equal(t.steps.length, 1);
  const [step] = t.steps;
  assert.equal(step.title, 'Design it');
  assert.equal(step.id, 'design-it');
  assert.deepEqual(step.skills, ['ab-brainstorming', 'ab-writing-plans']);
  assert.equal(step.time, '2 min');
  assert.deepEqual(step.lead, [
    { kind: 'md', md: 'Type:' },
    { kind: 'cmd', lang: 'prompt', text: '/ab-brainstorming Add a thing' },
    { kind: 'md', md: 'Then, in a terminal:' },
    { kind: 'cmd', lang: 'bash', text: 'git log --oneline\n## not a heading inside a fence' },
  ]);
  assert.equal(step.happens, 'It asks.\n\n```text\n### output, not a part\n```');
  assert.equal(step.why, 'Design first.');
  assert.equal(step.checkpoint, 'A file exists.');
  assert.match(step.markdown, /^## Design it\n/);
  assert.equal(t.recap, '| Skill | What it produced |\n|---|---|\n| `ab-brainstorming` | A design |');
});

test('parseTutorial names the file and the step when a step lacks a part', () => {
  const md = '---\ndescription: d\nrecorded: r\nproject: p\ntool: t\nmodel: m\nmode: auto\ntook: 1 min\n---\n\n## Lonely step\n\n```prompt\nhi\n```\n\n### What happens\n\nx\n\n### Checkpoint\n\ny\n\n## Recap\n\n| Skill | What it produced |\n|---|---|\n';
  assert.throws(() => parseTutorial(md, 'lonely.md'), /lonely\.md.*Lonely step.*Why it matters/);
});

test('every tutorial step has something to paste, what happens, why it matters and a checkpoint', () => {
  for (const t of tutorials) {
    assert.ok(t.steps.length > 0, `${t.slug} has no steps`);
    for (const step of t.steps) {
      const where = `${t.slug} / ${step.title}`;
      assert.ok(step.lead.some((s) => s.kind === 'cmd' && s.text.trim()), `${where}: no prompt or command to paste`);
      for (const part of ['happens', 'why', 'checkpoint']) assert.ok(step[part].trim(), `${where}: empty ${part}`);
    }
  }
});

test('every skill a tutorial step names is one of its chips, and every chip is a skill with a page', () => {
  for (const t of tutorials) {
    for (const step of t.steps) {
      const where = `${t.slug} / ${step.title}`;
      assert.equal(new Set(step.skills).size, step.skills.length, `${where}: a chip repeats`);
      for (const name of step.skills) assert.ok(SKILLS.includes(name), `${where}: chip ${name} is not a skill folder`);
      const named = skillsNamed([step.markdown], SKILLS);
      assert.deepEqual(named.filter((n) => !step.skills.includes(n)), [], `${where}: names a skill without a chip`);
    }
  }
});

test('in the built site, every skill chip on a tutorial page links to a built skill page', { skip: noBuild }, () => {
  for (const t of tutorials) {
    const html = readFileSync(join(DIST, 'tutorials', t.slug, 'index.html'), 'utf8');
    const chips = [...html.matchAll(/<a class="t-chip" href="([^"]+)"/g)].map((m) => m[1]);
    const expected = t.steps.flatMap((s) => s.skills.map((name) => `/skills/${name}/`));
    assert.deepEqual(chips, expected, `${t.slug}: the page's chips are not the steps' skills`);
    for (const href of chips) assert.ok(existsSync(join(DIST, href, 'index.html')), `${t.slug}: ${href} is not a built page`);
  }
});

test("each tutorial's recap names only skills that appear in its steps", () => {
  for (const t of tutorials) {
    const inSteps = new Set(t.steps.flatMap((s) => s.skills));
    const named = skillsNamed([t.recap], SKILLS);
    assert.ok(named.length > 0, `${t.slug}: the recap names no skill`);
    assert.deepEqual(named.filter((n) => !inSteps.has(n)), [], `${t.slug}: the recap names a skill no step names`);
  }
});
