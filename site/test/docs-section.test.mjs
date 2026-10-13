// Tests for site/src/components/docs/section.mjs: the Getting started page drops the README's
// install, naming and support tables from its rendered section (the install tabs render those
// facts from data) and puts a pointer where each table was; it leaves out the diagram the install
// loop stands in for, and puts the setup loop under its heading.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { dropImages, dropTables, insertAfterHeading, INSTALL_IMAGES, INSTALL_TABLES, markShortKeys, SHORT_KEY, wrapTables } from '../src/components/docs/section.mjs';

// The shape remark-gfm gives a Markdown table, with an alignment attribute on one header cell.
const table = (cells, rows = 1) =>
  `<table>\n<thead>\n<tr>\n${cells.map((c, i) => `<th${i ? '' : ' align="left"'}>${c}</th>`).join('\n')}\n</tr>\n</thead>\n<tbody>\n` +
  `${Array.from({ length: rows }, () => `<tr>\n${cells.map(() => '<td><code>x</code></td>').join('\n')}\n</tr>`).join('\n')}\n</tbody>\n</table>`;

const page = [
  '<h2 id="a">A</h2>',
  '<p>Or install one tool at a time with the route in this table:</p>',
  table(['Tool', 'Command', 'Install route', 'Support note'], 3),
  '<p>Give each tool one route.</p>',
  table(['Tool', 'How to name a skill'], 2),
  '<p>What each tool supports:</p>',
  table(['Tool', 'Hooks', 'Helpers', 'Manual-only skills'], 2),
  table(['Command', 'Checks']),
].join('\n');

test('the three install tables are replaced by their pointers and nothing else changes', () => {
  const out = dropTables(page, INSTALL_TABLES);
  assert.equal((out.match(/<table>/g) ?? []).length, 1, 'only the unrelated table is left');
  assert.match(out, /<th align="left">Command<\/th>\n<th>Checks<\/th>/);
  for (const { pointer } of INSTALL_TABLES) assert.ok(out.includes(pointer), `pointer missing: ${pointer}`);
  // the pointers sit where the tables were, between the same paragraphs
  assert.ok(out.indexOf(INSTALL_TABLES[0].pointer) > out.indexOf('route in this table'));
  assert.ok(out.indexOf(INSTALL_TABLES[0].pointer) < out.indexOf('Give each tool'));
  assert.ok(out.indexOf(INSTALL_TABLES[2].pointer) > out.indexOf('What each tool supports'));
  for (const text of ['<h2 id="a">A</h2>', 'Give each tool one route.', 'What each tool supports:']) {
    assert.ok(out.includes(text), `lost: ${text}`);
  }
});

test('a table to drop that the section no longer has stops the build, naming its header', () => {
  const withoutNaming = page.replace(table(['Tool', 'How to name a skill'], 2), '');
  assert.throws(() => dropTables(withoutNaming, INSTALL_TABLES), /Tool \| How to name a skill/);
});

test('the image a loop stands in for is left out, and a missing one stops the build', () => {
  const [name] = INSTALL_IMAGES;
  const img = (file) => `<p><img src="/_astro/${file}.a1B2c3.webp" alt="A diagram" loading="lazy" width="1760" height="990"></p>`;
  const html = `<p>Before.</p>\n${img(name)}\n<p>After.</p>\n${img('dev-loop')}`;
  const out = dropImages(html, INSTALL_IMAGES);
  assert.ok(!out.includes(`/${name}.`), 'the image is still there');
  assert.ok(out.includes('<p>Before.</p>') && out.includes('<p>After.</p>') && out.includes('/dev-loop.'), 'something else went too');
  // a name that is only part of another file's name is not a match
  assert.throws(() => dropImages(img(`${name}-old`), INSTALL_IMAGES), new RegExp(name));
});

test('a figure goes right under its heading, ahead of the section text, and a missing heading stops the build', () => {
  const html = '<h2 id="a">A</h2>\n<p>One.</p>\n<h2 id="set-up-your-project">Set up your project</h2>\n<p>Two.</p>';
  const out = insertAfterHeading(html, 'set-up-your-project', '<figure>F</figure>');
  assert.ok(out.includes('Set up your project</h2>\n<figure>F</figure>\n<p>Two.</p>'));
  assert.equal(out.indexOf('<figure>'), out.lastIndexOf('<figure>'), 'placed once');
  assert.throws(() => insertAfterHeading(html, 'nope', '<figure>F</figure>'), /#nope/);
});

test('a table whose rows start with short names is marked so they stay on one line; others are left alone', () => {
  const rows = (keys) => `<table>\n<thead>\n<tr>\n<th>Tool</th>\n<th>How to update</th>\n</tr>\n</thead>\n<tbody>\n${keys.map((k) => `<tr>\n<td>${k}</td>\n<td><code>x y</code></td>\n</tr>`).join('\n')}\n</tbody>\n</table>`;
  const tools = rows(['Claude Code', 'Pi, Hermes, Amp', '<code>docs/decisions/</code>']);
  assert.match(markShortKeys(tools), /^<table class="key-short">/);
  const long = rows(['Claude Code', 'x'.repeat(SHORT_KEY + 1)]);
  assert.equal(markShortKeys(long), long);
  assert.equal(markShortKeys(`<p>a</p>\n${tools}\n${long}`).match(/key-short/g).length, 1);
  // four columns compete for the width, so their keys are left free to wrap
  const wide = tools.replace('<th>How to update</th>', '<th>A</th>\n<th>B</th>\n<th>C</th>');
  assert.equal(markShortKeys(wide), wide);
});

test('each table sits in its own sideways-scrolling container, so a wide one never widens the page', () => {
  const html = `<p>a</p>\n${table(['Tool', 'How to update'], 2)}\n<p>b</p>\n${table(['A', 'B', 'C', 'D'])}`;
  const out = wrapTables(html);
  assert.equal((out.match(/<div class="table-scroll"><table>/g) ?? []).length, 2);
  assert.equal((out.match(/<\/table><\/div>/g) ?? []).length, 2);
  assert.equal(out.replace(/<div class="table-scroll">|<\/div>/g, ''), html, 'nothing else changes');
});
