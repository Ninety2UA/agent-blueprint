// Tests for the Hosted page's loops (site/motion/hosted/, RENDER.md "Hosted loops"): each piece in
// pieces.json has its seek-driven source, and its MP4, JPG poster and AVIF posters in site/public/media
// have the frame, length, layout and size the page budget allows. The loops join LOOPS with a portrait
// cut, which loop() returns beside the landscape one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { fileFacts } from '../src/components/kit/files.mjs';
import { LOOPS } from '../src/components/kit/kit-data.ts';
import { loop } from '../src/components/loops.ts';
import { readMp4Facts } from '../src/components/media.ts';
import { findRepoRoot } from '../src/lib/site.mjs';

const root = findRepoRoot();
const site = join(root, 'site');
const media = join(site, 'public', 'media');
const hosted = join(site, 'motion', 'hosted');
const manifest = JSON.parse(readFileSync(join(hosted, 'pieces.json'), 'utf8'));
const pieces = manifest.pieces;

// R10: no new loop may outweigh the largest loop the site already had (loop-install.mp4, in bytes)
const LOOP_CAP = 543038;
// KTD5: each AVIF poster (Fig. 1's, and the portrait posters of Figs. 2 and 3 by ruling 38), in the
// site's KB (files.mjs humanSize)
const AVIF_CAP = 20 * 1024;
// Fig. 2's prerequisites piece ships as exported (ruling 41); ruling 42 records its phone poster,
// encoded the ruling 38 way (CRF 40, preset 8), so that file's cap is its size as exported: 25,255
// bytes since ruling 55's re-export with the new Linear row (25,201 before)
const AVIF_CAPS = { 'loop-prereqs-portrait-720': 25255 };
const SITE_PREFIX = 'Looping animation, no sound: ';

// An AVIF's frame size is in its ispe property: version and flags, then width and height.
function avifSize(file) {
  const buf = readFileSync(file);
  const at = buf.indexOf('ispe', 0, 'latin1');
  assert.ok(at > 0, `${file}: no ispe box`);
  return { width: buf.readUInt32BE(at + 8), height: buf.readUInt32BE(at + 12) };
}

test('pieces.json names each hosted piece once, with a source folder for each and nothing else', () => {
  const names = pieces.map((p) => p.name);
  assert.ok(names.length > 0, 'pieces.json lists no piece');
  assert.equal(new Set(names).size, names.length, 'a piece is listed twice');
  const folders = readdirSync(hosted, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  assert.deepEqual(folders.sort(), [...names].sort());
  for (const p of pieces) {
    assert.ok(p.name.startsWith('loop-'), `${p.name}: hosted loops keep the site's loop- names`);
    assert.ok(p.poster >= 0 && p.poster < p.seconds, `${p.name}: poster time ${p.poster} is outside the loop`);
  }
});

test('every hosted MP4 has its frame and length, moov before mdat, and fits under the largest loop', () => {
  for (const p of pieces) {
    const file = join(media, `${p.name}.mp4`);
    assert.ok(existsSync(file), `${p.name}.mp4 is missing from site/public/media`);
    const f = readMp4Facts(file);
    assert.deepEqual([f.width, f.height], [p.width, p.height], `${p.name}: frame size`);
    assert.ok(Math.abs(f.duration - p.seconds) < 0.05, `${p.name}: ${f.duration} s, pieces.json says ${p.seconds} s`);
    assert.equal(f.faststart, true, `${p.name}: the moov box comes after mdat (no faststart)`);
    const bytes = statSync(file).size;
    assert.ok(bytes <= LOOP_CAP, `${p.name}.mp4 is ${bytes} bytes, over ${LOOP_CAP}`);
  }
});

test('the box reader takes a filesystem path and says whether moov comes first', () => {
  const f = readMp4Facts(join(media, 'loop-review.mp4'));
  assert.deepEqual([f.width, f.height], [1200, 750]);
  assert.equal(typeof f.faststart, 'boolean');
});

test('every hosted MP4 has a JPG poster beside it at the same frame size', () => {
  for (const p of pieces) {
    const jpg = join(media, `${p.name}.jpg`);
    assert.ok(existsSync(jpg), `${p.name}.jpg is missing`);
    assert.equal(fileFacts(jpg).frame, `${p.width} × ${p.height}`, `${p.name}.jpg frame size`);
  }
});

test('the AVIF posters exist at the widths pieces.json names, each within the budget and under its JPG', () => {
  const avifs = pieces.flatMap((p) => (p.avif ?? []).map((w) => ({ p, w })));
  assert.deepEqual(
    avifs.map(({ p, w }) => `${p.name}-${w}`).sort(),
    [
      'loop-prereqs-portrait-720',
      'loop-request-to-pr-1200',
      'loop-request-to-pr-600',
      'loop-request-to-pr-portrait-720',
      'loop-routes-portrait-720',
    ],
  );
  for (const { p, w } of avifs) {
    const file = join(media, `${p.name}-${w}.avif`);
    assert.ok(existsSync(file), `${p.name}-${w}.avif is missing`);
    assert.deepEqual(avifSize(file), { width: w, height: Math.round((w * p.height) / p.width) }, `${p.name}-${w}.avif size`);
    const bytes = statSync(file).size;
    const cap = AVIF_CAPS[`${p.name}-${w}`] ?? AVIF_CAP;
    assert.ok(bytes <= cap, `${p.name}-${w}.avif is ${bytes} bytes, over ${cap}`);
    const jpg = statSync(join(media, `${p.name}.jpg`)).size;
    assert.ok(bytes < jpg, `${p.name}-${w}.avif is ${bytes} bytes, not under its JPG's ${jpg}`);
  }
});

// Ruling 38: the phone posters of Figs. 2 and 3 are the CRF 40 sample Dominik approved (SVT-AV1 at its
// default preset, 8), below the pipeline's CRF 22, which alone did not bring the page to 100 (U9 F2);
// each piece records its own CRF and preset so a re-render repeats them.
test('the portrait cuts of Figs. 2 and 3 record their AVIF CRF and preset; Fig. 1 keeps the pipeline default', () => {
  const settings = Object.fromEntries(
    pieces.filter((p) => p.avif).map((p) => [p.name, [p.avifCrf ?? manifest.avifCrf, p.avifPreset ?? manifest.avifPreset]]),
  );
  assert.deepEqual(settings, {
    'loop-request-to-pr': [22, 4],
    'loop-request-to-pr-portrait': [22, 4],
    'loop-prereqs-portrait': [40, 8],
    'loop-routes-portrait': [40, 8],
  });
});

test('every effect.html keeps window.seek, loads the site font, and has no inlined font, address or dash', () => {
  for (const p of pieces) {
    const html = readFileSync(join(hosted, p.name, 'effect.html'), 'utf8');
    assert.match(html, /window\.seek\s*=/, `${p.name}: no window.seek`);
    assert.doesNotMatch(html, /base64,/, `${p.name}: an inlined base64 font is left`);
    // the SVG namespace is a name, not a request
    assert.doesNotMatch(html.replaceAll('http://www.w3.org/2000/svg', ''), /\b(?:https?:)?\/\/[a-z0-9-]+\.[a-z]/i, `${p.name}: a network address`);
    assert.doesNotMatch(html, /[\u2013\u2014]/, `${p.name}: an em or en dash`);
    const fonts = [...html.matchAll(/url\("([^"]+\.woff2)"\)/g)].map((m) => m[1]);
    assert.ok(fonts.length > 0, `${p.name}: no font reference for the exporter to fill`);
    for (const f of fonts) {
      assert.match(f, /^\.\.\/\.\.\/\.\.\/src\/assets\/fonts\//, `${p.name}: ${f} is not one of the site's font files`);
      assert.ok(existsSync(join(hosted, p.name, f)), `${p.name}: ${f} does not exist`);
    }
  }
});

test('each hosted loop is in LOOPS with the site prefix on its alt, and loop() returns both cuts', () => {
  const landscape = pieces.filter((p) => !p.name.endsWith('-portrait'));
  assert.ok(landscape.length > 0);
  for (const p of landscape) {
    const entry = LOOPS.find((l) => l.name === p.name);
    assert.ok(entry, `${p.name} is not in LOOPS`);
    assert.ok(entry.alt.startsWith(SITE_PREFIX) && entry.alt.length > SITE_PREFIX.length + 20, `${p.name}: alt`);
    assert.ok(entry.caption && entry.label, `${p.name}: caption and label`);
    const got = loop(p.name);
    assert.equal(got.src, `/media/${p.name}.mp4`);
    assert.equal(got.portraitSrc, `/media/${p.name}-portrait.mp4`);
    assert.ok(pieces.some((q) => q.name === `${p.name}-portrait`), `${p.name}-portrait is not in pieces.json`);
  }
});

test('a loop with one cut returns no portraitSrc', () => {
  const one = loop('loop-review');
  assert.equal(one.src, '/media/loop-review.mp4');
  assert.equal(one.portraitSrc, undefined);
});

// Ruling 41: the prerequisites piece replaces the one-repo loop as the Hosted page's Fig. 2, so no
// loop file in site/public/media is left without a LOOPS entry to show it.
test('every loop file in site/public/media belongs to a LOOPS entry, and the one-repo loop is gone', () => {
  const owned = new Set(LOOPS.flatMap((l) => [l.name, l.portrait].filter(Boolean)));
  const loose = readdirSync(media)
    .filter((f) => f.startsWith('loop-'))
    .filter((f) => !owned.has(f.replace(/(?:-\d+)?\.(?:mp4|jpg|avif)$/, '')));
  assert.deepEqual(loose, []);
  assert.equal(LOOPS.find((l) => l.name === 'loop-one-repo'), undefined);
});

test("Fig. 2's prerequisites piece is a 12-second loop in both cuts with its poster at 2.2 s", () => {
  const got = pieces.filter((p) => p.name.startsWith('loop-prereqs')).map(({ name, width, height, seconds, poster }) => [name, width, height, seconds, poster]);
  assert.deepEqual(got, [
    ['loop-prereqs', 1200, 750, 12, 2.2],
    ['loop-prereqs-portrait', 720, 900, 12, 2.2],
  ]);
});
