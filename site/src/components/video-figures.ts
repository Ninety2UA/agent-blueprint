// Video figures (ported from the approved f/src/video.js). Loops play while at least half
// of them is on screen and pause when they leave it; the film plays once and does not
// loop. A pause the reader asks for sticks until they press play. With reduced motion
// nothing starts on its own: the poster shows with a play button, as it does when the
// browser refuses to start a muted video by itself (data saver, low power mode). Without
// JavaScript the native controls stay. Nothing calls play() before a figure is half
// visible, and every video is preload="none", so no video bytes load before then.

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const clock = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

interface Figure {
  fig: HTMLElement;
  v: HTMLVideoElement;
  play(rewind?: boolean): void;
  auto(): void;
}

const figures: Figure[] = [];

document.querySelectorAll<HTMLElement>('[data-vfig]').forEach((fig) => {
  const v = fig.querySelector('video');
  if (!v) return;
  v.removeAttribute('controls');
  fig.classList.add('vjs');
  const toggle = fig.querySelector<HTMLButtonElement>('.vf-toggle');
  const state = toggle?.querySelector('.vf-state');
  const label = toggle?.dataset.label ?? 'the video';
  const big = fig.querySelector<HTMLButtonElement>('.vf-big');
  let userPaused = false;
  let inView = false;
  let refused = false;

  const sync = () => {
    const playing = !v.paused && !v.ended;
    if (playing) refused = false;
    const s = v.ended ? 'ended' : playing ? 'playing' : 'paused';
    fig.classList.toggle('is-playing', playing);
    fig.classList.toggle('show-big', !playing && (reduced || userPaused || refused || v.ended));
    if (toggle) {
      toggle.dataset.state = s;
      const word = s === 'playing' ? 'Pause' : s === 'ended' ? 'Replay' : 'Play';
      if (state) state.textContent = word;
      toggle.setAttribute('aria-label', `${word} ${label}`);
    }
    if (big) {
      const again = v.ended ? 'Replay' : 'Play';
      const text = big.querySelector('span');
      if (text) text.textContent = again;
      big.setAttribute('aria-label', `${again} ${label}`);
    }
  };
  const start = () => {
    v.play().catch((error: unknown) => {
      // an AbortError only means a pause() came first, as when the figure leaves the screen
      if ((error as DOMException | null)?.name === 'NotAllowedError') refused = true;
      sync();
    });
  };
  const ctl: Figure = {
    fig,
    v,
    play(rewind = true) {
      userPaused = false;
      if (rewind && v.ended) v.currentTime = 0;
      start();
    },
    auto() {
      if (inView && !reduced && !userPaused && !v.ended && v.paused && !document.hidden) start();
    },
  };
  const pause = () => {
    userPaused = true;
    v.pause();
  };

  (['play', 'playing', 'pause', 'ended'] as const).forEach((ev) => v.addEventListener(ev, sync));
  fig.querySelectorAll('[data-vplay]').forEach((b) =>
    b.addEventListener('click', () => (v.paused || v.ended ? ctl.play() : pause())),
  );
  new IntersectionObserver(
    (entries) => {
      const e = entries[entries.length - 1];
      inView = e.isIntersecting && e.intersectionRatio >= 0.5;
      if (!e.isIntersecting) {
        if (!v.paused) v.pause();
        return;
      }
      ctl.auto();
    },
    { threshold: [0, 0.5] },
  ).observe(v);
  sync();
  figures.push(ctl);
  if (fig.hasAttribute('data-film')) initFilm(ctl);
});

document.addEventListener('visibilitychange', () => {
  figures.forEach((c) => (document.hidden ? !c.v.paused && c.v.pause() : c.auto()));
});

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
}

// A module, so the header can load it with a dynamic import.
export {};
