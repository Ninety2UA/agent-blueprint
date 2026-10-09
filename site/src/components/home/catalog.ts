// Catalog preview (the approved f/src/home.js): phase chips filter the featured skills,
// the count says what is showing, and the cards move with a view transition where the
// browser has one.
import { reduced, reveal } from './reveal';

const cat = document.querySelector<HTMLElement>('[data-catalog]');

if (cat) {
  const chips = [...cat.querySelectorAll<HTMLButtonElement>('.chips .chip')];
  const cards = [...cat.querySelectorAll<HTMLElement>('.card')];
  const count = cat.querySelector<HTMLElement>('[data-count]')!;
  const empty = cat.querySelector<HTMLElement>('[data-empty]')!;
  const total = count.dataset.total ?? '';
  const sizes = Object.fromEntries(chips.map((c) => [c.dataset.phase, c.querySelector('.n')?.textContent ?? '']));
  const labels = Object.fromEntries(chips.map((c) => [c.dataset.phase, c.dataset.label ?? '']));

  const apply = (phase: string) => {
    chips.forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.phase === phase)));
    cards.forEach((el) => {
      el.hidden = phase !== 'all' && el.dataset.phase !== phase;
    });
    const shown = cards.filter((el) => !el.hidden).length;
    empty.hidden = shown > 0;
    count.textContent =
      phase === 'all' ? `${shown} featured of ${total}` : `${shown} featured of ${sizes[phase]} ${labels[phase]} skills`;
  };

  cat.querySelector('[data-phase-reset]')?.addEventListener('click', () => apply('all'));
  chips.forEach((c) =>
    c.addEventListener('click', () => {
      const go = () => apply(c.dataset.phase ?? 'all');
      if (document.startViewTransition && !reduced()) document.startViewTransition(go);
      else go();
    }),
  );

  reveal(cards, [{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }], {
    duration: 640,
    stagger: 60,
    order: (i) => i % 4,
  });
}
