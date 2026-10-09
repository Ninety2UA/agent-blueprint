// Ties site/scripts/ignore-build.sh to what the build reads. Vercel skips a build when none of the
// script's inputs changed, so a file the build reads outside those inputs would leave the live site
// stale. This test records every file and folder the site's data modules read while they load the
// repository data, adds every literal repository path in site/src (join(findRepoRoot(), ...) and the
// content collections' folders), and checks that each path outside site/ falls under one of the
// script's inputs. Existence and stat checks (the blob-or-tree choice for README links) are not
// recorded: they decide a link's form, not the content of a page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { extname, join, relative, sep } from 'node:path';

const reads = new Set();
for (const name of ['readFileSync', 'readdirSync', 'openSync']) {
  const real = fs[name];
  fs[name] = function (path, ...rest) {
    if (typeof path === 'string') reads.add(path);
    return real.call(this, path, ...rest);
  };
}
syncBuiltinESMExports();

// Imported only after the patch, so the modules bind the recording functions.
const { findRepoRoot, getReadmePages, getSiteData } = await import('../src/lib/site.mjs');
const { getWorkflow } = await import('../src/components/workflow/workflow-data.mjs');

const root = findRepoRoot();
const toRepo = (path) => relative(root, path).split(sep).join('/');

function scriptInputs() {
  const script = fs.readFileSync(join(root, 'site', 'scripts', 'ignore-build.sh'), 'utf8');
  const block = script.match(/^inputs=\(\n([\s\S]*?)^\)/m);
  assert.ok(block, 'ignore-build.sh no longer has an inputs=( ... ) list');
  return [...block[1].matchAll(/':\/([^']+)'/g)].map((m) => m[1]);
}

// Literal repository paths in the site source: join(findRepoRoot(), 'a', 'b') anywhere in site/src,
// join(root, 'a') where root is the repository root, and the content collections' '../../a/' folders.
function sourcePaths() {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (['.ts', '.mjs', '.astro'].includes(extname(entry.name))) {
        const text = fs.readFileSync(path, 'utf8');
        for (const m of text.matchAll(/join\((?:findRepoRoot\(\)|root), ((?:'[^']+'(?:, )?)+)\)/g)) {
          out.push([...m[1].matchAll(/'([^']+)'/g)].map((part) => part[1]).join('/'));
        }
        for (const m of text.matchAll(/new URL\('\.\.\/\.\.\/([^']+)'/g)) out.push(m[1].replace(/\/$/, ''));
      }
    }
  };
  walk(join(root, 'site', 'src'));
  return out;
}

test('every repository path the build reads outside site/ is an input of the ignored build step', () => {
  getSiteData();
  getReadmePages();
  getWorkflow();
  const inputs = scriptInputs();
  const read = [...reads].map(toRepo).filter((p) => !p.startsWith('..') && p !== '' && !p.startsWith('site/'));
  const literal = sourcePaths().filter((p) => !p.startsWith('site/'));
  assert.ok(literal.includes('docs/images/hero.gif'), 'the source scan missed the README GIF');
  const paths = [...new Set([...read, ...literal])].sort();
  assert.ok(paths.includes('README.md') && paths.some((p) => p.startsWith('skills/')), 'the trace recorded no reads');
  const covered = (p) => inputs.some((input) => p === input || p.startsWith(`${input}/`));
  assert.deepEqual(paths.filter((p) => !covered(p)), [], `inputs: ${inputs.join(', ')}`);
});

test('the script lists the site itself and the two files the built-site gate reads', () => {
  const inputs = scriptInputs();
  for (const input of ['site', 'scripts/check-site.py', 'scripts/adoption-denylist.json']) {
    assert.ok(inputs.includes(input), input);
  }
});
