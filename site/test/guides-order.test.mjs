// Tests for site/src/lib/guides-order.mjs: the Guides sidebar holds every Guides page of the README
// map exactly once, each with a hand-written intro, and the section root redirects to the first
// guide. Previous and next are walked in section-order.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { GUIDES, guidesOrder, guidesSidebar } from '../src/lib/guides-order.mjs';
import { GUIDE_PAGES, pageUrl } from '../src/lib/readme-map.mjs';

const SITE = fileURLToPath(new URL('../', import.meta.url));
const order = guidesOrder();

test('every Guides page of the README map appears in the guide order exactly once', () => {
  const slugs = GUIDES.map((g) => g.slug);
  assert.equal(new Set(slugs).size, slugs.length, `a slug repeats: ${slugs.join(', ')}`);
  assert.deepEqual([...slugs].sort(), GUIDE_PAGES.map((page) => page.slug).sort());
});

test('every guide has a label and a hand-written intro with a description', () => {
  for (const { slug, label } of GUIDES) {
    assert.ok(label, `guide "${slug}" has no label`);
    const file = `${SITE}src/content/guides/${slug}.md`;
    assert.ok(existsSync(file), `no intro at src/content/guides/${slug}.md`);
    assert.match(readFileSync(file, 'utf8'), /^---\ndescription: \S.*\n---\n/, `${slug}.md has no description in its frontmatter`);
  }
});

test('guidesOrder lists the guides in order with their site URLs', () => {
  assert.deepEqual(order.map((g) => g.slug), GUIDES.map((g) => g.slug));
  for (const g of order) assert.equal(g.href, pageUrl('guides', g.slug));
});

test('the /guides/ section root redirects to the first guide', () => {
  const vercel = JSON.parse(readFileSync(`${SITE}vercel.json`, 'utf8'));
  const redirect = vercel.redirects.find((r) => r.source.startsWith('/guides'));
  assert.ok(redirect, 'vercel.json has no /guides redirect');
  assert.equal(redirect.destination, order[0].href);
});

test('guidesSidebar is one group that marks only the current guide', () => {
  for (const g of order) {
    const groups = guidesSidebar(g.slug);
    assert.equal(groups.length, 1);
    assert.deepEqual(groups[0].items.map((i) => i.href), order.map((o) => o.href));
    const current = groups[0].items.filter((item) => item.current);
    assert.deepEqual(current, [{ label: g.label, href: g.href, current: true }]);
  }
});
