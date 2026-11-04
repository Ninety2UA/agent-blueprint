// Tests for the site's copy control (site/src/components/CopyButton.astro), its script run in plain Node
// against fakes (see client-script.mjs). They pin the control as the site ships it today, which the
// Hosted page's own-server block uses as it stands: "Copied" when the clipboard or the legacy command
// took the text, "Press ⌘C" when neither did, and back to "Copy" after 1.8 s.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fakeTarget, runClientScript, settle } from './client-script.mjs';

const TEXT = 'npm ci\nnpm run build';

// A page with one copy button. `clipboard` decides what navigator.clipboard.writeText does and `exec`
// what document.execCommand('copy') does (a function that may throw).
function page({ clipboard, exec }) {
  const label = { textContent: 'Copy' };
  const classes = new Set();
  const btn = {
    dataset: { copy: TEXT },
    closest: (s) => (s === '.copy-btn' ? btn : null),
    querySelector: (s) => (s === '.copy-label' ? label : null),
    classList: { toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)), remove: (c) => classes.delete(c) },
  };
  const live = { textContent: '' };
  const written = [];
  const legacy = [];
  const doc = fakeTarget({
    getElementById: (id) => (id === 'live' ? live : null),
    createElement: () => {
      const ta = { value: '', style: {}, setAttribute() {}, select: () => legacy.push(['select', ta.value]), remove: () => legacy.push(['remove']) };
      return ta;
    },
    body: { appendChild: (el) => legacy.push(['append', el.value]) },
    execCommand: (cmd) => (legacy.push(['exec', cmd]), exec()),
  });
  runClientScript('components/CopyButton.astro', {
    globals: {
      document: doc,
      navigator: { clipboard: { writeText: (text) => (written.push(text), clipboard()) } },
      window: { setTimeout: (fn, ms) => setTimeout(fn, ms) },
    },
  });
  const click = async () => {
    doc.fire('click', { target: btn });
    await settle();
  };
  return { label, live, classes, written, legacy, click };
}

test('the copy control: the clipboard takes the text and the label reads Copied, then Copy again', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const p = page({ clipboard: () => Promise.resolve(), exec: () => assert.fail('the legacy command is not needed') });
  await p.click();
  assert.deepEqual(p.written, [TEXT]);
  assert.equal(p.label.textContent, 'Copied');
  assert.equal(p.classes.has('is-copied'), true);
  assert.equal(p.live.textContent, 'Copied to the clipboard');
  t.mock.timers.tick(1800);
  assert.equal(p.label.textContent, 'Copy');
  assert.equal(p.classes.has('is-copied'), false);
});

test('the copy control: the clipboard refuses, the legacy command copies, and the label reads Copied', async () => {
  const p = page({ clipboard: () => Promise.reject(new Error('NotAllowedError')), exec: () => true });
  await p.click();
  assert.deepEqual(p.legacy, [['append', TEXT], ['select', TEXT], ['exec', 'copy'], ['remove']]);
  assert.equal(p.label.textContent, 'Copied');
  assert.equal(p.live.textContent, 'Copied to the clipboard');
});

for (const [how, exec] of [
  ['returns false', () => false],
  ['throws', () => {
    throw new Error('execCommand is not supported');
  }],
]) {
  test(`the copy control: the clipboard refuses and the legacy command ${how}, so the label reads Press ⌘C`, async () => {
    const p = page({ clipboard: () => Promise.reject(new Error('NotAllowedError')), exec });
    await p.click();
    assert.equal(p.label.textContent, 'Press ⌘C');
    assert.equal(p.classes.has('is-copied'), false);
    assert.equal(p.live.textContent, 'Copy failed, select the text instead');
    assert.deepEqual(p.legacy.at(-1), ['remove'], 'the hidden copy is removed');
  });
}
