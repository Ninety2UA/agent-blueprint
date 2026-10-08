// Tests for site/src/lib/docs-sidebar.mjs: the Docs sidebar holds every Docs page of the README map
// exactly once, marks the current page, and previous and next walk the sidebar order end to end.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DOCS_SIDEBAR, docsNeighbors, docsOrder, docsSidebar } from '../src/lib/docs-sidebar.mjs';
import { DOCS_PAGES, pageUrl } from '../src/lib/readme-map.mjs';

const order = docsOrder();

test('every Docs page of the README map appears in the sidebar exactly once', () => {
  const slugs = DOCS_SIDEBAR.flatMap((group) => group.items.map((item) => item.slug));
  assert.equal(new Set(slugs).size, slugs.length, `a slug repeats: ${slugs.join(', ')}`);
  assert.deepEqual([...slugs].sort(), DOCS_PAGES.map((page) => page.slug).sort());
});

test('every sidebar group has a title and at least one page, and every page a label', () => {
  for (const group of DOCS_SIDEBAR) {
    assert.ok(group.title, 'group without a title');
    assert.ok(group.items.length > 0, `group "${group.title}" is empty`);
    for (const item of group.items) assert.ok(item.label, `page "${item.slug}" has no label`);
  }
});

test('docsOrder lists the pages in sidebar order with their site URLs', () => {
  assert.deepEqual(
    order.map((page) => page.slug),
    DOCS_SIDEBAR.flatMap((group) => group.items.map((item) => item.slug)),
  );
  for (const page of order) assert.equal(page.href, pageUrl('docs', page.slug));
});

test('docsSidebar marks only the current page', () => {
  for (const page of order) {
    const groups = docsSidebar(page.slug);
    assert.deepEqual(groups.map((g) => g.title), DOCS_SIDEBAR.map((g) => g.title));
    const current = groups.flatMap((g) => g.items).filter((item) => item.current);
    assert.deepEqual(current, [{ label: page.label, href: page.href, current: true }]);
  }
});

test('previous and next walk the sidebar order from the first page to the last', () => {
  const first = order[0];
  const last = order.at(-1);
  assert.equal(docsNeighbors(first.slug).prev, undefined);
  assert.equal(docsNeighbors(last.slug).next, undefined);

  // forward from the first page by "next" reaches every page once, in order
  const forward = [first.slug];
  for (let n = docsNeighbors(first.slug).next; n; ) {
    const page = order.find((p) => p.href === n.href);
    assert.ok(page, `next link ${n.href} is not a docs page`);
    assert.equal(n.label, page.label);
    forward.push(page.slug);
    n = docsNeighbors(page.slug).next;
  }
  assert.deepEqual(forward, order.map((p) => p.slug));

  // and back from the last page by "previous"
  const back = [last.slug];
  for (let p = docsNeighbors(last.slug).prev; p; ) {
    const page = order.find((q) => q.href === p.href);
    back.push(page.slug);
    p = docsNeighbors(page.slug).prev;
  }
  assert.deepEqual(back, order.map((p) => p.slug).reverse());
});

test('docsNeighbors names an unknown page in its error', () => {
  assert.throws(() => docsNeighbors('no-such-page'), /no-such-page/);
});
