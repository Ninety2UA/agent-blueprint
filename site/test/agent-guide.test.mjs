// Tests for site/src/lib/agent-guide.mjs: /agent-blueprint.md holds each CLI's commands exactly as the
// README's install table does, the ask-first rule and no request for a secret, and a table it cannot use
// stops the build with a message naming the problem.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ASK_FIRST, buildAgentGuide, getAgentGuide, GUIDE_PATH, NO_SECRETS, parseCheck } from '../src/lib/agent-guide.mjs';
import { findRepoRoot, getSiteData } from '../src/lib/site.mjs';

const root = findRepoRoot();
const README = readFileSync(join(root, 'README.md'), 'utf8');
const site = getSiteData();
const guide = getAgentGuide();

const options = { site, hostNote: (tool) => readFileSync(join(root, tool.hostDoc), 'utf8'), preflight: 'https://example.test/pre-flight' };
const build = (readme) => buildAgentGuide(readme, options);

// Replaces one exact piece of the README text, failing when the piece is gone.
function edit(from, to) {
  assert.ok(README.includes(from), `README.md no longer contains: ${from}`);
  return README.replace(from, to);
}

const rowOf = (name) => README.split('\n').find((line) => line.startsWith(`| ${name} | \``));
const fences = (text) => [...text.matchAll(/^```bash\n([\s\S]*?)\n```$/gm)].map((m) => m[1]);
const sectionOf = (name) => {
  const start = guide.indexOf(`\n## ${name}\n`);
  assert.notEqual(start, -1, `no section for ${name}`);
  const end = guide.indexOf('\n## ', start + 1);
  return guide.slice(start, end);
};

test('the guide opens with the product and the counts from the site data', () => {
  const [title, , lead] = guide.split('\n');
  assert.equal(title, '# Agent Blueprint');
  assert.ok(lead.includes(`${site.counts.skills} skills`), lead);
  assert.ok(lead.includes(`${site.counts.helpers} helper prompts`), lead);
  assert.ok(lead.includes(`${site.counts.tools} coding CLIs`), lead);
});

test('its sections come in the agreed order, one per CLI in table order', () => {
  const headings = guide.split('\n').filter((line) => line.startsWith('## ')).map((line) => line.slice(3));
  assert.deepEqual(headings, [
    'Install it',
    'If 4.0 is installed',
    ...site.tools.map((tool) => tool.name),
    'Check that it worked',
    'Run it hosted instead',
    'Read more',
  ]);
});

test('every CLI section holds that row\'s commands exactly, in the README\'s order', () => {
  for (const tool of site.tools) {
    assert.deepEqual(fences(sectionOf(tool.name)), tool.commands, tool.name);
    assert.ok(sectionOf(tool.name).includes(`\`${tool.id}\``), tool.name);
    for (const command of tool.commands) assert.ok(rowOf(tool.name).includes(`\`${command}\``), command);
  }
});

test('the words of a route stay, so a follow-up step reaches the person', () => {
  assert.match(sectionOf('Codex'), /then trust the hooks in `\/hooks`/);
  assert.match(sectionOf('Grok Build'), /then confirm when it asks/);
  assert.match(sectionOf('Cursor CLI'), /then run `\/plugin` in a session and install agent-blueprint/);
});

test('the guide names no install command the README does not hold', () => {
  const held = site.tools.flatMap((tool) => tool.commands);
  for (const command of fences(guide)) assert.ok(held.includes(command) || README.includes(`\`\`\`bash\n${command}\n\`\`\``), command);
  const spans = [...guide.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]);
  for (const span of spans.filter((s) => /\b(install|add)\b/.test(s) && /\s/.test(s))) {
    assert.ok(README.includes(span), `the guide names "${span}", which README.md does not hold`);
  }
});

test('a change to a command in the README flows into the guide', () => {
  const text = build(edit('`pi install git:github.com/Ninety2UA/agent-blueprint`', '`pi install git:github.com/example/moved`'));
  assert.ok(text.includes('```bash\npi install git:github.com/example/moved\n```'));
  assert.ok(!text.includes('pi install git:github.com/Ninety2UA/agent-blueprint'));
});

test('the ask-first rule stands before any command', () => {
  assert.equal(guide.split(ASK_FIRST).length, 2);
  assert.ok(guide.indexOf(ASK_FIRST) < guide.indexOf('```bash'));
  assert.match(ASK_FIRST, /ask first, never run first/i);
});

test('a machine with 4.0 gets the installer before the tool sections, with what it removes', () => {
  const at = guide.indexOf('## If 4.0 is installed');
  assert.ok(at > guide.indexOf(ASK_FIRST));
  assert.ok(at < guide.indexOf('## Claude Code'));
  const section = guide.slice(at, guide.indexOf('## Claude Code'));
  assert.match(section, /bash agent-blueprint\/install\.sh\n```/);
  for (const folder of ['~/.agents/skills', '~/.grok/skills', '~/.pi/agent/skills']) assert.ok(section.includes(folder), folder);
});

test('the steps hand confirmations to the person and keep a clone out of the project', () => {
  assert.match(guide, /a command that stops to ask for confirmation, which needs their own terminal/);
  assert.match(guide, /Run a `git clone` from a folder outside their project/);
});

test('the guide never asks for a secret: the one line about pasting one forbids it', () => {
  const lines = guide.split('\n').filter((line) => /\bpaste/i.test(line));
  assert.deepEqual(lines, [NO_SECRETS]);
  assert.match(NO_SECRETS, /^Never ask /);
  const hosted = sectionOf('Run it hosted instead');
  assert.match(hosted, /GitHub App for one repository/);
  assert.match(hosted, /https:\/\/agent-blueprint\.dbenger\.com\/hosted\//);
  assert.match(hosted, /their host's dashboard/);
  assert.match(hosted, /You cannot finish this alone/);
});

test('the check section says only what the README and the support notes say', () => {
  const check = sectionOf('Check that it worked');
  assert.ok(check.includes('Start a session and ask which skills it has that start with `ab-`.'));
  for (const tool of site.tools) {
    const said = parseCheck(options.hostNote(tool), tool.hostDoc);
    assert.ok(check.includes(`- ${tool.name}: ${said}`), tool.name);
    assert.ok(options.hostNote(tool).includes(`Check: ${said} Update: `), tool.name);
  }
});

test('it points to llms.txt, the Skills page and the Markdown pages', () => {
  const more = guide.slice(guide.indexOf('\n## Read more\n'));
  assert.ok(more.includes(`${site.siteUrl}/llms.txt`));
  assert.ok(more.includes(`${site.siteUrl}/skills/`));
  assert.ok(more.includes(`${site.siteUrl}/docs/getting-started.md`));
});

test('it makes none of the claims the product does not make', () => {
  for (const claim of [/\bsecure/i, /one[- ]click/i, /any repositor/i, /\busers\b/i, /\bpric(e|ing)\b/i, /\bfree\b/i]) {
    assert.doesNotMatch(guide, claim);
  }
  assert.doesNotMatch(guide, /[–—]/, 'no em or en dash');
});

const HEADER = '| Tool | Command | Install route | Support note |';

for (const [what, text, message] of [
  ['a renamed column', () => edit(HEADER, '| Tool | Binary | Install route | Support note |'), /table "Tool \| Command \| Install route \| Support note" not found/],
  ['an added column', () => edit(HEADER, `${HEADER} Since |`), /table "Tool \| Command \| Install route \| Support note" not found/],
  ['a row with another number of cells', () => edit(rowOf('Pi'), `${rowOf('Pi')} extra |`), /has a row with 5 cells, expected 4/],
  ['a Command cell with two code spans', () => edit('| Pi | `pi` |', '| Pi | `pi` or `pi2` |'), /row Pi: the Command cell must be one code span/],
  ['a Command cell with no code span', () => edit('| Pi | `pi` |', '| Pi | pi |'), /row Pi has no command/],
  ['a Support note that is plain text', () => edit('[pi.md](docs/hosts/pi.md)', 'see pi.md'), /expected a single link/],
  ['a Support note outside docs/hosts/', () => edit('[pi.md](docs/hosts/pi.md)', '[pi.md](docs/pi.md)'), /row Pi: the Support note must link to docs\/hosts/],
  ['a route with no command', () => edit('`pi install git:github.com/Ninety2UA/agent-blueprint`', 'the usual way'), /row Pi: the Install route holds no command/],
  ['a code span that reads as a command and is not one', () => edit('`pi install git:github.com/Ninety2UA/agent-blueprint`', '`pi install git:github.com/Ninety2UA/agent-blueprint`, or `see the docs`'), /row Pi: the code span "see the docs" reads as a command/],
  ['a repeated row', () => edit(rowOf('Pi'), `${rowOf('Pi')}\n${rowOf('Pi')}`), /has two rows for Pi/],
  ['a blank line that cuts the table short', () => edit(rowOf('Hermes'), `\n${rowOf('Hermes')}`), /has no row for Hermes/],
  ['a removed row', () => edit(`${rowOf('Pi')}\n`, ''), /has no row for Pi/],
  ['a relative link in a route', () => edit('Antigravity needs the full URL', 'Antigravity needs [the full URL](#install)'), /row Antigravity: the Install route has a relative link/],
  ['no sentence about one route', () => edit('Give each tool one route', 'Give a tool one route'), /Give each tool one route/],
  ['no advice for a 4.0 install', () => edit('If you installed 4.0, run', 'If you had 4.0, run'), /If you installed 4\.0/],
  ['no installer block', () => edit('bash agent-blueprint/install.sh\n```', 'bash agent-blueprint/setup.sh\n```'), /first code block must end with the installer/],
  ['a relative link in the check section', () => edit('Start a session and ask which skills it has that start with `ab-`.', 'Start a session and ask which skills it has that start with [`ab-`](#install).'), /"Check that your tool sees the skills": a relative link/],
  ['no check section', () => edit('### Check that your tool sees the skills', '### Check your tool'), /Check that your tool sees the skills/],
]) {
  test(`${what} stops the build with a message naming the problem`, () => {
    assert.throws(() => build(text()), message);
  });
}

test('a support note the guide cannot read stops the build, naming the file', () => {
  assert.throws(() => parseCheck('No check here.', 'docs/hosts/pi.md'), /docs\/hosts\/pi\.md: expected one line that starts "Check: ", found 0/);
  assert.throws(() => parseCheck('Check: `a b`.\nCheck: `c d`.', 'docs/hosts/pi.md'), /found 2/);
  assert.throws(() => parseCheck('Check: `pi list` shows it.', 'docs/hosts/pi.md'), /must end its check where "Update: " starts/);
  assert.throws(() => parseCheck('Check: look at it. Update: later.', 'docs/hosts/pi.md'), /names no command/);
});

const built = join(root, 'site', 'dist', GUIDE_PATH.slice(1));
test('the build writes the guide at its path', { skip: !existsSync(built) && 'site/dist is not built (run npm run build in site/)' }, () => {
  assert.equal(readFileSync(built, 'utf8'), guide);
});
