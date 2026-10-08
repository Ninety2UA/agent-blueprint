// site.mjs: the shared site data contract (COMMON.md), built from the repository. Plain Node, no astro:
// imports, so pages, content.config.ts and the node:test suite all use the same code.
//
// Exports
//   SITE_URL                 the production origin (astro.config.mjs `site` holds the same value).
//   findRepoRoot(start?)     the nearest folder at or above `start` that holds .claude-plugin/plugin.json and
//                            README.md, memoized per start. The default start is this module's folder, which
//                            also works from a bundled build chunk because the build output stays inside site/.
//   getSiteData(root?)       a SiteData (the typedefs below), synchronous and memoized per root. version
//                            and repoUrl come from .claude-plugin/plugin.json (`version`, `repository`);
//                            the rest from README.md, skills/ and hooks/ through readme.mjs and skills.mjs.
//                            The typedefs are the one statement of the shape: .ts and .astro files get
//                            them from the return type, or by name with `import type { Skill } from`
//                            this file, so a field renamed in a typedef fails `astro check` wherever it
//                            is read. This file's own code is not type-checked against them; rename a
//                            field in the typedef and in getSiteData together.
//   getReadmePages(root?)    extractPages() over README.md with the readme-map.mjs pages: the Markdown each
//                            Docs and Guides page renders (see readme.mjs).

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { extractPages, parseHelpers, parseInstall, parsePhases, parseReleases } from './readme.mjs';
import { ANCHOR_FALLBACKS, README_PAGES } from './readme-map.mjs';
import { countHelperPrompts, countHooks, helperLister, joinSkills, listSkillFolders } from './skills.mjs';

export const SITE_URL = 'https://agent-blueprint.dbenger.com';

/**
 * @typedef {object} Counts  current-state counts: skills is one per skill folder (skills.mjs), helpers
 *   and hooks follow scripts/check-drift.sh, tools and phases count the README install and phase tables.
 * @property {number} skills
 * @property {number} helpers
 * @property {number} hooks
 * @property {number} tools
 * @property {number} phases
 */
/**
 * @typedef {object} Tool  one row of the README install table, in table order.
 * @property {string} name  "Claude Code"
 * @property {string} id  the Command column ("claude"), also install.sh --only <id>
 * @property {string} route  the Install route cell, as Markdown
 * @property {string[]} commands  the commands in that cell, in order
 * @property {string} hostDoc  "docs/hosts/claude-code.md"
 * @property {{ syntax: string | null, example: string }} naming  from the naming table
 * @property {{ hooks: string, helpers: string, manualOnly: string }} support  cells of the support table
 */
/**
 * @typedef {object} Phase  one "Skills reference" table.
 * @property {string} slug  "session-management"
 * @property {string} title  the heading without " phase"
 * @property {string[]} skills  skill names, in table order
 */
/**
 * @typedef {object} Skill  one skill folder, in phase-table order.
 * @property {string} name
 * @property {string} phase  the phase slug
 * @property {string} summary  the README row's summary cell
 * @property {string} when  the README row's "use when" cell
 * @property {string} description  the SKILL.md frontmatter description
 * @property {{ name: string, path: string }[]} helpers  the prompts in its references/agents/
 * @property {string[]} related  the other skills of its phase
 * @property {string | null} prev  the neighbor in phase-table order, null at the ends
 * @property {string | null} next
 * @property {string} githubUrl
 */
/**
 * @typedef {object} Helper  one row of the README "Helper prompts reference".
 * @property {string} name
 * @property {string} skill  the folder the row links into
 * @property {string} path
 * @property {string} summary  the Domain cell
 * @property {string} when
 * @property {string[]} usedBy  every skill whose references/agents/ holds this prompt
 */
/**
 * @typedef {object} Release  one row of the README release history, newest first.
 * @property {string} version  without the leading "v"
 * @property {string} date
 * @property {string} summary
 * @property {string | null} notes  the Markdown of docs/releases/v<version>-release-notes.md without its
 *   title line and the sentence that says the file is the GitHub release body; null without that file
 */
/**
 * @typedef {object} SiteData
 * @property {string} version  "4.0.1"
 * @property {string} repoUrl
 * @property {string} siteUrl
 * @property {Counts} counts
 * @property {string} cloneCommand  the lines under README "### 1. Get the code", newline-separated
 * @property {string} installCommand  "bash install.sh"
 * @property {Tool[]} tools
 * @property {Phase[]} phases
 * @property {Skill[]} skills
 * @property {Helper[]} helpers
 * @property {Release[]} releases
 */

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

/** @type {Map<string, SiteData>} */
const cache = new Map();

/**
 * @param {string} [root]
 * @returns {SiteData}
 */
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
      skills: folders.length,
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
