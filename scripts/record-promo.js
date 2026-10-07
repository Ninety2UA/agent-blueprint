#!/usr/bin/env node
// Records promo-video.html by taking screenshots at 25fps and stitching with ffmpeg.
// Usage: node scripts/record-promo.js

const { chromium } = require('playwright');
const { execFileSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Repo root is one level up from scripts/.
const ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(ROOT, 'docs/images');
const FRAMES_DIR = path.join(OUTPUT_DIR, '_frames');
const MP4_PATH = path.join(OUTPUT_DIR, 'overview.mp4');
const GIF_PATH = path.join(OUTPUT_DIR, 'overview.gif');
const GIF_WIDTH = 800;
const GIF_FPS = 10;

const FPS = 25;
const FRAME_INTERVAL = 1000 / FPS; // 40ms per frame

// Timeline: each entry is [action, durationMs]
// 'show:sceneX' clears all then activates sceneX (captures transition-in + hold)
// 'fade' clears all (captures fade-out)
// 'wait' holds current state
const TIMELINE = [
  ['wait', 500],
  ['show:scene1', 3500],
  ['fade', 600],
  ['show:scene2', 3500],
  ['fade', 600],
  ['show:scene3', 4000],
  ['fade', 600],
  ['show:scene4', 3500],
  ['fade', 600],
  ['show:scene5', 4000],
  ['fade', 600],
  ['show:scene6', 4500],
  ['fade', 600],
  ['show:scene7', 3500],
];

(async () => {
  // Prepare frames directory
  if (fs.existsSync(FRAMES_DIR)) fs.rmSync(FRAMES_DIR, { recursive: true });
  fs.mkdirSync(FRAMES_DIR, { recursive: true });

  console.log('Starting local server...');
  const server = spawn('python3', ['-m', 'http.server', '8769', '--directory', OUTPUT_DIR], {
    stdio: 'ignore',
  });
  await new Promise(r => setTimeout(r, 800));

  console.log('Launching browser...');
  // Prefer the bundled Chromium; fall back to system Chrome if it isn't installed.
  let browser;
  try {
    browser = await chromium.launch();
  } catch (e) {
    browser = await chromium.launch({ channel: 'chrome' });
  }
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto('http://localhost:8769/promo-video.html', { waitUntil: 'networkidle' });

  // Wait for fonts to load
  await page.waitForTimeout(500);

  let frameNum = 0;

  async function captureFrames(durationMs) {
    const numFrames = Math.round(durationMs / FRAME_INTERVAL);
    for (let i = 0; i < numFrames; i++) {
      await page.waitForTimeout(FRAME_INTERVAL);
      const padded = String(frameNum).padStart(5, '0');
      await page.screenshot({ path: path.join(FRAMES_DIR, `frame_${padded}.png`) });
      frameNum++;
    }
  }

  // Execute timeline
  for (const [action, durationMs] of TIMELINE) {
    if (action.startsWith('show:')) {
      const id = action.split(':')[1];
      console.log(`  → show ${id}`);
      // Clear ALL scenes first (proven working pattern)
      await page.evaluate(() =>
        document.querySelectorAll('.scene').forEach(s => s.classList.remove('active'))
      );
      // Activate target scene
      await page.evaluate(
        id => document.getElementById(id).classList.add('active'),
        id
      );
    } else if (action === 'fade') {
      await page.evaluate(() =>
        document.querySelectorAll('.scene').forEach(s => s.classList.remove('active'))
      );
    }
    await captureFrames(durationMs);
  }

  console.log(`Captured ${frameNum} frames`);
  await browser.close();
  server.kill();

  // Stitch frames into mp4
  console.log('Stitching video with ffmpeg...');
  execFileSync('ffmpeg', [
    '-y',
    '-framerate', String(FPS),
    '-i', path.join(FRAMES_DIR, 'frame_%05d.png'),
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-preset', 'slow',
    '-crf', '20',
    '-an',
    MP4_PATH,
  ], { stdio: 'inherit' });

  // Convert the mp4 into the README-embeddable GIF (GitHub strips <video> tags,
  // so the README uses <img src="overview.gif">). Two-pass palette for quality.
  console.log('Converting to GIF...');
  const palette = path.join(OUTPUT_DIR, '_palette.png');
  const vf = `fps=${GIF_FPS},scale=${GIF_WIDTH}:-1:flags=lanczos`;
  execFileSync('ffmpeg', ['-y', '-i', MP4_PATH, '-vf', `${vf},palettegen=stats_mode=diff`, palette], { stdio: 'inherit' });
  execFileSync('ffmpeg', ['-y', '-i', MP4_PATH, '-i', palette, '-lavfi', `${vf}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3`, GIF_PATH], { stdio: 'inherit' });
  fs.rmSync(palette);

  // Clean up frames
  fs.rmSync(FRAMES_DIR, { recursive: true });
  const mp4Size = (fs.statSync(MP4_PATH).size / 1024).toFixed(0);
  const gifSize = (fs.statSync(GIF_PATH).size / 1024).toFixed(0);
  console.log(`Done! overview.mp4 (${mp4Size} KB) + overview.gif (${gifSize} KB, ${GIF_WIDTH}px, ${GIF_FPS}fps, ${(frameNum / FPS).toFixed(1)}s)`);
})();
