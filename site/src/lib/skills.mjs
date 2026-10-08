// skills.mjs: reads the skill tree and joins it with the README phase tables (KTD2). Plain Node.
//
// Counting follows scripts/check-drift.sh, so the site and the drift gate agree:
//   skills   every file named SKILL.md under skills/
//   helpers  distinct prompt names under skills/*/references/agents/, companion notes left out
//            (<prompt>-<topic>.md beside <prompt>.md; the gate's loop and is_companion() in
//            tests/gates/test_prompt_files.py use the same rule)
//   hooks    "command" entries in hooks/claude-code.json
//
// Exports
//   listSkillFolders(root)          sorted folder names under skills/ that hold a SKILL.md.
//   readFrontmatter(text, where)    the SKILL.md frontmatter as an object: top-level scalars and one level
//                                   of nested scalars (metadata.version). Throws naming `where` on a line it
//                                   cannot read or a block scalar (| or >), rather than guess.
//   listHelperFiles(root, skill)    [{ name, path }] for the helper prompts in skills/<skill>/references/agents/,
//                                   sorted by name, companion notes left out; path is repository-relative.
//   helperLister(root)              skill => listHelperFiles(root, skill), memoized: each folder is read once and
//                                   its list reused. countHelperPrompts and joinSkills take one as `helpersOf`;
//                                   without it they read the folders themselves.
//   countSkillFiles(root), countHelperPrompts(root, helpersOf?), countHooks(root)  the drift gate's three counts.
//   joinSkills({ root, folders, phases, repoUrl, helpersOf? })
//                                   [{ name, phase, summary, when, description, helpers, related, prev, next,
//                                   githubUrl }] in phase-table order. phase is the phase slug, summary and
//                                   when the README row's cells, description the SKILL.md frontmatter's,
//                                   related the other skills in the same phase, prev and next the neighbors
//                                   in that order (null at the ends). Throws naming every folder that is in
//                                   no phase table.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export function listSkillFolders(root) {
  return readdirSync(join(root, 'skills'), { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(root, 'skills', d.name, 'SKILL.md')))
    .map((d) => d.name)
    .sort();
}

function scalar(raw, where) {
  if (raw.startsWith('"')) return JSON.parse(raw);
  if (raw.startsWith("'")) return raw.slice(1, -1).replace(/''/g, "'");
  if (/^[|>]/.test(raw)) throw new Error(`${where}: block scalars are not read here; write the value on one line`);
  if (raw === 'true' || raw === 'false') return raw === 'true';
  return raw;
}

export function readFrontmatter(text, where) {
  const block = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!block) throw new Error(`${where}: no frontmatter`);
  const data = {};
  let parent = null;
  for (const line of block[1].split('\n')) {
    if (!line.trim()) continue;
    const m = line.match(/^(\s*)([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!m) throw new Error(`${where}: cannot read frontmatter line "${line}"`);
    const [, indent, key, raw] = m;
    if (indent) {
      if (!parent) throw new Error(`${where}: indented line "${line}" has no parent key`);
      data[parent][key] = scalar(raw, where);
    } else if (raw === '') {
      data[key] = {};
      parent = key;
    } else {
      data[key] = scalar(raw, where);
      parent = null;
    }
  }
  return data;
}

function isCompanion(stem, stems) {
  const parts = stem.split('-');
  for (let i = parts.length - 1; i > 0; i--) {
    if (stems.has(parts.slice(0, i).join('-'))) return true;
  }
  return false;
}

export function listHelperFiles(root, skill) {
  const dir = join(root, 'skills', skill, 'references', 'agents');
  if (!existsSync(dir)) return [];
  const stems = new Set(
    readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isFile() && d.name.endsWith('.md'))
      .map((d) => d.name.slice(0, -3)),
  );
  return [...stems]
    .filter((stem) => !isCompanion(stem, stems))
    .sort()
    .map((name) => ({ name, path: `skills/${skill}/references/agents/${name}.md` }));
}

export function helperLister(root) {
  const lists = new Map();
  return (skill) => {
    if (!lists.has(skill)) lists.set(skill, listHelperFiles(root, skill));
    return lists.get(skill);
  };
}

export function countSkillFiles(root) {
  return readdirSync(join(root, 'skills'), { recursive: true, withFileTypes: true }).filter(
    (d) => d.isFile() && d.name === 'SKILL.md',
  ).length;
}

export function countHelperPrompts(root, helpersOf = (skill) => listHelperFiles(root, skill)) {
  const skills = readdirSync(join(root, 'skills'), { withFileTypes: true }).filter((d) => d.isDirectory());
  return new Set(skills.flatMap((d) => helpersOf(d.name).map((h) => h.name))).size;
}

export function countHooks(root) {
  const config = JSON.parse(readFileSync(join(root, 'hooks', 'claude-code.json'), 'utf8'));
  return Object.values(config.hooks ?? {})
    .flat()
    .flatMap((group) => group.hooks ?? [])
    .filter((hook) => hook.type === 'command').length;
}

export function joinSkills({ root, folders, phases, repoUrl, helpersOf = (skill) => listHelperFiles(root, skill) }) {
  const listed = new Set(phases.flatMap((p) => p.skills.map((s) => s.name)));
  const missing = folders.filter((name) => !listed.has(name));
  if (missing.length) {
    throw new Error(`README "Skills reference": no phase table lists the skill folder(s) ${missing.join(', ')}`);
  }
  const order = phases.flatMap((phase) => phase.skills.map((row) => ({ phase, row })));
  return order.map(({ phase, row }, i) => {
    const file = join(root, 'skills', row.name, 'SKILL.md');
    const frontmatter = readFrontmatter(readFileSync(file, 'utf8'), `skills/${row.name}/SKILL.md`);
    return {
      name: row.name,
      phase: phase.slug,
      summary: row.summary,
      when: row.when,
      description: frontmatter.description,
      helpers: helpersOf(row.name),
      related: phase.skills.map((s) => s.name).filter((name) => name !== row.name),
      prev: i > 0 ? order[i - 1].row.name : null,
      next: i < order.length - 1 ? order[i + 1].row.name : null,
      githubUrl: `${repoUrl}/blob/main/skills/${row.name}/SKILL.md`,
    };
  });
}
