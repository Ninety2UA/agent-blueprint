#!/usr/bin/env node
// Renders docs/images/hero/hero.html into docs/images/hero.gif, the README's animated hero.
// The page draws any moment of its loop on request (window.renderAt), so the script captures
// every frame exactly, however fast the machine is, and the last frame leads straight into the first.
// Usage: node scripts/record-hero.js [--fps 25] [--mp4] [--stills 0,1.5,4.9]
//   --mp4     also writes docs/images/hero.mp4
//   --stills  writes PNGs of those moments (in seconds) to a temporary folder instead of the GIF
// Needs Playwright (npm install playwright) and ffmpeg.

const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Repo root is one level up from scripts/.
const ROOT = path.resolve(__dirname, '..');
const SOURCE = path.join(ROOT, 'docs/images/hero/hero.html');
const OUTPUT_DIR = path.join(ROOT, 'docs/images');

const args = process.argv.slice(2);
const option = name => { const i = args.indexOf(name); return i < 0 ? null : args[i + 1]; };
const FPS = Number(option('--fps') || 25);
const stills = option('--stills');

(async () => {
  // Prefer the bundled Chromium; fall back to system Chrome if it isn't installed.
  let browser;
  try {
    browser = await chromium.launch();
  } catch (e) {
    browser = await chromium.launch({ channel: 'chrome' });
  }
  const page = await browser.newPage({ viewport: { width: 1280, height: 512 }, deviceScaleFactor: 1 });
  await page.goto('file://' + SOURCE, { waitUntil: 'networkidle' });
  await page.evaluate(() => window.heroReady);
  const fontsLoaded = await page.evaluate(() =>
    document.fonts.check('800 74px Inter') && document.fonts.check('500 14px "JetBrains Mono"'));
  if (!fontsLoaded) throw new Error('Inter or JetBrains Mono did not load (offline?); the frames would use a fallback font');
  const duration = await page.evaluate(() => window.DURATION);
  const stage = await page.$('#stage');

  if (stills !== null) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hero-stills-'));
    for (const t of String(stills).split(',').map(Number)) {
      await page.evaluate(x => window.renderAt(x), t);
      await stage.screenshot({ path: path.join(dir, `still-${t.toFixed(2)}.png`) });
    }
    await browser.close();
    console.log(`Stills in ${dir}`);
    return;
  }

  const frames = fs.mkdtempSync(path.join(os.tmpdir(), 'hero-frames-'));
  const count = Math.round(duration * FPS);
  for (let i = 0; i < count; i++) {
    await page.evaluate(x => window.renderAt(x), i / FPS);
    await stage.screenshot({ path: path.join(frames, `frame_${String(i).padStart(4, '0')}.png`) });
  }
  await browser.close();

  const input = ['-framerate', String(FPS), '-i', path.join(frames, 'frame_%04d.png')];
  if (args.includes('--mp4')) {
    execFileSync('ffmpeg', ['-v', 'error', '-y', ...input, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16',
      '-preset', 'slow', '-movflags', '+faststart', path.join(OUTPUT_DIR, 'hero.mp4')], { stdio: 'inherit' });
  }
  // GitHub does not play a video file from the repository in a README, so the hero is a GIF:
  // one palette for the whole loop, and an ordered dither that leaves unchanged pixels unchanged,
  // so each frame stores only what moves.
  const palette = path.join(frames, 'palette.png');
  execFileSync('ffmpeg', ['-v', 'error', '-y', ...input, '-vf', 'palettegen=max_colors=256:stats_mode=full', palette],
    { stdio: 'inherit' });
  execFileSync('ffmpeg', ['-v', 'error', '-y', ...input, '-i', palette, '-lavfi',
    'paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle', '-loop', '0', path.join(OUTPUT_DIR, 'hero.gif')],
    { stdio: 'inherit' });
  fs.rmSync(frames, { recursive: true });
  const kb = (fs.statSync(path.join(OUTPUT_DIR, 'hero.gif')).size / 1024).toFixed(0);
  console.log(`Done! hero.gif (${kb} KB, ${count} frames at ${FPS} fps, ${duration} s)`);
})().catch(e => { console.error(e.message || e); process.exit(1); });
