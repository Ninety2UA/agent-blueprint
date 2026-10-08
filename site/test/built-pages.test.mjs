// Checks on the built site (site/dist) for R1, R6, R7 and R8: every page has its own title and
// description, the sitemap lists every page, the Changelog and Kit pages state what the repository
// holds, and 404.html and llms.txt exist. CI runs these after `npm run build`; without a build the
// tests are skipped and say so.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { humanSize } from '../src/components/kit/files.mjs';
import { findRepoRoot, getSiteData } from '../src/lib/site.mjs';

const root = findRepoRoot();
const dist = join(root, 'site', 'dist');
const skip = !existsSync(join(dist, 'index.html')) && 'site/dist is not built (run npm run build in site/)';
const site = getSiteData();

const decode = (s) =>
  s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

// Every page Astro wrote, by its URL path; redirect stubs (meta refresh) are not pages.
function pages() {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) {
        if (!['_astro', 'pagefind'].includes(name)) walk(path);
      } else if (name.endsWith('.html')) {
        const html = readFileSync(path, 'utf8');
        if (/<meta http-equiv="refresh"/i.test(html)) continue;
        const rel = relative(dist, path).split(sep).join('/');
        const url = rel === 'index.html' ? '/' : rel.endsWith('/index.html') ? `/${rel.slice(0, -'index.html'.length)}` : `/${rel}`;
        const title = decode(html.match(/<title>([^<]*)<\/title>/)?.[1] ?? '');
        const description = decode(html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? '');
        out.push({ url, title, description, html });
      }
    }
  };
  walk(dist);
  return out;
}

const read = (path) => readFileSync(join(dist, path), 'utf8');

test('two pages never share a title or a description', { skip }, () => {
  const all = pages();
  for (const key of ['title', 'description']) {
    const seen = new Map();
    for (const p of all) seen.set(p[key], [...(seen.get(p[key]) ?? []), p.url]);
    const dupes = [...seen].filter(([, urls]) => urls.length > 1).map(([v, urls]) => `${v}: ${urls.join(', ')}`);
    assert.deepEqual(dupes, [], `pages sharing a ${key}`);
  }
});

test('titles name the page, then " · Agent Blueprint", with no dashes', { skip }, () => {
  for (const p of pages()) {
    assert.match(p.title, /^(.+ · )?Agent Blueprint\b/, p.url);
    assert.doesNotMatch(p.title, / [-–—] /, p.url);
  }
});

test('the sitemap lists every page except the 404, with the canonical URL', { skip }, () => {
  assert.ok(existsSync(join(dist, 'sitemap-index.xml')), 'no sitemap-index.xml');
  const index = read('sitemap-index.xml');
  const listed = new Set();
  for (const [, loc] of index.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    const file = new URL(loc).pathname.slice(1);
    for (const [, url] of read(file).matchAll(/<loc>([^<]+)<\/loc>/g)) listed.add(url);
  }
  const expected = pages().filter((p) => p.url !== '/404.html').map((p) => `${site.siteUrl}${p.url}`);
  assert.deepEqual(expected.filter((u) => !listed.has(u)), [], 'pages missing from the sitemap');
  for (const p of pages().filter((x) => x.url !== '/404.html')) {
    const canonical = p.html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
    assert.equal(canonical, `${site.siteUrl}${p.url}`, p.url);
  }
});

test('the Changelog lists every README release, newest first, with its date', { skip }, () => {
  const html = read('changelog/index.html');
  const listed = [...html.matchAll(/data-release="([^"]+)"[^]*?<time[^>]* datetime="([^"]+)"/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(listed, site.releases.map((r) => [r.version, r.date]));
  assert.doesNotMatch(html, /The body for the GitHub release/);
});

test('every file the Kit page lists shows the size of the file it links to', { skip }, () => {
  const html = read('kit/index.html');
  const rows = [...html.matchAll(/<tr><th scope="row"><a href="([^"]+)" download>[^]*?<\/tr>/g)];
  assert.ok(rows.length > 0, 'no file rows on the Kit page');
  const sources = { '/media/readme-hero.gif': join(root, 'docs', 'images', 'hero.gif') };
  for (const [row, href] of rows) {
    const cells = [...row.matchAll(/<td>([^<]*)<\/td>/g)].map((m) => m[1]);
    const file = sources[href] ?? join(root, 'site', 'public', href);
    assert.equal(cells.at(-1), humanSize(statSync(file).size), href);
    assert.ok(existsSync(join(dist, href)), `${href} is not in the build`);
  }
  for (const name of readdirSync(join(root, 'site', 'public', 'media'))) {
    assert.ok(rows.some(([, href]) => href === `/media/${name}`), `the Kit page does not list /media/${name}`);
  }
});

test('404.html and llms.txt are built; llms.txt names every skill page', { skip }, () => {
  assert.ok(existsSync(join(dist, '404.html')), 'no 404.html');
  const llms = read('llms.txt');
  for (const s of site.skills) assert.ok(llms.includes(`(${site.siteUrl}/skills/${s.name}/)`), s.name);
});
