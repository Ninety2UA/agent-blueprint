// Skill page: the on-page contents mark the section being read, and the step marker fills
// for the step at the middle of the screen (the approved d2 skill page's behavior).
const links = [...document.querySelectorAll<HTMLAnchorElement>('.toc ol a')];
const byId = new Map(links.map((a) => [decodeURIComponent(a.hash.slice(1)), a]));
const seen = new Set<string>();
links[0]?.classList.add('is-here');

const sections = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (e.isIntersecting) seen.add(e.target.id);
      else seen.delete(e.target.id);
    }
    const first = [...byId.keys()].find((id) => seen.has(id));
    if (first) links.forEach((a) => a.classList.toggle('is-here', a === byId.get(first)));
  },
  { rootMargin: '-20% 0px -60% 0px' },
);
byId.forEach((_, id) => {
  const section = document.getElementById(id);
  if (section) sections.observe(section);
});

const steps = new IntersectionObserver(
  (entries) => entries.forEach((e) => e.target.classList.toggle('is-here', e.isIntersecting)),
  { rootMargin: '-45% 0px -45% 0px' },
);
document.querySelectorAll('.steps li').forEach((li) => steps.observe(li));
