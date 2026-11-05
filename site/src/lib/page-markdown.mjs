// page-markdown.mjs: a Docs, Guides or Tutorials page as Markdown, served at its address plus .md
// (pages/<kind>/[slug].md.ts) and copied by "Copy for your agent" (components/docs/MarkdownControls.astro).
// Plain Node, tested in site/test/page-markdown.test.mjs.
//
// A page's Markdown is its title as the one H1, then its source without the frontmatter: for Docs and
// Guides the hand-written intro (content/<kind>/<slug>.md) and the README section(s) it maps
// (readme-map.mjs), for Tutorials the file itself. Docs also carry the parts the page builds from the same
// data: the GitHub documents under the intro, and on Hooks and native features the table of hooks. A
// guide leaves out a first heading that repeats its title, as its page does. The README tables the
// Getting started tabs replace stay in: here they are the only statement of those facts.
//
// Exports
//   MARKDOWN_HEADERS            the response headers of a .md route.
//   markdownHref(href)          "/docs/faq/" -> "/docs/faq.md".
//   docRefs({ hostDocs, repoDoc }, site)  [{ label, href, code }], the GitHub documents a docs page points
//                               to; components/docs/DocRefs.astro renders the same list.
//   absoluteLinks(markdown, { siteUrl, repoUrl, pageUrl })  every link and image with a full address:
//                               "/x" and "#x" on the site, "./x" (a README image) on GitHub. Any other
//                               relative target throws naming the page.
//   collapseBlankLines(markdown)  one blank line where a left-out README section leaves more; fenced code
//                               stays as written.
//   pageMarkdown(kind, slug, root?)  the page's Markdown. Throws naming the page or the file when the page
//                               is not in its section's order or its file has no frontmatter.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { docsOrder } from './docs-sidebar.mjs';
import { guidesOrder } from './guides-order.mjs';
import { parseHeadings, rewriteLinks } from './readme.mjs';
import { findRepoRoot, getReadmePages, getSiteData } from './site.mjs';
import { tutorialsOrder } from './tutorials-order.mjs';

const ORDER = { docs: docsOrder, guides: guidesOrder, tutorials: tutorialsOrder };
const HOOKS_PAGE = 'hooks-and-native-features';
const FENCE = /^\s*(`{3,}|~{3,})/;

export const MARKDOWN_HEADERS = { 'Content-Type': 'text/markdown; charset=utf-8' };

export function markdownHref(href) {
  return `${href.replace(/\/$/, '')}.md`;
}

/**
 * @param {{ hostDocs?: string, repoDoc?: string }} refs
 * @param {{ tools: { name: string, hostDoc: string }[], repoUrl: string }} site
 */
export function docRefs({ hostDocs, repoDoc }, { tools, repoUrl }) {
  const blob = (/** @type {string} */ path) => `${repoUrl}/blob/main/${path}`;
  return [
    ...(hostDocs ? tools.map((t) => ({ label: t.name, href: `${blob(t.hostDoc)}#${hostDocs}`, code: false })) : []),
    ...(repoDoc ? [{ label: repoDoc, href: blob(repoDoc), code: true }] : []),
  ];
}

export function absoluteLinks(markdown, { siteUrl, repoUrl, pageUrl }) {
  return rewriteLinks(markdown, (target, isImage) => {
    if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('//')) return target;
    if (target.startsWith('/')) return `${siteUrl}${target}`;
    if (target.startsWith('#')) return `${siteUrl}${pageUrl}${target}`;
    if (isImage && target.startsWith('./')) return `${repoUrl}/raw/main/${target.slice(2)}`;
    throw new Error(`Markdown of ${pageUrl}: the link "${target}" has no full address; use a site path or a full URL`);
  });
}

export function collapseBlankLines(markdown) {
  let fenced = false;
  return markdown
    .split('\n')
    .filter((line, i, lines) => {
      if (FENCE.test(line)) fenced = !fenced;
      return fenced || line.trim() !== '' || (lines[i - 1] ?? '').trim() !== '';
    })
    .join('\n');
}

function readSource(root, kind, slug) {
  const file = `site/src/content/${kind}/${slug}.md`;
  const text = readFileSync(join(root, file), 'utf8');
  const front = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!front) throw new Error(`${file}: no frontmatter`);
  const field = (name) => front[1].match(new RegExp(`^${name}:\\s*(\\S+)`, 'm'))?.[1];
  return { body: text.slice(front[0].length).trim(), hostDocs: field('hostDocs'), repoDoc: field('repoDoc') };
}

const readmeBodies = new Map();
function readmePage(root, slug) {
  if (!readmeBodies.has(root)) readmeBodies.set(root, new Map(getReadmePages(root).map((page) => [page.slug, page])));
  const page = readmeBodies.get(root).get(slug);
  if (!page) throw new Error(`Markdown of "${slug}": no README section; map it in src/lib/readme-map.mjs`);
  return page;
}

// Without a first H2 that repeats the title, its subsections lifted one level (guide-html.mjs does the
// same to the page's HTML).
function dropTitleHeading(markdown, title) {
  const [first, ...rest] = parseHeadings(markdown);
  if (first?.depth !== 2 || first.text !== title || first.line !== 0) return markdown;
  const lines = markdown.split('\n');
  for (const heading of rest) if (heading.line < first.end) lines[heading.line] = lines[heading.line].slice(1);
  return lines.slice(1).join('\n').trim();
}

function docsParts(root, source, page, site) {
  const section = readmePage(root, page.slug);
  const refs = docRefs(source, site).map((ref) => `- [${ref.code ? `\`${ref.label}\`` : ref.label}](${ref.href})`);
  const hooks = page.slug === HOOKS_PAGE
    ? [
        '## Hooks in each tool',
        ['| Tool | Hooks |', '|---|---|', ...site.tools.map((t) => `| ${t.name} | ${t.support.hooks} |`)].join('\n'),
        `## ${section.headings[0]}`,
      ]
    : [];
  return [...(refs.length ? [refs.join('\n')] : []), ...hooks, section.markdown];
}

/**
 * @param {'docs' | 'guides' | 'tutorials'} kind
 * @param {string} slug
 * @param {string} [root]
 * @returns {string}
 */
export function pageMarkdown(kind, slug, root = findRepoRoot()) {
  const page = ORDER[kind]().find((p) => p.slug === slug);
  if (!page) throw new Error(`Markdown: no ${kind} page "${slug}"`);
  const site = getSiteData(root);
  const source = readSource(root, kind, slug);
  const parts = [`# ${page.label}`, source.body];
  if (kind === 'docs') parts.push(...docsParts(root, source, page, site));
  if (kind === 'guides') parts.push(dropTitleHeading(readmePage(root, slug).markdown, page.label));
  const markdown = absoluteLinks(parts.join('\n\n'), { siteUrl: site.siteUrl, repoUrl: site.repoUrl, pageUrl: page.href });
  return `${collapseBlankLines(markdown).trimEnd()}\n`;
}
