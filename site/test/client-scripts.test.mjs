// Tests for the failure paths of the site's small browser scripts, each run in plain Node
// against fakes (see client-script.mjs): the client:interaction directive when hydration fails,
// the video figures when the browser refuses autoplay or a seek skips `playing`, the tabs with a
// malformed link fragment, and the skills catalog filter's URL writes.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { deferred, fakeTarget, runClientScript, settle } from './client-script.mjs';

// ---- client:interaction (site/src/directives/interaction.ts) ----

function island() {
  const el = fakeTarget();
  const clicks = [];
  const button = { isConnected: true, closest: () => button, click: () => clicks.push('replayed') };
  const directive = runClientScript('directives/interaction.ts');
  const loads = [];
  const load = async () => {
    const attempt = { load: deferred(), run: deferred() };
    loads.push(attempt);
    await attempt.load.promise;
    return () => attempt.run.promise;
  };
  directive(load, {}, el);
  return { el, button, clicks, loads, click: () => el.fire('click', { target: button }) };
}

test('client:interaction holds the first click while the island hydrates and replays it afterwards', async () => {
  const i = island();
  assert.equal(i.click().defaultPrevented, true);
  assert.equal(i.loads.length, 1);
  i.loads[0].load.resolve();
  await settle();
  i.loads[0].run.resolve();
  await settle();
  assert.deepEqual(i.clicks, ['replayed']);
  assert.equal(i.el.listeners.length, 0, 'the directive lets go of the island once it is hydrated');
});

for (const step of ['load', 'run']) {
  test(`client:interaction: when ${step}() rejects, clicks go through again and the next interaction retries`, async () => {
    const i = island();
    const unhandled = [];
    const onUnhandled = (reason) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);
    try {
      i.click();
      if (step === 'run') i.loads[0].load.resolve();
      await settle();
      i.loads[0][step].reject(new Error('chunk failed'));
      await settle();
      await settle();
      assert.deepEqual(unhandled, []);
      assert.deepEqual(i.clicks, [], 'the held press is not replayed into a failed island');

      const next = i.click();
      assert.equal(next.defaultPrevented, false, 'the island keeps its no-JS behavior');
      assert.equal(next.stopped, false);
      assert.equal(i.loads.length, 2, 'the interaction starts another try');
      i.loads[1].load.resolve();
      await settle();
      i.loads[1].run.resolve();
      await settle();
      assert.equal(i.el.listeners.length, 0, 'a later success hydrates the island as usual');
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });
}

// ---- video figures (site/src/components/video-figures.ts) ----

function classes() {
  const set = new Set();
  return {
    set,
    add: (c) => set.add(c),
    remove: (c) => set.delete(c),
    contains: (c) => set.has(c),
    toggle: (c, on) => (on ? set.add(c) : set.delete(c)),
  };
}

function videoPage({ film = false, play } = {}) {
  const v = fakeTarget({
    paused: true,
    ended: false,
    currentTime: 0,
    duration: 60,
    removeAttribute() {},
    play() {
      return play(v);
    },
    pause() {
      v.paused = true;
      v.fire('pause');
    },
  });
  const el = (extra = {}) => ({ style: {}, textContent: '', innerHTML: '', setAttribute() {}, removeAttribute() {}, ...extra });
  const chap = fakeTarget(el({ dataset: { t: '0' }, querySelector: () => ({ textContent: 'Start' }) }));
  const parts = {
    video: v,
    '.fd-fill': el(),
    '.fd-head': el(),
    '[data-cur]': el(),
    '.fd-seek': fakeTarget(el({ value: '0' })),
    '[data-now]': el(),
  };
  const fig = {
    classList: classes(),
    dataset: { duration: '60', texts: '{}' },
    querySelector: (s) => parts[s] ?? null,
    querySelectorAll: (s) => (s === '.chap' ? [chap] : []),
    hasAttribute: (name) => name === 'data-film' && film,
  };
  const frames = new Map();
  let nextFrame = 1;
  let observer;
  runClientScript('components/video-figures.ts', {
    globals: {
      window: { matchMedia: () => ({ matches: false }) },
      document: fakeTarget({ hidden: false, querySelectorAll: () => [fig] }),
      IntersectionObserver: class {
        constructor(cb) {
          observer = cb;
        }
        observe() {}
      },
      requestAnimationFrame: (fn) => (frames.set(nextFrame, fn), nextFrame++),
      cancelAnimationFrame: (id) => frames.delete(id),
    },
  });
  const scrollIntoView = () => observer([{ isIntersecting: true, intersectionRatio: 1 }]);
  return { v, fig, frames, scrollIntoView };
}

const refusal = () => Promise.reject(Object.assign(new Error('play() can only be initiated by a user gesture'), { name: 'NotAllowedError' }));

test('a video whose autoplay the browser refuses shows the big Play control until it plays', async () => {
  const page = videoPage({ play: refusal });
  page.scrollIntoView();
  await settle();
  assert.equal(page.fig.classList.contains('show-big'), true);
  page.v.paused = false;
  page.v.fire('playing');
  assert.equal(page.fig.classList.contains('show-big'), false);
  page.v.pause();
  assert.equal(page.fig.classList.contains('show-big'), false, 'pausing off screen after a start shows no control');
});

test('a play() interrupted by pause() is not a refusal: no big Play control', async () => {
  const page = videoPage({ play: () => Promise.reject(Object.assign(new Error('interrupted'), { name: 'AbortError' })) });
  page.scrollIntoView();
  await settle();
  assert.equal(page.fig.classList.contains('show-big'), false);
});

test('the film keeps its time readout moving after a seek while playing, even with no playing event', () => {
  const page = videoPage({ film: true, play: () => Promise.resolve() });
  page.v.paused = false;
  page.v.fire('playing');
  assert.equal(page.frames.size, 1);
  page.v.currentTime = 30;
  page.v.fire('seeked');
  assert.equal(page.frames.size, 1, 'the progress loop runs again after the seek');
  page.v.pause();
  page.v.fire('seeked');
  assert.equal(page.frames.size, 0, 'a seek while paused leaves the loop stopped');
});

// ---- tabs (site/src/components/Tabs.astro) ----

function tabGroup(ids) {
  const panels = {};
  const tabs = ids.map((id) => {
    const attrs = { 'aria-controls': id, 'aria-selected': id === ids[0] ? 'true' : 'false' };
    panels[id] = { hidden: id !== ids[0], offsetWidth: 0, classList: classes(), scrollIntoView() {} };
    return fakeTarget({
      tabIndex: 0,
      offsetLeft: 0,
      offsetWidth: 10,
      getAttribute: (n) => attrs[n] ?? null,
      setAttribute: (n, val) => (attrs[n] = String(val)),
      focus() {},
      scrollIntoView() {},
    });
  });
  const list = { scrollWidth: 0, clientWidth: 0, querySelectorAll: () => tabs, querySelector: () => null };
  return { root: { querySelector: () => list }, tabs, panels };
}

function tabsPage(hash) {
  const groups = [tabGroup(['claude', 'codex']), tabGroup(['bash', 'zsh'])];
  const panels = Object.assign({}, ...groups.map((g) => g.panels));
  runClientScript('components/Tabs.astro', {
    globals: {
      window: fakeTarget({ matchMedia: () => ({ matches: false }) }),
      location: { hash },
      document: { querySelectorAll: () => groups.map((g) => g.root), getElementById: (id) => panels[id] ?? null },
      requestAnimationFrame: () => 0,
      cancelAnimationFrame: () => {},
    },
  });
  return groups;
}

test('a malformed link fragment such as #%E0 leaves every tab group on the page working', () => {
  const groups = tabsPage('#%E0');
  for (const g of groups) {
    assert.ok(g.tabs.every((t) => t.listeners.some((l) => l.type === 'click')), 'every tab group is set up');
  }
  groups[1].tabs[1].fire('click');
  assert.equal(groups[1].panels.zsh.hidden, false);
});

test('a link fragment naming a panel still opens its tab', () => {
  const groups = tabsPage('#codex');
  assert.equal(groups[0].panels.codex.hidden, false);
  assert.equal(groups[0].panels.claude.hidden, true);
});

// ---- skills catalog filter (site/src/components/skills/SkillFilter.tsx) ----

function filterPage() {
  const loc = { href: 'https://example.test/skills/', search: '' };
  const writes = [];
  const write = (kind) => (_state, _title, url) => {
    writes.push(`${kind} ${url.search}`);
    loc.href = url.href;
    loc.search = url.search;
  };
  const applied = [];
  const win = fakeTarget({
    abCatalog: {
      read(search) {
        const p = new URLSearchParams(search);
        return { q: p.get('q') || '', phase: p.get('phase') || 'all' };
      },
      apply: (state) => applied.push({ ...state }),
    },
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (id) => clearTimeout(id),
  });
  const effects = [];
  const ToggleGroup = () => null;
  const tree = runClientScript('components/skills/SkillFilter.tsx', {
    imports: {
      'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
      react: { useState: (init) => [init, () => {}], useRef: (current) => ({ current }), useEffect: (fn) => effects.push(fn) },
      '@/components/ui/toggle-group': { ToggleGroup, ToggleGroupItem: () => null },
      '../Icon': { Icon: () => null },
    },
    globals: {
      window: win,
      location: loc,
      history: { state: null, pushState: write('push'), replaceState: write('replace') },
      document: fakeTarget(),
      URL,
    },
  })({ phases: [{ slug: 'quality', title: 'Quality', count: 1 }], total: 1 });
  const find = (node, test) => {
    if (!node || typeof node !== 'object') return null;
    if (test(node)) return node;
    for (const child of [node.props?.children].flat()) {
      const hit = find(child, test);
      if (hit) return hit;
    }
    return null;
  };
  const input = find(tree, (n) => n.props?.id === 'skill-q');
  const chips = find(tree, (n) => n.type === ToggleGroup);
  const field = { value: '', focus() {} };
  input.props.ref.current = field;
  effects.forEach((fn) => fn());
  const type = (value) => {
    field.value = value;
    input.props.onInput({ currentTarget: field });
  };
  return { loc, win, writes, applied, field, input, chips, type };
}

test('typing in the catalog filters at once and writes the URL once typing pauses', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = filterPage();
  for (const value of ['r', 're', 'rev', 'revi']) f.type(value);
  assert.deepEqual(f.applied.map((s) => s.q), ['', 'r', 're', 'rev', 'revi'], 'every keystroke filters');
  assert.deepEqual(f.writes, ['push ?q=r'], 'a typing run opens one history entry');
  t.mock.timers.tick(249);
  assert.deepEqual(f.writes, ['push ?q=r']);
  t.mock.timers.tick(1);
  assert.deepEqual(f.writes, ['push ?q=r', 'replace ?q=revi']);
});

test('a chip press or leaving the box writes the typed text first; Back drops a pending write', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = filterPage();
  f.type('a');
  f.type('ab');
  f.chips.props.onValueChange(['quality']);
  assert.deepEqual(f.writes, ['push ?q=a', 'replace ?q=ab', 'push ?q=ab&phase=quality']);

  f.type('abc');
  f.type('abcd');
  f.input.props.onBlur();
  assert.deepEqual(f.writes.slice(3), ['push ?q=abc&phase=quality', 'replace ?q=abcd&phase=quality']);

  f.type('abcde');
  // Back: the browser has already moved to the earlier entry
  f.loc.href = 'https://example.test/skills/?q=ab';
  f.loc.search = '?q=ab';
  f.win.fire('popstate');
  t.mock.timers.tick(1000);
  assert.deepEqual(f.writes.slice(5), [], 'nothing is written over the entry Back restored');
  assert.equal(f.field.value, 'ab');
  assert.deepEqual(f.applied.at(-1), { q: 'ab', phase: 'all' });
});
