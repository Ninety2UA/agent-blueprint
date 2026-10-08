// Tests for site/src/components/kit/files.mjs: the facts the Kit page lists for each file (format,
// frame, length, size) are read from the files themselves at build time, so a re-render changes
// the page with no edit under site/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { fileFacts, humanSize } from '../src/components/kit/files.mjs';
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

test('a GIF gives its frame size and its length, the sum of its frame delays', () => {
  const facts = fileFacts(join(root, 'docs', 'images', 'hero.gif'));
  assert.match(facts.frame, /^\d+ × \d+$/);
  assert.match(facts.length, /^\d+\.\d s$/);
  assert.ok(parseFloat(facts.length) > 0);
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
