// Tests for site/src/components/docs/readme-images.mjs: every image in a README section on a docs
// or guide page becomes a link to its own file, so a phone reader can open a diagram full size. The
// link has no aria-label: its name is the image's alt text plus a visually hidden hint, so a page
// with several diagrams has links with different names.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { linkFullSize } from '../src/components/docs/readme-images.mjs';

const IMG = '<img alt="One skills folder installed into eight tools" loading="lazy" decoding="async" width="1760" height="1194" src="/_astro/eight-tools.1HM_efZa_2iApiO.webp">';
const HINT = '<span class="sr-only" data-pagefind-ignore> (opens the full-size image)</span>';
const link = (img, src) => `<a class="img-full" href="${src}">${img}${HINT}</a>`;

test('linkFullSize wraps an image in a link to its own file and keeps the image as it is', () => {
  assert.equal(linkFullSize(`<p>${IMG}</p>`), `<p>${link(IMG, '/_astro/eight-tools.1HM_efZa_2iApiO.webp')}</p>`);
});

test('linkFullSize links every image, an eagerly loaded one too', () => {
  const eager = '<img alt="Wave orchestration" loading="eager" fetchpriority="high" width="1760" height="1268" src="/_astro/wave.webp">';
  const html = `<p>${eager}</p><h2 id="x">X</h2><p>${IMG}</p>`;
  assert.equal(
    linkFullSize(html),
    `<p>${link(eager, '/_astro/wave.webp')}</p><h2 id="x">X</h2><p>${link(IMG, '/_astro/eight-tools.1HM_efZa_2iApiO.webp')}</p>`,
  );
});

test('linkFullSize names each link by its image, so two diagrams give two different link names', () => {
  const other = '<img alt="Wave orchestration" loading="lazy" width="1760" height="1268" src="/_astro/wave.webp">';
  const out = linkFullSize(`<p>${IMG}</p><p>${other}</p>`);
  assert.doesNotMatch(out, /aria-label/);
  // the text a screen reader announces for each link: the image's alt text, then the hidden hint
  const names = [...out.matchAll(/<a class="img-full"[^>]*>(.*?)<\/a>/g)].map(([, inner]) =>
    inner.replace(/<img\b[^>]*\balt="([^"]*)"[^>]*>/, '$1').replace(/<[^>]+>/g, ''),
  );
  assert.deepEqual(names, [
    'One skills folder installed into eight tools (opens the full-size image)',
    'Wave orchestration (opens the full-size image)',
  ]);
});

test('linkFullSize leaves an image that is already inside a link alone', () => {
  const html = `<p><a href="https://github.com/Ninety2UA/agent-blueprint">${IMG}</a></p>`;
  assert.equal(linkFullSize(html), html);
});

test('linkFullSize leaves a section without images unchanged', () => {
  const html = '<h2 id="a">A</h2><p>Text with <a href="/x/">a link</a>.</p>';
  assert.equal(linkFullSize(html), html);
});
