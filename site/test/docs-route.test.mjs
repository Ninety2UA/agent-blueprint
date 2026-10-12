// Tests for site/src/components/docs/route.mjs: README table cells shown in the Getting started
// install tabs. An install route becomes its commands (one copyable block each) with the README's
// own words between them.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { routeSteps } from '../src/components/docs/route.mjs';
import { getSiteData } from '../src/lib/site.mjs';

const { tools } = getSiteData();
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
