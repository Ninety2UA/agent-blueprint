// node --test site/test/escape-skill-html.test.mjs
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';

import escapeSkillHtmlIntegration, { escapeSkillHtml, isSkillFile } from '../src/lib/markdown/escape-skill-html.mjs';

const skillsDir = join('/repo', 'skills');
const url = (...parts) => pathToFileURL(join('/repo', ...parts));
const factoryCtx = (fileURL) => ({ fileURL, sourceFormat: 'markdown', source: '', data: {} });
// the visitor context: only parent() is read
const visitCtx = (parent) => ({ parent: () => parent });

test('isSkillFile matches only skills/<name>/SKILL.md under the skills folder', () => {
  assert.equal(isSkillFile(url('skills', 'ab-quick-fix', 'SKILL.md'), skillsDir), true);
  assert.equal(isSkillFile(url('README.md'), skillsDir), false);
  assert.equal(isSkillFile(url('skills', 'ab-review-swarm', 'references', 'agents', 'code-reviewer.md'), skillsDir), false);
  assert.equal(isSkillFile(url('site', 'skills', 'ab-quick-fix', 'SKILL.md'), skillsDir), false);
  assert.equal(isSkillFile(url('docs', 'releases', 'v4.0.0-release-notes.md'), skillsDir), false);
  assert.equal(isSkillFile(undefined, skillsDir), false);
});

test('the plugin is left out for README sections and other Markdown', () => {
  const factory = escapeSkillHtml(skillsDir);
  assert.equal(factory(factoryCtx(url('README.md'))), null);
  assert.equal(factory(factoryCtx(undefined)), null);
});

test('inline raw HTML in a SKILL.md paragraph becomes text, so <name> stays visible', () => {
  const plugin = escapeSkillHtml(skillsDir)(factoryCtx(url('skills', 'ab-finishing-a-development-branch', 'SKILL.md')));
  assert.ok(plugin, 'the plugin runs for a SKILL.md');
  const out = plugin.html({ type: 'html', value: '<name>' }, visitCtx({ type: 'paragraph' }));
  assert.deepEqual(out, { type: 'text', value: '<name>' });
});

test('block raw HTML in a SKILL.md becomes a paragraph of text', () => {
  const plugin = escapeSkillHtml(skillsDir)(factoryCtx(url('skills', 'ab-pr-workflow', 'SKILL.md')));
  const out = plugin.html({ type: 'html', value: '<details>\n<summary>x</summary>' }, visitCtx({ type: 'root' }));
  assert.deepEqual(out, { type: 'paragraph', children: [{ type: 'text', value: '<details>\n<summary>x</summary>' }] });
  const inList = plugin.html({ type: 'html', value: '<br>' }, visitCtx({ type: 'listItem' }));
  assert.equal(inList.type, 'paragraph');
});

test('the integration adds the plugin to the Satteri processor and refuses any other processor', () => {
  const options = { mdastPlugins: [], hastPlugins: [], features: {} };
  const config = { markdown: { processor: { name: 'satteri', options } } };
  escapeSkillHtmlIntegration({ skillsDir }).hooks['astro:config:setup']({ config });
  assert.equal(options.mdastPlugins.length, 1);
  assert.equal(typeof options.mdastPlugins[0], 'function');

  const other = { markdown: { processor: { name: 'unified', options: {} } } };
  assert.throws(() => escapeSkillHtmlIntegration({ skillsDir }).hooks['astro:config:setup']({ config: other }), /satteri/i);
});

test('a command flag in SKILL.md prose keeps its two hyphens', async () => {
  const { markdownToHtml } = await import('satteri');
  const factory = escapeSkillHtml(skillsDir);
  const render = (md, file) =>
    markdownToHtml(md, { mdastPlugins: [() => factory(factoryCtx(file))], hastPlugins: [], fileURL: file, features: { gfm: true, smartPunctuation: true } }).html;
  const skill = url('skills', 'ab-performance-profiling', 'SKILL.md');
  const out = render('Use a profiler (pprof, node --prof, etc.) between 1–2 runs, then decide – or stop.', skill);
  assert.match(out, /node --prof/);
  assert.match(out, /1–2 runs/);
  assert.match(out, /decide – or stop/);
});
