// Unattended runs (the approved f/src/home.js): picking a host rewrites the --host
// argument and the note under the command, and adds --allow-unguarded for the tools that
// can only run unguarded. A dot runs along the five steps while they are on screen.
import { reduced } from './reveal';

const pick = document.querySelector<HTMLElement>('.host-pick');

if (pick) {
  const hosts = [...pick.querySelectorAll<HTMLButtonElement>('.host')];
  const arg = document.querySelector<HTMLElement>('[data-host-arg]')!;
  const unguarded = document.querySelector<HTMLElement>('[data-allow-unguarded]')!;
  const notes = [...document.querySelectorAll<HTMLElement>('[data-note-for]')];

  const choose = (b: HTMLButtonElement, focus = false) => {
    hosts.forEach((h) => {
      const on = h === b;
      h.setAttribute('aria-checked', String(on));
      h.tabIndex = on ? 0 : -1;
    });
    arg.textContent = b.dataset.host ?? '';
    unguarded.hidden = !b.hasAttribute('data-unguarded');
    notes.forEach((n) => {
      n.hidden = n.dataset.noteFor !== b.dataset.host;
    });
    if (focus) b.focus();
  };

  hosts.forEach((b, i) => {
    b.addEventListener('click', () => choose(b));
    b.addEventListener('keydown', (e) => {
      const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
      if (d) {
        e.preventDefault();
        choose(hosts[(i + d + hosts.length) % hosts.length], true);
      }
    });
  });
}

const flow = document.querySelector<HTMLElement>('[data-flow]');
if (flow && !reduced()) {
  const setRun = () => {
    const last = flow.querySelector('li:last-of-type .fm');
    if (last) flow.style.setProperty('--run', `${last.getBoundingClientRect().left - flow.getBoundingClientRect().left + 14}px`);
  };
  setRun();
  // one measurement per frame while the window is resized
  let frame = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(setRun);
  });
  new IntersectionObserver(([e]) => flow.classList.toggle('is-live', e.isIntersecting), { threshold: 0.4 }).observe(flow);
}
