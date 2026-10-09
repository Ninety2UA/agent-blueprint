#!/usr/bin/env bash
# Final encodes from the HyperFrames masters in motion/.work/<name>/renders/: H.264 yuv420p,
# faststart, no audio, 30 fps; a JPG poster per video; film-chapters.json; and the README GIF.
# Writes site/public/media/ and docs/images/hero.gif.
set -euo pipefail
MOTION="$(cd "$(dirname "$0")" && pwd)"
SITE="$(dirname "$MOTION")"
REPO="$(dirname "$SITE")"
WORK="$MOTION/.work"
OUT="$SITE/public/media"
mkdir -p "$OUT"

enc() { # name crf
  ffmpeg -v error -y -i "$WORK/$1/renders/$1-master.mp4" -an -c:v libx264 -preset slow -crf "$2" \
    -pix_fmt yuv420p -r 30 -movflags +faststart "$OUT/$1.mp4"
}
poster() { # name seconds
  ffmpeg -v error -y -ss "$2" -i "$OUT/$1.mp4" -frames:v 1 -q:v 2 "$OUT/$1.jpg"
}

enc film 16
enc readme-hero 16
for n in loop-review loop-waves loop-runner loop-handoff; do enc "$n" 17; done

poster film 3.6
# a lighter 1280x720 poster of the same frame
ffmpeg -v error -y -ss 3.6 -i "$OUT/film.mp4" -frames:v 1 -vf "scale=1280:720:flags=lanczos" -q:v 3 "$OUT/film-1280.jpg"
poster readme-hero 3.8
poster loop-review 5.5
poster loop-waves 5.0
poster loop-runner 6.4
poster loop-handoff 5.2

# README GIF: 960 px wide, 15 fps, one shared palette, loops forever
ffmpeg -v error -y -i "$OUT/readme-hero.mp4" -vf "fps=15,scale=960:-1:flags=lanczos,palettegen=max_colors=48:stats_mode=full" "$WORK/hero-palette.png"
ffmpeg -v error -y -i "$OUT/readme-hero.mp4" -i "$WORK/hero-palette.png" \
  -lavfi "fps=15,scale=960:-1:flags=lanczos [x]; [x][1:v] paletteuse=dither=none" -loop 0 "$REPO/docs/images/hero.gif"

cat > "$OUT/film-chapters.json" <<'JSON'
[
  {"label": "Idea", "start": 0},
  {"label": "Design", "start": 4.6},
  {"label": "Plan", "start": 11.4},
  {"label": "Build", "start": 17.8},
  {"label": "Review", "start": 25.6},
  {"label": "Verify", "start": 34.2},
  {"label": "Ship", "start": 40.6},
  {"label": "Learn", "start": 46.6}
]
JSON
ls -la "$OUT" "$REPO/docs/images/hero.gif"
