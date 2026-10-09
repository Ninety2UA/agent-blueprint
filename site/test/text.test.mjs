// Tests for site/src/lib/text.mjs: the escaping, inline code, list and capital-letter helpers the
// pages share.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { capitalize, escapeHtml, inlineCode, listJoin } from '../src/lib/text.mjs';

test('escapeHtml escapes & first, then < > and "', () => {
  assert.equal(escapeHtml('a &lt; <b> & "c"'), 'a &amp;lt; &lt;b&gt; &amp; &quot;c&quot;');
});

test('inlineCode renders code spans and escapes HTML, inside code too', () => {
  assert.equal(inlineCode('Keeps `docs/<x>.md` & more'), 'Keeps <code>docs/&lt;x&gt;.md</code> &amp; more');
  assert.equal(
    inlineCode('add `~/.agents/skills` to <b>x</b> & "y"'),
    'add <code>~/.agents/skills</code> to &lt;b&gt;x&lt;/b&gt; &amp; &quot;y&quot;',
  );
  assert.equal(inlineCode('`agy plugin install <checkout>`'), '<code>agy plugin install &lt;checkout&gt;</code>');
});

test('listJoin joins with commas and a final "and"', () => {
  assert.equal(listJoin([]), '');
  assert.equal(listJoin(['a']), 'a');
  assert.equal(listJoin(['a', 'b']), 'a and b');
  assert.equal(listJoin(['a', 'b', 'c']), 'a, b and c');
});

test('capitalize upper-cases the first character only', () => {
  assert.equal(capitalize('eight stations'), 'Eight stations');
  assert.equal(capitalize(''), '');
});
