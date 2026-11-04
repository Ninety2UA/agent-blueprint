// Renders the Hosted page's loops from their seek-driven sources (RENDER.md, "Hosted loops").
//
//   node site/motion/hosted/export.cjs [name ...]      every piece in pieces.json when no name is given
//
// For each piece it assembles site/motion/.work/hosted/<name>/index.html from <name>/effect.html with
// the site's own font files (src/assets/fonts/) inlined where the source points at them, loads it with
// ?render in system Chrome through Playwright, calls window.seek(f / fps) for every frame of the loop,
// pipes the screenshots into ffmpeg (H.264, CRF and settings as finish.sh encodes the loops, no audio,
// faststart), cuts the JPG poster at the time pieces.json records, and encodes any AVIF posters it
// lists from that JPG, at the piece's own AVIF CRF and preset where it sets them. Everything lands in
// .work/hosted/<name>/, which git ignores; copy the files into site/public/media/ to publish a re-render.
//
// Playwright stays outside the product: it is loaded from AB_MOTION_TOOLS (default
// ~/.cache/ab-motion-tools), where RENDER.md installs the pinned version once.
'use strict';
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const HOSTED = __dirname;
const SITE = path.resolve(HOSTED, '..', '..');
const WORK = path.join(SITE, 'motion', '.work', 'hosted');
const TOOLS = process.env.AB_MOTION_TOOLS || path.join(os.homedir(), '.cache', 'ab-motion-tools');
const FONT_REF = /url\("\.\.\/\.\.\/\.\.\/src\/assets\/fonts\/([\w.-]+\.woff2)"\)/g;

function playwright() {
  const dir = path.join(TOOLS, 'node_modules', 'playwright');
  if (!fs.existsSync(dir)) {
    throw new Error(`Playwright is not installed in ${TOOLS}; see site/motion/RENDER.md, "Hosted loops"`);
  }
  return { chromium: require(dir).chromium, version: require(path.join(dir, 'package.json')).version };
}

// The source with each font reference replaced by the font file as a data URL.
function assemble(name) {
  const html = fs.readFileSync(path.join(HOSTED, name, 'effect.html'), 'utf8').replace(FONT_REF, (_, file) => {
    const font = fs.readFileSync(path.join(SITE, 'src', 'assets', 'fonts', file));
    return `url(data:font/woff2;base64,${font.toString('base64')})`;
  });
  const dir = path.join(WORK, name);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'index.html');
  fs.writeFileSync(file, html);
  return { dir, file };
}

function ffmpeg(args) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`ffmpeg ${args.join(' ')} exited ${r.status}`);
}

async function render(browser, manifest, piece) {
  const { name, width, height, seconds, poster } = piece;
  const { dir, file } = assemble(name);
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('request', (r) => !r.url().startsWith('file:') && !r.url().startsWith('data:') && errors.push(`request to ${r.url()}`));
  await page.goto(`file://${file}?render`);
  // the page sets __ready once its fonts are in, as a promise or as true
  await page.waitForFunction(() => window.__ready !== undefined);
  await page.evaluate(() => window.__ready);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())));
  const stage = await page.evaluate(() => {
    const r = document.getElementById('stage').getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height, loop: window.__loop ?? window.DURATION };
  });
  if (stage.x || stage.y || stage.width !== width || stage.height !== height) {
    throw new Error(`${name}: the stage is ${stage.width} x ${stage.height} at ${stage.x},${stage.y}; pieces.json says ${width} x ${height}`);
  }
  if (stage.loop !== undefined && stage.loop !== seconds) {
    throw new Error(`${name}: the page loops in ${stage.loop} s; pieces.json says ${seconds} s`);
  }

  // frames 0 .. n-1 at t = f / fps; seek(seconds) equals seek(0), so the seam frame is not repeated
  const mp4 = path.join(dir, `${name}.mp4`);
  const ff = spawn('ffmpeg', [
    '-v', 'error', '-y',
    '-f', 'image2pipe', '-c:v', 'png', '-framerate', String(manifest.fps), '-i', '-',
    '-an',
    '-vf', 'scale=out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int,format=yuv420p',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', String(manifest.crf),
    '-pix_fmt', 'yuv420p', '-r', String(manifest.fps),
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
    '-movflags', '+faststart',
    mp4,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('close', (c) => (c === 0 ? res() : rej(new Error(`ffmpeg exited ${c}`)))));
  const frames = Math.round(seconds * manifest.fps);
  for (let f = 0; f < frames; f++) {
    await page.evaluate((s) => window.seek(s), f / manifest.fps);
    const png = await page.screenshot({ type: 'png' });
    if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once('drain', r));
  }
  ff.stdin.end();
  await done;
  await page.close();
  if (errors.length) throw new Error(`${name}: ${errors.join(' | ')}`);

  const jpg = path.join(dir, `${name}.jpg`);
  ffmpeg(['-ss', String(poster), '-i', mp4, '-frames:v', '1', '-q:v', '2', jpg]);
  // a piece may set its own AVIF CRF and preset (the phone posters of Figs. 2 and 3, ruling 38)
  const avifCrf = piece.avifCrf ?? manifest.avifCrf;
  const avifPreset = piece.avifPreset ?? manifest.avifPreset;
  for (const w of piece.avif ?? []) {
    const scale = w === width ? [] : ['-vf', `scale=${w}:-1:flags=lanczos`];
    ffmpeg(['-i', jpg, '-frames:v', '1', ...scale, '-c:v', 'libsvtav1', '-crf', String(avifCrf), '-preset', String(avifPreset),
      '-pix_fmt', 'yuv420p', '-f', 'avif', path.join(dir, `${name}-${w}.avif`)]);
  }
  console.log(`${name}: ${frames} frames at ${manifest.fps} fps, poster at ${poster} s -> ${path.relative(SITE, dir)}/`);
}

(async () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(HOSTED, 'pieces.json'), 'utf8'));
  const names = process.argv.slice(2);
  const pieces = names.length ? names.map((n) => manifest.pieces.find((p) => p.name === n) ?? n) : manifest.pieces;
  const unknown = pieces.filter((p) => typeof p === 'string');
  if (unknown.length) throw new Error(`not in pieces.json: ${unknown.join(', ')}`);
  const { chromium, version } = playwright();
  const browser = await chromium.launch({ channel: 'chrome' });
  console.log(`Playwright ${version}, Chrome ${browser.version()}`);
  try {
    for (const piece of pieces) await render(browser, manifest, piece);
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
