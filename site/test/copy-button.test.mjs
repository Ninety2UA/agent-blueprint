// Tests for the site's copy control (site/src/components/CopyButton.astro), its script run in plain Node
// against fakes (see client-script.mjs). They pin the control as the site ships it today, which the
// Hosted page's own-server block uses as it stands: "Copied" when the clipboard or the legacy command
// took the text, "Press ⌘C" when neither did, and back to "Copy" after 1.8 s. A button with its own words
// and a hint, "Copy for your agent", goes back to its words, and a failed copy stays on screen.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fakeTarget, runClientScript, settle } from './client-script.mjs';

const TEXT = 'npm ci\nnpm run build';

// A page with one copy button. `clipboard` decides what navigator.clipboard.writeText does and `exec`
// what document.execCommand('copy') does (a function that may throw).
function page({ clipboard, exec, dataset = {}, source = null }) {
  const label = { textContent: dataset.copyDisplay ?? 'Copy' };
  const classes = new Set();
  const btn = {
    dataset: { copy: TEXT, ...dataset },
    closest: (s) => (s === '.copy-btn' ? btn : null),
    querySelector: (s) => (s === '.copy-label' ? label : null),
    classList: { toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)), remove: (c) => classes.delete(c) },
  };
  const live = { textContent: '' };
  const written = [];
  const legacy = [];
  const selected = [];
  const doc = fakeTarget({
    getElementById: (id) => (id === 'live' ? live : id === dataset.copyFrom ? source : null),
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
      window: { setTimeout: (fn, ms) => setTimeout(fn, ms), getSelection: () => ({ selectAllChildren: (el) => selected.push(el) }) },
    },
  });
  const click = async () => {
    doc.fire('click', { target: btn });
    await settle();
  };
  return { label, live, classes, written, legacy, selected, click };
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

const AGENT = { copyDisplay: 'Copy for your agent', copyHint: 'Open View as Markdown and copy from there.' };

test('a button with its own words goes back to them after a copy', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const p = page({ clipboard: () => Promise.resolve(), exec: () => assert.fail('the legacy command is not needed'), dataset: AGENT });
  await p.click();
  assert.deepEqual(p.written, [TEXT]);
  assert.equal(p.label.textContent, 'Copied');
  t.mock.timers.tick(1800);
  assert.equal(p.label.textContent, 'Copy for your agent');
});

test('a failed copy shows a hidden source with its text selected; a good copy leaves it hidden', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const source = { hidden: true, textContent: TEXT };
  const { copy, ...dataset } = { copy: undefined, copyFrom: 'agent-prompt', copyDisplay: 'Copy prompt for your agent' };
  const good = page({ clipboard: () => Promise.resolve(), exec: () => false, dataset: { ...dataset, copy }, source });
  await good.click();
  assert.deepEqual(good.written, [TEXT]);
  assert.equal(source.hidden, true);
  const bad = page({ clipboard: () => Promise.reject(new Error('NotAllowedError')), exec: () => false, dataset: { ...dataset, copy }, source });
  await bad.click();
  assert.equal(source.hidden, false);
  assert.deepEqual(bad.selected, [source]);
  assert.equal(bad.label.textContent, 'Press ⌘C');
});

test('a button with a hint: a failed copy reads Copy failed, says what to do and stays until the next click', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let allowed = false;
  const p = page({
    clipboard: () => (allowed ? Promise.resolve() : Promise.reject(new Error('NotAllowedError'))),
    exec: () => false,
    dataset: AGENT,
  });
  await p.click();
  assert.equal(p.label.textContent, 'Copy failed');
  assert.equal(p.classes.has('is-failed'), true);
  assert.equal(p.classes.has('is-copied'), false);
  assert.equal(p.live.textContent, 'Copy failed. Open View as Markdown and copy from there.');
  t.mock.timers.tick(60000);
  assert.equal(p.label.textContent, 'Copy failed', 'the failure does not time out');
  allowed = true;
  await p.click();
  assert.equal(p.label.textContent, 'Copied');
  assert.equal(p.classes.has('is-failed'), false);
  t.mock.timers.tick(1800);
  assert.equal(p.label.textContent, 'Copy for your agent');
});
