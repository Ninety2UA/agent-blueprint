// Tests for Fig. 4, the chat run (site/src/components/hosted/chat-run/): the stylesheet keeps the
// site's flat look and switches stage with the loops; the loader in ChatRun.astro imports the run
// only as the figure nears the viewport and stays silent when the chunk fails; the run's words
// equal the approved source's, kept here as a snapshot since CI has no design workspace; and the
// clock's draw functions read no layout, so a tick only writes styles.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

import { deferred, runClientScript, settle } from './client-script.mjs';

const DIR = new URL('../src/components/hosted/chat-run/', import.meta.url);
const read = (name) => readFileSync(new URL(name, DIR), 'utf8');

// ---------- The stylesheet ----------

const css = () => read('chat-run.css').replace(/\/\*[\s\S]*?\*\//g, '');

test('the stylesheet holds no hex or functional colour, shadow, gradient, blur or glow', () => {
  const sheet = css();
  assert.doesNotMatch(sheet, /#[0-9a-f]{3,8}\b/i, 'hex colour');
  assert.doesNotMatch(sheet, /\b(?:rgba?|hsla?)\(/i, 'rgb or hsl colour');
  assert.doesNotMatch(sheet, /\b(?:red|yellow|green|orange)\b/i, 'traffic-light colour');
  assert.doesNotMatch(sheet, /shadow|gradient|blur|glow/i);
});

test('every class and keyframe in the stylesheet carries the crun prefix', () => {
  const sheet = css();
  const selectors = [...sheet.matchAll(/(?:^|[;{}])\s*([^{};@][^{};]*)\{/g)].map((m) => m[1]);
  const classes = selectors.flatMap((s) => [...s.matchAll(/\.(-?[a-zA-Z_][\w-]*)/g)].map((m) => m[1]));
  assert.ok(classes.length > 40, `found ${classes.length} class selectors`);
  assert.deepEqual(classes.filter((c) => !/^crun(?:-|$)/.test(c)), []);
  const frames = [...sheet.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]);
  assert.ok(frames.length > 0);
  assert.deepEqual(frames.filter((f) => !f.startsWith('crun-')), []);
});

test('the stage switches to portrait below 540 px of figure width, where the loops switch', () => {
  const sheet = css();
  assert.deepEqual([...sheet.matchAll(/@container\s*([^{]*)\{/g)].map((m) => m[1].trim()), ['(max-width: 539.98px)']);
  const block = sheet.slice(sheet.indexOf('@container'));
  for (const rule of ['.crun-alt', '.crun-view', '.crun-stage', '.crun-app', '.crun-still-wide', '.crun-still-narrow']) {
    assert.ok(block.includes(rule), `${rule} changes with the stage`);
  }
});

test('the stage is a strict containment box', () => {
  const stage = css().match(/\.crun-stage\s*\{([^}]*)\}/)[1];
  assert.match(stage, /contain:\s*strict/);
});

// ---------- The loader in ChatRun.astro ----------

function loaderPage({ chunk = deferred() } = {}) {
  const figure = { id: 'fig-4' };
  const observers = [];
  class FakeObserver {
    constructor(callback, options) {
      this.callback = callback;
      this.options = options;
      this.targets = [];
      this.connected = true;
      observers.push(this);
    }
    observe(el) {
      this.targets.push(el);
    }
    disconnect() {
      this.connected = false;
    }
    /** delivers one batch of entries, as a connected observer would */
    fire(isIntersecting) {
      if (this.connected) this.callback(this.targets.map((target) => ({ target, isIntersecting })));
    }
  }
  const imports = [];
  const idle = [];
  const mounted = [];
  const logged = [];
  const quiet = (kind) => (...args) => logged.push([kind, ...args]);
  const requestIdleCallback = (fn) => idle.push(fn);
  runClientScript('components/hosted/chat-run/ChatRun.astro', {
    globals: {
      document: { querySelectorAll: (sel) => (sel === '[data-chat-run]' ? [figure] : []) },
      IntersectionObserver: FakeObserver,
      window: { requestIdleCallback },
      requestIdleCallback,
      setTimeout: () => assert.fail('the mount waits for an idle callback'),
      console: { log: quiet('log'), warn: quiet('warn'), error: quiet('error'), info: quiet('info'), debug: quiet('debug') },
      __import(spec) {
        imports.push(spec);
        return chunk.promise;
      },
    },
  });
  const chunkModule = { mount: (el) => mounted.push(el) };
  return { figure, observers, imports, idle, mounted, logged, chunk, chunkModule };
}

test('the run is imported only once its figure comes within a screen of the viewport, never on load', async () => {
  const p = loaderPage();
  await settle();
  assert.deepEqual(p.imports, [], 'nothing is imported on load');
  assert.equal(p.observers.length, 1);
  const [io] = p.observers;
  assert.deepEqual(io.targets, [p.figure]);
  assert.equal(io.options.rootMargin, '100% 0px', 'one viewport above and below the screen');
  io.fire(false);
  assert.deepEqual(p.imports, [], 'a figure still far away loads nothing');
  io.fire(true);
  assert.deepEqual(p.imports, ['./chat-run.js']);
  assert.equal(io.connected, false, 'the observer lets go after the first approach');
  io.fire(true);
  assert.equal(p.imports.length, 1, 'imported once');
});

test('the run mounts in an idle callback after its chunk arrives', async () => {
  const p = loaderPage();
  p.observers[0].fire(true);
  p.chunk.resolve(p.chunkModule);
  await settle();
  assert.deepEqual(p.mounted, [], 'not in the import callback itself');
  assert.equal(p.idle.length, 1);
  p.idle[0]();
  assert.deepEqual(p.mounted, [p.figure]);
});

test('a chunk that fails to load leaves the sentence in place and logs nothing', async () => {
  const unhandled = [];
  const onUnhandled = (reason) => unhandled.push(reason);
  process.on('unhandledRejection', onUnhandled);
  try {
    const p = loaderPage();
    p.observers[0].fire(true);
    p.chunk.reject(new Error('chunk failed'));
    await settle();
    await settle();
    assert.deepEqual(p.idle, []);
    assert.deepEqual(p.mounted, []);
    assert.deepEqual(p.logged, []);
    assert.deepEqual(Object.keys(p.figure), ['id'], 'the figure is left as rendered');
  } finally {
    process.off('unhandledRejection', onUnhandled);
  }
  assert.deepEqual(unhandled, []);
});

// ---------- The words, as approved ----------

// Every visible string of the approved chat-run.js (~/.cache/ab-hosted-design/r2/shared/chat-demo/,
// ruling 15: the real chat text), as extracted below; "{}" marks a value filled in at run time.
const APPROVED_RUN = [
  '{}: {}',
  '{}, step by step',
  'Agent Blueprint',
  'Hosted on Eve',
  'Sessions',
  'Add a --version flag to the command-line entry point that prints the version from the package, with a test.',
  'Add input validation to the main function so an empty argument gives a clear error message, with a test.',
  'Add a short usage section to the README that shows the two most common commands and their output.',
  'Sheet',
  'New session',
  'Repository',
  'Ninety2UA/agent-blueprint-sample',
  'Pull requests open as',
  'agent-blueprint-demo[bot]',
  'The agent works on the sample repository, a small Python package with two commands and tests. Name a change, and each stage is pushed to a branch as it finishes.',
  'Suggested requests',
  'Or write your own request',
  'Send',
  'I cloned the sample repository into the sandbox and started the pipeline.',
  'I finished the plan stage and pushed the branch.',
  'I finished the execute stage and pushed the branch.',
  'I finished the review stage and pushed the branch.',
  'I finished the verify stage and pushed the branch.',
  'I finished the ship stage and pushed the branch.',
  'I opened the pull request as agent-blueprint-demo[bot]: ',
  'Add a short usage section to the README',
  'Thinking...',
  'Ask anything...',
  'Pick a request',
  'Plan',
  'Stage by stage',
  'Pull request',
  "Example run in the demo's web chat",
  'Example run',
];

// The figure's own words in the approved Hosted mock (r2/d2/index.html, Fig. 4).
const APPROVED_FIGURE = [
  "An example run in the demo's web chat. A visitor picks a suggested request, the agent pushes the branch as each stage finishes, and then it opens the pull request as the GitHub App.",
  'Fig.',
  "The demo's web chat, from a request to its pull request",
];

const PH = '\u0000';
/** Text runs of markup (tags and expressions dropped) plus aria-label values, with "{}" for a value. */
function markupText(html, out) {
  for (const m of html.matchAll(/aria-label="([^"]*)"/g)) out.push(m[1].split(PH).join('{}'));
  for (const run of html.replace(/<[^>]*>/g, PH).replace(/<[^>]*$/, PH).split(PH)) {
    const s = run.replace(/\s+/g, ' ').trim();
    if (/\p{L}/u.test(s)) out.push(s);
  }
}
/** A plain string literal that reads as words: a sentence, or one capitalised word. */
const isWords = (s) => /^\p{Lu}/u.test(s) && (/\s/.test(s) ? !/^[MLHVCSQTAZ][\d.\s,-]/.test(s) : /^\p{Lu}\p{Ll}+$/u.test(s));

/** Every visible string in a script: markup in string and template literals, and word strings. */
function scriptText(source, fileName) {
  const out = [];
  const visit = (node) => {
    if (ts.isTemplateExpression(node) && node.getText().includes('<')) {
      markupText(node.head.text + node.templateSpans.map((span) => PH + span.literal.text).join(''), out);
    } else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (node.text.includes('<')) markupText(node.text, out);
      else if (isWords(node.text)) out.push(node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(ts.createSourceFile(fileName, source, ts.ScriptTarget.ES2022, true));
  return out;
}

const sorted = (list) => [...list].sort();

test("the run's visible strings equal the approved source's, word for word", () => {
  assert.deepEqual(sorted(scriptText(read('chat-run.js'), 'chat-run.js')), sorted(APPROVED_RUN));
});

test("the figure's sentence, still text and caption are the approved mock's", () => {
  const astro = read('ChatRun.astro');
  const [, front, body] = astro.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  const out = scriptText(front, 'front.ts');
  markupText(body.replace(/<script>[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/\{[^{}]*\}/g, PH), out);
  assert.deepEqual(sorted(new Set(out)), sorted(APPROVED_FIGURE));
});

// ---------- The clock reads no layout ----------

const LAYOUT = ['offsetTop', 'offsetLeft', 'offsetWidth', 'offsetHeight', 'offsetParent', 'clientWidth', 'clientHeight', 'scrollTop', 'scrollHeight'];
/** An element whose style, classes and content can be written, and whose layout throws when read. */
function fakeElement(extra = {}) {
  const el = { style: {}, dataset: {}, className: '', innerHTML: '', ...extra };
  for (const key of LAYOUT) {
    Object.defineProperty(el, key, {
      get() {
        throw new Error(`the clock read ${key}`);
      },
    });
  }
  el.getBoundingClientRect = el.getClientRects = () => {
    throw new Error('the clock read a box');
  };
  return el;
}
function fakeStage(selectors, all = {}) {
  const $ = (sel) => {
    assert.ok(sel in selectors, `unexpected lookup ${sel}`);
    return selectors[sel];
  };
  $.all = (sel) => {
    assert.ok(sel in all, `unexpected lookup ${sel}`);
    return all[sel];
  };
  return $;
}
const textOf = (html) => html.replace(/<span class="crun-rest">[\s\S]*$/, '').replace(/<[^>]*>/g, '');

async function runSteps() {
  const { steps } = await import('../src/components/hosted/chat-run/chat-run.js');
  return steps;
}

test('the first step draws the page scroll, the hover and the pointer from t and its measured geometry alone', async () => {
  const [pick] = await runSteps();
  const scroll = fakeElement();
  const hover = fakeElement();
  const row = fakeElement({ lastChild: hover });
  const $ = fakeStage({ '[data-k="scroll"]': scroll, '[data-k="r2"]': row });
  const geo = { s: 120, rest: [1140, 712], to: [700, 480] };
  const start = pick.draw(0, $, geo);
  assert.equal(scroll.style.transform, 'translateY(0px)');
  assert.deepEqual([start.x, start.y], geo.rest);
  const end = pick.draw(pick.dur, $, geo);
  assert.equal(scroll.style.transform, 'translateY(-120px)');
  assert.equal(Number(hover.style.opacity), 1);
  assert.deepEqual([end.x, end.y, end.press], [700, 480, false]);
  assert.equal(pick.draw(3.65, $, geo).press, true, 'the click lands at 3.6 s');
});

test('the session steps stream every message and stick to the bottom from measured geometry alone', async () => {
  const steps = await runSteps();
  const [, plan, stages, pr] = steps;
  assert.equal(plan.scene, 'session');
  assert.equal(stages.scene, 'session');
  assert.equal(pr.scene, 'session');
  assert.equal(plan.measure, pr.measure, 'the scene is measured once for all its steps');
  const link = fakeElement();
  const ps = Array.from({ length: 7 }, (_, i) => fakeElement({ querySelector: (sel) => (sel === '.crun-link' && i === 6 ? link : null) }));
  const cc = fakeElement();
  const btn = fakeElement();
  const $ = fakeStage(
    {
      '[data-k="user"]': fakeElement(),
      '[data-k="think"]': fakeElement(),
      '[data-k="msg"]': fakeElement(),
      '[data-k="cc"]': cc,
      '[data-k="btn"]': btn,
    },
    { '.crun-p': ps },
  );
  const geo = { user: 80, ends: [130, 170, 210, 250, 290, 330, 400], view: 260, wait: [1150, 470], link: { x: 600, y: 520 } };
  const start = plan.draw(0, $, geo);
  assert.equal(start, null, 'no pointer while the agent works');
  assert.ok(ps.every((p) => Number(p.style.opacity) === 0), 'every message waits in its place, clear');
  assert.equal(btn.className, 'crun-btn crun-busy');
  const end = pr.draw(pr.dur, $, geo);
  assert.deepEqual(
    ps.map((p) => textOf(p.innerHTML)),
    APPROVED_RUN.slice(18, 24).concat(APPROVED_RUN[24] + APPROVED_RUN[25]),
  );
  assert.ok(ps.every((p) => !p.innerHTML.includes('crun-caret')), 'no caret once every message is in');
  assert.ok(ps.every((p) => Number(p.style.opacity) === 1));
  const y = Math.min(0, geo.view - geo.ends[6] - 24);
  assert.equal(cc.style.transform, `translateY(${y}px)`);
  assert.equal(btn.className, 'crun-btn crun-idle');
  assert.deepEqual([end.x, end.y], [geo.link.x, geo.link.y + 2 * y], 'the pointer rests on the link, scrolled with the conversation');
});
