// Entrances for elements below the fold (the approved f/src/common.js AB.reveal). Every
// element is visible by default; the animation starts from hidden only once the element
// is about to scroll in, so nothing above the fold moves and nothing shifts layout.
export const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

interface RevealOptions {
  duration?: number;
  /** delay between neighbours, in ms */
  stagger?: number;
  /** the element's place in the stagger; defaults to its index */
  order?: (index: number) => number;
}

export function reveal(els: Element[], frames: Keyframe[], { duration = 700, stagger = 0, order = (i) => i }: RevealOptions = {}) {
  if (reduced() || !('IntersectionObserver' in window)) return;
  const place = new Map(els.map((el, i) => [el, order(i)]));
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        io.unobserve(en.target);
        en.target.animate(frames, {
          duration,
          delay: stagger * (place.get(en.target) ?? 0),
          easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
          fill: 'backwards',
        });
      });
    },
    { rootMargin: '0px 0px 12% 0px', threshold: 0 },
  );
  els.forEach((el) => {
    if (el.getBoundingClientRect().top > window.innerHeight) io.observe(el);
  });
}
