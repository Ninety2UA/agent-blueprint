// Frame-by-frame layout check for the Hosted film (ruling 84). Loads the assembled composition
// (motion/.work/film-hosted/index.html, from `python3 build.py film-hosted`), seeks every frame (or every
// Nth), reads the screen box of every visible drawn element and asserts:
//   (a) on settled frames (window.__layout.settled), the visible content's box is centred on the frame
//       within 1 percent horizontally, its centre sits in the optical band vertically, and it stays
//       inside the 5 percent title-safe area;
//   (b) on every frame, no visible text is cut by the frame edge;
//   (c) outside the declared pans and camera moves (window.__layout.moves), no visible element is
//       partly off frame;
//   (d) on every frame, at most one accent element shows (window.__accents());
//   (e) on settled frames, every layout unit the composition marks with data-unit (each text line, the
//       card row, the button row, the mark, the sheets and panels) is centred on the frame's vertical
//       axis within 2 px, except the units declared below as a left/right pair, whose union is held
//       to the axis instead. The report lists every unit's centre offset.
// Elements inside a clip path are measured as clipped. "Visible" means an effective opacity over 0.05.
//
//   node site/motion/film-hosted/layout-check.cjs [--step N] [--report /tmp/ab-film-layout.txt]
//
// Playwright stays outside the product, as for motion/hosted/export.cjs: it loads from AB_MOTION_TOOLS
// (default ~/.cache/ab-motion-tools). Exits 1 when any check fails.
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SITE = path.resolve(__dirname, '..', '..');
const PAGE = path.join(SITE, 'motion', '.work', 'film-hosted', 'index.html');
const TOOLS = process.env.AB_MOTION_TOOLS || path.join(os.homedir(), '.cache', 'ab-motion-tools');
const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const STEP = Number(arg('--step', '1'));
// Units that sit deliberately left and right of each other: the pair, not each member, is centred.
const PAIRS = [
  ['sandbox', 'repository'],       // beat 4: the sandbox and the repository it will reach
  ['repository', 'run panel'],     // beats 5 and 6: the repository and the run panel
];
const UNIT_TOLERANCE = 2;
const REPORT = arg('--report', '/tmp/ab-film-layout.txt');

(async () => {
  if (!fs.existsSync(PAGE)) throw new Error(`${PAGE} is missing; run python3 build.py film-hosted in site/motion first`);
  const { chromium } = require(path.join(TOOLS, 'node_modules', 'playwright'));
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`file://${PAGE}`);
  await page.waitForFunction(() => window.__timelines && window.__timelines.main && window.__layout, null, { timeout: 30000 });

  const result = await page.evaluate(({ step, pairs, tol }) => {
    const L = window.__layout;
    const W = 1920, H = 1080, D = window.__duration;
    const inAny = (t, list) => list.some(([a, b]) => t >= a - 1e-6 && t <= b + 1e-6);
    const svg = document.getElementById('s');
    const leaves = [...svg.querySelectorAll('text, rect, circle, path, line')].filter((el) => !el.closest('defs, clipPath'));
    // a clip path's rect, in screen coordinates of the element that references it
    const clipBox = (el) => {
      for (let q = el; q && q !== svg; q = q.parentNode) {
        const ref = q.getAttribute && q.getAttribute('clip-path');
        if (!ref) continue;
        const rect = document.querySelector(ref.slice(4, -1) + ' rect');
        const m = q.getScreenCTM();
        const x = +rect.getAttribute('x'), y = +rect.getAttribute('y'), w = +rect.getAttribute('width'), h = +rect.getAttribute('height');
        const p1 = new DOMPoint(x, y).matrixTransform(m), p2 = new DOMPoint(x + w, y + h).matrixTransform(m);
        return { l: Math.min(p1.x, p2.x), t: Math.min(p1.y, p2.y), r: Math.max(p1.x, p2.x), b: Math.max(p1.y, p2.y) };
      }
      return null;
    };
    const opacity = (el) => { let o = 1; for (let q = el; q && q !== svg; q = q.parentNode) o *= +(q.getAttribute('opacity') ?? 1); return o; };
    const painted = (el) => {
      if (el.tagName === 'text') return !!el.textContent.trim();
      const f = el.getAttribute('fill'), s = el.getAttribute('stroke');
      return (f && f !== 'none') || (s && s !== 'none');
    };
    const label = (el) => el.tagName === 'text' ? `text "${el.textContent.trim().slice(0, 40)}"` : `${el.tagName}${el.id ? '#' + el.id : ''}`;
    const out = { frames: 0, settledFrames: 0, fails: { a: [], b: [], c: [], d: [], e: [] }, worst: { dx: 0, dy: null }, centres: [], units: {}, unitLines: [] };
    const unitEls = [...svg.querySelectorAll('[data-unit]')];
    let lastStretch = -1;
    for (let f = 0; f <= Math.round(D * 30); f += step) {
      const t = f / 30;
      window.seek(t);
      out.frames++;
      const moving = inAny(t, L.moves);
      let box = null;
      for (const el of leaves) {
        if (!painted(el) || opacity(el) <= 0.05) continue;
        const r = el.getBoundingClientRect();
        let b = { l: r.left, t: r.top, r: r.right, b: r.bottom };
        if (r.width === 0 && r.height === 0) continue;
        const c = clipBox(el);
        if (c) b = { l: Math.max(b.l, c.l), t: Math.max(b.t, c.t), r: Math.min(b.r, c.r), b: Math.min(b.b, c.b) };
        if (b.r <= b.l || b.b <= b.t) continue;
        const onFrame = b.r > 0 && b.l < W && b.b > 0 && b.t < H;
        if (!onFrame) continue;
        const partly = b.l < -0.5 || b.t < -0.5 || b.r > W + 0.5 || b.b > H + 0.5;
        if (partly && el.tagName === 'text') out.fails.b.push(`${t.toFixed(2)} s ${label(el)}`);
        else if (partly && !moving) out.fails.c.push(`${t.toFixed(2)} s ${label(el)}`);
        box = box ? { l: Math.min(box.l, b.l), t: Math.min(box.t, b.t), r: Math.max(box.r, b.r), b: Math.max(box.b, b.b) } : b;
      }
      const n = window.__accents();
      if (n > 1) out.fails.d.push(`${t.toFixed(2)} s: ${n} accent elements`);
      if (inAny(t, L.settled) && !moving && box) {
        out.settledFrames++;
        const cx = (box.l + box.r) / 2, cy = (box.t + box.b) / 2;
        const dx = Math.abs(cx - W / 2);
        out.worst.dx = Math.max(out.worst.dx, dx);
        if (f % 30 === 0) out.centres.push(`${t.toFixed(1)} s centre ${cx.toFixed(1)}, ${cy.toFixed(1)} box ${box.l.toFixed(0)}..${box.r.toFixed(0)} x ${box.t.toFixed(0)}..${box.b.toFixed(0)}`);
        const s = L.safe;
        const problems = [];
        if (dx > W * 0.01) problems.push(`centre x ${cx.toFixed(1)} is ${dx.toFixed(1)} px off`);
        if (cy < L.band[0] || cy > L.band[1]) problems.push(`centre y ${cy.toFixed(1)} outside ${L.band[0]}..${L.band[1]}`);
        if (box.l < s.x - 0.5 || box.t < s.y - 0.5 || box.r > s.x + s.w + 0.5 || box.b > s.y + s.h + 0.5) problems.push(`box ${box.l.toFixed(0)}..${box.r.toFixed(0)} x ${box.t.toFixed(0)}..${box.b.toFixed(0)} leaves the safe area`);
        if (problems.length) out.fails.a.push(`${t.toFixed(2)} s: ${problems.join('; ')}`);
        // (e) each visible unit, or its declared pair, on the frame's axis
        const vis = new Map();
        // a unit's box is the union of its visible painted parts (a group's hidden parts do not count)
        for (const el of unitEls) {
          const parts = el.matches('text, rect, circle, path, line') ? [el] : [...el.querySelectorAll('text, rect, circle, path, line')];
          let r = null;
          for (const q of parts) {
            if (!painted(q) || opacity(q) <= 0.05) continue;
            const b = q.getBoundingClientRect();
            if (!b.width && !b.height) continue;
            r = r ? { left: Math.min(r.left, b.left), right: Math.max(r.right, b.right) } : { left: b.left, right: b.right };
          }
          if (!r || r.right <= 0 || r.left >= W) continue;
          vis.set(el.getAttribute('data-unit'), r);
        }
        const covered = new Set();
        const checks = [];
        for (const pair of pairs) {
          if (!pair.every((n) => vis.has(n))) continue;
          const rs = pair.map((n) => vis.get(n));
          checks.push([pair.join(' + '), (Math.min(...rs.map((r) => r.left)) + Math.max(...rs.map((r) => r.right))) / 2]);
          pair.forEach((n) => covered.add(n));
        }
        for (const [n, r] of vis) if (!covered.has(n)) checks.push([n, (r.left + r.right) / 2]);
        const stretch = L.settled.findIndex(([a, b]) => t >= a - 1e-6 && t <= b + 1e-6);
        const first = stretch !== lastStretch;
        lastStretch = stretch;
        for (const [n, cx] of checks) {
          const off = cx - W / 2;
          const u = (out.units[n] ??= { max: 0, frames: 0 });
          u.frames++;
          if (Math.abs(off) > Math.abs(u.max)) u.max = off;
          if (Math.abs(off) > tol) out.fails.e.push(`${t.toFixed(2)} s: ${n} centred at ${cx.toFixed(1)} (${off >= 0 ? '+' : ''}${off.toFixed(1)} px)`);
        }
        if (first) out.unitLines.push(`${t.toFixed(2)} s: ` + checks.map(([n, cx]) => `${n} ${(cx - W / 2) >= 0 ? '+' : ''}${(cx - W / 2).toFixed(1)}`).join('; '));
      }
    }
    return out;
  }, { step: STEP, pairs: PAIRS, tol: UNIT_TOLERANCE });

  const lines = [];
  const pass = (k) => result.fails[k].length === 0;
  lines.push(`Hosted film layout check, ${new Date().toISOString()}`);
  lines.push(`Page: ${PAGE}`);
  lines.push(`Frames checked: ${result.frames} (every ${STEP}), settled frames measured: ${result.settledFrames}; page errors: ${errors.length}`);
  lines.push(`(a) settled content centred within 1% horizontally, centre in the optical band, inside the safe area: ${pass('a') ? 'PASS' : 'FAIL'} (worst horizontal offset ${result.worst.dx.toFixed(1)} px)`);
  lines.push(`(b) no visible text cut by the frame edge, any frame: ${pass('b') ? 'PASS' : 'FAIL'}`);
  lines.push(`(c) nothing partly off frame outside declared pans and moves: ${pass('c') ? 'PASS' : 'FAIL'}`);
  lines.push(`(d) at most one accent element per frame: ${pass('d') ? 'PASS' : 'FAIL'}`);
  lines.push(`(e) every unit (or declared pair) on the frame's axis within ${UNIT_TOLERANCE} px, settled frames: ${pass('e') ? 'PASS' : 'FAIL'}`);
  lines.push(`    declared pairs: ${PAIRS.map((p) => p.join(' + ')).join('; ')}`);
  for (const k of ['a', 'b', 'c', 'd', 'e']) {
    if (!result.fails[k].length) continue;
    lines.push('', `Failures (${k}), ${result.fails[k].length}:`, ...result.fails[k].slice(0, 60));
  }
  lines.push('', 'Largest centre offset of each unit over the settled frames (px from the axis; frames measured):',
    ...Object.entries(result.units).map(([n, u]) => `  ${n}: ${u.max >= 0 ? '+' : ''}${u.max.toFixed(2)} (${u.frames})`));
  lines.push('', 'Every unit\'s centre offset at the start of each settled stretch:', ...result.unitLines);
  lines.push('', 'Settled content centres, one per second:', ...result.centres);
  if (errors.length) lines.push('', 'Page errors:', ...errors);
  fs.writeFileSync(REPORT, lines.join('\n') + '\n');
  console.log(lines.slice(0, 10).join('\n'));
  console.log(`report: ${REPORT}`);
  await browser.close();
  process.exit(['a', 'b', 'c', 'd', 'e'].every(pass) && !errors.length ? 0 : 1);
})().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
