// The Workflow figures draw their lines once as they scroll in (the home page's reveal rule):
// every line is drawn by default, and only a figure that starts below the fold gets .is-drawing,
// which plays the CSS entrance in workflow.css. Nothing moves under reduced motion.
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (!reduced && 'IntersectionObserver' in window) {
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        io.unobserve(entry.target);
        entry.target.classList.add('is-drawing');
      }
    },
    { rootMargin: '0px 0px -12% 0px' },
  );
  document.querySelectorAll('[data-draw]').forEach((el) => {
    if (el.getBoundingClientRect().top > window.innerHeight) io.observe(el);
  });
}

export {};
