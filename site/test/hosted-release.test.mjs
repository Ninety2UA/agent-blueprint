// The Hosted page's release switch (KTD1): when /hosted/ is built, the route integration that injects
// it and checks its data on every build, the interim redirect while the switch is off, and what the
// built site links to in either mode. The built-output tests read site/dist after `npm run build`;
// without a build they are skipped and say so. CI builds the site twice, once as is and once with
// AB_HOSTED_PREVIEW=1 and VERCEL_ENV=preview, and runs these tests after each build.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';

import { enabledNav, HOSTED_PATH, HOSTED_RELEASED, hostedEnabled } from '../src/lib/hosted-release.mjs';
import hostedRoute from '../src/hosted/route.mjs';
import { findRepoRoot, SITE_URL } from '../src/lib/site.mjs';

const root = findRepoRoot();
const dist = join(root, 'site', 'dist');

// ── The enabling function, row by row of the KTD1 table ────────────────────

test('the switch off with no override builds no page, in any environment', () => {
  for (const env of [{}, { VERCEL_ENV: 'preview' }, { VERCEL: '1', VERCEL_ENV: 'production' }, { CI: 'true' }]) {
    assert.equal(hostedEnabled(false, env), false, JSON.stringify(env));
  }
});

test('the override turns the page on in a Vercel preview build', () => {
  assert.equal(hostedEnabled(false, { AB_HOSTED_PREVIEW: '1', VERCEL: '1', VERCEL_ENV: 'preview' }), true);
  // The CI site job's preview-on step: GitHub sets CI=true, the step sets VERCEL_ENV=preview.
  assert.equal(hostedEnabled(false, { AB_HOSTED_PREVIEW: '1', CI: 'true', VERCEL_ENV: 'preview' }), true);
});

test('the override turns the page on in a local build with neither VERCEL nor CI set', () => {
  assert.equal(hostedEnabled(false, { AB_HOSTED_PREVIEW: '1' }), true);
});

test('the override fails closed on Vercel or CI without VERCEL_ENV=preview', () => {
  for (const env of [
    { AB_HOSTED_PREVIEW: '1', VERCEL: '1' },
    { AB_HOSTED_PREVIEW: '1', CI: 'true' },
    { AB_HOSTED_PREVIEW: '1', VERCEL: '1', VERCEL_ENV: 'production' },
    { AB_HOSTED_PREVIEW: '1', VERCEL_ENV: 'production' },
    { AB_HOSTED_PREVIEW: '1', VERCEL: '1', VERCEL_ENV: 'development' },
    { AB_HOSTED_PREVIEW: 'true', VERCEL_ENV: 'preview' },
  ]) {
    assert.equal(hostedEnabled(false, env), false, JSON.stringify(env));
  }
});

test('the switch on builds the page in every environment', () => {
  for (const env of [{}, { VERCEL: '1', VERCEL_ENV: 'production' }, { CI: 'true' }, { AB_HOSTED_PREVIEW: '1', VERCEL_ENV: 'preview' }]) {
    assert.equal(hostedEnabled(true, env), true, JSON.stringify(env));
  }
});

test('the enabled NAV list drops the Hosted item only while the page is not built', () => {
  const nav = [
    { label: 'Workflow', href: '/workflow/' },
    { label: 'Hosted', href: HOSTED_PATH },
  ];
  assert.deepEqual(enabledNav(nav, false).map((n) => n.label), ['Workflow']);
  assert.deepEqual(enabledNav(nav, true).map((n) => n.label), ['Workflow', 'Hosted']);
});

// ── The route integration, called as the Kit's test calls its own ──────────

const setup = (options, command = 'build') => {
  const routes = [];
  hostedRoute(options).hooks['astro:config:setup']({ command, injectRoute: (r) => routes.push(r) });
  return routes;
};

const spy = () => {
  const calls = [];
  const load = (at) => {
    calls.push(at);
    return {};
  };
  return { calls, load };
};

test('the integration injects /hosted when enabled and nothing when not, and loads the data both times', () => {
  const on = spy();
  const routes = setup({ enabled: true, root, load: on.load });
  assert.deepEqual(routes.map((r) => r.pattern), ['/hosted']);
  assert.ok(existsSync(routes[0].entrypoint), `${routes[0].entrypoint} does not exist`);
  assert.deepEqual(on.calls, [root]);

  const off = spy();
  assert.deepEqual(setup({ enabled: false, root, load: off.load }), []);
  assert.deepEqual(off.calls, [root]);
});

test('a README the page cannot use fails the build in either mode', () => {
  const broken = () => {
    throw new Error('README "eve/README.md > Variables": broken');
  };
  for (const enabled of [true, false]) {
    assert.throws(() => setup({ enabled, root, load: broken }), /Variables/);
  }
});

test('by default the integration reads the real eve/README.md through the data loader', () => {
  assert.doesNotThrow(() => setup({ enabled: false }));
  assert.deepEqual(setup({ enabled: true }).map((r) => r.pattern), ['/hosted']);
});

test('with no eve/README.md, the switch off skips the data load and the switch on fails the build', () => {
  const bare = mkdtempSync(join(tmpdir(), 'ab-hosted-'));
  try {
    mkdirSync(join(bare, 'eve'));
    const off = spy();
    assert.deepEqual(setup({ enabled: false, root: bare, load: off.load }), []);
    assert.deepEqual(off.calls, []);

    const on = spy();
    assert.throws(() => setup({ enabled: true, root: bare, load: on.load }), /Hosted page.*eve\/README\.md/s);
    assert.deepEqual(on.calls, []);
  } finally {
    rmSync(bare, { recursive: true, force: true });
  }
});

// ── The interim redirect ──────────────────────────────────────────────────

const PRODUCTION_HOST = new URL(SITE_URL).host;

test('the interim redirect for /hosted follows the switch and applies on the production host only', () => {
  const vercel = JSON.parse(readFileSync(join(root, 'site', 'vercel.json'), 'utf8'));
  const redirect = vercel.redirects.find((r) => r.source.startsWith('/hosted'));
  if (HOSTED_RELEASED) {
    assert.equal(redirect, undefined, 'the switch is on: remove the interim /hosted redirect from vercel.json');
    return;
  }
  assert.ok(redirect, 'the switch is off and vercel.json has no /hosted redirect');
  assert.equal(redirect.source, '/hosted{/}?');
  assert.equal(redirect.destination, '/docs/getting-started/#hosted');
  assert.equal(redirect.permanent, false);
  assert.deepEqual(redirect.has, [{ type: 'host', value: PRODUCTION_HOST }]);
});

// ── The built site ────────────────────────────────────────────────────────

const skip = !existsSync(join(dist, 'index.html')) && 'site/dist is not built (run npm run build in site/)';
const built = () => existsSync(join(dist, 'hosted', 'index.html'));
const read = (path) => readFileSync(join(dist, path), 'utf8');

// Every page, llms.txt and sitemap file Astro wrote, by its path in dist.
function textFiles() {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) {
        if (!['_astro', 'pagefind'].includes(name)) walk(path);
      } else if (/\.(html|txt|xml)$/.test(name)) {
        out.push(relative(dist, path).split(sep).join('/'));
      }
    }
  };
  walk(dist);
  return out;
}

// A link to the page: a root-relative path in an attribute or island props (&quot; encoded), or an
// absolute URL on the production origin.
const LINK = new RegExp(`(?:${SITE_URL.replace(/[.]/g, '\\.')}|(?<=["'(]|&quot;))/hosted(?![\\w-])`, 'g');

function sitemapUrls() {
  const listed = new Set();
  for (const [, loc] of read('sitemap-index.xml').matchAll(/<loc>([^<]+)<\/loc>/g)) {
    for (const [, url] of read(new URL(loc).pathname.slice(1)).matchAll(/<loc>([^<]+)<\/loc>/g)) listed.add(url);
  }
  return listed;
}

test('without the page, no navigation surface lists /hosted and only the two outside links remain', { skip }, () => {
  if (built()) return;
  assert.ok(![...sitemapUrls()].some((u) => u.startsWith(`${SITE_URL}/hosted`)), 'the sitemap lists /hosted');
  assert.doesNotMatch(read('llms.txt'), LINK, 'llms.txt lists /hosted');
  const found = [];
  for (const file of textFiles()) {
    const text = read(file);
    for (const block of text.match(/<(header|footer)\b[^]*?<\/\1>/g) ?? []) {
      assert.doesNotMatch(block, LINK, `${file}: the header or footer links to /hosted`);
    }
    for (const m of text.matchAll(LINK)) found.push({ file, link: m[0] });
  }
  // The root README's Hosted line on Getting started and the release notes on the Changelog, both
  // absolute, so the production-host redirect in vercel.json catches them.
  assert.deepEqual([...new Set(found.map((f) => f.file))].sort(), ['changelog/index.html', 'docs/getting-started/index.html']);
  for (const f of found) assert.equal(f.link, `${SITE_URL}/hosted`, `${f.file} links to ${f.link}`);
});

test('with the page, the sitemap lists it', { skip }, () => {
  if (!built()) return;
  assert.ok(sitemapUrls().has(`${SITE_URL}/hosted/`), 'the sitemap does not list /hosted/');
});

test('a test run with AB_HOSTED_PREVIEW=1 reads a build that has the page', { skip }, () => {
  if (process.env.AB_HOSTED_PREVIEW !== '1') return;
  assert.ok(built(), 'AB_HOSTED_PREVIEW=1, but site/dist/hosted/index.html was not built');
  assert.ok(sitemapUrls().has(`${SITE_URL}/hosted/`), 'AB_HOSTED_PREVIEW=1, but the sitemap does not list /hosted/');
});
