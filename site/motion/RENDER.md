# Motion sources

The site's videos and the README hero GIF are HyperFrames compositions drawn in the 2A Drafting Table style: off-white `oklch(0.985 0 0)`, ink `oklch(0.17 0 0)`, hairlines, Archivo at width 112 to 118 for display, Azeret Mono for labels and paths, and one red-orange accent `oklch(0.63 0.21 33)` that marks only the active element. Text in the accent uses the darker `oklch(0.54 0.2 33)`.

| Folder | Output | Frame | Length |
|---|---|---|---|
| `film/` | `public/media/film.mp4`, `film.jpg`, `film-1280.jpg`, `film-chapters.json` | 1920x1080, 30 fps | 59.5 s |
| `film-hosted/` | `public/media/film-hosted.mp4` (with its AAC score), `film-hosted.jpg`, `film-hosted-1280.jpg`, `film-hosted-chapters.json` (the Hosted page's Fig. 5) | 1920x1080, 30 fps | 43 s |
| `readme-hero/` | `public/media/readme-hero.mp4`, `readme-hero.jpg`, and `docs/images/hero.gif` at the repository root | 1280x512 (GIF 960x384, 15 fps) | 10 s loop |
| `loop-review/`, `loop-waves/`, `loop-runner/`, `loop-handoff/` | `public/media/loop-*.mp4` and `loop-*.jpg` | 1200x750, 30 fps | 8 s loop each |
| `loop-install/`, `loop-setup/` | `public/media/loop-*.mp4` and `loop-*.jpg` | 1200x750, 30 fps | 10 s loop each |
| `loop-workflow/` | `public/media/loop-workflow.mp4` and `loop-workflow.jpg` (the Workflow page's Fig. 1) | 1600x640, 30 fps | 12 s loop |
| `hosted/loop-request-to-pr/`, `hosted/loop-request-to-pr-portrait/` | `public/media/loop-request-to-pr.mp4`, `loop-request-to-pr-portrait.mp4` and a `.jpg` beside each, plus `loop-request-to-pr-600.avif`, `-1200.avif` and `loop-request-to-pr-portrait-720.avif` (the Hosted page's Fig. 1) | 1200x750 and 720x900, 30 fps | 8 s loop |
| `hosted/loop-prereqs/`, `hosted/loop-prereqs-portrait/` | `public/media/loop-prereqs.mp4`, `loop-prereqs-portrait.mp4` and a `.jpg` beside each, plus `loop-prereqs-portrait-720.avif` (the phone poster of Fig. 2) | 1200x750 and 720x900, 30 fps | 12 s loop |
| `hosted/loop-routes/`, `hosted/loop-routes-portrait/` | `public/media/loop-routes.mp4`, `loop-routes-portrait.mp4` and a `.jpg` beside each, plus `loop-routes-portrait-720.avif` (the phone poster of Fig. 3) | 1200x750 and 720x900, 30 fps | 12 s loop |

The Hosted page's loops under `hosted/` are seek-driven HTML pages, not HyperFrames compositions; "Hosted loops" below says how they render.

`shared/ds.css` and `shared/ds.js` hold the tokens and drawing helpers that every composition inlines. Edit `<name>/composition.html` and the shared files; never edit the generated projects under `.work/`, which git ignores.

## When to re-render

- Re-render and commit a video only when its content changes. Every committed render stays in git history, and Codex and Antigravity installs from a checkout copy `.git` too.
- The README hero states the current skill count. The drift gate compares that sentence in `readme-hero/composition.html` with the tree, so adding or removing a skill means updating the sentence, re-rendering the hero and committing the new `docs/images/hero.gif`.
- The film and the loops state no counts, so a new skill never forces a re-render of them.
- The runner loop draws no `run.sh` line of its own: `src/components/home/Runner.astro` sets it over the video in an SVG at the composition's coordinates (x 40, baseline 58, mono 26 on 1200x750), so it names the host the reader picks. Move both together.

## How to re-render

Needs Node 22.12 or later, Python 3 and ffmpeg. HyperFrames 0.8.140 renders locally through `npx`; nothing goes to a cloud service and no container runs.

```bash
export DO_NOT_TRACK=1 HYPERFRAMES_NO_TELEMETRY=1 HYPERFRAMES_NO_UPDATE_CHECK=1 HYPERFRAMES_SKIP_SKILLS=1
cd site/motion
python3 build.py                 # or: python3 build.py readme-hero
for n in film film-hosted readme-hero loop-review loop-waves loop-runner loop-handoff loop-install loop-setup loop-workflow; do
  (cd ".work/$n" && npx --yes hyperframes@0.8.140 check && \
   npx --yes hyperframes@0.8.140 render --crf 2 --fps 30 --output "renders/$n-master.mp4")
done
bash finish.sh
```

`finish.sh` re-encodes each master with `ffmpeg -an -c:v libx264 -preset slow`, CRF 16 for the film and the README hero and CRF 17 for the loops, `-pix_fmt yuv420p -r 30 -movflags +faststart`. It skips `-tune animation`, which left faint ghost segments beside hairlines. Posters are taken with `ffmpeg -ss <t> -frames:v 1 -q:v 2` at these times: film 3.6 s (also scaled to the 1280x720 `film-1280.jpg`), README hero 3.8 s, review 5.5 s, waves 5.0 s, runner 6.4 s, handoff 5.2 s, install 2.3 s, setup 8.9 s, workflow 10.1 s. The GIF uses `fps=15,scale=960:-1:flags=lanczos,palettegen=max_colors=48`, then `paletteuse=dither=none` and `-loop 0`.

The film's chapter start times live in `finish.sh`, which writes `film-chapters.json`; the site reads that file for the chapter buttons. Change both the composition and those times together.

## The Hosted film

`film-hosted/composition.html` is the Hosted page's launch film (parent plan U14, the beats in `film-hosted/BEATS.md`, ruling 79; style C, "One line", ruling 83). It is the one scored piece: `build.py` runs `film-hosted/score.py`, which writes `.work/film-hosted/assets/score.wav` from the beat sheet's music cues with the Python standard library only (no third-party sound, no licence to carry), and the composition's `<audio id="score">` puts it in the master. `bash finish.sh film-hosted` encodes only this film, keeping the audio: `-c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -r 30 -c:a aac -b:a 96k -ac 2 -movflags +faststart`, posters at 8.4 s (the five ways to ask, the web chat's dot in the accent), and `film-hosted-chapters.json` (Ask 0, Sandbox 18.0, Stages 24.0, Pull request 32.0, Deploy 37.0). The composition draws every frame from the timeline's time in one clock tween; its paths and the typed line's caret positions are measured once before the timeline is registered.

```bash
export DO_NOT_TRACK=1 HYPERFRAMES_NO_TELEMETRY=1 HYPERFRAMES_NO_UPDATE_CHECK=1 HYPERFRAMES_SKIP_SKILLS=1
cd site/motion
python3 build.py film-hosted
node film-hosted/layout-check.cjs --step 1     # frame-by-frame layout; report in /tmp/ab-film-layout.txt
(cd .work/film-hosted && npx --yes hyperframes@0.8.140 check && \
 npx --yes hyperframes@0.8.140 render --crf 2 --fps 30 --output renders/film-hosted-master.mp4)
bash finish.sh film-hosted
```

`film-hosted/layout-check.cjs` (ruling 84) seeks every frame of the assembled composition in Chrome through the Playwright install the hosted loops use (`AB_MOTION_TOOLS`), reads the screen box of every visible drawn element (clipped where a clip path applies) and fails when: on a settled frame the content is off the vertical axis by more than 1 percent of the width, its centre leaves the optical band (500 to 570 px) or its box leaves the 5 percent title-safe area; any visible text is cut by the frame edge on any frame; anything is partly off frame outside the pans and camera moves the composition declares in `window.__layout`; more than one accent element shows; or, on a settled frame, any layout unit the composition marks with `data-unit` (each text line, the card row, the button row, the mark, the sheets) is more than 2 px off the frame's vertical axis. Units that sit deliberately left and right of each other are declared as pairs in the script (the sandbox and the repository; the repository and the run panel), and the pair's union is held to the axis instead. The report lists every unit's centre offset.

| File | Frame | Length | Poster | Size |
|---|---|---|---|---|
| `film-hosted.mp4` | 1920x1080, H.264 High, yuv420p, BT.709 TV range, 30 fps (1,290 frames); AAC LC 48 kHz stereo 96 kb/s | 43.0 s | 8.4 s | 2,973,136 bytes |
| `film-hosted.jpg` | 1920x1080 | | | 114,430 bytes |
| `film-hosted-1280.jpg` | 1280x720 | | | 62,851 bytes |
| `film-hosted-chapters.json` | | | | 194 bytes |

Render of 2026-11-03, after ruling 84's layout pass: HyperFrames 0.8.140, rendered in 34.0 s on the Mini (hardware GPU). `hyperframes check` passes with no error and three warnings: the stage holds a nested SVG rather than sub-compositions (as the product film does), the file's length, and `gsap_callback_dom_measurement`, which the lint raises from the file's text; every measurement runs once in `measure()` before the timeline is registered. `layout-check.cjs --step 1` passes all five checks over all 1,291 frames (653 settled frames measured; every unit and pair within 0.13 px of the axis; the push in beat 3 now zooms on the frame's axis at the field's height). The sandbox's dot and its "Running" count as one status element. The film is at or under 6 MB with its audio (FACTS line 171). Loudness of the encode: -17.4 LUFS integrated, true peak -2.9 dBFS.

## Checks before committing a render

- `npx hyperframes check` passes for the project.
- Extract frames from the final file with ffmpeg and look at them: the film shows at most one red element per frame, and each loop's first and last frames match so the seam is invisible.
- Scale each loop to 560 px wide (the workflow loop to 1150 px) and confirm every label still reads, since that is its size on the page.

## Hosted loops

The Hosted page's three loops come in two cuts each: 1200x750 for wide figures and 720x900 for phones. Each cut is one self-contained page, `hosted/<name>/effect.html`, drawn on a fixed stage and driven by `window.seek(seconds)`; with `?render` its clock stops so a renderer can seek frame by frame. The look and timing rules they follow are in `hosted/MOTION.md`. `hosted/pieces.json` records each cut's frame, length and poster time, the encode settings, which cuts get AVIF posters, and a cut's own AVIF CRF and preset where it differs from the default. `build.py` and `finish.sh` do not handle these loops.

Each source loads Archivo from the site's own `src/assets/fonts/Archivo-var.woff2` by a relative path. `hosted/export.cjs` assembles `.work/hosted/<name>/index.html` with that font inlined as a data URL, renders it in system Chrome through Playwright, and writes the MP4, the JPG poster and any AVIF posters next to it in `.work/hosted/<name>/`.

| File | Frame | Length | Poster | Size |
|---|---|---|---|---|
| `loop-request-to-pr.mp4` | 1200x750 | 8 s | 4.4 s | 306,412 bytes |
| `loop-request-to-pr.jpg` | 1200x750 | | | 62,612 bytes |
| `loop-request-to-pr-600.avif` | 600x375 | | | 8,766 bytes |
| `loop-request-to-pr-1200.avif` | 1200x750 | | | 19,254 bytes |
| `loop-request-to-pr-portrait.mp4` | 720x900 | 8 s | 4.4 s | 291,162 bytes |
| `loop-request-to-pr-portrait.jpg` | 720x900 | | | 55,161 bytes |
| `loop-request-to-pr-portrait-720.avif` | 720x900 | | | 19,469 bytes |
| `loop-prereqs.mp4` | 1200x750 | 12 s | 2.2 s | 534,177 bytes |
| `loop-prereqs.jpg` | 1200x750 | | | 81,825 bytes |
| `loop-prereqs-portrait.mp4` | 720x900 | 12 s | 2.2 s | 474,672 bytes |
| `loop-prereqs-portrait.jpg` | 720x900 | | | 71,130 bytes |
| `loop-prereqs-portrait-720.avif` | 720x900 | | | 25,255 bytes |
| `loop-routes.mp4` | 1200x750 | 12 s | 0 s | 349,709 bytes |
| `loop-routes.jpg` | 1200x750 | | | 64,705 bytes |
| `loop-routes-portrait.mp4` | 720x900 | 12 s | 0 s | 345,788 bytes |
| `loop-routes-portrait.jpg` | 720x900 | | | 59,003 bytes |
| `loop-routes-portrait-720.avif` | 720x900 | | | 16,578 bytes |

Every MP4 stays at or under 543,038 bytes (the largest loop before them, `loop-install.mp4`), and every AVIF poster at or under 20 KB and under its JPG, except `loop-prereqs-portrait-720.avif`, whose cap is its size as exported, 25,255 bytes since ruling 55's re-export (rulings 41 and 42: Fig. 2's prerequisites piece ships as exported, its phone poster encoded the ruling 38 way); `test/motion-sources.test.mjs` checks both, with each frame size, length and faststart layout. `ffprobe` on 2026-10-30 found each MP4 to be H.264 High, yuv420p, BT.709 in TV range, 30 fps (240 frames for 8 s, 360 for 12 s), with no audio stream.

### Re-rendering a hosted loop

Needs Node 22.12 or later, ffmpeg with libx264 and libsvtav1, and Google Chrome. Playwright is not a dependency of the site: install the pinned version once into a folder outside the repository, which the exporter loads by its path (`AB_MOTION_TOOLS`, default `~/.cache/ab-motion-tools`).

```bash
npm install --prefix ~/.cache/ab-motion-tools playwright@1.64.1   # once; it drives your installed Chrome
cd site
node motion/hosted/export.cjs                       # every cut, or name some: node motion/hosted/export.cjs loop-routes
cp motion/.work/hosted/loop-routes/loop-routes.{mp4,jpg} public/media/
```

The exporter loads `index.html?render`, waits for the page's fonts, checks that the stage and the page's own loop length match `pieces.json`, calls `window.seek(f / 30)` for frames 0 to n-1 and pipes each screenshot into ffmpeg: `-an -c:v libx264 -preset slow -crf 17 -pix_fmt yuv420p -r 30 -movflags +faststart`, BT.709 tags in TV range, no `-tune animation`, as `finish.sh` encodes the other loops. It cuts the poster with `ffmpeg -ss <poster> -frames:v 1 -q:v 2`, and the AVIF posters from that JPG with `libsvtav1 -crf 22 -preset 4 -pix_fmt yuv420p -f avif` (scaled with lanczos where the width is smaller). The phone posters of Figs. 2 and 3 (`loop-prereqs-portrait-720.avif`, `loop-routes-portrait-720.avif`, ruling 38) take their own `"avifCrf": 40, "avifPreset": 8` from `pieces.json`: at the pipeline's CRF 22 the earlier Fig. 2 poster and Fig. 3's weighed about 15 KB each and the page's mobile Lighthouse score stayed at 99 (U9 finding F2). Preset 8 is SVT-AV1's default in ffmpeg, the setting of the sample Dominik approved; preset 4 at CRF 40 gives a different, smaller file (8,745 bytes for Fig. 3's). Encoded on 2026-10-30 with ffmpeg 9.0.2 and SVT-AV1 4.2.0, Fig. 3's file is byte for byte that sample. Fig. 2's prerequisites piece (ruling 41) replaced the one-repo loop; it was exported with this exporter on 2026-10-30 and its five files are committed byte for byte as exported (`r2/shared/effects/prereqs/EXPORTED`). The page serves each one through a `<picture>` in the portrait box (VideoMedia's `avifPoster`), with the JPG as the fallback for a browser without AVIF. It stops on a page error, a console error or a request that leaves the page.

The Playwright pin does not pin Chrome, so record the Chrome version the exporter prints with each re-render.

### Re-render check

On 2026-10-30 the exporter rendered `loop-request-to-pr` and `loop-routes-portrait` with Playwright 1.64.1 and Chrome 156.0.8078.76. Each assembled `index.html` was byte for byte the approved page, and each MP4, JPG poster and AVIF poster came out byte for byte the committed file, so PSNR against the committed MP4 is infinite on frame 0, at 2.2 s, at the poster time and over every frame. The site's Archivo file therefore covers every glyph and axis the sources use.
