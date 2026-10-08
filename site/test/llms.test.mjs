// Tests for site/src/lib/llms.mjs: llms.txt lists the site's sections and every skill page with its
// one-line summary, all generated from the repository data.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { NAV } from '../src/components/nav.ts';
import { llmsTxt } from '../src/lib/llms.mjs';
import { getSiteData } from '../src/lib/site.mjs';

const site = getSiteData();
const text = llmsTxt(site, NAV);
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
  for (const { label, href } of NAV) {
    const hit = linkLines(`${site.siteUrl}${href}`);
    assert.equal(hit.length, 1, label);
    assert.ok(hit[0].startsWith(`- [${label}](`), hit[0]);
  }
});

test('skills are grouped under their README phase, in phase order', () => {
  const headings = lines.filter((l) => l.startsWith('## Skills: '));
  assert.deepEqual(headings, site.phases.map((p) => `## Skills: ${p.title}`));
});

test('every link line is a full URL on the site', () => {
  const links = lines.filter((l) => l.startsWith('- ['));
  assert.equal(links.length, site.skills.length + NAV.length + 1);
  for (const l of links) assert.match(l, new RegExp(`\\]\\(${site.siteUrl.replace(/\./g, '\\.')}/`), l);
});
