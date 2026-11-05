// agent-guide.mjs: /agent-blueprint.md, one file a coding agent can act on after a person hands it the
// address. Plain Node, tested in site/test/agent-guide.test.mjs.
//
// Every install command and the words around it come from the README's install table, read at build time,
// and each tool's check from the "Check:" line of its support note in docs/hosts/. A README that cannot
// support the guide stops the build with an error naming the table and the row: a changed header, a row
// with another number of cells, a Command cell that is not one code span, a Support note that is not one
// link into docs/hosts/, a route with no command, a code span with a space that starts with neither a
// tool's command nor git, a repeated tool, a tool the naming or support table lists and this table does
// not (a blank line inside the table cuts it short), or a relative link in the words. So does a support
// note without exactly one "Check:" line that ends at "Update:", or a README without its 4.0 advice or the
// installer's commands.
//
// Exports
//   GUIDE_PATH                the file's path on the site.
//   ASK_FIRST                 the rule the file opens its install steps with (ruling 108).
//   NO_SECRETS                the rule on secrets in the hosted section.
//   parseCheck(note, file)    what a support note's "Check:" line says, as Markdown.
//   buildAgentGuide(readme, { site, hostNote, preflight })  the file's text. `site` gives the counts, the
//                             version and the addresses, hostNote(tool) a support note's text, preflight
//                             the address of the hosted pre-flight steps. The tools come from `readme`.
//   getAgentGuide(root?)      buildAgentGuide over the repository.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { routeParts } from '../components/docs/route.mjs';
import { getHosted } from '../components/hosted/hosted-data.mjs';
import { HOSTED_PATH } from './hosted-release.mjs';
import { codeSpans, getSection, parseInstall, parseLink, parseTable } from './readme.mjs';
import { findRepoRoot, getSiteData } from './site.mjs';
import { listJoin } from './text.mjs';

export const GUIDE_PATH = '/agent-blueprint.md';
export const ASK_FIRST = 'Ask first, never run first: show your person the commands and run them only once they agree.';
export const NO_SECRETS = 'Never ask your person to paste a secret to you.';

const WHERE = 'Install';
const INSTALL_HEADER = ['Tool', 'Command', 'Install route', 'Support note'];
const TABLE = `README "${WHERE}": table "${INSTALL_HEADER.join(' | ')}"`;
// The tables that list every tool too, by which a row cut from the install table shows.
const OTHER_TABLES = [['Tool', 'How to name a skill'], ['Tool', 'Hooks', 'Helpers', 'Manual-only skills']];
const ONE_ROUTE = /^Give each tool one route[^.]*\./m;
const FROM_4_0 = /If you installed 4\.0, run the installer below once without `--only`\. (It installs [^\n]+)/;
const EVERY_TOOL = 'Set up every tool at once';
const CHECK_HEADING = 'Check that your tool sees the skills';
const RELATIVE_LINK = /\]\((?![a-z][a-z0-9+.-]*:)/i;

function checkTable(readme, tools) {
  const install = getSection(readme, WHERE);
  const seen = new Set();
  for (const [name, command, , note] of parseTable(install.lines, INSTALL_HEADER, WHERE)) {
    if (seen.has(name)) throw new Error(`${TABLE} has two rows for ${name}`);
    seen.add(name);
    if (!/^`[^`\s]+`$/.test(command)) throw new Error(`${TABLE} row ${name}: the Command cell must be one code span, found "${command}"`);
    const { href } = parseLink(note, WHERE);
    if (!/^docs\/hosts\/[^/]+\.md$/.test(href)) throw new Error(`${TABLE} row ${name}: the Support note must link to docs/hosts/<tool>.md, found "${href}"`);
  }
  const starts = new Set([...tools.map((tool) => tool.id), 'git']);
  for (const { name, route, commands } of tools) {
    if (!commands.length) throw new Error(`${TABLE} row ${name}: the Install route holds no command (a code span with a space)`);
    for (const command of commands) {
      if (!starts.has(command.split(/\s/)[0])) {
        throw new Error(`${TABLE} row ${name}: the code span "${command}" reads as a command but starts with neither a tool's command nor git`);
      }
    }
    if (RELATIVE_LINK.test(route)) throw new Error(`${TABLE} row ${name}: the Install route has a relative link, which the guide cannot carry`);
  }
  for (const header of OTHER_TABLES) {
    for (const [cell] of parseTable(install.lines, header, WHERE)) {
      for (const name of cell.split(/,\s*/)) {
        if (!seen.has(name)) throw new Error(`${TABLE} has no row for ${name}, which table "${header.join(' | ')}" lists; check for a removed row or a blank line inside the table`);
      }
    }
  }
}

export function parseCheck(note, file) {
  const lines = note.split('\n').filter((line) => line.startsWith('Check: '));
  if (lines.length !== 1) throw new Error(`${file}: expected one line that starts "Check: ", found ${lines.length}`);
  const check = lines[0].match(/^Check: (.+?) Update: /)?.[1];
  if (!check) throw new Error(`${file}: the "Check: " line must end its check where "Update: " starts`);
  if (!codeSpans(check).length) throw new Error(`${file}: the "Check: " line names no command`);
  return check;
}

function toolSection({ name, id, route, commands, hostDoc }, repoUrl) {
  const file = hostDoc.split('/').at(-1);
  const out = [`## ${name}`, `The command is \`${id}\`. Support note: [${file}](${repoUrl}/blob/main/${hostDoc}).`];
  for (const part of routeParts(route, commands)) {
    out.push(part.kind === 'cmd' ? `\`\`\`bash\n${part.text}\n\`\`\`` : part.md);
  }
  return out;
}

// The README's advice for a machine with a 4.0 install, with the installer's commands, which the tool
// sections do not give.
function from40Section(readme) {
  const what = getSection(readme, WHERE).lines.join('\n').match(FROM_4_0)?.[1];
  if (!what) throw new Error(`README "${WHERE}": the sentence that starts "If you installed 4.0" is gone`);
  const commands = getSection(readme, EVERY_TOOL).lines.join('\n').match(/^```bash\n([\s\S]*?)\n```$/m)?.[1];
  if (!commands?.endsWith('bash agent-blueprint/install.sh')) throw new Error(`README "${EVERY_TOOL}": the first code block must end with the installer, run without options`);
  return [
    '## If 4.0 is installed',
    'If you cannot tell whether it is, ask your person. On a machine with 4.0, follow the same steps with these commands, once, instead of the sections below:',
    `\`\`\`bash\n${commands}\n\`\`\``,
    what,
  ];
}

function checkSection(readme, tools, hostNote) {
  const said = getSection(readme, CHECK_HEADING).lines.filter((line) => line.trim());
  if (!said.length) throw new Error(`README "${CHECK_HEADING}": the section is empty`);
  if (said.some((line) => RELATIVE_LINK.test(line))) throw new Error(`README "${CHECK_HEADING}": a relative link, which the guide cannot carry`);
  return [
    '## Check that it worked',
    ...said,
    "Each CLI's support note gives its own check:",
    tools.map((tool) => `- ${tool.name}: ${parseCheck(hostNote(tool), tool.hostDoc)}`).join('\n'),
  ];
}

/**
 * @param {string} readme
 * @param {{ site: ReturnType<typeof getSiteData>, hostNote: (tool: { hostDoc: string }) => string, preflight: string }} options
 * @returns {string}
 */
export function buildAgentGuide(readme, { site, hostNote, preflight }) {
  const { tools } = parseInstall(readme);
  checkTable(readme, tools);
  const oneRoute = getSection(readme, WHERE).lines.join('\n').match(ONE_ROUTE)?.[0];
  if (!oneRoute) throw new Error(`README "${WHERE}": the sentence that starts "Give each tool one route" is gone`);
  const { siteUrl, repoUrl, counts, version } = site;
  const blocks = [
    '# Agent Blueprint',
    `Agent Blueprint is ${counts.skills} skills and ${counts.helpers} helper prompts that take a coding agent from an idea to a reviewed pull request, in ${tools.length} coding CLIs: ${listJoin(tools.map((tool) => tool.name))}. This is version ${version}, and its source is at <${repoUrl}>.`,
    '## Install it',
    ASK_FIRST,
    [
      "1. Work out which CLI you are running in. Each section below names a CLI's command. If you cannot tell, ask your person.",
      "2. Show your person that section's commands, exactly as written, and ask whether to run them.",
      '3. Run them once they agree, except the steps in 4. Run a `git clone` from a folder outside their project, because the clone stays where it lands.',
      '4. Hand your person the steps you cannot do from here: a slash command, which runs inside a session, and a command that stops to ask for confirmation, which needs their own terminal.',
      '5. Run the check for that CLI and tell your person what it printed. The session you are in may not list the new skills until a new one starts, so go by that check.',
    ].join('\n'),
    oneRoute,
    ...from40Section(readme),
    ...tools.flatMap((tool) => toolSection(tool, repoUrl)),
    ...checkSection(readme, tools, hostNote),
    '## Run it hosted instead',
    'Agent Blueprint also runs as a hosted agent that your person deploys to their own Vercel account, Railway or a server they run, and nothing installs on this computer. You cannot finish this alone, so walk them through it:',
    [
      `1. They create a GitHub App for one repository, by the steps in [Pre-flight](${preflight}).`,
      `2. They deploy from <${siteUrl}${HOSTED_PATH}>, where they choose where it runs and how they reach it.`,
      "3. They enter each secret in their host's dashboard, or in their server's environment when they run their own.",
    ].join('\n'),
    NO_SECRETS,
    '## Read more',
    [
      `- [llms.txt](${siteUrl}/llms.txt) lists every page and skill on the site.`,
      `- [Skills](${siteUrl}/skills/) has every skill by phase.`,
      `- Any page under /docs/, /tutorials/ or /guides/ is available as Markdown at its address plus .md, without the final slash, for example <${siteUrl}/docs/getting-started.md>.`,
    ].join('\n'),
  ];
  return `${blocks.join('\n\n')}\n`;
}

export function getAgentGuide(root = findRepoRoot()) {
  return buildAgentGuide(readFileSync(join(root, 'README.md'), 'utf8'), {
    site: getSiteData(root),
    hostNote: (tool) => readFileSync(join(root, tool.hostDoc), 'utf8'),
    preflight: getHosted(root).links.preflight,
  });
}
