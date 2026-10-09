// Tests for the Archivo fallback faces in site/src/styles/global.css and their wiring through the
// Fonts API in site/astro.config.mjs. Archivo loads with font-display: block, so until it arrives
// the browser lays the page out, invisibly, in the first fallback family. These faces carry
// Archivo's measured widths and its vertical metrics, so that layout already has Archivo's line
// breaks and nothing moves when Archivo replaces it. The widths themselves were measured in the
// browser; these tests hold what can be checked without one: every font-stretch and font-weight
// the stylesheets use has a face for spaces, digits and letters, the metric overrides come out at
// Archivo's ascent, descent and line gap, and the built pages use these faces instead of the
// fallback Astro generates.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { findRepoRoot } from '../src/lib/site.mjs';

const root = findRepoRoot();
const styles = join(root, 'site', 'src', 'styles');
const dist = join(root, 'site', 'dist');
const skip = !existsSync(join(dist, 'index.html')) && 'site/dist is not built (run npm run build in site/)';

// Archivo-var.woff2: ascender 878, descender -210, line gap 0, at 1000 units per em (hhea and OS/2).
const ARCHIVO = { ascent: 87.8, descent: 21.0, lineGap: 0 };
const FAMILY = 'Archivo Fallback';

const css = Object.fromEntries(readdirSync(styles).filter((f) => f.endsWith('.css')).map((f) => [f, readFileSync(join(styles, f), 'utf8')]));

const range = (value, unit) => {
  const [lo, hi = lo] = value.trim().split(/\s+/).map((v) => Number.parseFloat(v.replace(unit, '')));
  return [lo, hi];
};
const unicodeRanges = (value) =>
  (value ?? 'U+0-10FFFF').split(',').map((r) => {
    const [lo, hi = lo] = r.trim().replace(/^U\+/i, '').split('-').map((h) => Number.parseInt(h, 16));
    return [lo, hi];
  });

const faces = [...css['global.css'].matchAll(/@font-face\s*\{([^}]*)\}/g)]
  .map(([, body]) => Object.fromEntries([...body.matchAll(/([\w-]+)\s*:\s*([^;]+)/g)].map(([, k, v]) => [k, v.trim()])))
  .filter((f) => f['font-family']?.replace(/["']/g, '') === FAMILY)
  .map((f) => ({
    ...f,
    weight: range(f['font-weight'], ''),
    stretch: range(f['font-stretch'], '%'),
    chars: unicodeRanges(f['unicode-range']),
    pct: (k) => Number.parseFloat(f[k]),
  }));

// The font-stretch and font-weight values the stylesheets set, with the tokens resolved.
const tokens = Object.fromEntries([...css['tokens.css'].matchAll(/(--w-[\w-]+)\s*:\s*([\d.]+)%/g)].map(([, k, v]) => [k, Number(v)]));
const used = (prop, parse) => new Set(Object.values(css).flatMap((text) => [...text.matchAll(new RegExp(`${prop}\\s*:\\s*([^;}]+)`, 'g'))].map(([, v]) => parse(v.trim()))).filter((v) => v !== null));
const stretches = used('font-stretch', (v) => (v.startsWith('var(') ? tokens[v.slice(4, -1)] : v === 'normal' ? 100 : Number.parseFloat(v)));
const weights = used('font-weight', (v) => (v === 'normal' ? 400 : v === 'bold' ? 700 : /^\d+$/.test(v) ? Number(v) : null));
weights.add(400).add(700); // body text and <strong>

test('every font-stretch and font-weight the stylesheets use has a fallback face for spaces, digits and letters', () => {
  assert.ok(faces.length > 0, `no @font-face for "${FAMILY}" in global.css`);
  assert.ok(stretches.has(118) && stretches.has(112), 'the display widths were not read from tokens.css');
  const missing = [];
  for (const s of stretches) {
    for (const w of weights) {
      const match = faces.filter((f) => f.stretch[0] <= s && s <= f.stretch[1] && f.weight[0] <= w && w <= f.weight[1]);
      for (const ch of [0x20, 0x30, 0x61]) {
        if (!match.some((f) => f.chars.some(([lo, hi]) => lo <= ch && ch <= hi))) missing.push(`${s}% ${w} U+${ch.toString(16)}`);
      }
    }
  }
  assert.deepEqual(missing, []);
});

test('each fallback face scales to Archivo ascent, descent and line gap', () => {
  for (const f of faces) {
    const k = f.pct('size-adjust') / 100;
    const label = `${f['font-stretch']} ${f['font-weight']} ${f['unicode-range'] ?? ''}`;
    assert.ok(Math.abs(f.pct('ascent-override') * k - ARCHIVO.ascent) < 0.02, `${label}: ascent`);
    assert.ok(Math.abs(f.pct('descent-override') * k - ARCHIVO.descent) < 0.02, `${label}: descent`);
    assert.equal(f.pct('line-gap-override'), ARCHIVO.lineGap, `${label}: line gap`);
    assert.match(f.src, /local\("Arial"\)/, `${label}: src`);
  }
});

test('the built pages lay Archivo text out in these faces, not in a generated fallback', { skip }, () => {
  const html = readFileSync(join(dist, 'index.html'), 'utf8');
  const archivo = html.match(/--font-archivo:([^;}]+)/)?.[1];
  assert.ok(archivo, 'no --font-archivo in index.html');
  assert.match(archivo, new RegExp(`^Archivo-\\w+,"?${FAMILY}"?,`), '--font-archivo');
  assert.doesNotMatch(html, /fallback: Arial/, 'the generated Archivo fallback is still there');
  assert.match(html, new RegExp(`@font-face\\{font-family:"?${FAMILY}"?`), 'the fallback faces were not inlined');
  assert.equal(html.match(/<link rel="preload"[^>]*as="font"/g)?.length, 1, 'one preloaded font file');
});
