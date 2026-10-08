// Tests for site/src/lib/docs-sidebar.mjs: the Docs sidebar holds every Docs page of the README map
// exactly once, marks the current page, and the section root redirects to the first page. Previous
// and next are walked in section-order.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { DOCS_SIDEBAR, docsOrder, docsSidebar } from '../src/lib/docs-sidebar.mjs';
import { DOCS_PAGES, pageUrl } from '../src/lib/readme-map.mjs';

const SITE = fileURLToPath(new URL('../', import.meta.url));
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

test('the /docs/ section root redirects to the first Docs page', () => {
  const vercel = JSON.parse(readFileSync(`${SITE}vercel.json`, 'utf8'));
  const redirect = vercel.redirects.find((r) => r.source.startsWith('/docs'));
  assert.ok(redirect, 'vercel.json has no /docs redirect');
  assert.equal(redirect.destination, order[0].href);
});
