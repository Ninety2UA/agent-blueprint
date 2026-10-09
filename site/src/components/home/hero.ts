// Hero drawing (the approved f/src/home.js). The drawing draws itself once from the
// .is-drawing class in the static HTML (CSS only, so it starts with the first paint);
// afterwards a red tracer walks the loop while the drawing is on screen. The detail
// bubble "A" scrolls to Detail A.
import { reduced } from './reveal';

const fig = document.querySelector<HTMLElement>('[data-hero]');

function runTracer(svg: SVGSVGElement) {
  const track = svg.querySelector<SVGPathElement>('.track');
  const dot = svg.querySelector<SVGCircleElement>('.tracer');
  const stations = [...svg.querySelectorAll<SVGGElement>('.st')].map((g) => {
    const m = /translate\(([\d.]+)[ ,]+([\d.]+)\)/.exec(g.getAttribute('transform') ?? '');
    return { g, x: Number(m?.[1] ?? 0), y: Number(m?.[2] ?? 0) };
  });
  if (!track || !dot || !stations.length) return;
  if (reduced()) {
    stations[0].g.classList.add('is-on');
    return;
  }
  const total = track.getTotalLength();
  const first = stations[0];
  const last = stations[stations.length - 1];
  const datum = Math.hypot(last.x - first.x, last.y - first.y);
  // down the stations in 62% of the period, back up the return line in the rest
  const period = 12000;
  const split = 0.62;
  let start: number | null = null;
  let raf = 0;
  let running = false;
  const frame = (ts: number) => {
    start ??= ts;
    const t = ((ts - start) % period) / period;
    const len = t < split ? (t / split) * datum : datum + ((t - split) / (1 - split)) * (total - datum);
    const p = track.getPointAtLength(len);
    dot.setAttribute('cx', p.x.toFixed(1));
    dot.setAttribute('cy', p.y.toFixed(1));
    stations.forEach((s) => s.g.classList.toggle('is-on', t < split + 0.01 && Math.hypot(s.x - p.x, s.y - p.y) < 22));
    raf = requestAnimationFrame(frame);
  };
  const play = () => {
    if (running) return;
    running = true;
    svg.classList.add('is-tracing');
    raf = requestAnimationFrame(frame);
  };
  const stop = () => {
    running = false;
    cancelAnimationFrame(raf);
  };
  const io = new IntersectionObserver(([e]) => (e.isIntersecting && !document.hidden ? play() : stop()));
  setTimeout(() => io.observe(svg), 2500);
  document.addEventListener('visibilitychange', () =>
    document.hidden ? stop() : svg.getBoundingClientRect().bottom > 0 && play(),
  );
}

if (fig) {
  const drawings = [...fig.querySelectorAll<SVGSVGElement>('.sch')];
  // The entrance has finished by now; dropping the class keeps it from replaying when a
  // resize swaps the wide drawing for the narrow one.
  setTimeout(() => drawings.forEach((s) => s.classList.remove('is-drawing')), 3600);
  fig.querySelector('.bubble')?.addEventListener('click', () =>
    document.getElementById('loop')?.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth' }),
  );
  const shown = drawings.find((s) => s.getBoundingClientRect().width > 0);
  if (shown) runTracer(shown);
}
