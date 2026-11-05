// Tests for the failure paths of the site's small browser scripts, each run in plain Node
// against fakes (see client-script.mjs): the client:interaction directive when hydration fails,
// the video figures when the browser refuses autoplay, a seek skips `playing` or a figure swaps its cut, the tabs with a
// malformed link fragment, the skills catalog filter's URL writes, and the Hosted page's configurator.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getViteConfig } from 'astro/config';
import { experimental_AstroContainer } from 'astro/container';
import { createServer } from 'vite';

import { WEB_CHAT_REASON, buildHosted, getHosted } from '../src/components/hosted/hosted-data.mjs';
import * as modelVarsModule from '../src/components/hosted/model-vars.mjs';
import { escapeHtml } from '../src/lib/text.mjs';
import { groupModels, savedModels } from '../src/lib/gateway-models.mjs';
import * as wrapPoints from '../src/components/wrap-points.mjs';
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

// One video box (VideoMedia): its video, its Play button and its own class list. `play` decides what
// the video's play() does; by default it starts at once.
// With `poster: 'deferred'` the box holds a poster that waits for the reader (ruling 47): an <img> with
// data-src and an AVIF <source> with data-srcset, neither fetched until the script sets src and srcset.
function videoBox(cut, play = (v) => ((v.paused = false), v.fire('playing'), Promise.resolve()), poster = 'plain') {
  const plays = [];
  const v = fakeTarget({
    paused: true,
    ended: false,
    muted: true,
    currentTime: 0,
    duration: 60,
    removeAttribute() {},
    play() {
      plays.push(cut);
      return play(v);
    },
    pause() {
      v.paused = true;
      v.fire('pause');
    },
  });
  const attrs = {};
  const text = { textContent: 'Play' };
  const big = fakeTarget({
    dataset: { label: `the ${cut} loop` },
    querySelector: (s) => (s === 'span' ? text : null),
    setAttribute: (n, val) => (attrs[n] = String(val)),
    getAttribute: (n) => attrs[n] ?? null,
    text,
  });
  const element = (data) => ({
    dataset: { ...data },
    removeAttribute(name) {
      delete this.dataset[name.replace(/^data-/, '')];
    },
  });
  const img = poster === 'deferred' ? element({ src: `/media/${cut}.jpg?v=1` }) : null;
  const source = poster === 'deferred' ? element({ srcset: `/media/${cut}-720.avif?v=2` }) : null;
  const box = {
    cut,
    v,
    big,
    plays,
    img,
    source,
    classList: classes(),
    querySelector: (s) => (s === 'video' ? v : s === '.vf-big' ? big : s === 'img[data-src]' ? (img?.dataset.src ? img : null) : null),
    querySelectorAll: (s) => (s === 'source[data-srcset]' && source?.dataset.srcset ? [source] : []),
  };
  return box;
}

// A page with one figure: one box (as every figure today) or a landscape and a portrait box (a figure
// with a portrait cut). Each box's video has its own IntersectionObserver, which the test drives.
function videoPage({ film = false, sound = false, play, cuts = ['landscape'], reduced = false, afterLoad = false, readyState = 'complete', poster } = {}) {
  const boxes = cuts.map((cut) => videoBox(cut, typeof play === 'function' ? play : play?.[cut], poster));
  const el = (extra = {}) => ({ style: {}, textContent: '', innerHTML: '', setAttribute() {}, removeAttribute() {}, ...extra });
  const chap = fakeTarget(el({ dataset: { t: '12' }, querySelector: () => ({ textContent: 'Start' }) }));
  const parts = {
    '.fd-fill': el(),
    '.fd-head': el(),
    '[data-cur]': el(),
    '.fd-seek': fakeTarget(el({ value: '0' })),
    '[data-now]': el(),
  };
  if (sound) {
    const attrs = { 'aria-pressed': 'false' };
    parts['.fd-sound'] = fakeTarget(el({ setAttribute: (n, val) => (attrs[n] = String(val)), getAttribute: (n) => attrs[n] ?? null }));
  }
  const fig = {
    classList: classes(),
    dataset: { duration: '60', texts: '{}' },
    querySelector: (s) => parts[s] ?? null,
    querySelectorAll: (s) => (s === '.chap' ? [chap] : s === '.vf-media' ? boxes : []),
    hasAttribute: (name) => (name === 'data-film' && film) || (name === 'data-after-load' && afterLoad),
  };
  const frames = new Map();
  let nextFrame = 1;
  const observers = new Map();
  const margins = new Map();
  const win = fakeTarget({ matchMedia: () => ({ matches: reduced }) });
  const doc = fakeTarget({ hidden: false, readyState, querySelectorAll: () => [fig] });
  runClientScript('components/video-figures.ts', {
    globals: {
      window: win,
      document: doc,
      IntersectionObserver: class {
        constructor(cb, options = {}) {
          this.cb = cb;
          this.options = options;
        }
        observe(target) {
          observers.set(target, this.cb);
          margins.set(target, this.options.rootMargin);
        }
        unobserve(target) {
          observers.delete(target);
        }
      },
      requestAnimationFrame: (fn) => (frames.set(nextFrame, fn), nextFrame++),
      cancelAnimationFrame: (id) => frames.delete(id),
    },
  });
  // one IntersectionObserver entry for a box: how much of its video shows, out of its height, in a viewport this tall
  const see = ({ shown, height = 400, viewport = 900, box = boxes[0] }) =>
    observers.get(box.v)([{ isIntersecting: shown > 0, intersectionRatio: shown / height, intersectionRect: { height: shown }, rootBounds: { height: viewport } }]);
  const scrollIntoView = (box = boxes[0]) => observers.get(box.v)([{ isIntersecting: true, intersectionRatio: 1 }]);
  // the poster observer's entry for a box: within its margin of the viewport or not
  const near = (box = boxes[0], isIntersecting = true) => observers.get(box)?.([{ target: box, isIntersecting }]);
  const [land, port] = boxes;
  return { v: boxes[0].v, box: boxes[0], boxes, land, port, fig, parts, chap, frames, observers, margins, win, doc, scrollIntoView, see, near };
}

const refusal = () => Promise.reject(Object.assign(new Error('play() can only be initiated by a user gesture'), { name: 'NotAllowedError' }));
const aborted = () => Object.assign(new Error('The play() request was interrupted by a call to pause()'), { name: 'AbortError' });

test('a video whose autoplay the browser refuses shows the big Play control until it plays', async () => {
  const page = videoPage({ play: refusal });
  page.scrollIntoView();
  await settle();
  assert.equal(page.box.classList.contains('show-big'), true);
  page.v.paused = false;
  page.v.fire('playing');
  assert.equal(page.box.classList.contains('show-big'), false);
  page.v.pause();
  assert.equal(page.box.classList.contains('show-big'), false, 'pausing off screen after a start shows no control');
});

test('a figure starts once half of it is on screen, pauses when it leaves, and starts again when it is back', async () => {
  const page = videoPage();
  page.see({ shown: 120 });
  await settle();
  assert.equal(page.box.plays.length, 0, 'less than half on screen: still waiting');
  page.see({ shown: 200 });
  await settle();
  assert.equal(page.box.plays.length, 1, 'half on screen: playing');
  assert.equal(page.box.classList.contains('is-playing'), true);
  page.see({ shown: 0 });
  assert.equal(page.v.paused, true, 'off screen: the player paused it');
  page.see({ shown: 240 });
  await settle();
  assert.equal(page.box.plays.length, 2, 'back on screen: playing again');
  assert.equal(page.box.classList.contains('show-big'), false);
});

// A figure taller than twice the viewport (a short landscape window) can never be half on screen;
// it starts once it fills half the viewport instead, so it still plays on its own.
test('a figure taller than twice the viewport starts once it fills half the viewport', async () => {
  const page = videoPage();
  page.see({ shown: 100, height: 560, viewport: 250 });
  await settle();
  assert.equal(page.box.plays.length, 0, 'a sliver at the bottom of the window: still waiting');
  page.see({ shown: 250, height: 560, viewport: 250 });
  await settle();
  assert.equal(page.box.plays.length, 1, 'filling the window: playing');
});

test('a play() interrupted by pause() is not a refusal: no big Play control', async () => {
  const page = videoPage({ play: () => Promise.reject(aborted()) });
  page.scrollIntoView();
  await settle();
  assert.equal(page.box.classList.contains('show-big'), false);
});

test('the figure carries vjs, so the film controls and the Play button rules apply; the Play button reads Play, then Replay', async () => {
  const page = videoPage({ film: true, reduced: true });
  assert.equal(page.fig.classList.contains('vjs'), true);
  assert.equal(page.box.classList.contains('show-big'), true, 'reduced motion: the Play button shows');
  assert.equal(page.box.big.text.textContent, 'Play');
  assert.equal(page.box.big.getAttribute('aria-label'), 'Play the landscape loop');
  page.v.ended = true;
  page.v.fire('ended');
  assert.equal(page.box.big.text.textContent, 'Replay');
  assert.equal(page.box.big.getAttribute('aria-label'), 'Replay the landscape loop');
  page.box.big.fire('click');
  await settle();
  assert.equal(page.v.currentTime, 0, 'Replay starts from the top');
  assert.deepEqual(page.box.plays, ['landscape']);
});

test('the film: a chapter seeks and plays, the seek bar moves the time', async () => {
  const page = videoPage({ film: true });
  page.chap.fire('click');
  await settle();
  assert.ok(Math.abs(page.v.currentTime - 12.01) < 1e-9, 'the chapter seeks to its start');
  assert.equal(page.box.plays.length, 1, 'and plays');
  page.parts['.fd-seek'].value = '500';
  page.parts['.fd-seek'].fire('input');
  assert.equal(page.v.currentTime, 30);
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

test('a scored film starts muted; Sound unmutes it, carries aria-pressed, and the choice holds across a chapter jump, a replay and a hidden tab', async () => {
  const page = videoPage({ film: true, sound: true });
  const btn = page.parts['.fd-sound'];
  assert.equal(page.v.muted, true, 'the film starts muted');
  assert.equal(btn.getAttribute('aria-pressed'), 'false');
  btn.fire('click');
  assert.equal(page.v.muted, false, 'a press turns the sound on');
  assert.equal(btn.getAttribute('aria-pressed'), 'true');
  page.chap.fire('click');
  await settle();
  assert.equal(page.v.muted, false, 'a chapter jump keeps the sound on');
  page.v.ended = true;
  page.v.fire('ended');
  page.box.big.fire('click');
  await settle();
  assert.equal(page.v.muted, false, 'Replay keeps the sound on');
  page.doc.hidden = true;
  page.doc.fire('visibilitychange');
  assert.equal(page.v.paused, true, 'a hidden tab pauses the film, and its sound with it');
  page.doc.hidden = false;
  btn.fire('click');
  assert.equal(page.v.muted, true, 'a second press mutes it again');
  assert.equal(btn.getAttribute('aria-pressed'), 'false');
});

test('a film without sound has no Sound toggle and stays muted', () => {
  const page = videoPage({ film: true });
  assert.equal(page.parts['.fd-sound'], undefined);
  assert.equal(page.v.muted, true);
});

// ---- two-cut figures: a landscape and a portrait box, CSS shows one by the figure's width ----

const twoCuts = ['landscape', 'portrait'];

test('a two-cut figure plays only the shown box; the hidden box never calls play()', async () => {
  const page = videoPage({ cuts: twoCuts });
  // a display: none box never intersects
  page.see({ box: page.port, shown: 0 });
  page.see({ box: page.land, shown: 400 });
  await settle();
  assert.deepEqual(page.land.plays, ['landscape']);
  assert.deepEqual(page.port.plays, []);
  assert.equal(page.land.classList.contains('is-playing'), true);
  assert.equal(page.port.classList.contains('is-playing'), false);
  assert.equal(page.fig.classList.contains('is-playing'), false, 'the playing state sits on the box, not the figure');
  assert.equal(page.fig.classList.contains('vjs'), true, 'vjs stays on the figure');
});

test('a swap while playing pauses the old box, its interrupted play() shows no Play button and logs nothing, and the new box starts', async (t) => {
  const logged = [];
  for (const m of ['error', 'warn', 'log']) t.mock.method(console, m, (...args) => logged.push(args));
  let reject;
  const page = videoPage({
    cuts: twoCuts,
    play: {
      // the landscape start is still pending when the figure narrows
      landscape: (v) => ((v.paused = false), new Promise((_, rej) => (reject = rej))),
      portrait: (v) => ((v.paused = false), v.fire('playing'), Promise.resolve()),
    },
  });
  page.see({ box: page.land, shown: 400 });
  await settle();
  assert.equal(page.land.plays.length, 1);
  // the figure narrows: the landscape box goes display: none, the portrait box shows
  page.see({ box: page.land, shown: 0 });
  assert.equal(page.land.v.paused, true, 'the old box is paused');
  reject(aborted());
  page.see({ box: page.port, shown: 500, height: 500 });
  await settle();
  assert.equal(page.land.classList.contains('show-big'), false, 'no Play button on the old box');
  assert.deepEqual(page.port.plays, ['portrait'], 'the new box starts');
  assert.equal(page.port.classList.contains('is-playing'), true);
  assert.deepEqual(logged, [], 'nothing is logged');
});

test('a refused start shows the Play button on that box only', async () => {
  const page = videoPage({ cuts: twoCuts, play: { landscape: () => Promise.resolve(), portrait: refusal } });
  page.see({ box: page.port, shown: 500, height: 500 });
  await settle();
  assert.equal(page.port.classList.contains('show-big'), true);
  assert.equal(page.land.classList.contains('show-big'), false);
  assert.equal(page.fig.classList.contains('show-big'), false);
});

test('reduced motion: nothing starts, and Play in one box does not start the other', async () => {
  const page = videoPage({ cuts: twoCuts, reduced: true });
  page.see({ box: page.land, shown: 400 });
  await settle();
  assert.deepEqual([...page.land.plays, ...page.port.plays], [], 'nothing starts on its own');
  page.land.big.fire('click');
  await settle();
  assert.deepEqual(page.land.plays, ['landscape']);
  assert.deepEqual(page.port.plays, [], 'the other box stays still');
});

test('a hidden tab pauses both boxes and the return resumes only the shown one', async () => {
  const page = videoPage({ cuts: twoCuts });
  page.see({ box: page.port, shown: 0 });
  page.see({ box: page.land, shown: 400 });
  await settle();
  page.doc.hidden = true;
  page.doc.fire('visibilitychange');
  assert.equal(page.land.v.paused, true);
  assert.equal(page.port.v.paused, true);
  page.doc.hidden = false;
  page.doc.fire('visibilitychange');
  await settle();
  assert.deepEqual(page.land.plays, ['landscape', 'landscape'], 'the shown box resumes');
  assert.deepEqual(page.port.plays, [], 'the hidden box never starts');
});

test("Fig. 1's box does not start before the load event", async () => {
  const page = videoPage({ cuts: twoCuts, afterLoad: true, readyState: 'interactive' });
  page.see({ box: page.land, shown: 400 });
  await settle();
  assert.deepEqual(page.land.plays, [], 'in view, but the page is still loading');
  page.doc.readyState = 'complete';
  page.win.fire('load');
  await settle();
  assert.deepEqual(page.land.plays, ['landscape'], 'the load event starts the shown box');
  assert.deepEqual(page.port.plays, []);
});

test('a figure that waits for load plays at once when the script runs after load', async () => {
  const page = videoPage({ cuts: twoCuts, afterLoad: true, readyState: 'complete' });
  page.see({ box: page.land, shown: 400 });
  await settle();
  assert.deepEqual(page.land.plays, ['landscape']);
});

// ---- posters that wait for the reader (ruling 47) ----

// What the browser would fetch for a box's poster: nothing until src and srcset are set.
const fetched = (box) => ({ src: box.img.src, srcset: box.source.srcset });

test('a deferred poster gets its URLs only once its box comes within a screen of the viewport', () => {
  const page = videoPage({ poster: 'deferred' });
  assert.ok(page.observers.has(page.box), 'the poster observer watches the box');
  assert.equal(page.margins.get(page.box), '100% 0px', 'a margin of one screen above and below');
  assert.deepEqual(fetched(page.box), { src: undefined, srcset: undefined }, 'nothing to fetch while the page loads');
  page.near(page.box, false);
  assert.deepEqual(fetched(page.box), { src: undefined, srcset: undefined }, 'still far below the fold');
  page.near(page.box);
  assert.deepEqual(fetched(page.box), { src: '/media/landscape.jpg?v=1', srcset: '/media/landscape-720.avif?v=2' });
  assert.equal(page.box.img.dataset.src, undefined, 'data-src is dropped once src is set');
  assert.equal(page.box.source.dataset.srcset, undefined, 'data-srcset is dropped once srcset is set');
  assert.equal(page.observers.has(page.box), false, 'the poster observer lets the box go');
  assert.equal(page.box.plays.length, 0, 'nearing the viewport starts no video');
});

test('a two-cut figure fetches only the shown box poster; the hidden box never comes near', () => {
  const page = videoPage({ cuts: twoCuts, poster: 'deferred' });
  page.near(page.port);
  assert.equal(page.port.img.src, '/media/portrait.jpg?v=1');
  assert.equal(page.land.img.src, undefined, 'a display: none box never intersects, so its poster stays unfetched');
});

test('a box without a deferred poster (the film, Fig. 1) is not watched by the poster observer', () => {
  const page = videoPage();
  assert.equal(page.observers.has(page.box), false);
  assert.ok(page.observers.has(page.v), 'its video is still watched for playing');
});

test('with reduced motion the poster still arrives on approach and shows under the Play button', async () => {
  const page = videoPage({ reduced: true, poster: 'deferred' });
  page.near();
  page.scrollIntoView();
  await settle();
  assert.equal(page.box.img.src, '/media/landscape.jpg?v=1');
  assert.deepEqual(page.box.plays, [], 'nothing starts on its own');
  assert.equal(page.box.classList.contains('show-big'), true);
});

test('a refused or failed video still shows its poster', async () => {
  const failed = () => Promise.reject(Object.assign(new Error('no supported source'), { name: 'NotSupportedError' }));
  for (const play of [refusal, failed]) {
    const page = videoPage({ play, poster: 'deferred' });
    page.near();
    page.scrollIntoView();
    await settle();
    assert.equal(page.box.img.src, '/media/landscape.jpg?v=1', 'the poster is fetched');
    assert.equal(page.box.classList.contains('is-playing'), false, 'the video does not cover it');
  }
});

// ---- ship runner host picker (site/src/components/home/runner.ts) ----

// The home page's runner command and the run.sh line drawn over its loop: picking a host must
// rewrite both, with --allow-unguarded for a tool that can only run unguarded.
function runnerPage() {
  const host = (id, unguarded = false) =>
    fakeTarget({ dataset: { host: id }, tabIndex: 0, hasAttribute: (n) => n === 'data-unguarded' && unguarded, setAttribute() {}, focus() {} });
  const hosts = [host('claude'), host('agy', true)];
  const parts = {
    '.host-pick': { querySelectorAll: () => hosts },
    '[data-host-arg]': { textContent: 'claude' },
    '[data-allow-unguarded]': { hidden: true, textContent: ' --allow-unguarded' },
    '[data-fig-host]': { textContent: 'claude' },
  };
  const notes = [{ dataset: { noteFor: 'claude' }, hidden: false }, { dataset: { noteFor: 'agy' }, hidden: true }];
  runClientScript('components/home/runner.ts', {
    imports: { './reveal': { reduced: () => true } },
    globals: { document: { querySelector: (s) => parts[s] ?? null, querySelectorAll: () => notes }, window: fakeTarget() },
  });
  return { hosts, fig: parts['[data-fig-host]'], arg: parts['[data-host-arg]'], flag: parts['[data-allow-unguarded]'], notes };
}

test('picking a host rewrites the run.sh line over the runner loop, with the unguarded flag where the command has it', () => {
  const page = runnerPage();
  page.hosts[1].fire('click');
  assert.equal(page.arg.textContent, 'agy');
  assert.equal(page.flag.hidden, false);
  assert.equal(page.fig.textContent, 'agy --allow-unguarded');
  assert.deepEqual(page.notes.map((n) => n.hidden), [true, false]);
  page.hosts[1].fire('keydown', { key: 'ArrowLeft' });
  assert.equal(page.fig.textContent, 'claude');
  assert.equal(page.flag.hidden, true);
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

// ---- the Hosted page's configurator (site/src/components/hosted/Configurator.astro, configurator.ts) ----

// Configurator.astro is rendered through Astro's container API with the site's own Vite config, and
// the script then runs against a small DOM parsed from that HTML. The expected routes come from the data
// module, so each test checks the markup and the script against hosted-data.mjs, never against itself.
const SITE = fileURLToPath(new URL('..', import.meta.url));
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const HOSTED = getHosted(ROOT);
const README = readFileSync(join(ROOT, 'eve', 'README.md'), 'utf8');
const REPO_URL = JSON.parse(readFileSync(join(ROOT, '.claude-plugin', 'plugin.json'), 'utf8')).repository;

// The tests never reach the network: the component's model list falls back to the saved copy.
const SAVED_MODELS = savedModels().models;
const realFetch = globalThis.fetch;
globalThis.fetch = async () => {
  throw new Error('the tests do not reach the network');
};
after(() => {
  globalThis.fetch = realFetch;
});

let vite = null;
let container = null;
async function renderConfigurator(props = {}) {
  if (!vite) {
    const config = await getViteConfig(
      { server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'silent' },
      { root: SITE, logLevel: 'silent' },
    )({ command: 'serve', mode: 'test' });
    vite = await createServer({ ...config, configFile: false });
    container = await experimental_AstroContainer.create();
  }
  const mod = await vite.ssrLoadModule('/src/components/hosted/Configurator.astro');
  return container.renderToString(mod.default, { props });
}
after(async () => {
  await vite?.close();
});

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (s) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) =>
    e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (ENTITIES[e] ?? m),
  );
const VOID = new Set(['input', 'wbr', 'br', 'img', 'meta', 'link', 'hr', 'source']);
const dataAttr = (key) => `data-${String(key).replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;

// One element of the parsed HTML, with the DOM surface the configurator script uses.
class El {
  constructor(tag, attrs, parent) {
    this.tagName = tag.toUpperCase();
    this.attrs = attrs;
    this.parent = parent;
    this.children = [];
    this.listeners = [];
    this._checked = attrs.has('checked');
    this._selected = attrs.has('selected');
    this.classList = {
      contains: (c) => this.classes().includes(c),
      add: (c) => this.classList.toggle(c, true),
      remove: (c) => this.classList.toggle(c, false),
      toggle: (c, on = !this.classList.contains(c)) => {
        const set = new Set(this.classes());
        if (on) set.add(c);
        else set.delete(c);
        this.attrs.set('class', [...set].join(' '));
        return on;
      },
    };
    this.dataset = new Proxy(
      {},
      {
        get: (_, key) => this.getAttribute(dataAttr(key)) ?? undefined,
        set: (_, key, value) => (this.setAttribute(dataAttr(key), value), true),
      },
    );
  }
  classes() {
    return (this.attrs.get('class') ?? '').split(/\s+/).filter(Boolean);
  }
  getAttribute(n) {
    return this.attrs.has(n) ? this.attrs.get(n) : null;
  }
  setAttribute(n, v) {
    this.attrs.set(n, String(v));
  }
  removeAttribute(n) {
    this.attrs.delete(n);
  }
  hasAttribute(n) {
    return this.attrs.has(n);
  }
  flag(n, on) {
    if (on) this.attrs.set(n, '');
    else this.attrs.delete(n);
  }
  get hidden() {
    return this.attrs.has('hidden');
  }
  set hidden(on) {
    this.flag('hidden', on);
  }
  get disabled() {
    return this.attrs.has('disabled');
  }
  set disabled(on) {
    this.flag('disabled', on);
  }
  get checked() {
    return this._checked;
  }
  // checking a radio unchecks the others of its group, as in a browser
  set checked(on) {
    if (on) for (const r of this.form().querySelectorAll(`input[name="${this.name}"]`)) r._checked = false;
    this._checked = Boolean(on);
  }
  get id() {
    return this.getAttribute('id') ?? '';
  }
  get name() {
    return this.getAttribute('name') ?? '';
  }
  // a select's value is its selected option's, the first option's when none is selected, and '' after
  // a value no option carries, as in a browser
  get value() {
    if (this.tagName !== 'SELECT') return this.getAttribute('value') ?? '';
    const options = this.querySelectorAll('option');
    return (options.find((o) => o._selected) ?? (this._none ? null : options[0]))?.value ?? '';
  }
  set value(v) {
    if (this.tagName !== 'SELECT') return this.setAttribute('value', v);
    const options = this.querySelectorAll('option');
    for (const o of options) o._selected = o.value === v;
    this._none = !options.some((o) => o._selected);
  }
  get options() {
    return this.querySelectorAll('option');
  }
  // a <template>'s content, cloned whole
  get content() {
    return { cloneNode: () => Object.assign(new El('#fragment', new Map(), null), { children: this.children.map((c) => cloneEl(c)) }) };
  }
  replaceChildren(...nodes) {
    this.children = [];
    for (const node of nodes) this.append(node);
  }
  append(node) {
    for (const child of node.tagName === '#FRAGMENT' ? node.children : [node]) {
      if (typeof child !== 'string') child.parent = this;
      this.children.push(child);
    }
  }
  remove() {
    if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this);
    this.parent = null;
  }
  set innerHTML(html) {
    this.children = [];
    this.append(fragment(html));
  }
  insertAdjacentHTML(where, html) {
    assert.equal(where, 'afterend', 'the fake DOM inserts after an element only');
    const nodes = fragment(html).children;
    for (const n of nodes) if (typeof n !== 'string') n.parent = this.parent;
    const siblings = this.parent.children;
    siblings.splice(siblings.indexOf(this) + 1, 0, ...nodes);
  }
  get href() {
    return this.getAttribute('href') ?? '';
  }
  set href(v) {
    this.setAttribute('href', v);
  }
  get textContent() {
    return this.children.map((c) => (typeof c === 'string' ? c : c.textContent)).join('');
  }
  set textContent(v) {
    this.children = [String(v)];
  }
  form() {
    let el = this;
    while (el.parent && el.tagName !== 'FORM') el = el.parent;
    return el;
  }
  *descendants() {
    for (const c of this.children) {
      if (typeof c === 'string') continue;
      yield c;
      yield* c.descendants();
    }
  }
  matches(selector) {
    const parts = selector.trim().split(/\s+/).map(compound);
    if (!parts.at(-1)(this)) return false;
    let el = this.parent;
    for (let i = parts.length - 2; i >= 0; i--) {
      while (el && !parts[i](el)) el = el.parent;
      if (!el) return false;
      el = el.parent;
    }
    return true;
  }
  closest(selector) {
    for (let el = this; el; el = el.parent) if (el.matches(selector)) return el;
    return null;
  }
  querySelectorAll(selector) {
    return [...this.descendants()].filter((el) => el.matches(selector));
  }
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }
  addEventListener(type, fn) {
    this.listeners.push({ type, fn });
  }
  removeEventListener(type, fn) {
    this.listeners = this.listeners.filter((l) => l.type !== type || l.fn !== fn);
  }
  /** an event that bubbles from this element up to the root */
  dispatch(type) {
    const event = { type, target: this, preventDefault() {}, stopPropagation() {} };
    for (let el = this; el; el = el.parent) for (const l of el.listeners.filter((x) => x.type === type)) l.fn.call(el, event);
  }
  /** on screen: neither it nor an ancestor carries hidden */
  get shown() {
    for (let el = this; el; el = el.parent) if (el.hidden) return false;
    return true;
  }
}

// A simple selector: tag, #id, .class and [attr] or [attr="value"], in any combination.
function compound(sel) {
  const tag = sel.match(/^[a-z][\w-]*/i)?.[0];
  const id = sel.match(/#([\w-]+)/)?.[1];
  const classes = [...sel.matchAll(/\.([\w-]+)/g)].map((m) => m[1]);
  const attrs = [...sel.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)].map((m) => [m[1], m[2]]);
  return (el) =>
    (!tag || el.tagName === tag.toUpperCase()) &&
    (!id || el.id === id) &&
    classes.every((c) => el.classes().includes(c)) &&
    attrs.every(([n, v]) => el.hasAttribute(n) && (v === undefined || el.getAttribute(n) === v));
}

// a deep copy of an element (or text) with its attributes, as cloneNode(true) makes it
function cloneEl(node, parent = null) {
  if (typeof node === 'string') return node;
  const copy = new El(node.tagName.toLowerCase(), new Map(node.attrs), parent);
  copy.children = node.children.map((c) => cloneEl(c, copy));
  return copy;
}

// parsed HTML as a fragment whose children have no parent yet
function fragment(html) {
  const root = parseHtml(html);
  return Object.assign(new El('#fragment', new Map(), null), { children: root.children });
}

function parseHtml(html) {
  const root = new El('root', new Map(), null);
  let cur = root;
  const re = /<!--[\s\S]*?-->|<(\/?)([a-z][\w-]*)((?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>|([^<]+)/gi;
  let m;
  while ((m = re.exec(html))) {
    if (m[0].startsWith('<!--')) continue;
    if (m[5] !== undefined) {
      cur.children.push(decode(m[5]));
      continue;
    }
    const [, close, rawTag, rawAttrs, selfClose] = m;
    const tag = rawTag.toLowerCase();
    if (close) {
      for (let el = cur; el; el = el.parent) {
        if (el.tagName === tag.toUpperCase()) {
          cur = el.parent;
          break;
        }
      }
      continue;
    }
    const attrs = new Map();
    for (const a of rawAttrs.matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
      attrs.set(a[1].toLowerCase(), decode(a[2] ?? a[3] ?? a[4] ?? ''));
    }
    const el = new El(tag, attrs, cur);
    cur.children.push(el);
    if (tag === 'script') {
      const end = html.indexOf('</script>', re.lastIndex);
      el.children.push(html.slice(re.lastIndex, end));
      re.lastIndex = end + '</script>'.length;
      continue;
    }
    if (!VOID.has(tag) && !selfClose) cur = el;
  }
  return root;
}

const pairText = (n) => (n.value === null ? n.name : `${n.name}=${n.value}`);
const stateById = (id) => HOSTED.states.find((s) => s.id === id);
const hostOf = (id) => HOSTED.hosts.find((h) => h.id === id);

// The model-choice chunk as the bundler would hand it over: its default export.
const modelChoiceChunk = () => ({
  default: runClientScript('components/hosted/model-choice.ts', {
    imports: { './model-vars.mjs': modelVarsModule, '../../lib/text.mjs': { escapeHtml }, '../wrap-points.mjs': wrapPoints },
  }),
});

// The rendered configurator with its script running. `reduced` is prefers-reduced-motion. `chunk` answers
// the script's dynamic import of the model-choice chunk; every call is recorded in `imports`.
async function configurator({ reduced = true, html, beforeScript, chunk = async () => modelChoiceChunk() } = {}) {
  const dom = parseHtml(html ?? (await renderConfigurator()));
  const form = dom.querySelector('#cfg');
  assert.ok(form, 'the configurator renders a form with id cfg');
  const live = new El('div', new Map([['id', 'live']]), null);
  const imports = [];
  beforeScript?.(form);
  runClientScript('components/hosted/configurator.ts', {
    globals: {
      document: { getElementById: (id) => (id === 'live' ? live : dom.querySelector(`#${id}`)) },
      window: {
        matchMedia: () => ({ matches: reduced }),
        setTimeout: (fn, ms) => setTimeout(fn, ms),
        clearTimeout: (id) => clearTimeout(id),
      },
      __import: (spec) => (imports.push(spec), chunk(spec)),
    },
  });
  const radio = (name, value) => form.querySelector(`input[name="${name}"][value="${value}"]`);
  // a reader's click on a radio: only an enabled radio on screen can be picked
  const pick = (name, value) => {
    const r = radio(name, value);
    assert.ok(r.shown, `${name}=${value} is on screen`);
    assert.equal(r.disabled, false, `${name}=${value} is enabled`);
    if (r.checked) return false;
    r.checked = true;
    r.dispatch('change');
    return true;
  };
  const checked = (name) => form.querySelectorAll(`input[name="${name}"]`).find((r) => r.checked)?.value ?? null;
  const visibleNames = () => form.querySelectorAll('#cfg-names li').filter((li) => li.shown);
  const select = (role) => form.querySelector(`select[data-role="${role}"]`);
  return {
    form,
    live,
    imports,
    pick,
    checked,
    /** a reader's pick in a role's select, which shows on Per role only */
    pickModel: (role, id) => {
      assert.equal(form.querySelector('#cfg-roles').dataset.mode, 'role', `the ${role} select is on screen`);
      assert.ok(select(role).options.some((o) => o.value === id), `the ${role} select offers ${id}`);
      select(role).value = id;
      select(role).dispatch('change');
    },
    select,
    roleRows: () => form.querySelectorAll('#cfg-roles li').map((li) => [li.querySelector('label').textContent, li.querySelector('.role-model').textContent]),
    later: () => (form.querySelector('.asks-after').shown ? form.querySelectorAll('#cfg-later li').map((li) => li.textContent) : null),
    exportLine: () => form.querySelectorAll('.res[data-res="server"] .ln')[HOSTED.hosts.find((h) => h.id === 'server').exportAt].textContent.replace(/^\$/, ''),
    serverCopy: () => form.querySelector('.res[data-res="server"] .copy-btn').dataset.copy,
    web: radio('channel', 'web'),
    slack: radio('channel', 'slack'),
    why: form.querySelector('.why'),
    sbx: form.querySelector('.sbx'),
    result: form.querySelector('.result'),
    shownResults: () => form.querySelectorAll('.res').filter((r) => r.shown).map((r) => r.dataset.res),
    names: () => visibleNames().map((li) => li.querySelector('code').textContent),
    sensitive: () => visibleNames().filter((li) => li.querySelector('.sec')).map((li) => li.querySelector('code').textContent),
    vercelLink: () => form.querySelector('.res[data-res="vercel"] a').href,
    askLabel: () => form.querySelectorAll('.asks-l').filter((l) => l.shown).map((l) => l.textContent.trim()),
    slackNote: () => form.querySelector('.cfg-slack'),
    preNote: () => form.querySelector('.cfg-pre'),
  };
}

// Moves the page to a route by its fewest control changes: the host first, then the channel and the
// sandbox only where the host change left them different.
function reach(page, state) {
  const steps = [];
  const step = (name, value) => page.pick(name, value) && steps.push(`${name}=${value}`);
  if (page.checked('host') !== state.host) step('host', state.host);
  if (page.checked('channel') !== state.channel) step('channel', state.channel);
  const sandboxes = new Set(HOSTED.states.filter((s) => s.host === state.host).map((s) => s.sandbox));
  if (sandboxes.size > 1 && page.checked('sandbox') !== state.sandbox) step('sandbox', state.sandbox);
  return steps;
}

// The model variables: on Vercel in the names list after the preset variable (the link pre-fills them), on
// Railway under "Set after deploying", on your own server in the export line before the build.
function assertState(page, state, where, vars = [['AB_ROSTER', 'quality']]) {
  const webRoute = HOSTED.states.some((s) => s.host === state.host && s.channel === 'web');
  const sandboxes = new Set(HOSTED.states.filter((s) => s.host === state.host).map((s) => s.sandbox));
  const pairs = vars.map(([n, v]) => `${n}=${v}`);
  const names = state.names.map(pairText).flatMap((text) => {
    if (!text.startsWith(`${HOSTED.roster.variable}=`)) return [text];
    return state.host === 'vercel' ? pairs : [];
  });
  assert.deepEqual(page.shownResults(), [state.host], `${where}: the result shown`);
  assert.equal(page.result.dataset.host, state.host, `${where}: the result's host`);
  assert.deepEqual(page.names(), names, `${where}: the names in README order, NAME=value for a non-sensitive one`);
  assert.deepEqual(page.sensitive(), state.names.filter((n) => n.sensitive).map((n) => n.name), `${where}: the sensitive marks`);
  assert.deepEqual(page.later(), state.host === 'railway' ? pairs : null, `${where}: the variables set after deploying`);
  assert.equal(page.exportLine(), modelVarsModule.exportLine(vars), `${where}: the export line`);
  assert.equal(page.serverCopy().split('\n')[HOSTED.hosts.find((h) => h.id === 'server').exportAt], modelVarsModule.exportLine(vars), `${where}: the copied export line`);
  if (state.host === 'vercel') assert.equal(page.vercelLink(), modelVarsModule.withModels(state.link, vars), `${where}: the Vercel link`);
  assert.equal(page.web.disabled, !webRoute, `${where}: the web chat disabled flag`);
  assert.equal(page.why.hidden, webRoute, `${where}: the reason line`);
  assert.equal(page.web.getAttribute('aria-describedby'), webRoute ? null : page.why.id, `${where}: aria-describedby only while the web chat is disabled`);
  assert.equal(page.slack.getAttribute('aria-describedby'), null);
  assert.equal(page.web.closest('.opt').classList.contains('is-off'), !webRoute, `${where}: the web chat option reads as off`);
  assert.equal(page.sbx.hidden, sandboxes.size < 2, `${where}: the sandbox choice shows on your own server only`);
  const labels = { vercel: ['It asks for'], railway: ['It asks for', 'Set after deploying'], server: ['Set these first'] };
  assert.deepEqual(page.askLabel(), labels[state.host], `${where}: the labels before the names`);
  assert.equal(page.slackNote().hidden, state.channel !== 'slack', `${where}: the Slack sentence shows with Slack only`);
  assert.equal(page.preNote().hidden, !['linear', 'telegram'].includes(state.channel), `${where}: the Pre-flight sentence shows with Linear or Telegram only`);
}

test('the configurator: the default route is complete static HTML, and the other choices are disabled until the script runs', async () => {
  const dom = parseHtml(await renderConfigurator());
  const form = dom.querySelector('#cfg');
  const def = stateById(HOSTED.defaultState);
  const radios = form.querySelectorAll('input');
  assert.ok(radios.length > 0);
  for (const r of radios) {
    assert.equal(r.getAttribute('type'), 'radio');
    assert.equal(r.getAttribute('autocomplete'), 'off', `${r.name}=${r.value} carries autocomplete="off"`);
  }
  const isDefault = (r) =>
    (r.name === 'host' && r.value === def.host) || (r.name === 'channel' && r.value === def.channel) || (r.name === 'models' && r.value === def.preset);
  assert.deepEqual(
    radios.filter((r) => r.hasAttribute('checked') && r.name !== 'sandbox').map((r) => `${r.name}=${r.value}`),
    [`host=${def.host}`, `channel=${def.channel}`, `models=${def.preset}`],
  );
  assert.deepEqual(radios.filter((r) => !isDefault(r) && !r.disabled).map((r) => `${r.name}=${r.value}`), [], 'every other choice is disabled');
  assert.ok(radios.filter(isDefault).every((r) => !r.disabled), 'the default choices are enabled');
  assert.equal(form.querySelector('input[name="channel"][value="web"]').getAttribute('aria-describedby'), null);
  // the static page shows the default route and nothing else
  assert.deepEqual(form.querySelectorAll('.res').filter((r) => r.shown).map((r) => r.dataset.res), [def.host]);
  assert.equal(form.querySelector('.res[data-res="vercel"] a').href, hostOf('vercel').links.web);
  assert.equal(def.link, hostOf('vercel').links.web);
  const names = form.querySelectorAll('#cfg-names li').filter((li) => li.shown).map((li) => li.querySelector('code').textContent);
  assert.deepEqual(names, def.names.map(pairText));
  assert.equal(form.querySelector('.sbx').hidden, true);
  assert.equal(form.querySelector('.why').hidden, true);
  assert.equal(form.querySelector('.cfg-slack').hidden, true);
  assert.equal(form.querySelector('.asks-after').hidden, true, 'the Railway row is hidden');
  for (const r of form.querySelectorAll('.res').filter((x) => !x.shown)) {
    assert.ok(r.hasAttribute('data-pagefind-ignore'), `the ${r.dataset.res} result is left out of search`);
  }
  // every name some route asks for is listed once per value it takes, with the routes it belongs to; the
  // preset variable only on Vercel
  const items = form.querySelectorAll('#cfg-names li').map((li) => [li.querySelector('code').textContent, li.dataset.states]);
  const expected = HOSTED.names.flatMap((n) => {
    const byValue = new Map();
    for (const [id, value] of Object.entries(n.states)) {
      if (n.name === HOSTED.roster.variable && stateById(id).host !== 'vercel') continue;
      byValue.set(value, [...(byValue.get(value) ?? []), id]);
    }
    return [...byValue].map(([value, ids]) => [value === null ? n.name : `${n.name}=${value}`, ids.join(' ')]);
  });
  assert.deepEqual(items, expected);
  // the channel radios are the channels the README's table names, in order
  assert.deepEqual(
    form.querySelectorAll('input[name="channel"]').map((r) => [r.value, r.closest('.opt').querySelector('.o-name').textContent]),
    HOSTED.channels.map((c) => [c.id, c.label]),
  );
});

test('the configurator: the Vercel choice carries the tier sentence with the README\'s Hobby minutes', async () => {
  const dom = parseHtml(await renderConfigurator());
  const vercel = dom.querySelector('input[name="host"][value="vercel"]').closest('.opt');
  const m = HOSTED.tierMinutes;
  assert.deepEqual(
    vercel.querySelectorAll('.o-note').map((n) => n.textContent.trim()),
    ['Sandbox: Vercel Sandbox.', `On the Hobby plan a sandbox session lasts up to ${m} minutes, so a full run over ${m} minutes needs Pro.`],
  );
  assert.equal(dom.querySelector('.why').textContent.trim(), WEB_CHAT_REASON);
});

test('the configurator: the first pass reads the checked radios, enables the other choices and changes nothing else', async () => {
  let before = null;
  const snapshot = (form) =>
    [form, ...form.descendants()].map((el) => [
      el.tagName,
      el.getAttribute('class'),
      el.hidden,
      el.getAttribute('aria-describedby'),
      el.getAttribute('href'),
      el.getAttribute('style'),
      el.textContent.length,
    ]);
  const page = await configurator({ beforeScript: (form) => (before = snapshot(form)) });
  assert.deepEqual(snapshot(page.form), before, 'enabling the choices changes no class, style, text or visibility');
  assert.deepEqual(page.form.querySelectorAll('input').filter((r) => r.disabled), [], 'every choice is enabled');
  assert.equal(page.live.textContent, '', 'nothing is announced on load');
  assertState(page, stateById(HOSTED.defaultState), 'on load');
});

test('the configurator: every ordered pair of the seventeen routes, each reached by its fewest changes, ends on the right route', async () => {
  const html = await renderConfigurator();
  assert.equal(HOSTED.states.length, 17);
  let pairs = 0;
  for (const from of HOSTED.states) {
    for (const to of HOSTED.states) {
      if (from === to) continue;
      const page = await configurator({ html });
      reach(page, from);
      assertState(page, from, `at ${from.id}`);
      const steps = reach(page, to);
      assert.ok(steps.length >= 1 && steps.length <= 3, `${from.id} to ${to.id}: ${steps.join(', ')}`);
      assertState(page, to, `${from.id} to ${to.id} (${steps.join(', ')})`);
      pairs += 1;
    }
  }
  assert.equal(pairs, 272);
});

test('the configurator (AE2): Vercel with web chat to Railway disables the web chat and picks Slack; back to Vercel restores it', async () => {
  const page = await configurator();
  page.pick('host', 'railway');
  assert.equal(page.web.disabled, true);
  assert.equal(page.why.hidden, false);
  assert.equal(page.checked('channel'), 'slack');
  assertState(page, stateById('railway-slack'), 'Railway');
  page.pick('host', 'vercel');
  assert.equal(page.checked('channel'), 'web', 'the web chat is checked again');
  assertState(page, stateById('vercel-web'), 'back on Vercel');
});

test('the configurator: the reader\'s own choices survive a trip: Slack through Railway, Daytona through Vercel', async () => {
  const page = await configurator();
  page.pick('channel', 'slack');
  page.pick('host', 'railway');
  page.pick('host', 'vercel');
  assert.equal(page.checked('channel'), 'slack', 'Slack stays');
  assertState(page, stateById('vercel-slack'), 'Vercel with Slack after Railway');

  const server = await configurator();
  server.pick('host', 'server');
  server.pick('sandbox', 'daytona');
  server.pick('host', 'vercel');
  server.pick('host', 'server');
  assert.equal(server.checked('sandbox'), 'daytona', 'Daytona stays');
  assertState(server, stateById('server-daytona-slack'), 'own server with Daytona after Vercel');
});

test('the configurator (AE3): your own server with Daytona shows the data module\'s names and the README\'s commands', async () => {
  const page = await configurator();
  page.pick('host', 'server');
  page.pick('sandbox', 'daytona');
  assert.ok(page.names().includes('DAYTONA_API_KEY'));
  assert.ok(page.names().includes('AB_SANDBOX=daytona'));
  assertState(page, stateById('server-daytona-slack'), 'own server with Daytona');
  const block = page.form.querySelector('.res[data-res="server"]');
  const lines = block.querySelectorAll('.ln').map((ln) => ln.textContent.replace(/^\$/, ''));
  // the README's block read without the data module: comment lines and trailing comments dropped
  const fence = README.match(/^### Your own server\n[\s\S]*?```bash\n([\s\S]*?)```/m)[1];
  const readmeLines = fence
    .split('\n')
    .filter((l) => l && !/^\s*#/.test(l))
    .map((l) => l.replace(/\s+#.*$/, '').trimEnd());
  // with the model line before the build, since the lead's model is read at build
  readmeLines.splice(readmeLines.indexOf('npm run build'), 0, 'export AB_ROSTER=quality');
  assert.deepEqual(lines, readmeLines);
  const copy = block.querySelector('.copy-btn');
  assert.equal(copy.dataset.copy, readmeLines.join('\n'), 'the copy control copies the commands without prompts');
  assert.equal(copy.getAttribute('aria-label'), 'Copy the commands for your own server');
});

test('the configurator: the Railway button links the template, and the README\'s Railway section with the caption when no address exists', async () => {
  const address = 'https://railway.com/deploy/agent-blueprint-railway';
  const withAddress = parseHtml(await renderConfigurator()).querySelector('.res[data-res="railway"]');
  assert.equal(hostOf('railway').address, address, 'the README carries the template address');
  assert.equal(withAddress.querySelector('a').href, address);
  assert.equal(withAddress.querySelector('a').textContent.trim(), 'Deploy on Railway');
  assert.equal(withAddress.querySelector('.res-cap'), null, 'no caption');

  const readme = README.replace(`**With the button.** The [Railway template](${address})`, '**With the button.** The Railway template');
  assert.notEqual(readme, README, 'the test README drops the address');
  const hosted = buildHosted(readme, { repoUrl: REPO_URL });
  const res = parseHtml(await renderConfigurator({ hosted })).querySelector('.res[data-res="railway"]');
  assert.equal(res.querySelector('a').href, hosted.links.railway);
  assert.equal(res.querySelector('.res-cap').textContent.trim(), 'The template is published with the release.');
});

test('the configurator: with Slack on any host the Slack sentence shows under the names and links the README\'s After the deploy', async () => {
  const page = await configurator();
  const note = page.slackNote();
  assert.equal(note.parent, page.form.querySelector('.names').parent, 'the sentence sits with the names');
  assert.equal(note.querySelector('a').href, HOSTED.links.afterDeploy);
  assert.equal(note.hidden, true, 'hidden with the web chat');
  for (const id of ['vercel-slack', 'railway-slack', 'server-docker-slack', 'server-daytona-slack', 'vercel-web']) {
    reach(page, stateById(id));
    assert.equal(note.hidden, stateById(id).channel !== 'slack', id);
  }
});

test('the configurator: with Linear or Telegram on any host the Pre-flight sentence shows under the names and links the README\'s Pre-flight', async () => {
  const page = await configurator();
  const note = page.preNote();
  assert.equal(note.parent, page.form.querySelector('.names').parent, 'the sentence sits with the names');
  assert.equal(note.querySelector('a').href, HOSTED.links.preflight);
  assert.equal(note.hidden, true, 'hidden with the web chat');
  for (const id of ['vercel-linear', 'railway-telegram', 'server-docker-linear', 'vercel-slack', 'vercel-web', 'vercel-mcp']) {
    reach(page, stateById(id));
    assert.equal(note.hidden, !['linear', 'telegram'].includes(stateById(id).channel), id);
    assert.equal(page.slackNote().hidden, stateById(id).channel !== 'slack', `${id}: the Slack sentence`);
  }
});

test('the configurator: the live region reads the result sentence, with the reason when the host forces Slack', async () => {
  const page = await configurator();
  const count = (id) => stateById(id).names.length;
  page.pick('host', 'railway');
  assert.equal(page.live.textContent, `Deploy on Railway, with ${count('railway-slack')} variables. ${WEB_CHAT_REASON}.`);
  page.pick('host', 'server');
  assert.equal(page.live.textContent, `The commands for your own server, with ${count('server-docker-slack')} variables. ${WEB_CHAT_REASON}.`);
  page.pick('host', 'vercel');
  assert.equal(page.live.textContent, `Deploy to Vercel, with ${count('vercel-web')} variables.`);
  page.pick('channel', 'slack');
  assert.equal(page.live.textContent, `Deploy to Vercel, with ${count('vercel-slack')} variables.`);
  page.pick('host', 'railway');
  assert.equal(page.live.textContent, `Deploy on Railway, with ${count('railway-slack')} variables.`, 'Slack was the reader\'s own choice');
});

test('the configurator: three changes within the swap delay end on the last choice with no leftover swap state', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const page = await configurator({ reduced: false });
  // three changes 60 ms apart, each inside the 160 ms swap of the one before
  page.pick('host', 'railway');
  t.mock.timers.tick(60);
  page.pick('host', 'server');
  t.mock.timers.tick(60);
  page.pick('sandbox', 'daytona');
  t.mock.timers.tick(40);
  assert.equal(page.result.classList.contains('is-swapping'), true, 'the result stays faded while the choices change');
  assert.deepEqual(page.shownResults(), ['vercel'], 'no earlier choice is shown on the way');
  t.mock.timers.tick(119);
  assert.equal(page.result.classList.contains('is-swapping'), true);
  t.mock.timers.tick(1);
  assert.equal(page.result.classList.contains('is-swapping'), false);
  assertState(page, stateById('server-daytona-slack'), 'after the swap');
  t.mock.timers.tick(1000);
  assert.equal(page.result.classList.contains('is-swapping'), false, 'no swap is left pending');
  assertState(page, stateById('server-daytona-slack'), 'a second later');
});

test('the configurator: with reduced motion the result swaps at once', async () => {
  const page = await configurator({ reduced: true });
  page.pick('host', 'railway');
  assert.equal(page.result.classList.contains('is-swapping'), false);
  assertState(page, stateById('railway-slack'), 'at once');
});

// ---- the Models row (rulings 30, 33, 34 and 37; the approved mock v3.2) ----

const ROSTER = HOSTED.roster;
const NAME = new Map(SAVED_MODELS.map((m) => [m.id, m.name]));
const presetRows = (preset) => ROSTER.roles.map((r) => [r[0].toUpperCase() + r.slice(1), NAME.get(ROSTER.presets[preset][r])]);
const ASTRA = 'openai/gpt-6-astra';

test('the Models row: Quality checked with its model for each role, the line, and one shared list of the Gateway models', async () => {
  const dom = parseHtml(await renderConfigurator());
  const row = dom.querySelector('.cfg-models');
  assert.equal(row.querySelector('legend').textContent, 'Models');
  const radios = row.querySelectorAll('input[name="models"]');
  assert.deepEqual(radios.map((r) => [r.value, r.closest('.opt').textContent.trim(), r.hasAttribute('checked'), r.disabled]), [
    ['quality', 'Quality', true, false],
    ['budget', 'Budget', false, true],
    ['role', 'Per role', false, true],
  ]);
  assert.equal(row.querySelector('.roles-line').textContent, 'A preset sets the model for every role, and Per role lets you change any of them.');
  const roles = row.querySelector('#cfg-roles');
  assert.equal(roles.dataset.mode, 'preset');
  assert.deepEqual(
    roles.querySelectorAll('li').map((li) => [li.querySelector('label').textContent, li.querySelector('.role-model').textContent]),
    presetRows('quality'),
  );
  assert.deepEqual(presetRows('quality').map((r) => r[1]), ['Claude Opus 5.5', 'Claude Opus 5.5', 'Claude Opus 5.5', 'GPT-6 Astra', 'Claude Sonnet 5.5', 'Claude Sonnet 5.5', 'Claude Haiku 5.5']);
  // each select is labelled by its role and holds only its default until Per role opens
  for (const li of roles.querySelectorAll('li')) {
    const select = li.querySelector('select');
    assert.equal(li.querySelector('label').getAttribute('for'), select.id);
    assert.equal(select.getAttribute('autocomplete'), 'off');
    assert.deepEqual(select.options.map((o) => [o.value, o.textContent]), [[ROSTER.presets.quality[select.dataset.role], NAME.get(ROSTER.presets.quality[select.dataset.role])]]);
  }
  // the list is written once, grouped by provider and sorted by name, the Gateway's names as labels
  const templates = dom.querySelectorAll('template');
  assert.equal(templates.length, 1);
  const groups = templates[0].querySelectorAll('optgroup').map((g) => [g.getAttribute('label'), g.querySelectorAll('option').map((o) => [o.value, o.textContent])]);
  assert.deepEqual(groups, groupModels(SAVED_MODELS).map((g) => [g.provider, g.models.map((m) => [m.id, m.name])]));
  assert.equal(dom.querySelectorAll('option').length, SAVED_MODELS.length + ROSTER.roles.length, 'no other copy of the list');
  assert.deepEqual(radios.filter((r) => r.hasAttribute('aria-controls')).map((r) => r.getAttribute('aria-controls')), ['cfg-roles']);
});

test('the Models row: the model chunk loads on the first interaction with the row, never on load or for a host change', async () => {
  const page = await configurator();
  assert.deepEqual(page.imports, [], 'nothing loads with the page');
  page.pick('host', 'railway');
  page.pick('channel', 'slack');
  page.pick('host', 'vercel');
  assert.deepEqual(page.imports, [], 'host and channel changes need no model code');
  const row = page.form.querySelector('.cfg-models');
  row.dispatch('pointerover');
  row.dispatch('focusin');
  await settle();
  assert.deepEqual(page.imports, ['./model-choice'], 'pointing at the row starts the one load');
  page.pick('models', 'budget');
  await settle();
  assert.deepEqual(page.imports, ['./model-choice']);
  assertState(page, stateById('vercel-web'), 'Budget', [['AB_ROSTER', 'budget']]);

  // a pick made before the chunk arrives is applied when it does
  const later = await configurator();
  later.pick('models', 'budget');
  assert.deepEqual(later.imports, ['./model-choice']);
  await settle();
  assert.deepEqual(later.roleRows(), presetRows('budget'));
  assertState(later, stateById('vercel-web'), 'Budget picked before the chunk', [['AB_ROSTER', 'budget']]);
});

test('the Models row: Budget lists the budget models and sets AB_ROSTER=budget on every route', async () => {
  const page = await configurator();
  page.pick('models', 'budget');
  await settle();
  assert.deepEqual(page.roleRows(), presetRows('budget'));
  assert.deepEqual(presetRows('budget').map((r) => r[1]), ['GLM 5.3', 'GLM 5.3', 'GLM 5.3', 'DeepSeek V4.1 Flash 1017', 'DeepSeek V4.1 Flash 1017', 'DeepSeek V4.1 Flash 1017', 'DeepSeek V4.1 Flash 1017']);
  assert.equal(page.form.querySelector('#cfg-roles').dataset.mode, 'preset');
  const vars = [['AB_ROSTER', 'budget']];
  for (const state of HOSTED.states) {
    reach(page, state);
    assertState(page, state, `Budget on ${state.id}`, vars);
  }
  page.pick('host', 'vercel');
  page.pick('channel', 'web');
  assert.deepEqual(JSON.parse(new URL(page.vercelLink()).searchParams.get('envDefaults')), { AB_ROSTER: 'budget' });
  page.pick('models', 'quality');
  assert.deepEqual(page.roleRows(), presetRows('quality'));
  assertState(page, stateById('vercel-web'), 'back to Quality');
  assert.equal(page.vercelLink(), stateById('vercel-web').link, 'the static link again');
});

test('the Models row: Per role from Budget with the reviewer on GPT-6 Astra composes the variables the mock notes record', async () => {
  const page = await configurator();
  page.pick('models', 'budget');
  await settle();
  page.pick('models', 'role');
  assert.equal(page.form.querySelector('#cfg-roles').dataset.mode, 'role');
  // each select now offers the whole list, set to the preset chosen last
  for (const role of ROSTER.roles) {
    const select = page.select(role);
    assert.equal(select.options.length, SAVED_MODELS.length, `${role} offers every model`);
    assert.equal(select.value, ROSTER.presets.budget[role], `${role} starts on the budget model`);
  }
  assertState(page, stateById('vercel-web'), 'Per role, nothing changed yet', [['AB_ROSTER', 'budget']]);
  page.pickModel('reviewer', ASTRA);
  const vars = [['AB_ROSTER', 'budget'], ['AB_MODEL_REVIEWER', ASTRA]];
  assertState(page, stateById('vercel-web'), 'the reviewer on GPT-6 Astra', vars);
  const p = new URL(page.vercelLink()).searchParams;
  assert.deepEqual(p.get('env').split(','), ['AB_ROSTER', 'AB_MODEL_REVIEWER', 'AB_GITHUB_APP_ID', 'AB_GITHUB_APP_PRIVATE_KEY', 'EVE_CHAT_PASSWORD']);
  assert.deepEqual(JSON.parse(p.get('envDefaults')), { AB_ROSTER: 'budget', AB_MODEL_REVIEWER: ASTRA });
  assert.equal(page.live.textContent, `Deploy to Vercel, with ${stateById('vercel-web').names.length + 1} variables.`);
  for (const id of ['vercel-slack', 'railway-slack', 'server-docker-slack', 'server-daytona-slack']) {
    reach(page, stateById(id));
    assertState(page, stateById(id), `the reviewer on GPT-6 Astra, ${id}`, vars);
  }
  assert.equal(page.exportLine(), `export AB_ROSTER=budget AB_MODEL_REVIEWER=${ASTRA}`);
  assert.equal(page.live.textContent, `The commands for your own server, with ${stateById('server-daytona-slack').names.length + 1} variables.`);
  // a model from neither preset composes the same way, in the README's role order
  page.pickModel('documenter', 'moonshotai/kimi-k2');
  assert.equal(page.exportLine(), `export AB_ROSTER=budget AB_MODEL_REVIEWER=${ASTRA} AB_MODEL_DOCUMENTER=moonshotai/kimi-k2`);
  // a pick set back to the preset's model drops its variable
  page.pickModel('reviewer', ROSTER.presets.budget.reviewer);
  page.pickModel('documenter', ROSTER.presets.budget.documenter);
  assertState(page, stateById('server-daytona-slack'), 'both picks set back', [['AB_ROSTER', 'budget']]);
});

test('the Models row: Per role starts from the preset chosen last and keeps the picks while that preset stays', async () => {
  const page = await configurator();
  page.pick('models', 'role');
  await settle();
  assert.equal(page.select('reviewer').value, ROSTER.presets.quality.reviewer, 'from Quality, the quality models');
  page.pickModel('tester', 'zai/glm-5.3');
  page.pick('models', 'quality');
  assert.deepEqual(page.roleRows(), presetRows('quality'), 'a preset shows its own models');
  assertState(page, stateById('vercel-web'), 'Quality again');
  page.pick('models', 'role');
  assert.equal(page.select('tester').value, 'zai/glm-5.3', 'the pick is kept while the preset is the same');
  assertState(page, stateById('vercel-web'), 'Per role again', [['AB_ROSTER', 'quality'], ['AB_MODEL_TESTER', 'zai/glm-5.3']]);
  page.pick('models', 'budget');
  page.pick('models', 'role');
  assert.deepEqual(ROSTER.roles.map((r) => page.select(r).value), ROSTER.roles.map((r) => ROSTER.presets.budget[r]), 'a new preset resets the selects');
  assertState(page, stateById('vercel-web'), 'Per role from Budget', [['AB_ROSTER', 'budget']]);
});

test('the Models row: when the chunk cannot load, the row goes back to the default preset and the next interaction tries again', async () => {
  let fail = true;
  const page = await configurator({ chunk: async () => (fail ? Promise.reject(new Error('offline')) : modelChoiceChunk()) });
  page.pick('models', 'budget');
  await settle();
  assert.equal(page.checked('models'), 'quality', 'the page never shows a choice its link does not carry');
  assertState(page, stateById('vercel-web'), 'after the failed load');
  fail = false;
  page.pick('models', 'budget');
  await settle();
  assert.equal(page.imports.length, 2);
  assert.deepEqual(page.roleRows(), presetRows('budget'));
  assertState(page, stateById('vercel-web'), 'after the retry', [['AB_ROSTER', 'budget']]);
});

test('the export line the chunk writes is marked up as Cmd marks the static one', async () => {
  const html = await renderConfigurator();
  const server = HOSTED.hosts.find((h) => h.id === 'server');
  const lines = [...html.slice(html.indexOf('data-res="server"')).matchAll(/<span class="ln">([\s\S]*?)<\/span>(?=<span class="ln">|<\/code>)/g)].map((m) => m[1]);
  const wrap = (text) => wrapPoints.breakAfterSlashes(wrapPoints.keepFlagsWhole(escapeHtml(text)));
  assert.equal(lines[server.exportAt], `<span class="pr" aria-hidden="true">$</span>${wrap('export AB_ROSTER=quality')}`);
  const source = readFileSync(new URL('../src/components/hosted/model-choice.ts', import.meta.url), 'utf8');
  assert.match(source, /<span class="pr" aria-hidden="true">\$<\/span>\$\{breakAfterSlashes\(keepFlagsWhole\(escapeHtml\(/);
});

test('the Linear rows show up in the channel row and routes, and taking them out takes them away, with no page change', async () => {
  const html = await renderConfigurator();
  const dom = parseHtml(html);
  assert.deepEqual(dom.querySelectorAll('input[name="channel"]').map((r) => r.value), ['web', 'slack', 'linear', 'telegram', 'mcp']);
  assert.equal(dom.querySelector('input[name="channel"][value="linear"]').closest('.opt').textContent.trim(), 'Linear');
  const page = await configurator({ html });
  page.pick('host', 'railway');
  page.pick('channel', 'linear');
  assert.deepEqual(page.names(), [
    'AI_GATEWAY_API_KEY', 'AB_GITHUB_APP_ID', 'AB_GITHUB_APP_PRIVATE_KEY', 'LINEAR_CLIENT_ID', 'LINEAR_CLIENT_SECRET', 'LINEAR_WEBHOOK_SECRET', 'AB_SANDBOX=daytona', 'DAYTONA_API_KEY',
  ]);
  assert.equal(page.form.querySelector('.cfg-slack').hidden, true);
  page.pick('host', 'vercel');
  assert.equal(page.checked('channel'), 'linear');
  const env = new URL(page.vercelLink()).searchParams.get('env').split(',');
  assert.deepEqual(env, ['AB_ROSTER', 'AB_GITHUB_APP_ID', 'AB_GITHUB_APP_PRIVATE_KEY', 'LINEAR_CLIENT_ID', 'LINEAR_CLIENT_SECRET', 'LINEAR_WEBHOOK_SECRET']);
  const rows = README.split('\n').filter((l) => l.startsWith('| `LINEAR_'));
  assert.equal(rows.length, 3);
  const without = buildHosted(README.split('\n').filter((l) => !rows.includes(l)).join('\n'), { repoUrl: REPO_URL });
  const fewer = parseHtml(await renderConfigurator({ hosted: without }));
  assert.deepEqual(fewer.querySelectorAll('input[name="channel"]').map((r) => r.value), ['web', 'slack', 'telegram', 'mcp']);
});

