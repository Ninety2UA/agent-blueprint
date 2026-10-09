// readme.mjs: reads README.md into plain data for the site (KTD2). Plain Node, no astro: imports.
//
// Every parser takes the README text and throws an Error that names the README section (and the
// table, where there is one) when the section or table is missing or malformed, so a README edit
// that breaks the site stops the build with a message that says where to look.
//
// Exports
//   githubSlug(text)          GitHub's heading anchor for a heading text ("Consistency gates (CI)" ->
//                             "consistency-gates-ci"); Astro gives rendered headings the same ids.
//   parseHeadings(markdown)   [{ depth, text, slug, line, end }] for every ATX heading outside fenced code;
//                             `slug` carries GitHub's -1, -2 suffix for repeats, `line` is the 0-based
//                             line index and `end` the index where the heading's section stops.
//   getSection(markdown, heading)  the heading object above plus `lines` (the section body). Throws
//                             'README: section "<heading>" not found'.
//   parsePhases(markdown)     [{ slug, title, skills: [{ name, path, summary, when }] }] from the
//                             "Skills reference" tables; title is the heading without " phase",
//                             slug its anchor ("Session management" -> "session-management").
//   parseInstall(markdown)    { cloneCommand, installCommand, tools } from the "Install" section;
//                             tools: [{ name, id, route, commands, hostDoc, naming: { syntax, example },
//                             support: { hooks, helpers, manualOnly } }] in install-table order.
//                             `commands` are the route cell's code spans that contain a space (paths
//                             and config keys have none). A naming cell without an example gets one
//                             built from the syntax and the skill another row's example names.
//   parseHelpers(markdown)    [{ name, path, skill, summary, when }] from "Helper prompts reference";
//                             skill is the folder the row links into, summary the Domain cell.
//   parseReleases(markdown)   [{ version, date, summary }] from "Release history", newest first;
//                             version without the leading "v".
//   extractPages(markdown, pages, { repoUrl, repoRoot, anchorFallbacks })
//                             [{ slug, kind, url, headings, markdown, images }] for the pages of
//                             readme-map.mjs. Each page gets the Markdown of the sections it maps:
//                             one section renders without its own heading and its subsections become
//                             H2; several sections each become an H2. A subsection another page maps
//                             is left out. README anchor links become site URLs, repository paths
//                             become GitHub links, and README <img> blocks become Markdown images
//                             with a "./" path relative to README.md (listed in `images` as repository
//                             paths) for Astro's image pipeline. Throws naming the page when a mapped
//                             heading is missing, and naming the link when an anchor matches no heading.

import { statSync } from 'node:fs';
import { join } from 'node:path';

const FENCE = /^\s*(`{3,}|~{3,})/;
const HEADING = /^(#{1,6})[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/;
const BRANCH = 'main';

export function githubSlug(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '')
    .replace(/ /g, '-');
}

// Fenced code tracking: `code` is true for fence lines and the lines between them.
function fenceStep(line, fence) {
  const open = line.match(FENCE);
  if (!open) return { fence, code: fence !== null };
  if (fence === null) return { fence: open[1][0], code: true };
  const closes = open[1][0] === fence && line.trim().replace(/[`~]/g, '') === '';
  return { fence: closes ? null : fence, code: true };
}

export function parseHeadings(markdown) {
  const lines = markdown.split('\n');
  const headings = [];
  const seen = new Map();
  let fence = null;
  lines.forEach((line, index) => {
    const step = fenceStep(line, fence);
    fence = step.fence;
    if (step.code) return;
    const m = line.match(HEADING);
    if (!m) return;
    const text = m[2];
    const base = githubSlug(text);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    headings.push({ depth: m[1].length, text, slug: count ? `${base}-${count}` : base, line: index });
  });
  headings.forEach((h, i) => {
    const next = headings.slice(i + 1).find((n) => n.depth <= h.depth);
    h.end = next ? next.line : lines.length;
  });
  return headings;
}

function sectionOf(lines, heading) {
  return { ...heading, lines: lines.slice(heading.line + 1, heading.end) };
}

export function getSection(markdown, heading) {
  const found = parseHeadings(markdown).find((h) => h.text === heading);
  if (!found) throw new Error(`README: section "${heading}" not found`);
  return sectionOf(markdown.split('\n'), found);
}

// The direct subsections of a section, each with its own lines.
function subsections(markdown, section) {
  const lines = markdown.split('\n');
  return parseHeadings(markdown)
    .filter((h) => h.line > section.line && h.line < section.end && h.depth === section.depth + 1)
    .map((h) => sectionOf(lines, h));
}

function splitRow(line) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/(?<!\\)\|$/, '')
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim().replace(/\\\|/g, '|'));
}

// The rows of the first table in `lines` whose header row is exactly `header`.
function parseTable(lines, header, where) {
  const name = header.join(' | ');
  const start = lines.findIndex(
    (line, i) =>
      line.trim().startsWith('|') &&
      splitRow(line).join(' | ') === name &&
      /^\s*\|[\s|:-]+\|?\s*$/.test(lines[i + 1] ?? ''),
  );
  if (start === -1) throw new Error(`README "${where}": table "${name}" not found`);
  const rows = [];
  for (const line of lines.slice(start + 2)) {
    if (!line.trim().startsWith('|')) break;
    const cells = splitRow(line);
    if (cells.length !== header.length) {
      throw new Error(`README "${where}": table "${name}" has a row with ${cells.length} cells, expected ${header.length}: ${line}`);
    }
    rows.push(cells);
  }
  if (!rows.length) throw new Error(`README "${where}": table "${name}" has no rows`);
  return rows;
}

function parseLink(cell, where) {
  const m = cell.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
  if (!m) throw new Error(`README "${where}": expected a single link, found "${cell}"`);
  return { text: m[1], href: m[2] };
}

function codeSpans(text) {
  return [...text.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
}

function firstFence(lines, where) {
  const start = lines.findIndex((line) => FENCE.test(line));
  const end = start === -1 ? -1 : lines.findIndex((line, i) => i > start && FENCE.test(line));
  if (end === -1) throw new Error(`README "${where}": no fenced code block`);
  return lines.slice(start + 1, end).join('\n').trim();
}

export function parsePhases(markdown) {
  const reference = getSection(markdown, 'Skills reference');
  const phases = subsections(markdown, reference);
  if (!phases.length) throw new Error('README "Skills reference": no phase subsections');
  return phases.map((phase) => {
    const where = `Skills reference > ${phase.text}`;
    const title = phase.text.replace(/ phase$/i, '');
    const skills = parseTable(phase.lines, ['Skill', 'What it does', 'When'], where).map(([skill, summary, when]) => {
      const link = parseLink(skill, where);
      return { name: link.text, path: link.href, summary, when };
    });
    return { slug: githubSlug(title), title, skills };
  });
}

function namingFor(cell, exampleSkill, where) {
  const spans = codeSpans(cell);
  if (spans.length >= 2) return { syntax: spans[0], example: spans[1] };
  if (spans.length === 1 && exampleSkill) return { syntax: spans[0], example: `${spans[0]}${exampleSkill}` };
  const quoted = cell.match(/"([^"]+)"|“([^”]+)”/);
  if (!spans.length && quoted) return { syntax: null, example: quoted[1] ?? quoted[2] };
  throw new Error(`README "${where}": table "Tool | How to name a skill" cell "${cell}" gives no syntax or example`);
}

export function parseInstall(markdown) {
  const install = getSection(markdown, 'Install');
  const sub = (title) => {
    const found = subsections(markdown, install).find((s) => s.text === title);
    if (!found) throw new Error(`README "Install": section "${title}" not found`);
    return found;
  };
  const cloneCommand = firstFence(sub('1. Get the code').lines, 'Install > 1. Get the code');
  const installCommand = firstFence(sub('2. Install for the tools you use').lines, 'Install > 2. Install for the tools you use');

  const where = 'Install';
  const routes = parseTable(install.lines, ['Tool', 'Command', 'Install route', 'Support note'], where);
  const naming = parseTable(install.lines, ['Tool', 'How to name a skill'], where);
  const support = parseTable(install.lines, ['Tool', 'Hooks', 'Helpers', 'Manual-only skills'], where);

  const exampleSkill = naming
    .map(([, cell]) => codeSpans(cell))
    .filter((spans) => spans.length >= 2 && spans[1].startsWith(spans[0]))
    .map((spans) => spans[1].slice(spans[0].length))[0];
  const rowFor = (rows, name, table) => {
    const row = rows.find(([tools]) => tools.split(/,\s*/).includes(name));
    if (!row) throw new Error(`README "${where}": table "${table}" has no row for ${name}`);
    return row;
  };

  const tools = routes.map(([name, command, route, note]) => {
    const id = codeSpans(command)[0];
    if (!id) throw new Error(`README "${where}": table "Tool | Command | Install route | Support note" row ${name} has no command`);
    const [, nameCell] = rowFor(naming, name, 'Tool | How to name a skill');
    const [, hooks, helpers, manualOnly] = rowFor(support, name, 'Tool | Hooks | Helpers | Manual-only skills');
    return {
      name,
      id,
      route,
      commands: codeSpans(route).filter((span) => /\s/.test(span)),
      hostDoc: parseLink(note, where).href,
      naming: namingFor(nameCell, exampleSkill, where),
      support: { hooks, helpers, manualOnly },
    };
  });
  return { cloneCommand, installCommand, tools };
}

export function parseHelpers(markdown) {
  const where = 'Helper prompts reference';
  const section = getSection(markdown, where);
  return parseTable(section.lines, ['Helper', 'Domain', 'When it runs'], where).map(([helper, summary, when]) => {
    const link = parseLink(helper, where);
    const skill = link.href.match(/^skills\/([^/]+)\/references\/agents\/[^/]+\.md$/)?.[1];
    if (!skill) throw new Error(`README "${where}": ${link.text} links to ${link.href}, not to a skill's references/agents/`);
    return { name: link.text, path: link.href, skill, summary, when };
  });
}

export function parseReleases(markdown) {
  const where = 'Release history';
  const section = getSection(markdown, where);
  return parseTable(section.lines, ['Version', 'Date', 'What changed'], where).map(([version, date, summary]) => ({
    version: version.replace(/^v/, ''),
    date,
    summary,
  }));
}

// ---- Section extraction for Docs and Guides pages ----

function imageBlocksToMarkdown(text) {
  return text.replace(/<p\b[^>]*>\s*<img\b([^>]*?)\/?>\s*<\/p>/g, (_, attrs) => {
    const attr = (name) => attrs.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] ?? '';
    return `![${attr('alt').replace(/[[\]]/g, '\\$&')}](${attr('src')})`;
  });
}

function makeLinkRewriter({ anchors, repoUrl, repoRoot, slug, images }) {
  const repoLink = (target) => {
    const [path, fragment] = target.split('#');
    const clean = path.replace(/^\.\//, '');
    let isDir = clean.endsWith('/');
    if (!isDir) {
      try {
        isDir = statSync(join(repoRoot, clean)).isDirectory();
      } catch {
        isDir = false;
      }
    }
    return `${repoUrl}/${isDir ? 'tree' : 'blob'}/${BRANCH}/${clean}${fragment ? `#${fragment}` : ''}`;
  };
  return (target, isImage) => {
    if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('/')) return target;
    if (isImage) {
      const clean = target.replace(/^\.\//, '');
      images.add(clean);
      return `./${clean}`;
    }
    if (target.startsWith('#')) {
      const url = anchors.get(target.slice(1));
      if (!url) throw new Error(`README link "${target}" on page "${slug}" matches no README heading`);
      return url;
    }
    return repoLink(target);
  };
}

function rewriteLinks(text, rewrite) {
  let fence = null;
  return text
    .split('\n')
    .map((line) => {
      const step = fenceStep(line, fence);
      fence = step.fence;
      if (step.code) return line;
      return line
        .replace(/(!?)\[([^\]]*)\]\(([^)\s]+)\)/g, (_, bang, label, target) => `${bang}[${label}](${rewrite(target, bang === '!')})`)
        .replace(/\b(href|src)="([^"]+)"/g, (_, attr, target) => `${attr}="${rewrite(target, attr === 'src')}"`);
    })
    .join('\n');
}

export function extractPages(markdown, pages, { repoUrl, repoRoot, anchorFallbacks = [] }) {
  const lines = markdown.split('\n');
  const headings = parseHeadings(markdown);
  const byLine = new Map(headings.map((h) => [h.line, h]));

  // Which page renders each mapped heading.
  const mapped = new Map();
  for (const page of pages) {
    for (const text of page.headings) {
      const heading = headings.find((h) => h.text === text);
      if (!heading) {
        throw new Error(`README map: page "${page.slug}" (${page.url}) maps the heading "${text}", which README.md does not have`);
      }
      mapped.set(heading.line, page);
    }
  }

  // Where a link to each README anchor goes on the site: the page that maps the heading or its
  // nearest mapped ancestor, else the fallback for its top-level section, else the home page.
  const anchors = new Map();
  const stack = [];
  for (const heading of headings) {
    while (stack.length && stack.at(-1).depth >= heading.depth) stack.pop();
    stack.push(heading);
    const owner = [...stack].reverse().find((h) => mapped.has(h.line));
    let url;
    if (owner) {
      const page = mapped.get(owner.line);
      const fragment = owner !== heading || page.headings.length > 1;
      url = `${page.url}${fragment ? `#${githubSlug(heading.text)}` : ''}`;
    } else {
      const top = stack.find((h) => h.depth >= 2) ?? heading;
      url = anchorFallbacks.find(([pattern]) => pattern.test(top.text))?.[1] ?? '/';
    }
    anchors.set(heading.slug, url);
  }

  return pages.map((page) => {
    const single = page.headings.length === 1;
    const chunks = page.headings.map((text) => {
      const section = headings.find((h) => h.text === text);
      const shift = (single ? 1 : 2) - section.depth;
      const out = single ? [] : [`## ${section.text}`];
      for (let i = section.line + 1; i < section.end; i++) {
        const sub = byLine.get(i);
        if (sub && mapped.has(i) && mapped.get(i) !== page) {
          i = sub.end - 1;
          continue;
        }
        out.push(sub ? `${'#'.repeat(Math.min(6, sub.depth + shift))} ${sub.text}` : lines[i]);
      }
      return out.join('\n').trim();
    });
    const images = new Set();
    const rewrite = makeLinkRewriter({ anchors, repoUrl, repoRoot, slug: page.slug, images });
    const body = rewriteLinks(imageBlocksToMarkdown(chunks.join('\n\n')), rewrite);
    return {
      slug: page.slug,
      kind: page.kind,
      url: page.url,
      headings: page.headings,
      markdown: `${body}\n`,
      images: [...images],
    };
  });
}
