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
