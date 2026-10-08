# Motion sources

The site's videos and the README hero GIF are HyperFrames compositions drawn in the 2A Drafting Table style: off-white `oklch(0.985 0 0)`, ink `oklch(0.17 0 0)`, hairlines, Archivo at width 112 to 118 for display, Azeret Mono for labels and paths, and one red-orange accent `oklch(0.63 0.21 33)` that marks only the active element. Text in the accent uses the darker `oklch(0.54 0.2 33)`.

| Folder | Output | Frame | Length |
|---|---|---|---|
| `film/` | `public/media/film.mp4`, `film.jpg`, `film-1280.jpg`, `film-chapters.json` | 1920x1080, 30 fps | 59.5 s |
| `readme-hero/` | `public/media/readme-hero.mp4`, `readme-hero.jpg`, and `docs/images/hero.gif` at the repository root | 1280x512 (GIF 960x384, 15 fps) | 10 s loop |
| `loop-review/`, `loop-waves/`, `loop-runner/`, `loop-handoff/` | `public/media/loop-*.mp4` and `loop-*.jpg` | 1200x750, 30 fps | 8 s loop each |

`shared/ds.css` and `shared/ds.js` hold the tokens and drawing helpers that every composition inlines. Edit `<name>/composition.html` and the shared files; never edit the generated projects under `.work/`, which git ignores.

## When to re-render

- Re-render and commit a video only when its content changes. Every committed render stays in git history, and Codex and Antigravity installs from a checkout copy `.git` too.
- The README hero states the current skill count. The drift gate compares that sentence in `readme-hero/composition.html` with the tree, so adding or removing a skill means updating the sentence, re-rendering the hero and committing the new `docs/images/hero.gif`.
- The film and the loops state no counts, so a new skill never forces a re-render of them.

## How to re-render

Needs Node 22.12 or later, Python 3 and ffmpeg. HyperFrames 0.8.140 renders locally through `npx`; nothing goes to a cloud service and no container runs.

```bash
export DO_NOT_TRACK=1 HYPERFRAMES_NO_TELEMETRY=1 HYPERFRAMES_NO_UPDATE_CHECK=1 HYPERFRAMES_SKIP_SKILLS=1
cd site/motion
python3 build.py                 # or: python3 build.py readme-hero
for n in film readme-hero loop-review loop-waves loop-runner loop-handoff; do
  (cd ".work/$n" && npx --yes hyperframes@0.8.140 check && \
   npx --yes hyperframes@0.8.140 render --crf 2 --fps 30 --output "renders/$n-master.mp4")
done
bash finish.sh
```

`finish.sh` re-encodes each master with `ffmpeg -an -c:v libx264 -preset slow`, CRF 16 for the film and the README hero and CRF 17 for the loops, `-pix_fmt yuv420p -r 30 -movflags +faststart`. It skips `-tune animation`, which left faint ghost segments beside hairlines. Posters are taken with `ffmpeg -ss <t> -frames:v 1 -q:v 2` at these times: film 3.6 s (also scaled to the 1280x720 `film-1280.jpg`), README hero 3.8 s, review 5.5 s, waves 5.0 s, runner 6.4 s, handoff 5.2 s. The GIF uses `fps=15,scale=960:-1:flags=lanczos,palettegen=max_colors=48`, then `paletteuse=dither=none` and `-loop 0`.

The film's chapter start times live in `finish.sh`, which writes `film-chapters.json`; the site reads that file for the chapter buttons. Change both the composition and those times together.

## Checks before committing a render

- `npx hyperframes check` passes for the project.
- Extract frames from the final file with ffmpeg and look at them: the film shows at most one red element per frame, and each loop's first and last frames match so the seam is invisible.
- Scale each loop to 560 px wide and confirm every label still reads, since that is its size on the page.
