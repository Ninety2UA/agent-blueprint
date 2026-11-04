// Tests for site/src/lib/llms.mjs: llms.txt lists the site's sections and every skill page with its
// one-line summary, all generated from the repository data. The header, footer and llms.txt read the
// NAV list the release switch allows (KTD11); both modes are reached in process through enabledNav.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { NAV, navItems, productGroup } from '../src/components/nav.ts';
import { enabledNav, HOSTED_PATH } from '../src/lib/hosted-release.mjs';
import { docsOrder } from '../src/lib/docs-sidebar.mjs';
import { guidesOrder } from '../src/lib/guides-order.mjs';
import { tutorialsOrder } from '../src/lib/tutorials-order.mjs';
import { llmsTxt } from '../src/lib/llms.mjs';
import { getSiteData } from '../src/lib/site.mjs';

const site = getSiteData();
// The list this build carries, as llms.txt.ts passes it.
const nav = enabledNav(NAV);
const text = llmsTxt(site, nav);
const lines = text.split('\n');
const linkLines = (url) => lines.filter((l) => l.startsWith(`- [`) && l.includes(`](${url})`));

test('it opens with the site name and a summary carrying the current counts', () => {
  assert.equal(lines[0], '# Agent Blueprint');
  const quote = lines.find((l) => l.startsWith('> '));
  assert.ok(quote, 'no summary line');
  assert.ok(quote.includes(`${site.counts.skills} skills`), quote);
});

test('one line per skill page, with the skill summary', () => {
  for (const s of site.skills) {
    const hit = linkLines(`${site.siteUrl}/skills/${s.name}/`);
    assert.equal(hit.length, 1, s.name);
    assert.equal(hit[0], `- [${s.name}](${site.siteUrl}/skills/${s.name}/): ${s.summary}`);
  }
});

test('one line per section index: Home and every header section', () => {
  assert.equal(linkLines(`${site.siteUrl}/`).length, 1, 'Home');
  for (const { label, href } of nav) {
    const hit = lines.filter((l) => l.startsWith(`- [${label}](${site.siteUrl}${href})`));
    assert.equal(hit.length, 1, label);
  }
});

const SECTIONS = [['Docs', docsOrder()], ['Tutorials', tutorialsOrder()], ['Guides', guidesOrder()]];

test('every docs, tutorial and guide page is listed under its section, in reading order', () => {
  for (const [heading, pages] of SECTIONS) {
    const start = lines.indexOf(`## ${heading}`);
    assert.ok(start > 0, `no "## ${heading}" list`);
    const end = lines.indexOf('', start + 2);
    const block = lines.slice(start + 2, end === -1 ? undefined : end);
    assert.deepEqual(block, pages.map((p) => `- [${p.label}](${site.siteUrl}${p.href})`), heading);
  }
});

test('skills are grouped under their README phase, in phase order', () => {
  const headings = lines.filter((l) => l.startsWith('## Skills: '));
  assert.deepEqual(headings, site.phases.map((p) => `## Skills: ${p.title}`));
});

test('every link line is a full URL on the site', () => {
  const links = lines.filter((l) => l.startsWith('- ['));
  const pages = SECTIONS.reduce((n, [, list]) => n + list.length, 0);
  assert.equal(links.length, site.skills.length + nav.length + 1 + pages);
  for (const l of links) assert.match(l, new RegExp(`\\]\\(${site.siteUrl.replace(/\./g, '\\.')}/`), l);
});

// ── The seventh item in both switch modes (R13, KTD11) ────────────────────

const labels = (list) => list.map((n) => n.label);
const pageCount = SECTIONS.reduce((n, [, list]) => n + list.length, 0);
const sectionLines = (body) => {
  const start = body.indexOf('## Site sections');
  return body.slice(start, body.indexOf('\n## ', start + 1)).split('\n').filter((l) => l.startsWith('- ['));
};

test('NAV ends with Hosted at /hosted/, and nav.ts reads no environment', async () => {
  assert.equal(NAV.length, 7);
  assert.deepEqual(NAV.at(-1), { label: 'Hosted', href: HOSTED_PATH, section: HOSTED_PATH });
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../src/components/nav.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /process\.env|import\.meta\.env|from\s+['"][^'"]*hosted-release/);
});

test('switch on: seven header items with Hosted last, the footer group ends with Hosted, one llms.txt line each', () => {
  const on = enabledNav(NAV, true);
  assert.deepEqual(labels(on), ['Skills', 'Docs', 'Tutorials', 'Workflow', 'Guides', 'Changelog', 'Hosted']);
  assert.equal(labels(enabledNav(navItems('/'), true)).at(-1), 'Hosted');
  assert.deepEqual(labels(productGroup(on)), ['Skills', 'Workflow', 'Tutorials', 'Guides', 'Changelog', 'Hosted']);

  const body = llmsTxt(site, on);
  const hosted = sectionLines(body).filter((l) => l.startsWith(`- [Hosted](${site.siteUrl}${HOSTED_PATH})`));
  assert.equal(hosted.length, 1);
  assert.match(hosted[0], /\): \S/, 'the Hosted line carries a note');
  for (const { label, href } of on) {
    assert.equal(body.split('\n').filter((l) => l.startsWith(`- [${label}](${site.siteUrl}${href})`)).length, 1, label);
  }
  const links = body.split('\n').filter((l) => l.startsWith('- ['));
  assert.equal(links.length, site.skills.length + on.length + 1 + pageCount);
});

test('switch off: six items, no Hosted in the header, footer or llms.txt, and no missing footer entry', () => {
  const off = enabledNav(NAV, false);
  assert.deepEqual(labels(off), ['Skills', 'Docs', 'Tutorials', 'Workflow', 'Guides', 'Changelog']);
  assert.ok(!labels(enabledNav(navItems('/'), false)).includes('Hosted'));
  const group = productGroup(off);
  assert.deepEqual(labels(group), ['Skills', 'Workflow', 'Tutorials', 'Guides', 'Changelog']);
  for (const item of group) assert.ok(item && item.href, 'an undefined footer entry');

  const body = llmsTxt(site, off);
  assert.ok(!body.includes(HOSTED_PATH), 'llms.txt lists /hosted/');
  assert.ok(!body.includes('[Hosted]'), 'llms.txt has a Hosted line');
  const links = body.split('\n').filter((l) => l.startsWith('- ['));
  assert.equal(links.length, site.skills.length + off.length + 1 + pageCount);
});

test('navItems marks Hosted as the current page on /hosted/', () => {
  const items = navItems('/hosted/');
  assert.equal(items.find((i) => i.label === 'Hosted')?.current, 'page');
  assert.ok(items.filter((i) => i.label !== 'Hosted').every((i) => i.current === undefined));
  assert.equal(navItems('/hosted').find((i) => i.label === 'Hosted')?.current, 'page');
});
