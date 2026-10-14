// Checks on the built site (site/dist) for R1, R6, R7 and R8: every page has its own title and
// description, the sitemap lists every page, the Changelog states what the repository holds, the
// Kit stays out of the build, 404.html and llms.txt exist, and robots.txt names the sitemap. One more holds the script
// budget: islands hydrate on first interaction and nothing loads from another origin. The install
// surfaces show each tool's setup call, the home hero a command for each tool, and each skill page's
// Codex tab the name Codex's picker shows. CI runs these after `npm run build`; without a build the
// tests are skipped and say so.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { leadRoute } from '../src/components/docs/route.mjs';
import { getWorkflow } from '../src/components/workflow/workflow-data.mjs';
import { callSkill, SETUP_SKILL } from '../src/lib/naming.mjs';
import { findRepoRoot, getSiteData } from '../src/lib/site.mjs';

const root = findRepoRoot();
const dist = join(root, 'site', 'dist');
const skip = !existsSync(join(dist, 'index.html')) && 'site/dist is not built (run npm run build in site/)';
const site = getSiteData();

const decode = (s) =>
  s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

// Every page Astro wrote, by its URL path; redirect stubs (meta refresh) are not pages. Read on the
// first call (a skipped run never reads site/dist) and shared by the tests after it.
let built;
const pages = () => (built ??= readPages());

function readPages() {
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

test('robots.txt allows every crawler and names the sitemap index on the production origin', { skip }, () => {
  assert.ok(existsSync(join(dist, 'robots.txt')), 'no robots.txt');
  const lines = read('robots.txt').split('\n');
  assert.ok(lines.includes('User-agent: *'), lines.join('\n'));
  assert.ok(lines.includes('Allow: /'), lines.join('\n'));
  assert.ok(lines.includes(`Sitemap: ${site.siteUrl}/sitemap-index.xml`), lines.join('\n'));
});

test('the Changelog lists every README release, newest first, with its date', { skip }, () => {
  const html = read('changelog/index.html');
  const listed = [...html.matchAll(/data-release="([^"]+)"[^]*?<time[^>]* datetime="([^"]+)"/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(listed, site.releases.map((r) => [r.version, r.date]));
  assert.doesNotMatch(html, /The body for the GitHub release/);
});

// The Kit is the maintainer's media kit: `npm run dev` serves it, the production build never does.
test('the Kit page stays out of the build: no page, no link to it, not in llms.txt', { skip }, () => {
  assert.ok(!existsSync(join(dist, 'kit')), 'site/dist/kit/ was built');
  for (const p of pages()) assert.doesNotMatch(p.html, /href="\/kit\/"/, `${p.url} links to /kit/`);
  assert.doesNotMatch(read('llms.txt'), /\/kit\//);
});

// Every animation plays on its own while it is on screen; no figure carries a pause, play or replay
// toggle. The big Play button stays, shown only when the browser refuses to start a video by itself,
// under reduced motion, or after the film ends.
test('no page has a pause toggle on its videos', { skip }, () => {
  const problems = [];
  for (const p of pages()) {
    if (/class="vf-toggle"/.test(p.html)) problems.push(`${p.url}: a vf-toggle`);
    if (/aria-label="Pause /.test(p.html)) problems.push(`${p.url}: a Pause button`);
  }
  assert.deepEqual(problems, []);
});

// The runner picks Claude Code first, and the figure's own command line names the picked host, so
// the drawing never shows a different tool from the command above it.
test('the runner starts on claude, in the command and in the figure', { skip }, () => {
  const runner = read('index.html').match(/<section class="sec runner"[\s\S]*?<\/section>/)?.[0] ?? '';
  const checked = [...runner.matchAll(/<button class="host"[^>]*aria-checked="true"[^>]*data-host="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(checked, ['claude']);
  assert.match(runner, /data-host-arg[^>]*>claude</);
  const figure = runner.match(/<figure class="vfig[^"]*in-runner[\s\S]*?<\/figure>/)?.[0] ?? '';
  assert.match(decode(figure), /run\.sh --host <tspan data-fig-host>claude<\/tspan> "Add CSV export"/, 'the figure does not draw the run.sh line for claude');
});

// Workflow Fig. 1 is the development loop as a looping animation on its drawing sheet, with the
// README's six steps under it as the legend, each skill it names linked to its page.
test("the Workflow page's Fig. 1 plays the loop animation above the README's steps", { skip }, () => {
  const html = read('workflow/index.html');
  const fig = html.match(/<section class="wf-sec" id="loop"[\s\S]*?<\/section>/)?.[0] ?? '';
  assert.match(fig, /<figure[^>]*data-vfig/, 'Fig. 1 is not a video figure');
  assert.match(fig, /<video[^>]*\bloop\b[^>]*preload="none"[^>]*aria-label="Looping animation, no sound: [^"]+"/);
  assert.match(fig, /<source src="\/media\/loop-workflow\.mp4" type="video\/mp4"/);
  assert.ok(existsSync(join(dist, 'media', 'loop-workflow.mp4')) && existsSync(join(dist, 'media', 'loop-workflow.jpg')), 'the loop or its poster is not in the build');
  const legend = fig.slice(fig.indexOf('</video>'));
  let at = 0;
  for (const step of getWorkflow().loop) {
    const next = legend.indexOf(`>${step.name}<`, at);
    assert.ok(next > at, `step ${step.n} ${step.name} is missing from the legend, or out of order`);
    at = next;
    for (const [, href] of step.html.matchAll(/href="([^"]+)"/g)) assert.ok(legend.includes(`href="${href}"`), `${step.name}: no link to ${href}`);
  }
});

test('404.html and llms.txt are built; llms.txt names every skill page', { skip }, () => {
  assert.ok(existsSync(join(dist, '404.html')), 'no 404.html');
  const llms = read('llms.txt');
  for (const s of site.skills) assert.ok(llms.includes(`(${site.siteUrl}/skills/${s.name}/)`), s.name);
});

// The script budget: React islands hydrate on first interaction (never client:load or client:idle),
// so no page downloads framework JavaScript on load, and no page pulls a script or a stylesheet
// from another origin.
test('islands hydrate on interaction; no page loads a script or stylesheet from another origin', { skip }, () => {
  const origin = new URL(site.siteUrl).origin;
  const attr = (tag, name) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
  let islands = 0;
  const problems = [];
  for (const p of pages()) {
    for (const [tag] of p.html.matchAll(/<astro-island\b[^>]*>/g)) {
      islands += 1;
      const client = attr(tag, 'client');
      if (client !== 'interaction') problems.push(`${p.url}: an island with client="${client}"`);
    }
    for (const [tag] of p.html.matchAll(/<script\b[^>]*>/g)) {
      const src = attr(tag, 'src');
      if (src && new URL(src, site.siteUrl).origin !== origin) problems.push(`${p.url}: script ${src}`);
    }
    for (const [tag] of p.html.matchAll(/<link\b[^>]*>/g)) {
      const href = attr(tag, 'href');
      const rel = (attr(tag, 'rel') ?? '').toLowerCase().split(/\s+/);
      if (rel.includes('stylesheet') && href && new URL(href, site.siteUrl).origin !== origin) {
        problems.push(`${p.url}: stylesheet ${href}`);
      }
    }
  }
  assert.ok(islands > 0, 'no <astro-island> in the build: the header menu is one, so the pattern no longer matches');
  assert.deepEqual(problems, [], 'islands that hydrate before interaction, or scripts and stylesheets from another origin');
});

// One tab panel of a built page, by its id, as HTML.
function panel(html, id) {
  const start = html.indexOf(`role="tabpanel" id="${id}"`);
  assert.ok(start > 0, `no tab panel ${id}`);
  const end = html.indexOf('role="tabpanel"', start + 1);
  return html.slice(start, end === -1 ? undefined : end);
}

test("every Getting started tab shows how to call the setup skill in that tool", { skip }, () => {
  const html = read('docs/getting-started/index.html');
  for (const tool of site.tools) {
    const p = decode(panel(html, tool.id));
    const call = callSkill(site.tools, tool, SETUP_SKILL);
    assert.match(p, /<dt[^>]*>Set up your project<\/dt>/, tool.name);
    assert.ok(p.includes(tool.naming.syntax === null ? `"${call}"` : `data-copy="${call}"`), `${tool.name}: no ${call}`);
    assert.equal(p.includes('offers it right after install'), site.onboarding[tool.id] === SETUP_SKILL, tool.name);
    if (tool.section) assert.ok(p.includes(`href="#${tool.section.slug}"`), `${tool.name} does not link to its section`);
  }
  // the steps under the intro link to headings on the page
  const rail = html.match(/<ol class="gs-steps"[\s\S]*?<\/ol>/)?.[0];
  assert.ok(rail, 'no steps under the intro');
  for (const [, id] of rail.matchAll(/href="#([^"]+)"/g)) assert.ok(html.includes(`id="${id}"`), `no #${id} on the page`);
});

test('the home hero gives a command for each tool and for all of them; the closing gives each setup call', { skip }, () => {
  const html = read('index.html');
  for (const tool of site.tools) {
    const copy = leadRoute(tool.route, tool.commands).commands.join(' && ');
    assert.ok(decode(panel(html, `hero-${tool.id}`)).includes(`data-copy="${copy}"`), `${tool.name}: the hero does not copy ${copy}`);
  }
  assert.ok(decode(panel(html, 'hero-all')).includes(`data-copy="${site.allToolsCommand}"`), 'the all-tools panel copies the installer');
  const closing = decode(html.match(/<section class="sec closing"[\s\S]*?<\/section>/)[0]);
  for (const tool of site.tools) assert.ok(closing.includes(callSkill(site.tools, tool, SETUP_SKILL)), tool.name);
});

test("each skill page's Codex tab shows the name and line Codex's picker shows", { skip }, () => {
  for (const skill of site.skills.filter((s) => s.codex)) {
    const p = decode(panel(read(`skills/${skill.name}/index.html`), 'name-it-codex'));
    assert.ok(p.includes(`<b>${skill.codex.displayName}</b>`), `${skill.name}: no ${skill.codex.displayName}`);
    assert.ok(p.includes(skill.codex.shortDescription), skill.name);
    assert.ok(p.includes(`data-copy="$${skill.name}"`), `${skill.name}: the Codex call keeps its $`);
    assert.equal(p.includes('offers it right after install'), site.onboarding.codex === skill.name, skill.name);
  }
});

test('the install and setup loops sit where the placement map puts them, with one caption and alt text each', { skip }, () => {
  const figures = (path) => [...read(path).matchAll(/<figure class="vfig[^"]*"[\s\S]*?<\/figure>/g)].map(([f]) => ({
    src: f.match(/<source src="([^"]+)"/)?.[1],
    num: Number(f.match(/<b>Fig\. (\d+)<\/b>/)?.[1]),
    caption: f.match(/<b>Fig\. \d+<\/b>([\s\S]*?)<\/span>/)?.[1].trim(),
    alt: f.match(/<video[^>]*\saria-label="([^"]*)"/)?.[1],
    html: f,
  }));
  const where = (path, src) => figures(path).find((f) => f.src === src);
  const placements = [
    ['index.html', '/media/loop-install.mp4', 6],
    ['docs/getting-started/index.html', '/media/loop-install.mp4', 1],
    ['docs/getting-started/index.html', '/media/loop-setup.mp4', 2],
    ['docs/project-files/index.html', '/media/loop-setup.mp4', 1],
  ];
  const first = new Map();
  for (const [path, src, num] of placements) {
    const fig = where(path, src);
    assert.equal(fig?.num, num, `${path}: ${src}`);
    // every page reads the caption and text alternative from LOOPS, so a loop reads the same everywhere
    assert.ok(fig.caption && fig.alt?.startsWith('Looping animation, no sound: '), `${path}: ${src} has no caption or alt text`);
    const seen = first.get(src) ?? first.set(src, { ...fig, path }).get(src);
    assert.ok(fig.caption === seen.caption && fig.alt === seen.alt, `${path}: ${src} does not match its caption and alt text on ${seen.path}`);
  }
  const start = read('docs/getting-started/index.html');
  assert.ok(start.indexOf('id="set-up-your-project"') < start.indexOf('/media/loop-setup.mp4'), 'the setup loop comes after its heading');
  assert.ok(!/eight-tools\.[^"]*\.webp/.test(start), 'Getting started still shows the eight-tools diagram the install loop stands in for');
  for (const f of figures('docs/getting-started/index.html')) assert.match(f.html, /preload="none"/, f.src);
});
