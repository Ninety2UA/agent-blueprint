// The Hosted page's script budget (plan KTD10, ruling 22): the script hosted/index.html loads before
// any interaction, with the video player chunk counted, plus the chat-run chunk its figure imports as it
// nears the viewport, together strictly under 13,312 bytes gzipped. Both numbers are printed as test
// diagnostics. The counter is the site's copy of website-build's js_budget.mjs. The page tests read
// site/dist/hosted/index.html, which only a build with the page switched on writes (AB_HOSTED_PREVIEW=1,
// src/lib/hosted-release.mjs); without it they are skipped and say so. The synthetic page runs always.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { scriptBytes, servedPath } from '../scripts/js_budget.mjs';
import { findRepoRoot } from '../src/lib/site.mjs';

const LIMIT = 13312;
const ONLOAD = [/video/];
const CHAT_RUN = /chat-run/;

const root = findRepoRoot();
const dist = join(root, 'site', 'dist');
const page = 'hosted/index.html';
const skip = !existsSync(join(dist, page)) && 'site/dist/hosted/ is not built (run AB_HOSTED_PREVIEW=1 npm run build in site/)';

const readDist = (path) => {
  const file = join(dist, decodeURIComponent(path).replace(/^\/+/, ''));
  return existsSync(file) ? readFileSync(file, 'utf8') : undefined;
};

/**
 * The two numbers of ruling 22 for one page.
 * @param {string} html
 * @param {(path: string) => string | undefined} read
 */
function hostedBudget(html, read, pagePath = servedPath(page)) {
  const onload = scriptBytes(html, read, { pagePath, onload: ONLOAD });
  const withChat = scriptBytes(html, read, { pagePath, onload: [...ONLOAD, CHAT_RUN] });
  const missing = [...new Set([...onload.missing, ...withChat.missing])];
  const chatFiles = [...withChat.files.keys()].filter((path) => CHAT_RUN.test(path) && !onload.files.has(path));
  return { onload: onload.total, total: withChat.total, chatFiles, missing, over: withChat.total >= LIMIT || missing.length > 0 };
}

test('the on-load script and the chat run of /hosted/ stay under 13,312 bytes gzipped', { skip }, (t) => {
  const result = hostedBudget(readFileSync(join(dist, page), 'utf8'), readDist);
  t.diagnostic(`on load ${result.onload} B; with the chat run ${result.total} B; limit ${LIMIT} B`);
  assert.deepEqual(result.missing, [], 'a script the page names is missing from the build');
  assert.ok(result.chatFiles.length > 0, 'no chat-run chunk was counted: the pattern no longer matches what the figure imports');
  assert.ok(result.onload > 0 && result.total > result.onload, 'the two counts must both measure something');
  assert.ok(result.total < LIMIT, `${result.total} B gzipped is not under ${LIMIT} B`);
  assert.equal(result.over, false);
});

test('a synthetic page over the cap fails the same check', () => {
  // random bytes do not compress, so the chat-run chunk alone weighs more than the limit gzipped
  const heavy = `export const blob = "${randomBytes(LIMIT).toString('base64')}";`;
  const files = {
    '/_astro/loader.js': 'new IntersectionObserver(() => import("./chat-run.synthetic.js"));',
    '/_astro/chat-run.synthetic.js': heavy,
    '/_astro/video-figures.synthetic.js': 'export const play = () => {};',
  };
  const html = '<script type="module" src="/_astro/loader.js"></script><script type="module">import("/_astro/video-figures.synthetic.js")</script>';
  const result = hostedBudget(html, (path) => files[path]);
  assert.ok(result.onload < LIMIT, 'the on-load part alone is small');
  assert.deepEqual(result.chatFiles, ['/_astro/chat-run.synthetic.js']);
  assert.ok(result.total >= LIMIT);
  assert.equal(result.over, true);
});

test('a page whose chat-run chunk is missing fails', () => {
  const html = '<script type="module">import("/_astro/chat-run.gone.js")</script>';
  const result = hostedBudget(html, () => undefined);
  assert.deepEqual(result.missing, ['/_astro/chat-run.gone.js']);
  assert.equal(result.over, true);
});
