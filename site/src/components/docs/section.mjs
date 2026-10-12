// section.mjs: changes a docs page makes to its rendered README section. Plain Node, tested in
// site/test/docs-section.test.mjs.
//
//   INSTALL_TABS_ID   the id of the Getting started heading above the install tabs.
//   INSTALL_TABLES    [{ header, pointer }] for the README "Install" tables whose facts the install
//                     tabs render from data (route, naming, support), each with the line that
//                     replaces it in the section. The headers are the ones readme.mjs parses.
//   dropTables(html, tables)  the HTML with each listed table (matched by its header cells) replaced
//                     by its pointer. Throws naming the header when a listed table is not there, so a
//                     changed table never comes back on the page as a duplicate of the tabs.
//   INSTALL_IMAGES    file names (without extension) of the README "Install" images the install loop
//                     stands in for on Getting started: the eight-tools diagram shows the same routes.
//   dropImages(html, names)  the HTML without each paragraph that holds only an image whose file is one
//                     of `names` (Astro keeps the name and adds a hash: eight-tools.<hash>.webp). Throws
//                     naming the image when it is not there.
//   insertAfterHeading(html, id, insert)  the HTML with `insert` placed right after the heading whose id
//                     is `id`, ahead of that section's text. Throws naming the id when no heading has it.
//   SHORT_KEY         the longest first-column text (in characters) a table may have and still count
//                     as keyed by short names: 20, which "Claude Code" and "Pi, Hermes, Amp" fit.
//   markShortKeys(html)  the HTML with class="key-short" on each table of two or three columns whose
//                     body rows all start with a cell of at most SHORT_KEY characters, such as a tool
//                     name, so the stylesheet can keep those names on one line on a wide screen instead
//                     of letting a long second column squeeze them onto two. With four or more columns
//                     every column competes for the width, so the keys may wrap there.

export const INSTALL_TABS_ID = 'install-by-tool';

// `before` and `after` surround the link, so each pointer reads on from the README line above it
const pointer = (before, after) => `<p class="gs-pointer">${before}<a href="#${INSTALL_TABS_ID}">install tabs above</a>${after}</p>`;

export const INSTALL_TABLES = [
  { header: ['Tool', 'Command', 'Install route', 'Support note'], pointer: pointer("Each tool's route is in the ", ', with a copy button for every command.') },
  { header: ['Tool', 'How to name a skill'], pointer: pointer('How to name a skill in each tool is in the ', '.') },
  { header: ['Tool', 'Hooks', 'Helpers', 'Manual-only skills'], pointer: pointer('In the ', ', under Support.') },
];

const TABLE = /<table\b[^>]*>[\s\S]*?<\/table>/g;

function headerOf(table) {
  const thead = table.match(/<thead\b[^>]*>([\s\S]*?)<\/thead>/)?.[1] ?? '';
  return [...thead.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/g)].map((m) => m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
}

export function dropTables(html, tables) {
  const found = new Set();
  const out = html.replace(TABLE, (table) => {
    const header = headerOf(table).join(' | ');
    const drop = tables.find((t) => t.header.join(' | ') === header);
    if (!drop) return table;
    found.add(drop);
    return drop.pointer;
  });
  const missing = tables.filter((t) => !found.has(t));
  if (missing.length) {
    throw new Error(`docs: the rendered README section has no table "${missing.map((t) => t.header.join(' | ')).join('", "')}" to replace with the install tabs`);
  }
  return out;
}

export const INSTALL_IMAGES = ['eight-tools'];

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function dropImages(html, names) {
  let out = html;
  for (const name of names) {
    const image = new RegExp(`<p>\\s*<img\\b[^>]*\\ssrc="[^"]*/${escapeRe(name)}\\.[^"]*"[^>]*>\\s*</p>\\n?`);
    if (!image.test(out)) throw new Error(`docs: the rendered README section has no image "${name}" to replace with its loop`);
    out = out.replace(image, '');
  }
  return out;
}

export function insertAfterHeading(html, id, insert) {
  const heading = new RegExp(`<h([1-6])\\b[^>]*\\sid="${escapeRe(id)}"[^>]*>[\\s\\S]*?</h\\1>`);
  if (!heading.test(html)) throw new Error(`docs: the rendered README section has no heading #${id} to put a figure under`);
  return html.replace(heading, (h) => `${h}\n${insert}`);
}

export const SHORT_KEY = 20;

const cellText = (cell) => cell.replace(/<[^>]+>/g, '').replace(/&\w+;|&#\d+;/g, '_').replace(/\s+/g, ' ').trim();

export function markShortKeys(html) {
  return html.replace(TABLE, (table) => {
    const body = table.match(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/)?.[1] ?? '';
    const keys = [...body.matchAll(/<tr\b[^>]*>\s*<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/g)].map((m) => cellText(m[1]));
    if (headerOf(table).length > 3 || !keys.length || keys.some((k) => k.length > SHORT_KEY)) return table;
    return table.replace(/^<table\b/, '<table class="key-short"');
  });
}
