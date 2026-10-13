// Tests for site/src/components/docs/route.mjs: README table cells shown in the Getting started
// install tabs. An install route becomes its commands (one copyable block each) with the README's
// own words between them; the home hero shows its short form. Also the setup call each tab shows
// (src/lib/naming.mjs) and the Getting started anchors other pages link to (start.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { leadRoute, routeSteps } from '../src/components/docs/route.mjs';
import { START, startAnchor } from '../src/components/docs/start.mjs';
import { callSkill, SETUP_SKILL, setupSkill } from '../src/lib/naming.mjs';
import { getSiteData } from '../src/lib/site.mjs';

const { tools, skills, onboarding } = getSiteData();
const tool = (id) => tools.find((t) => t.id === id);

test('every command of every route becomes one command step, in table order', () => {
  for (const t of tools) {
    const commands = routeSteps(t.route, t.commands).filter((s) => s.kind === 'cmd').map((s) => s.text);
    assert.deepEqual(commands, t.commands, t.name);
  }
});

test('the words between commands stay, without the punctuation that joined them to the command', () => {
  const claude = routeSteps(tool('claude').route, tool('claude').commands);
  assert.deepEqual(claude.slice(0, 3), [
    { kind: 'cmd', text: 'claude plugin marketplace add Ninety2UA/agent-blueprint' },
    { kind: 'text', html: 'then' },
    { kind: 'cmd', text: 'claude plugin install agent-blueprint@agent-blueprint' },
  ]);
  // the sentence after the last command starts without the period that ended the command's sentence
  assert.equal(claude.length, 4);
  assert.match(claude[3].html, /^The hooks /);
  // words before the only command stay in front of it, inline code kept
  const hermes = routeSteps(tool('hermes').route, tool('hermes').commands);
  assert.deepEqual(hermes.map((s) => s.kind), ['text', 'cmd']);
  assert.match(hermes[0].html, /<code>~\/\.hermes\/skills<\/code>/);
  assert.equal(hermes[1].text, tool('hermes').commands[0]);
});

test('no word of a route is lost', () => {
  const words = (s) => s.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/[`,.;]/g, ' ').split(/\s+/).filter(Boolean);
  for (const t of tools) {
    const steps = routeSteps(t.route, t.commands);
    const rebuilt = steps.map((s) => (s.kind === 'cmd' ? s.text : s.html)).join(' ');
    assert.deepEqual(words(rebuilt), words(t.route), t.name);
  }
});

test('the words that end a route end with a period, as a sentence under a command block does', () => {
  for (const t of tools) {
    const last = routeSteps(t.route, t.commands).at(-1);
    if (last.kind === 'text') assert.match(last.html.replace(/<[^>]+>/g, ''), /[.:;!?]$/, t.name);
  }
  assert.ok(!tool('claude').route.trim().endsWith('.'), 'the README cell itself has no final period');
});

test("the hero's short route: the first run of commands and one sentence of the README's words", () => {
  // a tool's own run, with the sentence after it
  assert.deepEqual(leadRoute(tool('codex').route, tool('codex').commands), {
    commands: tool('codex').commands,
    note: 'Then trust the hooks in <code>/hooks</code>.',
  });
  // a tool that reads Claude Code's plugin: Claude Code's run, and the opening sentence that says so
  for (const id of ['cursor-agent', 'amp']) {
    const lead = leadRoute(tool(id).route, tool(id).commands);
    assert.deepEqual(lead.commands, tool('claude').commands, id);
    assert.match(lead.note, /reads Claude Code's plugin, so once Claude Code has it there is nothing to do\.$/, id);
  }
  // an opening sentence that led into the command with a colon ends with a period instead
  assert.match(leadRoute(tool('hermes').route, tool('hermes').commands).note, /^The installer gives Hermes .*edit\.$/);
  // a route of one command and no words has no note
  assert.deepEqual(leadRoute(tool('pi').route, tool('pi').commands), { commands: tool('pi').commands, note: '' });
  for (const t of tools) assert.ok(leadRoute(t.route, t.commands).commands.length > 0, t.name);
});

test('the setup call in each tool comes from the naming table', () => {
  assert.equal(setupSkill(skills), SETUP_SKILL);
  assert.throws(() => setupSkill(skills.filter((s) => s.name !== SETUP_SKILL)), new RegExp(SETUP_SKILL));
  assert.equal(callSkill(tools, tool('claude'), SETUP_SKILL), `/${SETUP_SKILL}`);
  assert.equal(callSkill(tools, tool('codex'), SETUP_SKILL), `$${SETUP_SKILL}`);
  assert.equal(callSkill(tools, tool('pi'), SETUP_SKILL), `/skill:${SETUP_SKILL}`);
  assert.equal(callSkill(tools, tool('amp'), SETUP_SKILL), `use the ${SETUP_SKILL} skill`);
  // Codex offers the setup skill right after install, as its manifest says
  assert.deepEqual(onboarding, { codex: SETUP_SKILL });
});

test('the Getting started sections other pages link to exist, and a missing one stops the build', () => {
  assert.equal(startAnchor(START.setup), 'set-up-your-project');
  assert.equal(startAnchor(START.check), 'check-that-your-tool-sees-the-skills');
  assert.equal(startAnchor(START.all), 'set-up-every-tool-at-once');
  assert.throws(() => startAnchor('No such section'), /No such section/);
});
