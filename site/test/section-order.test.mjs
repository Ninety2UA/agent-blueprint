// Tests for site/src/lib/section-order.mjs: one section's reading order, sidebar and previous and next
// from its sidebar groups, with every link from pageUrl. The Docs, Guides and Tutorials modules are
// this factory over their own data; their data tests stay in their own test files, and previous and
// next are walked here for all three.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { docsNeighbors, docsOrder } from '../src/lib/docs-sidebar.mjs';
import { guidesNeighbors, guidesOrder } from '../src/lib/guides-order.mjs';
import { pageUrl } from '../src/lib/readme-map.mjs';
import { sectionOrder } from '../src/lib/section-order.mjs';
import { tutorialsNeighbors, tutorialsOrder } from '../src/lib/tutorials-order.mjs';

const GROUPS = [
  { title: 'First', items: [{ slug: 'a', label: 'A' }, { slug: 'b', label: 'B' }] },
  { title: 'Second', items: [{ slug: 'c', label: 'C' }] },
];
const section = sectionOrder({ kind: 'notes', groups: GROUPS });

test('order lists every page of every group in sidebar order, with its pageUrl and group title', () => {
  assert.deepEqual(section.order(), [
    { slug: 'a', label: 'A', href: pageUrl('notes', 'a'), group: 'First' },
    { slug: 'b', label: 'B', href: pageUrl('notes', 'b'), group: 'First' },
    { slug: 'c', label: 'C', href: pageUrl('notes', 'c'), group: 'Second' },
  ]);
});

test('sidebar keeps the groups and marks only the given page current', () => {
  assert.deepEqual(section.sidebar('c'), [
    { title: 'First', items: [{ label: 'A', href: '/notes/a/' }, { label: 'B', href: '/notes/b/' }] },
    { title: 'Second', items: [{ label: 'C', href: '/notes/c/', current: true }] },
  ]);
});

test('neighbors links the pages on either side, across groups, and nothing past either end', () => {
  assert.deepEqual(section.neighbors('a'), { prev: undefined, next: { label: 'B', href: '/notes/b/' } });
  assert.deepEqual(section.neighbors('b'), { prev: { label: 'A', href: '/notes/a/' }, next: { label: 'C', href: '/notes/c/' } });
  assert.deepEqual(section.neighbors('c'), { prev: { label: 'B', href: '/notes/b/' }, next: undefined });
});

test('neighbors names an unknown page in its error', () => {
  assert.throws(() => section.neighbors('no-such-page'), /no-such-page/);
});

// The three sections: previous and next walk each one from its first page to its last and back.
const SECTIONS = [
  ['Docs', docsOrder, docsNeighbors],
  ['Guides', guidesOrder, guidesNeighbors],
  ['Tutorials', tutorialsOrder, tutorialsNeighbors],
];

for (const [name, orderOf, neighbors] of SECTIONS) {
  test(`${name}: previous and next walk the section from the first page to the last and back`, () => {
    const order = orderOf();
    const walk = (start, dir) => {
      const seen = [start];
      for (let n = neighbors(start)[dir]; n; ) {
        const page = order.find((p) => p.href === n.href);
        assert.ok(page, `${dir} link ${n.href} is not a ${name} page`);
        assert.equal(n.label, page.label);
        seen.push(page.slug);
        n = neighbors(page.slug)[dir];
      }
      return seen;
    };
    assert.deepEqual(walk(order[0].slug, 'next'), order.map((p) => p.slug));
    assert.deepEqual(walk(order.at(-1).slug, 'prev'), order.map((p) => p.slug).reverse());
    assert.throws(() => neighbors('no-such-page'), /no-such-page/);
  });
}
