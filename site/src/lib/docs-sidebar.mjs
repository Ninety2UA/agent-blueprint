// docs-sidebar.mjs: the Docs section's sidebar, curated here in reading order (R4). The labels are
// the pages' names everywhere: sidebar, page heading, and previous and next. Which README sections a
// page renders is readme-map.mjs; site/test/docs-sidebar.test.mjs holds the two lists to the same pages.
// The first page is where /docs/ redirects (site/vercel.json).
//
// Exports
//   DOCS_SIDEBAR          [{ title, items: [{ slug, label }] }], the groups in order.
//   docsOrder()           [{ slug, label, href, group }] for every page, in sidebar order.
//   docsSidebar(slug)     the groups in DocsLayout's shape, with the page `slug` marked current.
//   docsNeighbors(slug)   { prev, next } as { label, href }, each undefined at the ends of the order.
// The three functions are section-order.mjs over DOCS_SIDEBAR.

import { sectionOrder } from './section-order.mjs';

export const DOCS_SIDEBAR = [
  {
    title: 'Get started',
    items: [
      { slug: 'getting-started', label: 'Getting started' },
      { slug: 'quick-start', label: 'Quick start' },
      { slug: 'update', label: 'Update' },
      { slug: 'upgrade-from-v3', label: 'Upgrade from v3' },
    ],
  },
  {
    title: 'Concepts',
    items: [
      { slug: 'project-files', label: 'Project files' },
      { slug: 'how-it-works', label: 'How it works' },
      { slug: 'hooks-and-native-features', label: 'Hooks and native features' },
      { slug: 'consistency-gates', label: 'Consistency gates' },
    ],
  },
  {
    title: 'Help',
    items: [
      { slug: 'customization', label: 'Customization' },
      { slug: 'error-recovery', label: 'Error recovery' },
      { slug: 'tested-in-each-tool', label: 'Tested in each tool' },
      { slug: 'faq', label: 'FAQ' },
    ],
  },
];

export const {
  order: docsOrder,
  sidebar: docsSidebar,
  neighbors: docsNeighbors,
} = sectionOrder({ kind: 'docs', groups: DOCS_SIDEBAR });
