// Tests for site/src/components/guides/guide-html.mjs: a guide's README section links each skill it
// names in code to the skill's page, drops a first heading that repeats the page title, and the
// skills a guide names are found in first-mention order. The hand-written intros link only to
// skills that exist.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { dropTitleHeading, linkSkills, skillsNamed } from '../src/components/guides/guide-html.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const NAMES = ['ab-orchestrate', 'ab-review-swarm', 'ab-ship-pipeline'];

test('linkSkills links a skill named in code to its page', () => {
  assert.equal(
    linkSkills('<p>Run <code>ab-orchestrate</code> first.</p>', NAMES),
    '<p>Run <a href="/skills/ab-orchestrate/"><code>ab-orchestrate</code></a> first.</p>',
  );
});

test('linkSkills leaves code that is not a skill name as it is', () => {
  const html = '<p><code>ab-no-such-skill</code>, <code>ab-orchestrate --no-review</code> and <code>state.json</code></p>';
  assert.equal(linkSkills(html, NAMES), html);
});

test('linkSkills leaves skill names inside links, code blocks and headings alone', () => {
  const html = [
    '<h3 id="team-work-ab-orchestrate">Team work (<code>ab-orchestrate</code>)</h3>',
    '<p><a href="https://example.com/x"><code>ab-review-swarm</code></a></p>',
    '<pre class="astro-code"><code><span>run <code>ab-ship-pipeline</code></span></code></pre>',
  ].join('\n');
  assert.equal(linkSkills(html, NAMES), html);
});

test('linkSkills links every mention, also right after an element it skips', () => {
  const html = '<h2>A <code>ab-ship-pipeline</code></h2><p><code>ab-ship-pipeline</code> and <code>ab-review-swarm</code></p>';
  assert.equal(
    linkSkills(html, NAMES),
    '<h2>A <code>ab-ship-pipeline</code></h2><p><a href="/skills/ab-ship-pipeline/"><code>ab-ship-pipeline</code></a>' +
      ' and <a href="/skills/ab-review-swarm/"><code>ab-review-swarm</code></a></p>',
  );
});

test('dropTitleHeading removes a first H2 that repeats the page title and lifts its subsections', () => {
  const html = '<h2 id="team-work-and-swarms">Team work and swarms</h2>\n<p>Helpers run.</p><h2 id="how">How helpers run</h2>';
  assert.equal(dropTitleHeading(html, 'Team work and swarms'), '\n<p>Helpers run.</p><h2 id="how">How helpers run</h2>');
  // its subsections move up a level, so the heading order under the H1 has no gap
  const nested = '<h2 id="t">Team work and swarms</h2><p>A.</p><h3 id="a">Team work (<code>x</code>)</h3><h4 id="b">B</h4>' +
    '<h2 id="how">How helpers run</h2><h3 id="c">C</h3>';
  assert.equal(
    dropTitleHeading(nested, 'Team work and swarms'),
    '<p>A.</p><h2 id="a">Team work (<code>x</code>)</h2><h3 id="b">B</h3><h2 id="how">How helpers run</h2><h3 id="c">C</h3>',
  );
  // a first heading with other words, or the title further down, stays
  assert.equal(dropTitleHeading(html, 'Model and effort'), html);
  const later = '<p>Intro.</p><h2 id="x">Model and effort</h2>';
  assert.equal(dropTitleHeading(later, 'Model and effort'), later);
});

test('skillsNamed lists each known skill once, in the order the texts first name it', () => {
  const intro = 'Use [ab-ship-pipeline](/skills/ab-ship-pipeline/) for this.';
  const section = 'Then `ab-review-swarm`, then `ab-ship-pipeline` again, and `ab-made-up`; see `skills/ab-orchestrate/references/`.';
  assert.deepEqual(skillsNamed([intro, section], NAMES), ['ab-ship-pipeline', 'ab-review-swarm', 'ab-orchestrate']);
  assert.deepEqual(skillsNamed(['no skills here'], NAMES), []);
});

test('every skill link in the guide intros points at an existing skill', () => {
  const dir = join(ROOT, 'site/src/content/guides');
  const files = readdirSync(dir).filter((f) => f.endsWith('.md'));
  assert.ok(files.length > 0, 'no guide intros');
  for (const file of files) {
    for (const [, name] of readFileSync(join(dir, file), 'utf8').matchAll(/\]\(\/skills\/([^/)]+)\/\)/g)) {
      assert.ok(existsSync(join(ROOT, 'skills', name, 'SKILL.md')), `${file} links /skills/${name}/, which has no skills/${name}/SKILL.md`);
    }
  }
});
