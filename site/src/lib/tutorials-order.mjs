// tutorials-order.mjs: the Tutorials section's reading order and page names (R1, R5). The labels
// are the tutorials' names everywhere: sidebar, page heading, and previous and next. Each tutorial's
// text is src/content/tutorials/<slug>.md. The first tutorial is where /tutorials/ redirects
// (site/vercel.json) and where the header's Tutorials item goes (components/nav.ts);
// site/test/tutorials-order.test.mjs holds the three to the same page.
//
// Exports
//   TUTORIALS                  [{ slug, label }] in reading order.
//   tutorialsOrder()           [{ slug, label, href }] for every tutorial, in order.
//   tutorialsSidebar(slug)     DocsLayout's sidebar shape: one group of every tutorial, `slug` marked current.
//   tutorialsNeighbors(slug)   { prev, next } as { label, href }, each undefined at the ends of the order.
//                              Throws naming the slug when it is not a tutorial.

export const TUTORIALS = [
  { slug: 'first-feature-new-project', label: 'Your first feature in a new project' },
  { slug: 'feature-existing-codebase', label: 'A feature in an existing codebase' },
  { slug: 'unattended-run', label: 'A feature run unattended' },
];

export function tutorialsOrder() {
  return TUTORIALS.map(({ slug, label }) => ({ slug, label, href: `/tutorials/${slug}/` }));
}

export function tutorialsSidebar(slug) {
  return [
    {
      title: 'Tutorials',
      items: tutorialsOrder().map((t) => ({ label: t.label, href: t.href, ...(t.slug === slug ? { current: true } : {}) })),
    },
  ];
}

export function tutorialsNeighbors(slug) {
  const order = tutorialsOrder();
  const i = order.findIndex((t) => t.slug === slug);
  if (i === -1) throw new Error(`tutorials-order: "${slug}" is not a tutorial`);
  const link = (t) => (t ? { label: t.label, href: t.href } : undefined);
  return { prev: link(order[i - 1]), next: link(order[i + 1]) };
}
