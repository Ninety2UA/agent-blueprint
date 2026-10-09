// Detail A (the approved f/src/home.js): the stations are WAI-ARIA tabs with a roving
// tabindex; the cursor under the rail slides to the selected station; hovering a
// pipeline's dimension line lights the stations it covers. The dimension lines draw out
// as they scroll in.
import { reduced, reveal } from './reveal';

const rail = document.querySelector<HTMLElement>('.rail');

if (rail) {
  const cursor = rail.querySelector<HTMLElement>('.rail-cursor');
  const stations = [...rail.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const panelOf = (t: HTMLElement) => document.getElementById(t.getAttribute('aria-controls') ?? '');

  const select = (t: HTMLButtonElement, focus = false) => {
    stations.forEach((s) => {
      const on = s === t;
      s.setAttribute('aria-selected', String(on));
      s.tabIndex = on ? 0 : -1;
      const p = panelOf(s);
      if (!p) return;
      p.hidden = !on;
      if (on) {
        // restart the panel's entrance
        p.classList.remove('is-in');
        void p.offsetWidth;
        p.classList.add('is-in');
      }
    });
    if (cursor) cursor.style.transform = `translateX(${stations.indexOf(t) * 100}%)`;
    if (focus) t.focus();
    if (rail.scrollWidth > rail.clientWidth) {
      t.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reduced() ? 'auto' : 'smooth' });
    }
  };

  stations.forEach((t, i) => {
    t.addEventListener('click', () => select(t));
    t.addEventListener('keydown', (e) => {
      const n = stations.length;
      const next =
        e.key === 'ArrowRight' || e.key === 'ArrowDown' ? (i + 1) % n
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? (i - 1 + n) % n
        : e.key === 'Home' ? 0
        : e.key === 'End' ? n - 1
        : null;
      if (next !== null) {
        e.preventDefault();
        select(stations[next], true);
      }
    });
  });

  document.querySelectorAll<HTMLElement>('.pdim').forEach((d) => {
    const cover = (d.dataset.cover ?? '').split(',').map(Number);
    const light = (on: boolean) => stations.forEach((s, i) => s.classList.toggle('is-covered', on && cover.includes(i)));
    d.addEventListener('mouseenter', () => light(true));
    d.addEventListener('mouseleave', () => light(false));
  });

  reveal([...document.querySelectorAll('.dim-line')], [{ transform: 'scaleX(0)', opacity: 0 }, { transform: 'scaleX(1)', opacity: 1 }], {
    duration: 900,
    stagger: 120,
  });
}
