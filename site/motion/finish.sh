#!/usr/bin/env bash
# Final encodes from the HyperFrames masters in motion/.work/<name>/renders/: H.264 yuv420p,
# faststart, no audio, 30 fps; a JPG poster per video; film-chapters.json; and the README GIF.
# Writes site/public/media/ and docs/images/hero.gif.
#   bash finish.sh               every piece below
#   bash finish.sh film-hosted   only the Hosted page's film, the one scored piece: H.264 with its
#                                AAC audio kept, its posters and film-hosted-chapters.json
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

film_hosted() {
  # the score rides the master (the composition's <audio>); keep it as AAC, 96 kb/s stereo
  ffmpeg -v error -y -i "$WORK/film-hosted/renders/film-hosted-master.mp4" -c:v libx264 -preset slow -crf 18 \
    -pix_fmt yuv420p -r 30 -c:a aac -b:a 96k -ac 2 -movflags +faststart "$OUT/film-hosted.mp4"
  poster film-hosted 8.4
  ffmpeg -v error -y -ss 8.4 -i "$OUT/film-hosted.mp4" -frames:v 1 -vf "scale=1280:720:flags=lanczos" -q:v 3 "$OUT/film-hosted-1280.jpg"
  cat > "$OUT/film-hosted-chapters.json" <<'JSON'
[
  {"label": "Ask", "start": 0},
  {"label": "Sandbox", "start": 18.0},
  {"label": "Stages", "start": 24.0},
  {"label": "Pull request", "start": 32.0},
  {"label": "Deploy", "start": 37.0}
]
JSON
  ls -la "$OUT"/film-hosted*
}
if [ "${1:-}" = "film-hosted" ]; then film_hosted; exit 0; fi

enc film 16
enc readme-hero 16
for n in loop-review loop-waves loop-runner loop-handoff loop-install loop-setup loop-workflow; do enc "$n" 17; done

poster film 3.6
# a lighter 1280x720 poster of the same frame
ffmpeg -v error -y -ss 3.6 -i "$OUT/film.mp4" -frames:v 1 -vf "scale=1280:720:flags=lanczos" -q:v 3 "$OUT/film-1280.jpg"
poster readme-hero 3.8
poster loop-review 5.5
poster loop-waves 5.0
poster loop-runner 6.4
poster loop-handoff 5.2
poster loop-install 2.3
poster loop-setup 8.9
poster loop-workflow 10.1

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
film_hosted
ls -la "$OUT" "$REPO/docs/images/hero.gif"
