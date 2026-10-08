// Tests for site/src/components/docs/section.mjs: the Getting started page drops the README's
// install, naming and support tables from its rendered section (the install tabs render those
// facts from data) and puts a pointer where each table was.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { dropTables, INSTALL_TABLES } from '../src/components/docs/section.mjs';

// The shape remark-gfm gives a Markdown table, with an alignment attribute on one header cell.
const table = (cells, rows = 1) =>
  `<table>\n<thead>\n<tr>\n${cells.map((c, i) => `<th${i ? '' : ' align="left"'}>${c}</th>`).join('\n')}\n</tr>\n</thead>\n<tbody>\n` +
  `${Array.from({ length: rows }, () => `<tr>\n${cells.map(() => '<td><code>x</code></td>').join('\n')}\n</tr>`).join('\n')}\n</tbody>\n</table>`;

const page = [
  '<h2 id="a">A</h2>',
  '<p>Or install one tool at a time with the route in this table:</p>',
  table(['Tool', 'Command', 'Install route', 'Support note'], 3),
  '<p>The shared copy is one copy.</p>',
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
  assert.ok(out.indexOf(INSTALL_TABLES[0].pointer) < out.indexOf('The shared copy'));
  assert.ok(out.indexOf(INSTALL_TABLES[2].pointer) > out.indexOf('What each tool supports'));
  for (const text of ['<h2 id="a">A</h2>', 'The shared copy is one copy.', 'What each tool supports:']) {
    assert.ok(out.includes(text), `lost: ${text}`);
  }
});

test('a table to drop that the section no longer has stops the build, naming its header', () => {
  const withoutNaming = page.replace(table(['Tool', 'How to name a skill'], 2), '');
  assert.throws(() => dropTables(withoutNaming, INSTALL_TABLES), /Tool \| How to name a skill/);
});
