// site.mjs: the shared site data contract (COMMON.md), built from the repository. Plain Node, no astro:
// imports, so pages, content.config.ts and the node:test suite all use the same code.
//
// Exports
//   SITE_URL                 the production origin (astro.config.mjs `site` holds the same value).
//   findRepoRoot(start?)     the nearest folder at or above `start` that holds .claude-plugin/plugin.json and
//                            README.md, memoized per start. The default start is this module's folder, which
//                            also works from a bundled build chunk because the build output stays inside site/.
//   getSiteData(root?)       synchronous and memoized per root:
//     { version, repoUrl, siteUrl,
//       counts: { skills, helpers, hooks, tools, phases },  skills/helpers/hooks follow scripts/check-drift.sh
//       cloneCommand, installCommand,
//       tools: [{ name, id, route, commands, hostDoc, naming: { syntax, example }, support: { hooks, helpers, manualOnly } }],
//       phases: [{ slug, title, skills: [name] }],
//       skills: [{ name, phase, summary, when, description, helpers: [{ name, path }], related, prev, next, githubUrl }],
//       helpers: [{ name, skill, path, summary, when, usedBy: [skill] }],
//       releases: [{ version, date, summary, notes }] }
//     version and repoUrl come from .claude-plugin/plugin.json (`version`, `repository`); the rest from
//     README.md, skills/ and hooks/ through readme.mjs and skills.mjs. A helper's usedBy lists every skill
//     whose references/agents/ holds that prompt. A release's notes is the Markdown of
//     docs/releases/v<version>-release-notes.md without its title line and the sentence that says the
//     file is the GitHub release body, or null when there is no such file.
//   getReadmePages(root?)    extractPages() over README.md with the readme-map.mjs pages: the Markdown each
//                            Docs and Guides page renders (see readme.mjs).

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { extractPages, parseHelpers, parseInstall, parsePhases, parseReleases } from './readme.mjs';
import { ANCHOR_FALLBACKS, README_PAGES } from './readme-map.mjs';
import { countHelperPrompts, countHooks, countSkillFiles, helperLister, joinSkills, listSkillFolders } from './skills.mjs';

export const SITE_URL = 'https://agent-blueprint.dbenger.com';

const roots = new Map();

export function findRepoRoot(start = dirname(fileURLToPath(import.meta.url))) {
  if (roots.has(start)) return roots.get(start);
  for (let dir = start; ; dir = dirname(dir)) {
    if (existsSync(join(dir, '.claude-plugin', 'plugin.json')) && existsSync(join(dir, 'README.md'))) {
      roots.set(start, dir);
      return dir;
    }
    if (dirname(dir) === dir) throw new Error(`No repository root (.claude-plugin/plugin.json) at or above ${start}`);
  }
}

function readPlugin(root) {
  return JSON.parse(readFileSync(join(root, '.claude-plugin', 'plugin.json'), 'utf8'));
}

function readReleaseNotes(root, version) {
  const file = join(root, 'docs', 'releases', `v${version}-release-notes.md`);
  if (!existsSync(file)) return null;
  const body = readFileSync(file, 'utf8')
    .replace(/^# .*\n/, '')
    .trim()
    .replace(/^The body for the GitHub release\.\s*/, '');
  return `${body}\n`;
}

const cache = new Map();

export function getSiteData(root = findRepoRoot()) {
  if (cache.has(root)) return cache.get(root);
  const readme = readFileSync(join(root, 'README.md'), 'utf8');
  const plugin = readPlugin(root);
  const repoUrl = plugin.repository;
  const folders = listSkillFolders(root);
  const phases = parsePhases(readme);
  const install = parseInstall(readme);
  // each skill's references/agents/ is read once, for the count, the skills and usedBy
  const helpersOf = helperLister(root);
  const usedBy = (name) => folders.filter((skill) => helpersOf(skill).some((h) => h.name === name));
  const data = {
    version: plugin.version,
    repoUrl,
    siteUrl: SITE_URL,
    counts: {
      skills: countSkillFiles(root),
      helpers: countHelperPrompts(root, helpersOf),
      hooks: countHooks(root),
      tools: install.tools.length,
      phases: phases.length,
    },
    cloneCommand: install.cloneCommand,
    installCommand: install.installCommand,
    tools: install.tools,
    phases: phases.map(({ slug, title, skills }) => ({ slug, title, skills: skills.map((s) => s.name) })),
    skills: joinSkills({ root, folders, phases, repoUrl, helpersOf }),
    helpers: parseHelpers(readme).map((helper) => ({ ...helper, usedBy: usedBy(helper.name) })),
    releases: parseReleases(readme).map((release) => ({ ...release, notes: readReleaseNotes(root, release.version) })),
  };
  cache.set(root, data);
  return data;
}

export function getReadmePages(root = findRepoRoot()) {
  const readme = readFileSync(join(root, 'README.md'), 'utf8');
  return extractPages(readme, README_PAGES, {
    repoUrl: readPlugin(root).repository,
    repoRoot: root,
    anchorFallbacks: ANCHOR_FALLBACKS,
  });
}
