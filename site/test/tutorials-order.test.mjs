// Tests for site/src/lib/tutorials-order.mjs: the Tutorials section holds the three tutorials in
// reading order, each with a content file, and the section root and the header's Tutorials item open
// the first one. Previous and next are walked in section-order.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { TUTORIALS, tutorialsOrder, tutorialsSidebar } from '../src/lib/tutorials-order.mjs';

const SITE = fileURLToPath(new URL('../', import.meta.url));
const order = tutorialsOrder();

test('the tutorials run from the new project to the existing codebase to the unattended run', () => {
  assert.deepEqual(
    TUTORIALS.map((t) => t.slug),
    ['first-feature-new-project', 'feature-existing-codebase', 'unattended-run'],
  );
  for (const { slug, label } of TUTORIALS) assert.ok(label, `tutorial "${slug}" has no label`);
});

test('every tutorial in the order has a content file, and every content file is in the order', () => {
  const files = readdirSync(`${SITE}src/content/tutorials`).filter((f) => f.endsWith('.md'));
  assert.deepEqual(files.map((f) => f.slice(0, -3)).sort(), TUTORIALS.map((t) => t.slug).sort());
  for (const { slug } of TUTORIALS) assert.ok(existsSync(`${SITE}src/content/tutorials/${slug}.md`), slug);
});

test('tutorialsOrder gives each tutorial its URL under /tutorials/', () => {
  assert.deepEqual(order.map((t) => t.slug), TUTORIALS.map((t) => t.slug));
  for (const t of order) assert.equal(t.href, `/tutorials/${t.slug}/`);
});

test('the /tutorials/ redirect and the header Tutorials item open the first tutorial', () => {
  const vercel = JSON.parse(readFileSync(`${SITE}vercel.json`, 'utf8'));
  const redirect = vercel.redirects.find((r) => r.source.startsWith('/tutorials'));
  assert.ok(redirect, 'vercel.json has no /tutorials redirect');
  assert.equal(redirect.destination, order[0].href);
  const nav = readFileSync(`${SITE}src/components/nav.ts`, 'utf8');
  assert.match(nav, new RegExp(`label: 'Tutorials', href: '${order[0].href}'`));
});

test('tutorialsSidebar is one group that marks only the current tutorial', () => {
  for (const t of order) {
    const groups = tutorialsSidebar(t.slug);
    assert.equal(groups.length, 1);
    assert.deepEqual(groups[0].items.map((i) => i.href), order.map((o) => o.href));
    assert.deepEqual(groups[0].items.filter((i) => i.current), [{ label: t.label, href: t.href, current: true }]);
  }
});
