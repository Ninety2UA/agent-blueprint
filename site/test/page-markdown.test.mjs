// Tests for site/src/lib/page-markdown.mjs and the two controls in a page's header: every Docs, Guides and
// Tutorials page has a .md version that matches its source, without frontmatter, with its title as the one
// H1 and every link absolute. The built-page tests hold the files, the buttons and the hosting config.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { docsOrder } from '../src/lib/docs-sidebar.mjs';
import { guidesOrder } from '../src/lib/guides-order.mjs';
import { absoluteLinks, collapseBlankLines, docRefs, markdownHref, pageMarkdown } from '../src/lib/page-markdown.mjs';
import { parseHeadings } from '../src/lib/readme.mjs';
import { findRepoRoot, getReadmePages, getSiteData } from '../src/lib/site.mjs';
import { tutorialsOrder } from '../src/lib/tutorials-order.mjs';

const root = findRepoRoot();
const dist = join(root, 'site', 'dist');
const skip = !existsSync(join(dist, 'index.html')) && 'site/dist is not built (run npm run build in site/)';
const site = getSiteData();
const { siteUrl, repoUrl } = site;

const PAGES = [
  ...docsOrder().map((page) => ({ ...page, kind: 'docs' })),
  ...guidesOrder().map((page) => ({ ...page, kind: 'guides' })),
  ...tutorialsOrder().map((page) => ({ ...page, kind: 'tutorials' })),
];
const sourceOf = ({ kind, slug }) => readFileSync(join(root, 'site', 'src', 'content', kind, `${slug}.md`), 'utf8');
const bodyOf = (page) => sourceOf(page).replace(/^---\n[\s\S]*?\n---\n/, '').trim();
const absolute = (page, markdown) => collapseBlankLines(absoluteLinks(markdown, { siteUrl, repoUrl, pageUrl: page.href }));
const readme = new Map(getReadmePages().map((page) => [page.slug, page.markdown]));

test('every page is covered', () => {
  assert.equal(PAGES.length, docsOrder().length + guidesOrder().length + tutorialsOrder().length);
  assert.ok(docsOrder().length > 0 && guidesOrder().length > 0 && tutorialsOrder().length > 0);
});

for (const page of PAGES) {
  const label = `${page.kind}/${page.slug}`;
  const text = pageMarkdown(page.kind, page.slug);

  test(`${label}: the title is the first line and the one H1`, () => {
    assert.equal(text.split('\n')[0], `# ${page.label}`);
    assert.deepEqual(parseHeadings(text).filter((h) => h.depth === 1).map((h) => h.text), [page.label]);
  });

  test(`${label}: no frontmatter`, () => {
    assert.ok(sourceOf(page).startsWith('---\n'), 'the source has frontmatter to remove');
    const front = sourceOf(page).match(/^---\n([\s\S]*?)\n---\n/)[1];
    for (const line of front.split('\n')) assert.ok(!text.includes(`\n${line}\n`), `frontmatter line "${line}" in the output`);
    assert.doesNotMatch(text, /^---$/m);
  });

  test(`${label}: holds the page's source`, () => {
    assert.ok(text.includes(absolute(page, bodyOf(page))), 'the hand-written source');
    if (page.kind === 'docs') assert.ok(text.includes(absolute(page, readme.get(page.slug))), 'the README section');
    // A guide whose part opens with its title has its own test below.
    if (page.kind === 'guides' && !readme.get(page.slug).startsWith(`## ${page.label}\n`)) {
      assert.ok(text.includes(absolute(page, readme.get(page.slug))), 'the README part');
    }
  });

  test(`${label}: every link is absolute`, () => {
    const outsideFences = text.replace(/^```[\s\S]*?^```$/gm, '');
    assert.doesNotMatch(outsideFences, /\]\((?![a-z][a-z0-9+.-]*:)/i);
    assert.doesNotMatch(outsideFences, /\b(?:href|src)="(?![a-z][a-z0-9+.-]*:)/i);
  });

  test(`${label}: an image points at a file in the repository`, () => {
    for (const [, path] of text.matchAll(new RegExp(`!\\[[^\\]]*\\]\\(${repoUrl}/raw/main/([^)]+)\\)`, 'g'))) {
      assert.ok(existsSync(join(root, path)), path);
    }
  });
}

test('a guide leaves out a first heading that repeats its title and lifts what was under it', () => {
  const body = readme.get('team-work-and-swarms');
  assert.ok(body.startsWith('## Team work and swarms\n'), 'the README part opens with the title');
  const text = pageMarkdown('guides', 'team-work-and-swarms');
  assert.ok(!text.includes('\n## Team work and swarms\n'));
  assert.ok(text.includes('\n## Team work (`ab-orchestrate`)\n'), 'the H3 under it is now an H2');
});

test('a docs page keeps the GitHub documents its intro introduces', () => {
  const text = pageMarkdown('docs', 'update');
  for (const ref of docRefs({ hostDocs: 'install' }, site)) assert.ok(text.includes(`- [${ref.label}](${ref.href})`), ref.label);
  assert.ok(pageMarkdown('docs', 'upgrade-from-v3').includes(`- [\`docs/upgrade/v4.md\`](${repoUrl}/blob/main/docs/upgrade/v4.md)`));
});

test('Hooks and native features keeps the table the page builds, from the same data', () => {
  const text = pageMarkdown('docs', 'hooks-and-native-features');
  assert.ok(text.includes('\n## Hooks in each tool\n'));
  for (const tool of site.tools) assert.ok(text.includes(`| ${tool.name} | ${tool.support.hooks} |`), tool.name);
});

test('Getting started keeps the README tables the tabs replace on the page', () => {
  assert.ok(pageMarkdown('docs', 'getting-started').includes('| Tool | Command | Install route | Support note |'));
});

test('absoluteLinks: site paths, fragments and README images get a full address, the rest stays', () => {
  const opts = { siteUrl: 'https://s.test', repoUrl: 'https://g.test/r', pageUrl: '/docs/a/' };
  assert.equal(absoluteLinks('[x](/docs/b/#c)', opts), '[x](https://s.test/docs/b/#c)');
  assert.equal(absoluteLinks('[x](#c)', opts), '[x](https://s.test/docs/a/#c)');
  assert.equal(absoluteLinks('![x](./docs/images/a.png)', opts), '![x](https://g.test/r/raw/main/docs/images/a.png)');
  assert.equal(absoluteLinks('<a href="/b/">x</a>', opts), '<a href="https://s.test/b/">x</a>');
  assert.equal(absoluteLinks('[x](https://e.test/) [y](mailto:a@e.test)', opts), '[x](https://e.test/) [y](mailto:a@e.test)');
  assert.equal(absoluteLinks('```\n[x](/kept)\n```', opts), '```\n[x](/kept)\n```');
  assert.throws(() => absoluteLinks('[x](other.md)', opts), /Markdown of \/docs\/a\/: the link "other\.md"/);
});

test('collapseBlankLines: one blank line between blocks, fenced code as written', () => {
  assert.equal(collapseBlankLines('a\n\n\n\nb'), 'a\n\nb');
  assert.equal(collapseBlankLines('```\na\n\n\nb\n```\n\n\nc'), '```\na\n\n\nb\n```\n\nc');
});

test('markdownHref: the address without its final slash, plus .md', () => {
  assert.equal(markdownHref('/docs/getting-started/'), '/docs/getting-started.md');
});

test('pageMarkdown names a page that is not in its section', () => {
  assert.throws(() => pageMarkdown('docs', 'no-such-page'), /no docs page "no-such-page"/);
});

const decode = (s) => s.replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

for (const page of PAGES) {
  const label = `${page.kind}/${page.slug}`;
  test(`${label}: the build writes the .md, and the header holds the two controls`, { skip }, () => {
    const href = markdownHref(page.href);
    const text = pageMarkdown(page.kind, page.slug);
    assert.equal(readFileSync(join(dist, href.slice(1)), 'utf8'), text);
    const html = readFileSync(join(dist, page.href.slice(1), 'index.html'), 'utf8');
    const head = html.slice(html.indexOf('class="dp-head"'), html.indexOf('<h1'));
    assert.match(head, /<span class="copy-label">Copy for your agent<\/span>/);
    assert.ok(head.includes(`<a class="dp-md-view" href="${href}"`), 'the View as Markdown link');
    assert.match(head, />View as Markdown<\/a>/);
    assert.match(head, /data-copy-hint="[^"]+"/);
    assert.equal(decode(head.match(/ data-copy="([^"]*)"/)[1]), text, 'the copy text is the .md file');
  });
}

test('Vercel config: .md files are served as Markdown and the trailing slash rule stays', () => {
  const config = JSON.parse(readFileSync(join(root, 'site', 'vercel.json'), 'utf8'));
  const entry = config.headers.find((h) => h.source === '/(.*)\\.md');
  assert.deepEqual(entry?.headers, [{ key: 'Content-Type', value: 'text/markdown; charset=utf-8' }]);
  // Vercel's docs: with trailingSlash true, "paths with a file extension will not redirect".
  assert.equal(config.trailingSlash, true);
  for (const { source } of config.redirects) assert.doesNotMatch(source, /\.md/);
});

test('the sitemap lists no .md file', { skip }, () => {
  assert.doesNotMatch(readFileSync(join(dist, 'sitemap-0.xml'), 'utf8'), /\.md</);
});
