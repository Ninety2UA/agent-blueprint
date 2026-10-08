// Tests for site/src/lib/skills.mjs and the getSiteData() contract in site/src/lib/site.mjs.
// Expected counts come from the tree and from the drift gate's own output, never typed in.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parsePhases } from '../src/lib/readme.mjs';
import { joinSkills, listHelperFiles, listSkillFolders } from '../src/lib/skills.mjs';
import { getSiteData } from '../src/lib/site.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const README = readFileSync(join(ROOT, 'README.md'), 'utf8');
const PLUGIN = JSON.parse(readFileSync(join(ROOT, '.claude-plugin/plugin.json'), 'utf8'));

const skillFolders = readdirSync(join(ROOT, 'skills'), { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(ROOT, 'skills', d.name, 'SKILL.md')))
  .map((d) => d.name)
  .sort();

// The drift gate prints "Derived ground truth: N skills · N hooks · N helper prompts" before it
// compares anything, so the line is there whether or not the gate passes.
function driftGroundTruth() {
  let out;
  try {
    out = execFileSync('bash', [join(ROOT, 'scripts/check-drift.sh')], { encoding: 'utf8' });
  } catch (error) {
    out = error.stdout;
  }
  const m = out.match(/Derived ground truth: (\d+) skills · (\d+) hooks · (\d+) helper prompts/);
  assert.ok(m, `drift gate output has no ground-truth line:\n${out}`);
  return { skills: Number(m[1]), hooks: Number(m[2]), helpers: Number(m[3]) };
}

test('a skill folder absent from every phase table makes the join name the folder', () => {
  const missing = skillFolders[Math.floor(skillFolders.length / 2)];
  const row = README.split('\n').find((l) => l.startsWith(`| [${missing}](skills/${missing}/) |`));
  assert.ok(row, `README has no phase row for ${missing}`);
  const phases = parsePhases(README.replace(`${row}\n`, ''));
  assert.throws(
    () => joinSkills({ root: ROOT, folders: listSkillFolders(ROOT), phases, repoUrl: PLUGIN.repository }),
    new RegExp(missing),
  );
});

test('each skill lists the helper prompts in its own folder, companion notes left out', () => {
  for (const skill of skillFolders) {
    const dir = join(ROOT, 'skills', skill, 'references', 'agents');
    const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.md')) : [];
    const stems = new Set(files.map((f) => f.slice(0, -3)));
    const expected = [...stems]
      .filter((stem) => !stem.split('-').some((_, i, parts) => i > 0 && stems.has(parts.slice(0, i).join('-'))))
      .sort();
    const helpers = listHelperFiles(ROOT, skill);
    assert.deepEqual(helpers.map((h) => h.name).sort(), expected, skill);
    for (const helper of helpers) assert.equal(helper.path, `skills/${skill}/references/agents/${helper.name}.md`);
  }
});

test('getSiteData counts and version agree with the drift gate and plugin.json', () => {
  const data = getSiteData();
  const truth = driftGroundTruth();
  console.log(
    `getSiteData: ${data.counts.skills} skills, ${data.counts.helpers} helper prompts, ${data.counts.hooks} hooks, ` +
      `${data.counts.tools} tools, ${data.counts.phases} phases, version ${data.version}`,
  );
  console.log(`drift gate:  ${truth.skills} skills, ${truth.helpers} helper prompts, ${truth.hooks} hooks`);
  assert.equal(data.counts.skills, truth.skills);
  assert.equal(data.counts.helpers, truth.helpers);
  assert.equal(data.counts.hooks, truth.hooks);
  assert.equal(data.version, PLUGIN.version);
  assert.equal(data.repoUrl, PLUGIN.repository);
  assert.equal(data.skills.length, skillFolders.length);
  assert.equal(data.helpers.length, truth.helpers);
  assert.equal(data.counts.tools, data.tools.length);
  assert.equal(data.counts.phases, data.phases.length);
  assert.equal(data.releases[0].version, data.version);
  assert.strictEqual(getSiteData(), data, 'getSiteData is memoized');
});

test('each skill carries its phase, README summary, SKILL.md description, neighbors and related skills', () => {
  const data = getSiteData();
  const order = data.phases.flatMap((p) => p.skills);
  assert.deepEqual(data.skills.map((s) => s.name), order, 'skills follow the phase tables');
  data.skills.forEach((skill, i) => {
    const text = readFileSync(join(ROOT, 'skills', skill.name, 'SKILL.md'), 'utf8');
    const frontmatterName = text.match(/^name: (.+)$/m)[1];
    assert.equal(skill.name, frontmatterName);
    assert.ok(skill.description.length > 0 && text.includes(skill.description), `${skill.name} description`);
    assert.ok(skill.summary.length > 0);
    const phase = data.phases.find((p) => p.slug === skill.phase);
    assert.ok(phase.skills.includes(skill.name));
    assert.deepEqual(skill.related, phase.skills.filter((n) => n !== skill.name));
    assert.equal(skill.prev, i === 0 ? null : order[i - 1]);
    assert.equal(skill.next, i === order.length - 1 ? null : order[i + 1]);
    assert.equal(skill.githubUrl, `${PLUGIN.repository}/blob/main/skills/${skill.name}/SKILL.md`);
    assert.deepEqual(skill.helpers, listHelperFiles(ROOT, skill.name));
  });
});

test('release notes come from docs/releases where a file exists for the version', () => {
  const data = getSiteData();
  const noteFiles = new Set(
    readdirSync(join(ROOT, 'docs/releases'))
      .map((f) => f.match(/^v(.+)-release-notes\.md$/))
      .filter(Boolean)
      .map((m) => m[1]),
  );
  for (const release of data.releases) {
    if (noteFiles.has(release.version)) {
      assert.ok(release.notes.length > 0, `${release.version} notes are empty`);
      assert.ok(!release.notes.startsWith('# '), `${release.version} notes keep the file title`);
      assert.ok(!release.notes.includes('The body for the GitHub release.'));
    } else {
      assert.equal(release.notes, null, release.version);
    }
  }
  assert.ok(data.releases.some((r) => r.notes), 'no release has notes');
});
