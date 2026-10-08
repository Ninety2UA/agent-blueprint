// Tests for site/src/lib/readme.mjs against the real README.md and broken copies of it.
// Every expected count, name and version is read from the tree or .claude-plugin/plugin.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  extractPages,
  getSection,
  parseHelpers,
  parseInstall,
  parsePhases,
  parseReleases,
} from '../src/lib/readme.mjs';
import { ANCHOR_FALLBACKS, README_PAGES } from '../src/lib/readme-map.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const README = readFileSync(join(ROOT, 'README.md'), 'utf8');
const PLUGIN = JSON.parse(readFileSync(join(ROOT, '.claude-plugin/plugin.json'), 'utf8'));
const OPTIONS = { repoUrl: PLUGIN.repository, repoRoot: ROOT, anchorFallbacks: ANCHOR_FALLBACKS };

const skillFolders = readdirSync(join(ROOT, 'skills'), { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(ROOT, 'skills', d.name, 'SKILL.md')))
  .map((d) => d.name)
  .sort();

// The drift gate's helper-prompt rule, written out again here as the test's own oracle:
// distinct file names under skills/*/references/agents/, minus companion notes
// (<prompt>-<topic>.md next to <prompt>.md).
function helperPromptNames() {
  const names = new Set();
  for (const skill of skillFolders) {
    const dir = join(ROOT, 'skills', skill, 'references', 'agents');
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.md'))) {
      const parts = file.slice(0, -3).split('-');
      let companion = false;
      for (let i = parts.length - 1; i > 0; i--) {
        if (existsSync(join(dir, `${parts.slice(0, i).join('-')}.md`))) companion = true;
      }
      if (!companion) names.add(file.slice(0, -3));
    }
  }
  return names;
}

// Lines of the README between "## <title>" and the next "## " heading, read without the parser.
function rawSectionLines(title) {
  const lines = README.split('\n');
  const start = lines.indexOf(`## ${title}`);
  assert.ok(start >= 0, `README has no "## ${title}" heading`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith('## '));
  return end === -1 ? rest : rest.slice(0, end);
}

test('the phase tables cover every skill folder exactly once', () => {
  const phases = parsePhases(README);
  const phaseHeadings = rawSectionLines('Skills reference').filter((l) => l.startsWith('### '));
  assert.equal(phases.length, phaseHeadings.length);
  const names = phases.flatMap((p) => p.skills.map((s) => s.name));
  assert.equal(new Set(names).size, names.length, 'a skill appears in two phase tables');
  assert.deepEqual([...names].sort(), skillFolders);
  for (const phase of phases) {
    assert.match(phase.slug, /^[a-z]+(-[a-z]+)*$/);
    assert.ok(phase.title.length > 0);
    for (const skill of phase.skills) assert.ok(skill.summary.length > 0, `${skill.name} has no summary`);
  }
  assert.ok(phases.some((p) => p.slug === 'quality'));
  assert.ok(phases.some((p) => p.slug === 'session-management'));
});

test('the helper table has one row per helper prompt in the tree, each linking to an existing file', () => {
  const helpers = parseHelpers(README);
  const expected = helperPromptNames();
  assert.equal(helpers.length, expected.size);
  assert.deepEqual(new Set(helpers.map((h) => h.name)), expected);
  for (const helper of helpers) {
    assert.ok(existsSync(join(ROOT, helper.path)), `${helper.name} links to missing ${helper.path}`);
    assert.equal(helper.path, `skills/${helper.skill}/references/agents/${helper.name}.md`);
    assert.ok(helper.summary.length > 0);
  }
});

test('the install, naming and support tables give one entry per host the installer knows', () => {
  const hostsSh = readFileSync(join(ROOT, 'skills/ab-ship-pipeline/scripts/hosts.sh'), 'utf8');
  const hostIds = hostsSh.match(/^AB_HOSTS="([^"]+)"/m)[1].split(' ');
  const install = parseInstall(README);
  assert.deepEqual(install.tools.map((t) => t.id), hostIds);
  assert.match(install.cloneCommand, /^git clone \S+\ncd \S+$/);
  assert.equal(install.installCommand, 'bash install.sh');
  for (const tool of install.tools) {
    assert.ok(existsSync(join(ROOT, tool.hostDoc)), `${tool.name} host doc ${tool.hostDoc} is missing`);
    assert.ok(tool.commands.length > 0, `${tool.name} has no install command`);
    for (const command of tool.commands) assert.match(command, /\s/, `"${command}" is not a command`);
    assert.ok(tool.route.includes(tool.commands[0]));
    for (const key of ['hooks', 'helpers', 'manualOnly']) assert.ok(tool.support[key].length > 0);
  }
  const byId = Object.fromEntries(install.tools.map((t) => [t.id, t]));
  assert.deepEqual(byId.claude.naming, { syntax: '/', example: '/ab-brainstorming' });
  assert.deepEqual(byId.codex.naming, { syntax: '$', example: '$ab-brainstorming' });
  assert.deepEqual(byId.pi.naming, { syntax: '/skill:', example: '/skill:ab-brainstorming' });
  assert.deepEqual(byId.amp.naming, { syntax: null, example: 'use the ab-brainstorming skill' });
  assert.equal(byId.hermes.commands[0], 'bash install.sh --only hermes');
  assert.ok(!byId.hermes.commands.includes('~/.agents/skills'), 'a path is not a command');
});

test('a README without the "Skills reference" heading makes the parser name the missing section', () => {
  const broken = README.replace('\n## Skills reference\n', '\n');
  assert.notEqual(broken, README);
  assert.throws(() => parsePhases(broken), /Skills reference/);
});

test('a README whose install table lost its header makes the parser name the table', () => {
  const broken = README.replace('| Tool | Command | Install route | Support note |', '| Tool | Route |');
  assert.notEqual(broken, README);
  assert.throws(() => parseInstall(broken), /Install.*Tool \| Command \| Install route \| Support note/s);
});

test('the release history starts at the plugin version and keeps the README dates', () => {
  const releases = parseReleases(README);
  assert.equal(releases[0].version, PLUGIN.version);
  const rows = rawSectionLines('Release history')
    .map((l) => l.match(/^\| v(\d[^ |]*) \| ([^ |]+) \|/))
    .filter(Boolean)
    .map((m) => ({ version: m[1], date: m[2] }));
  assert.ok(rows.length > 0);
  assert.deepEqual(releases.map(({ version, date }) => ({ version, date })), rows);
  for (const release of releases) assert.ok(release.summary.length > 0);
});

test('every heading in the README map resolves to a section of the real README', () => {
  for (const page of README_PAGES) {
    for (const heading of page.headings) {
      assert.doesNotThrow(() => getSection(README, heading), `${page.slug}: "${heading}"`);
    }
  }
  const pages = extractPages(README, README_PAGES, OPTIONS);
  assert.deepEqual(pages.map((p) => p.slug), README_PAGES.map((p) => p.slug));
  for (const page of pages) assert.ok(page.markdown.trim().length > 0, `${page.slug} is empty`);
});

test('a README with a mapped heading renamed makes extraction name the page that maps it', () => {
  const broken = README.replace('\n## Error recovery\n', '\n## When things break\n');
  assert.notEqual(broken, README);
  assert.throws(() => extractPages(broken, README_PAGES, OPTIONS), /error-recovery.*Error recovery/s);
});

test('extracted sections link README anchors to site pages and repository paths to GitHub', () => {
  const extra = [
    '',
    'The skill is [ab-migrate](skills/ab-migrate/), its first step is [Get the code](#1-get-the-code),',
    'the catalog is [Skills](#skills-reference) and the gates are [Quality gates](#quality-gates).',
    '',
  ].join('\n');
  const readme = README.replace('\n## Update\n', `${extra}\n## Update\n`);
  const pages = Object.fromEntries(extractPages(readme, README_PAGES, OPTIONS).map((p) => [p.slug, p]));
  const url = (slug) => README_PAGES.find((p) => p.slug === slug).url;
  assert.ok(pages['quick-start'].markdown.includes(`[Install](${url('getting-started')})`));
  assert.ok(!/\]\(#/.test(pages['quick-start'].markdown));
  const upgrade = pages['upgrade-from-v3'].markdown;
  assert.ok(upgrade.includes(`[ab-migrate](${PLUGIN.repository}/tree/main/skills/ab-migrate/)`));
  assert.ok(upgrade.includes(`[Get the code](${url('getting-started')}#1-get-the-code)`), 'a subsection anchor keeps its fragment');
  // A heading no page renders links to its fallback page.
  assert.ok(upgrade.includes('[Skills](/skills/)'));
  assert.ok(upgrade.includes('[Quality gates](/workflow/)'));
  assert.ok(pages['getting-started'].markdown.includes(`(${PLUGIN.repository}/blob/main/docs/hosts/claude-code.md)`));
  assert.ok(pages.faq.markdown.includes(`[Tested in each tool](${url('tested-in-each-tool')})`));
  for (const page of Object.values(pages)) {
    assert.ok(!/\]\((?!https?:|\/|\.\/docs\/images\/)[^)]+\)/.test(page.markdown), `${page.slug} keeps a relative link`);
  }
});

test('extracted sections keep inline code, tables and fenced code, and reference README images', () => {
  const pages = Object.fromEntries(extractPages(README, README_PAGES, OPTIONS).map((p) => [p.slug, p]));
  const start = pages['getting-started'].markdown;
  assert.ok(start.includes('```bash\ngit clone https://github.com/Ninety2UA/agent-blueprint.git\ncd agent-blueprint\n```'));
  assert.ok(start.includes('| Tool | Command | Install route | Support note |'));
  assert.ok(start.includes('`<checkout>`'));
  assert.match(start, /^## 1\. Get the code$/m, 'subsections become H2 when a page renders one section');
  assert.ok(!/^## Install$/m.test(start), 'the page title replaces the section heading');
  assert.match(start, /!\[One skills folder installed into eight tools[^\]]*\]\(\.\/docs\/images\/eight-tools\.png\)/);
  assert.ok(!start.includes('<img'), 'README <img> tags become Markdown images');
  for (const page of Object.values(pages)) {
    for (const image of page.images) assert.ok(existsSync(join(ROOT, image)), `${page.slug}: ${image} is missing`);
  }
  const project = pages['project-files'].markdown;
  assert.match(project, /^## What you get$/m, 'each section is an H2 when a page renders several');
  assert.match(project, /^### Project structure$/m);
});

test('no README section renders on two pages', () => {
  const pages = extractPages(README, README_PAGES, OPTIONS);
  const owner = new Map();
  for (const page of pages) {
    for (const line of page.markdown.split('\n').filter((l) => /^#{2,6} /.test(l))) {
      const text = line.replace(/^#+ /, '');
      assert.ok(!owner.has(text) || owner.get(text) === page.slug, `"${text}" is on ${owner.get(text)} and ${page.slug}`);
      owner.set(text, page.slug);
    }
  }
  assert.ok(!pages.find((p) => p.slug === 'how-it-works').markdown.includes('handoff note between sessions'));
  assert.ok(pages.find((p) => p.slug === 'session-continuity').markdown.includes('handoff note between sessions'));
});
