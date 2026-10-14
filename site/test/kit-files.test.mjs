// Tests for site/src/components/kit/files.mjs: the facts the Kit page lists for each file (format,
// frame, length, size) are read from the files themselves at build time, so a re-render changes
// the page with no edit under site/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { fileFacts, humanSize } from '../src/components/kit/files.mjs';
import kitDevRoute from '../src/dev/kit-route.mjs';
import { findRepoRoot } from '../src/lib/site.mjs';

const root = findRepoRoot();
const media = join(root, 'site', 'public', 'media');
const brand = join(root, 'site', 'public', 'brand');

test('humanSize: bytes below 1 KB, whole KB below 1 MB, MB with two decimals', () => {
  assert.equal(humanSize(295), '295 B');
  assert.equal(humanSize(1023), '1023 B');
  assert.equal(humanSize(1024), '1 KB');
  assert.equal(humanSize(54190), '53 KB');
  assert.equal(humanSize(1024 * 1024 - 1), '1024 KB');
  assert.equal(humanSize(4501840), '4.29 MB');
});

test('every file in site/public/media shows its own size on disk', () => {
  const names = readdirSync(media);
  assert.ok(names.length > 0, 'site/public/media is empty');
  for (const name of names) {
    const path = join(media, name);
    assert.equal(fileFacts(path).size, humanSize(statSync(path).size), name);
  }
});

test('the format follows the extension', () => {
  assert.equal(fileFacts(join(media, 'film.mp4')).format, 'MP4 (H.264)');
  assert.equal(fileFacts(join(media, 'film.jpg')).format, 'JPG');
  assert.equal(fileFacts(join(media, 'film-chapters.json')).format, 'JSON');
  assert.equal(fileFacts(join(brand, 'mark.svg')).format, 'SVG');
  assert.equal(fileFacts(join(root, 'docs', 'images', 'hero.gif')).format, 'GIF');
});

test('a JPG gives its frame size from its own header, and no length', () => {
  assert.deepEqual(
    { frame: fileFacts(join(media, 'readme-hero.jpg')).frame, length: fileFacts(join(media, 'readme-hero.jpg')).length },
    { frame: '1280 × 512', length: '' },
  );
  assert.equal(fileFacts(join(media, 'film.jpg')).frame, '1920 × 1080');
  assert.equal(fileFacts(join(media, 'loop-review.jpg')).frame, '1200 × 750');
});

// The README hero GIF is rendered from site/motion/readme-hero/composition.html (its root element
// declares the size and length) and scaled by finish.sh, so the GIF's facts follow from those two
// files and a wrong read of the GIF's own header or frame delays fails here.
test('a GIF gives its frame size and its length, the sum of its frame delays', () => {
  const motion = join(root, 'site', 'motion');
  const declared = readFileSync(join(motion, 'readme-hero', 'composition.html'), 'utf8').match(
    /data-duration="([\d.]+)"[^>]*data-width="(\d+)"[^>]*data-height="(\d+)"/,
  );
  assert.ok(declared, 'the composition no longer declares data-duration, data-width and data-height');
  const [, seconds, width, height] = declared.map(Number);
  const scaled = readFileSync(join(motion, 'finish.sh'), 'utf8').match(/scale=(\d+):-1[^"]*\[x\]/);
  assert.ok(scaled, 'finish.sh no longer scales the GIF with scale=<width>:-1');
  const gifWidth = Number(scaled[1]);
  const facts = fileFacts(join(root, 'docs', 'images', 'hero.gif'));
  assert.equal(facts.frame, `${gifWidth} × ${Math.round((gifWidth * height) / width)}`);
  assert.equal(facts.length, `${seconds.toFixed(1)} s`);
});

test('an SVG gives the grid of its viewBox', () => {
  assert.equal(fileFacts(join(brand, 'mark.svg')).frame, '28 grid');
  assert.equal(fileFacts(join(brand, 'mark-small.svg')).frame, '32 grid');
});

test('JSON has no frame and no length', () => {
  const facts = fileFacts(join(media, 'film-chapters.json'));
  assert.equal(facts.frame, '');
  assert.equal(facts.length, '');
});

// The Kit and the README GIF route exist under `npm run dev` only: the integration injects both
// routes, with entrypoints that exist, for dev, and nothing for a build.
test('the Kit routes are injected for astro dev and never for a build', () => {
  const injected = (command) => {
    const routes = [];
    kitDevRoute().hooks['astro:config:setup']({ command, injectRoute: (r) => routes.push(r) });
    return routes;
  };
  const dev = injected('dev');
  assert.deepEqual(dev.map((r) => r.pattern), ['/kit', '/media/readme-hero.gif']);
  for (const r of dev) assert.ok(existsSync(r.entrypoint), `${r.pattern}: ${r.entrypoint} does not exist`);
  assert.deepEqual(injected('build'), []);
  assert.deepEqual(injected('preview'), []);
});
