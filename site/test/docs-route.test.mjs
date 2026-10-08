// Tests for site/src/components/docs/route.mjs: README table cells shown in the Getting started
// install tabs. Inline code renders as <code> with everything else escaped, and an install route
// becomes its commands (one copyable block each) with the README's own words between them.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { inlineMarkdown, routeSteps } from '../src/components/docs/route.mjs';
import { getSiteData } from '../src/lib/site.mjs';

const { tools } = getSiteData();
const tool = (id) => tools.find((t) => t.id === id);

test('inlineMarkdown renders code spans and escapes HTML, inside code too', () => {
  assert.equal(
    inlineMarkdown('add `~/.agents/skills` to <b>x</b> & "y"'),
    'add <code>~/.agents/skills</code> to &lt;b&gt;x&lt;/b&gt; &amp; &quot;y&quot;',
  );
  assert.equal(inlineMarkdown('`agy plugin install <checkout>`'), '<code>agy plugin install &lt;checkout&gt;</code>');
});

test('every command of every route becomes one command step, in table order', () => {
  for (const t of tools) {
    const commands = routeSteps(t.route, t.commands).filter((s) => s.kind === 'cmd').map((s) => s.text);
    assert.deepEqual(commands, t.commands, t.name);
  }
});

test('the words between commands stay, without the comma that joined them to the command', () => {
  assert.deepEqual(routeSteps(tool('claude').route, tool('claude').commands), [
    { kind: 'cmd', text: 'claude plugin marketplace add Ninety2UA/agent-blueprint' },
    { kind: 'text', html: 'then' },
    { kind: 'cmd', text: 'claude plugin install agent-blueprint@agent-blueprint' },
  ]);
  assert.deepEqual(routeSteps(tool('hermes').route, tool('hermes').commands), [
    { kind: 'cmd', text: 'bash install.sh --only hermes' },
    {
      kind: 'text',
      html: 'then add <code>~/.agents/skills</code> under <code>skills.external_dirs</code> in <code>~/.hermes/config.yaml</code> (the installer prints the lines)',
    },
  ]);
});

test('no word of a route is lost', () => {
  const words = (s) => s.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/[`,]/g, ' ').split(/\s+/).filter(Boolean);
  for (const t of tools) {
    const steps = routeSteps(t.route, t.commands);
    const rebuilt = steps.map((s) => (s.kind === 'cmd' ? s.text : s.html)).join(' ');
    assert.deepEqual(words(rebuilt), words(t.route), t.name);
  }
});
