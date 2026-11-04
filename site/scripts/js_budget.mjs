// website-build 1.0.0 scripts/js_budget.mjs
// js_budget.mjs: gzipped JavaScript a page loads before any interaction, against a per-page budget.
//
// Usage:
//   node js_budget.mjs <dist> [page.html ...] [--home-kb 25] [--page-kb 10] [--home index.html]
//                      [--onload-import REGEX ...] [--all-dynamic] [--trailing-slash always|never]
//
// Counted, per page: every inline script (JSON and ld+json data blocks excepted), every <script src>, every
// <link rel="modulepreload">, and through each inline script and each of those files their static imports and
// re-exports (import x from "./a.js", import "./a.js", export * from "./a.js"), each file once. A specifier may carry
// a ?query or #hash ("./a.js?v=2"); the file read is its pathname. Dynamic import("./x.js")
// usually waits for a click or key press and is not counted; pass --onload-import with a pattern for the
// chunks a page imports on load (a video player imported when a figure exists), or --all-dynamic for the
// worst case. The bundler may write a dynamic import with backticks; all three quote forms are read.
// Sizes are gzip level 9 of each file; the limit is a strict "under": a page at exactly the limit fails.
//
// A relative script or import resolves against the URL the browser shows, as in check_site.py: with
// --trailing-slash always (the default, Astro trailingSlash: 'always') docs/intro/index.html is /docs/intro/ and
// bundle.js means /docs/intro/bundle.js; with --trailing-slash never (Astro 'never', Vercel cleanUrls) it is
// /docs/intro and bundle.js means /docs/bundle.js.
//
// Pages default to every .html file in dist. The home page (--home, default index.html) gets --home-kb,
// every other page --page-kb. A script from another origin cannot be measured: it is listed and noted on
// stderr. A script missing from the build fails its page. Names match case-sensitively, as on a Linux host,
// so /_astro/Chunk.js is missing when the build holds chunk.js, even on a case-insensitive macOS disk.
//
// Output: JSON on stdout {pages: [{page, limit, total, inline, files, missing, external, over}], over}.
// Exit codes: 0 every page under budget, 1 a page over budget or missing a script, 2 usage error.
// Node built-ins only.
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { gzipSync } from 'node:zlib';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

const gz = (text) => gzipSync(Buffer.from(text), { level: 9 }).length;
const BASE = 'https://site.invalid';
const local = (url) => url.origin === BASE;

const STATIC = /\b(?:import|export)\s*(?:[\w$\s{},*]+?\s*from\s*)?["']([^"'?#]+\.m?js(?:[?#][^"']*)?)["']/g;
const DYNAMIC = /\bimport\(\s*(["'`])([^"'`$?#]+?\.m?js(?:[?#][^"'`$]*)?)\1\s*\)/g;

/**
 * The URL path a browser shows for a built page, the base its relative scripts resolve against.
 * @param {string} page slash path relative to dist (docs/intro/index.html)
 * @param {'always' | 'never'} trailingSlash the host's policy, as check_site.py --trailing-slash
 */
export function servedPath(page, trailingSlash = 'always') {
  if (trailingSlash === 'never' && page.endsWith('/index.html')) return `/${page.slice(0, -'/index.html'.length)}`;
  return `/${page}`;
}

/**
 * The gzipped bytes a page's scripts weigh before interaction.
 * @param {string} html the page
 * @param {(path: string) => string | undefined} read a site path (/_astro/x.js) to its text, undefined when absent
 * @param {{pagePath?: string, onload?: RegExp[], allDynamic?: boolean, cache?: Map<string, object>}} opts
 *   cache: gzip sizes and import specifiers per site path, shared across calls that use the same read
 */
export function scriptBytes(html, read, { pagePath = '/index.html', onload = [], allDynamic = false, cache = new Map() } = {}) {
  const files = new Map();
  const missing = [];
  const external = [];
  let inline = 0;
  const parse = (code) => ({
    statics: [...code.matchAll(STATIC)].map((m) => m[1]),
    dynamics: [...code.matchAll(DYNAMIC)].map((m) => m[2]),
  });
  const imports = ({ statics, dynamics }, base) => {
    for (const spec of statics) follow(new URL(spec, base));
    for (const spec of dynamics) {
      if (allDynamic || onload.some((re) => re.test(spec))) follow(new URL(spec, base));
    }
  };
  const follow = (url) => {
    if (!local(url)) { if (!external.includes(url.href)) external.push(url.href); return; }
    const path = url.pathname;
    if (files.has(path) || missing.includes(path)) return;
    let entry = cache.get(path);
    if (!entry) {
      const code = read(path);
      if (code === undefined) { missing.push(path); return; }
      entry = { size: gz(code), ...parse(code) };
      cache.set(path, entry);
    }
    files.set(path, entry.size);
    imports(entry, url);
  };
  // the first <base href> sets the URL relative scripts resolve against, as in check_site.py
  const baseHref = html.match(/<base\b[^>]*\shref\s*=\s*["']?([^"'\s>]+)/i)?.[1];
  const page = new URL(baseHref || '', new URL(pagePath, BASE));
  for (const [, attrs, body] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/\btype\s*=\s*["']?application\/(?:ld\+)?json/i.test(attrs) || /\btype\s*=\s*["']?(?:importmap|speculationrules)/i.test(attrs)) continue;
    const src = attrs.match(/\ssrc\s*=\s*["']?([^"'\s>]+)/i)?.[1];
    if (src) follow(new URL(src, page));
    else if (body.trim()) { inline += gz(body); imports(parse(body), page); }
  }
  for (const [tag] of html.matchAll(/<link\b[^>]*>/gi)) {
    if (!/\brel\s*=\s*["']?modulepreload/i.test(tag)) continue;
    const href = tag.match(/\shref\s*=\s*["']?([^"'\s>]+)/i)?.[1];
    if (href) follow(new URL(href, page));
  }
  const total = inline + [...files.values()].reduce((a, b) => a + b, 0);
  return { total, inline, files, missing, external };
}

// Every file in dist as a slash path relative to it, with the names as stored on disk.
function distFiles(dist) {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else out.push(relative(dist, path).split(sep).join('/'));
    }
  };
  walk(dist);
  return out;
}

// the leading comment block only, up to the first line that is not a comment
const help = () => {
  const lines = readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1);
  const end = lines.findIndex((l) => !l.startsWith('//'));
  return lines.slice(0, end === -1 ? lines.length : end).map((l) => l.replace(/^\/\/ ?/, '')).join('\n');
};

function main(argv) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        'home-kb': { type: 'string', default: '25' },
        'page-kb': { type: 'string', default: '10' },
        home: { type: 'string', default: 'index.html' },
        'onload-import': { type: 'string', multiple: true, default: [] },
        'all-dynamic': { type: 'boolean', default: false },
        'trailing-slash': { type: 'string', default: 'always' },
        help: { type: 'boolean', short: 'h', default: false },
      },
    });
  } catch (error) {
    console.error(`js_budget: ${error.message}`);
    return 2;
  }
  const { values, positionals } = parsed;
  if (values.help) { console.log(help()); return 0; }
  const [distArg, ...pageArgs] = positionals;
  if (!distArg) { console.error('js_budget: give the built site folder: node js_budget.mjs <dist> [page.html ...]'); return 2; }
  const dist = resolve(distArg);
  if (!existsSync(dist) || !statSync(dist).isDirectory()) { console.error(`js_budget: ${dist}: no build folder; run the site build first`); return 2; }
  const homeKb = Number(values['home-kb']);
  const pageKb = Number(values['page-kb']);
  if (!(homeKb > 0) || !(pageKb > 0)) { console.error('js_budget: --home-kb and --page-kb take positive numbers'); return 2; }
  const trailingSlash = values['trailing-slash'];
  if (!['always', 'never'].includes(trailingSlash)) { console.error(`js_budget: --trailing-slash takes always or never, not ${trailingSlash}`); return 2; }
  let onload;
  try { onload = values['onload-import'].map((p) => new RegExp(p)); } catch (error) { console.error(`js_budget: --onload-import: ${error.message}`); return 2; }

  const known = distFiles(dist);
  const present = new Set(known);
  const pages = pageArgs.length ? pageArgs.map((p) => relative(dist, resolve(dist, p)).split(sep).join('/')) : known.filter((f) => f.endsWith('.html'));
  if (!pages.length) { console.error(`js_budget: ${dist}: no HTML pages`); return 2; }
  const read = (path) => {
    let rel;
    try { rel = decodeURIComponent(path).replace(/^\/+/, ''); } catch { return undefined; }
    if (!present.has(rel)) return undefined;
    return readFileSync(join(dist, rel), 'utf8');
  };
  const cache = new Map();
  const report = [];
  for (const page of pages) {
    const file = join(dist, page);
    if (!present.has(page)) { console.error(`js_budget: ${page}: not in ${dist}`); return 2; }
    const r = scriptBytes(readFileSync(file, 'utf8'), read, { pagePath: servedPath(page, trailingSlash), onload, allDynamic: values['all-dynamic'], cache });
    const limit = Math.round((page === values.home ? homeKb : pageKb) * 1024);
    for (const url of r.external) console.error(`js_budget: ${page}: ${url} comes from another origin and is not measured`);
    report.push({
      page, limit, total: r.total, inline: r.inline, files: Object.fromEntries(r.files),
      missing: r.missing, external: r.external, over: r.total >= limit || r.missing.length > 0,
    });
  }
  const over = report.filter((p) => p.over).length;
  console.log(JSON.stringify({ pages: report, over }, null, 2));
  for (const p of report.filter((x) => x.over)) {
    console.error(`js_budget: ${p.page}: ${(p.total / 1024).toFixed(1)} KB gzipped, limit ${(p.limit / 1024).toFixed(1)} KB${p.missing.length ? `; missing ${p.missing.join(', ')}` : ''}`);
  }
  return over ? 1 : 0;
}

// realpath on both sides, so a run through a symlinked skill folder still reaches main()
const invoked = process.argv[1] && existsSync(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
if (invoked) process.exitCode = main(process.argv.slice(2));
