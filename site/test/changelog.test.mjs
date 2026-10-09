// Tests for site/src/components/changelog/changelog.mjs: the Changelog lists every release of the
// README release history, newest first, with its date. Releases down to the oldest one with a
// release-notes file are revision blocks; the older ones are rows of one table.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { changelog, headline, releaseId, releaseType, splitNotes } from '../src/components/changelog/changelog.mjs';
import { getSiteData } from '../src/lib/site.mjs';

const { releases } = getSiteData();

test('every README release appears once, newest first, with its README date', () => {
  const { blocks, older } = changelog(releases);
  assert.deepEqual(
    [...blocks, ...older].map((r) => [r.version, r.date]),
    releases.map((r) => [r.version, r.date]),
  );
});

test('the releases with notes are blocks and the rows below them have none', () => {
  const { blocks, older } = changelog(releases);
  assert.ok(blocks.length > 0, 'no revision blocks');
  assert.ok(blocks.at(-1).notes, 'the last block is the oldest release with notes');
  assert.ok(older.every((r) => !r.notes), 'a row of the older table has notes');
});

test('a release without notes that is newer than one with notes stays in order, as a block', () => {
  const rows = [
    { version: '4.1.0', date: '2026-11-01', summary: 'A. B.', notes: null },
    { version: '4.0.1', date: '2026-10-07', summary: 'C.', notes: 'x' },
    { version: '3.8.0', date: '2026-09-28', summary: 'D.', notes: null },
  ];
  const { blocks, older } = changelog(rows);
  assert.deepEqual(blocks.map((r) => r.version), ['4.1.0', '4.0.1']);
  assert.deepEqual(older.map((r) => r.version), ['3.8.0']);
});

test('each block knows the release it follows, for the diff link', () => {
  const { blocks } = changelog(releases);
  for (const b of blocks) {
    const i = releases.findIndex((r) => r.version === b.version);
    assert.equal(b.previous, releases[i + 1]?.version, b.version);
  }
});

test('headline: the first sentence without its full stop, cut at a colon', () => {
  assert.equal(headline('Cursor CLI lists each skill once. On a machine with both, it changes.'), 'Cursor CLI lists each skill once');
  assert.equal(headline('Leftover names from before v3.2 removed. The site lists every skill.'), 'Leftover names from before v3.2 removed');
  assert.equal(
    headline('`claude-code-blueprint` becomes Agent Blueprint: one set of skills, each named `ab-`. Agents became prompts.'),
    '`claude-code-blueprint` becomes Agent Blueprint',
  );
  assert.equal(headline('One sentence only.'), 'One sentence only');
});

test('releaseType reads the version: x.0.0 is major, x.y.0 minor, anything else a patch', () => {
  assert.equal(releaseType('4.0.0'), 'Major');
  assert.equal(releaseType('3.8.0'), 'Minor');
  assert.equal(releaseType('4.0.1'), 'Patch');
  assert.equal(releaseType('2.3'), 'Minor');
});

test('releaseId makes an anchor from the version', () => {
  assert.equal(releaseId('4.0.1'), 'v4-0-1');
  assert.equal(releaseId('2.3'), 'v2-3');
});

test('splitNotes: the first paragraph is the lede, the list before any heading is "What changed", each h2 a group', () => {
  const html = [
    '<p>A patch to v4.0.0 for the installer.</p>',
    '<ul>\n<li><strong>One</strong>: a change.</li>\n</ul>',
    '<h2 id="upgrading">Upgrading</h2>',
    '<p>Run <code>bash install.sh</code> again.</p>',
    '<h2 id="known-limits">Known limits</h2>',
    '<ul>\n<li>A limit.</li>\n</ul>',
    '<p>Pull requests #16 and #17.</p>',
  ].join('\n');
  const { lede, groups } = splitNotes(html);
  assert.equal(lede, '<p>A patch to v4.0.0 for the installer.</p>');
  assert.deepEqual(groups.map((g) => g.label), ['What changed', 'Upgrading', 'Known limits']);
  assert.equal(groups[0].html, '<ul>\n<li><strong>One</strong>: a change.</li>\n</ul>');
  assert.equal(groups[1].html, '<p>Run <code>bash install.sh</code> again.</p>');
  assert.equal(groups[2].html, '<ul>\n<li>A limit.</li>\n</ul>\n<p>Pull requests #16 and #17.</p>');
});

test('splitNotes: notes that open with a list have no lede', () => {
  const { lede, groups } = splitNotes('<ul>\n<li>A change.</li>\n</ul>');
  assert.equal(lede, '');
  assert.deepEqual(groups.map((g) => g.label), ['What changed']);
});

test('the maintainer note at the top of a release-notes file never reaches the page', () => {
  for (const r of releases.filter((x) => x.notes)) {
    assert.doesNotMatch(r.notes, /The body for the GitHub release/, r.version);
  }
});
