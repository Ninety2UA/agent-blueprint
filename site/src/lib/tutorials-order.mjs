// tutorials-order.mjs: the Tutorials section's reading order and page names (R1, R5). The labels
// are the tutorials' names everywhere: sidebar, page heading, and previous and next. Each tutorial's
// text is src/content/tutorials/<slug>.md. The first tutorial is where /tutorials/ redirects
// (site/vercel.json) and where the header's Tutorials item goes (components/nav.ts);
// site/test/tutorials-order.test.mjs holds the three to the same page.
//
// Exports
//   TUTORIALS                  [{ slug, label }] in reading order.
//   tutorialsOrder()           [{ slug, label, href, group }] for every tutorial, in order.
//   tutorialsSidebar(slug)     DocsLayout's sidebar shape: one group of every tutorial, `slug` marked current.
//   tutorialsNeighbors(slug)   { prev, next } as { label, href }, each undefined at the ends of the order.
// The three functions are section-order.mjs over one "Tutorials" group.

import { sectionOrder } from './section-order.mjs';

export const TUTORIALS = [
  { slug: 'first-feature-new-project', label: 'Your first feature in a new project' },
  { slug: 'feature-existing-codebase', label: 'A feature in an existing codebase' },
  { slug: 'unattended-run', label: 'A feature run unattended' },
];

export const {
  order: tutorialsOrder,
  sidebar: tutorialsSidebar,
  neighbors: tutorialsNeighbors,
} = sectionOrder({ kind: 'tutorials', groups: [{ title: 'Tutorials', items: TUTORIALS }] });
