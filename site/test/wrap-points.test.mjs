// Tests for site/src/components/wrap-points.mjs: where code wraps on a phone. A command shown in a
// .cmd control gets a <wbr> after each slash inside a path or URL, so it wraps at a slash instead
// of inside a name; a segment of that path with a hyphen in it (agent-blueprint.git) stays whole,
// since Chrome would otherwise break after the hyphen; and its flags (--host, [--pr]) stay whole,
// as in a title block's code cells. The text (what the copy button copies, what a reader selects)
// stays exactly the same.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { breakAfterSlashes, breakCodeAfterSlashes, keepFlagsWhole } from '../src/components/wrap-points.mjs';

const text = (html) => html.replace(/<[^>]+>/g, '');
const whole = (s) => `<span class="nowrap">${s}</span>`;

test('breakAfterSlashes puts a <wbr> after each slash in a URL and a path', () => {
  assert.equal(
    breakAfterSlashes('git clone https://github.com/Ninety2UA/agent-blueprint.git'),
    `git clone https://<wbr>github.com/<wbr>Ninety2UA/<wbr>${whole('agent-blueprint.git')}`,
  );
  assert.equal(breakAfterSlashes('docs/hosts/claude-code.md'), `docs/<wbr>hosts/<wbr>${whole('claude-code.md')}`);
});

test('breakAfterSlashes keeps each segment of a path or URL that holds a hyphen whole', () => {
  assert.equal(
    breakAfterSlashes('bash &lt;checkout&gt;/skills/ab-ship-pipeline/scripts/run.sh'),
    `bash &lt;checkout&gt;/<wbr>skills/<wbr>${whole('ab-ship-pipeline')}/<wbr>scripts/<wbr>run.sh`,
  );
  assert.equal(breakAfterSlashes('git switch -c feat/jwt-refresh'), `git switch -c feat/<wbr>${whole('jwt-refresh')}`);
  assert.equal(breakAfterSlashes('/usr/local-bin/x'), `/usr/<wbr>${whole('local-bin')}/<wbr>x`);
  assert.equal(breakAfterSlashes('.agent-blueprint/run/'), `${whole('.agent-blueprint')}/<wbr>run/`);
  // a word with no slash inside it is not a path: its hyphens are left to keepFlagsWhole and the browser
  for (const s of ['cd agent-blueprint', '--allow-unguarded', '/ab-review-swarm', 'docs-site/']) {
    assert.equal(breakAfterSlashes(s), s);
  }
});

test('breakAfterSlashes keeps the clone command text and the copied text byte-identical', () => {
  const line = 'git clone https://github.com/Ninety2UA/agent-blueprint.git';
  assert.equal(text(breakAfterSlashes(line)), line);
  assert.equal(text(breakAfterSlashes(keepFlagsWhole(line))), line);
});

test('breakAfterSlashes leaves a slash that starts or ends a word alone', () => {
  for (const s of ['/ab-review-swarm', '/skill:ab-review-swarm', 'ls docs/', 'a / b', 'run /path']) {
    assert.equal(breakAfterSlashes(s), s);
  }
  assert.equal(breakAfterSlashes('ls docs/context/'), 'ls docs/<wbr>context/');
});

test('breakAfterSlashes changes the text between tags only, never a tag or an attribute', () => {
  const html =
    '<span class="pr" aria-hidden="true">$</span>bash &lt;checkout&gt;/skills/run.sh <a href="https://x.dev/a/b">see a/b</a>';
  assert.equal(
    breakAfterSlashes(html),
    '<span class="pr" aria-hidden="true">$</span>bash &lt;checkout&gt;/<wbr>skills/<wbr>run.sh <a href="https://x.dev/a/b">see a/<wbr>b</a>',
  );
});

test('breakAfterSlashes adds no characters to the text', () => {
  const html = '<span class="ln">git switch -c feat/jwt-refresh</span><span class="ln">bash &lt;checkout&gt;/skills/ab-ship-pipeline/scripts/run.sh \\</span>';
  assert.equal(text(breakAfterSlashes(html)), text(html));
});

test('keepFlagsWhole wraps each word that starts with - or [- in a nowrap span', () => {
  assert.equal(
    keepFlagsWhole('[optional: files or path to review] [--pr] [--full]'),
    '[optional: files or path to review] <span class="nowrap">[--pr]</span> <span class="nowrap">[--full]</span>',
  );
  assert.equal(
    keepFlagsWhole('[path to plan file] [--wave-size N] -q'),
    '[path to plan file] <span class="nowrap">[--wave-size</span> N] <span class="nowrap">-q</span>',
  );
});

test('keepFlagsWhole changes the text between tags only, never a tag or an attribute', () => {
  assert.equal(
    keepFlagsWhole('<span class="pr" aria-hidden="true">$</span>bash run.sh --host <span class="arg" data-host-arg>claude</span> &lt;x&gt; -q'),
    '<span class="pr" aria-hidden="true">$</span>bash run.sh <span class="nowrap">--host</span> <span class="arg" data-host-arg>claude</span> &lt;x&gt; <span class="nowrap">-q</span>',
  );
});

test('keepFlagsWhole leaves words without a leading hyphen alone', () => {
  assert.equal(keepFlagsWhole('&lt;feature description&gt; [--quick]'), '&lt;feature description&gt; <span class="nowrap">[--quick]</span>');
  for (const s of ['skills/ab-review-swarm/SKILL.md', '4.0.1', 'ab-review-swarm', '[describe the change]', 'a - b']) {
    assert.equal(keepFlagsWhole(s), s);
  }
});

test('keepFlagsWhole keeps the visible text the same', () => {
  const s = '&lt;feature description&gt; [--swarm] [--iterations N] [--convergence fast|deep|perfect] &amp; git commit -m "x"';
  assert.equal(text(keepFlagsWhole(s)), s);
});

test('breakCodeAfterSlashes breaks the paths in inline code and leaves the prose, tags and links alone', () => {
  assert.equal(
    breakCodeAfterSlashes('<p>See <code>docs/plans/x.md</code> and/or <a href="/a/b/">a/b</a>.</p>'),
    '<p>See <code>docs/<wbr>plans/<wbr>x.md</code> and/or <a href="/a/b/">a/b</a>.</p>',
  );
  assert.equal(
    breakCodeAfterSlashes('<td><a href="/skills/x/"><code>.agent-blueprint/run/state.json</code></a></td>'),
    '<td><a href="/skills/x/"><code>.agent-blueprint/<wbr>run/<wbr>state.json</code></a></td>',
  );
});

test('breakCodeAfterSlashes leaves code blocks alone', () => {
  const html = '<pre class="astro-code" tabindex="0"><code><span class="line"><span>cat docs/context/STATUS.md</span></span></code></pre><p><code>a/b</code></p>';
  assert.equal(breakCodeAfterSlashes(html), html.replace('<code>a/b</code></p>', '<code>a/<wbr>b</code></p>'));
});
