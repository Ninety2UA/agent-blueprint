// Video figures (ported from the approved f/src/video.js). Every video plays on its own while at
// least half of it is on screen (or, when it is taller than twice the viewport, while it fills half
// the viewport) and pauses when it leaves; there is no pause control. Loops loop;
// the film plays once and does not loop. With reduced motion nothing starts on its own: the poster
// shows with a play button, as it does when the browser refuses to start a muted video by itself
// (data saver, low power mode) and after the film ends. Without JavaScript the native controls
// stay. Nothing calls play() before a video is half visible, and every video is preload="none",
// so no video bytes load before then.
//
// A figure holds one video box (VideoMedia), or a landscape and a portrait box when it has a portrait
// cut, and CSS shows one of them. Each box is played on its own: the hidden box is display: none, so
// it never intersects and its video never starts. `vjs` marks the figure (the film's controls and the
// Play button rules key on it); `is-playing` and `show-big` mark each box. A figure marked
// data-after-load (the Hosted page's Fig. 1) starts only after the load event, so its video does not
// compete with its poster and the fonts.

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// a ratio step every 10 %, so a figure taller than the viewport still reports as it scrolls
const THRESHOLDS = Array.from({ length: 11 }, (_, i) => i / 10);
const clock = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

interface Figure {
  fig: HTMLElement;
  v: HTMLVideoElement;
  play(rewind?: boolean): void;
  auto(): void;
}

const figures: Figure[] = [];
let loaded = document.readyState === 'complete';

// Ruling 47: a poster that waits for the reader (VideoMedia) carries its URLs as data-src and
// data-srcset; they are set once its box comes within a screen of the viewport, whatever the video
// does next (reduced motion, a refused or failed start), and a hidden box (display: none) never comes
// near, so its poster never loads.
const near = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const box = e.target as HTMLElement;
      near.unobserve(box);
      box.querySelectorAll<HTMLSourceElement>('source[data-srcset]').forEach((s) => {
        s.srcset = s.dataset.srcset!;
        s.removeAttribute('data-srcset');
      });
      const img = box.querySelector<HTMLImageElement>('img[data-src]');
      if (img) {
        img.src = img.dataset.src!;
        img.removeAttribute('data-src');
      }
    }
  },
  { rootMargin: '100% 0px' },
);

document.querySelectorAll<HTMLElement>('[data-vfig]').forEach((fig) => {
  const afterLoad = fig.hasAttribute('data-after-load');
  const boxes: Figure[] = [];
  fig.querySelectorAll<HTMLElement>('.vf-media').forEach((box) => {
    if (box.querySelector('img[data-src]')) near.observe(box);
    const v = box.querySelector('video');
    if (v) boxes.push(initBox(fig, box, v, afterLoad));
  });
  if (!boxes.length) return;
  fig.classList.add('vjs');
  figures.push(...boxes);
  if (fig.hasAttribute('data-film')) initFilm(boxes[0]);
});

if (!loaded && figures.some((c) => c.fig.hasAttribute('data-after-load'))) {
  window.addEventListener(
    'load',
    () => {
      loaded = true;
      figures.forEach((c) => c.auto());
    },
    { once: true },
  );
}

document.addEventListener('visibilitychange', () => {
  figures.forEach((c) => (document.hidden ? !c.v.paused && c.v.pause() : c.auto()));
});

function initBox(fig: HTMLElement, box: HTMLElement, v: HTMLVideoElement, afterLoad: boolean): Figure {
  v.removeAttribute('controls');
  const big = box.querySelector<HTMLButtonElement>('.vf-big');
  const label = big?.dataset.label ?? 'the video';
  let inView = false;
  let refused = false;

  const sync = () => {
    const playing = !v.paused && !v.ended;
    if (playing) refused = false;
    box.classList.toggle('is-playing', playing);
    box.classList.toggle('show-big', !playing && (reduced || refused || v.ended));
    if (big) {
      const again = v.ended ? 'Replay' : 'Play';
      const text = big.querySelector('span');
      if (text) text.textContent = again;
      big.setAttribute('aria-label', `${again} ${label}`);
    }
  };
  const start = () => {
    v.play().catch((error: unknown) => {
      // an AbortError only means a pause() came first, as when the box leaves the screen or is hidden
      if ((error as DOMException | null)?.name === 'NotAllowedError') refused = true;
      sync();
    });
  };
  const ctl: Figure = {
    fig,
    v,
    play(rewind = true) {
      if (rewind && v.ended) v.currentTime = 0;
      start();
    },
    auto() {
      if (inView && !reduced && !v.ended && v.paused && !document.hidden && (loaded || !afterLoad)) start();
    },
  };

  (['play', 'playing', 'pause', 'ended'] as const).forEach((ev) => v.addEventListener(ev, sync));
  big?.addEventListener('click', () => ctl.play());
  new IntersectionObserver(
    (entries) => {
      const e = entries[entries.length - 1];
      const fillsHalfTheViewport = !!e.rootBounds && e.intersectionRect.height >= e.rootBounds.height / 2;
      inView = e.isIntersecting && (e.intersectionRatio >= 0.5 || fillsHalfTheViewport);
      if (!e.isIntersecting) {
        if (!v.paused) v.pause();
        return;
      }
      ctl.auto();
    },
    { threshold: THRESHOLDS },
  ).observe(v);
  sync();
  return ctl;
}

// The film: chapter buttons seek and follow playback; the dimension line shows where it is.
function initFilm({ fig, v, play }: Figure) {
  const dur0 = parseFloat(fig.dataset.duration ?? '') || 1;
  const texts: Record<string, string> = JSON.parse(fig.dataset.texts ?? '{}');
  const chaps = [...fig.querySelectorAll<HTMLButtonElement>('.chap')].map((b) => ({
    b,
    t: parseFloat(b.dataset.t ?? '0'),
    label: b.querySelector('.cn')?.textContent ?? '',
  }));
  const fill = fig.querySelector<HTMLElement>('.fd-fill')!;
  const head = fig.querySelector<HTMLElement>('.fd-head')!;
  const cur = fig.querySelector<HTMLElement>('[data-cur]')!;
  const seek = fig.querySelector<HTMLInputElement>('.fd-seek')!;
  const now = fig.querySelector<HTMLElement>('[data-now]')!;
  let active = -1;
  let raf = 0;
  const dur = () => (Number.isFinite(v.duration) && v.duration > 0 ? v.duration : dur0);

  const show = (t: number) => {
    const p = Math.min(1, Math.max(0, t / dur()));
    fill.style.transform = `scaleX(${p})`;
    head.style.left = `${p * 100}%`;
    cur.textContent = clock(t);
    seek.value = String(Math.round(p * 1000));
    seek.setAttribute('aria-valuetext', `${clock(t)} of ${clock(dur())}`);
    let i = 0;
    chaps.forEach((c, k) => {
      if (t + 0.05 >= c.t) i = k;
    });
    if (i !== active) {
      active = i;
      chaps.forEach((c, k) => (k === i ? c.b.setAttribute('aria-current', 'step') : c.b.removeAttribute('aria-current')));
      // chapter texts are fixed strings written into the page at build time
      now.innerHTML = `<b>${chaps[i].label}</b> <span>${texts[chaps[i].label] ?? ''}</span>`;
    }
  };
  const loop = () => {
    show(v.currentTime);
    raf = requestAnimationFrame(loop);
  };
  v.addEventListener('playing', () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
  });
  (['pause', 'ended', 'seeked', 'loadedmetadata'] as const).forEach((ev) =>
    v.addEventListener(ev, () => {
      cancelAnimationFrame(raf);
      show(v.currentTime);
      // a seek inside the buffer may not fire `playing` again; keep the readout moving
      if (!v.paused && !v.ended) raf = requestAnimationFrame(loop);
    }),
  );

  const jump = (t: number) => {
    v.currentTime = Math.min(t, dur() - 0.05);
    show(t);
  };
  chaps.forEach((c) =>
    c.b.addEventListener('click', () => {
      jump(c.t + 0.01);
      play(false);
    }),
  );
  seek.addEventListener('input', () => jump((Number(seek.value) / 1000) * dur()));
  show(0);

  // A scored film's Sound toggle (FilmPlayer `sound`): the film starts muted; a press flips the
  // video's own mute, which replay, chapter jumps and seeking leave alone, so the choice holds. A
  // hidden tab pauses the film above, and its sound with it.
  const sound = fig.querySelector<HTMLButtonElement>('.fd-sound');
  if (sound) {
    const pressed = () => sound.setAttribute('aria-pressed', String(!v.muted));
    sound.addEventListener('click', () => {
      v.muted = !v.muted;
      pressed();
    });
    v.addEventListener('volumechange', pressed);
    pressed();
  }
}

// A module, so the header can load it with a dynamic import.
export {};
