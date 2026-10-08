// docs-sidebar.mjs: the Docs section's sidebar, curated here in reading order (R4). The labels are
// the pages' names everywhere: sidebar, page heading, and previous and next. Which README sections a
// page renders is readme-map.mjs; site/test/docs-sidebar.test.mjs holds the two lists to the same pages.
//
// Exports
//   DOCS_SIDEBAR          [{ title, items: [{ slug, label }] }], the groups in order.
//   docsOrder()           [{ slug, label, href, group }] for every page, in sidebar order.
//   docsSidebar(slug)     the groups in DocsLayout's shape ({ title, items: [{ label, href, current }] }),
//                         with the page `slug` marked current.
//   docsNeighbors(slug)   { prev, next } as { label, href }, each undefined at the ends of the order.
//                         Throws naming the slug when it is not a Docs page.

import { pageUrl } from './readme-map.mjs';

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

export function docsOrder() {
  return DOCS_SIDEBAR.flatMap((group) =>
    group.items.map(({ slug, label }) => ({ slug, label, href: pageUrl('docs', slug), group: group.title })),
  );
}

export function docsSidebar(slug) {
  return DOCS_SIDEBAR.map((group) => ({
    title: group.title,
    items: group.items.map((item) => ({
      label: item.label,
      href: pageUrl('docs', item.slug),
      ...(item.slug === slug ? { current: true } : {}),
    })),
  }));
}

export function docsNeighbors(slug) {
  const order = docsOrder();
  const i = order.findIndex((page) => page.slug === slug);
  if (i === -1) throw new Error(`docs-sidebar: "${slug}" is not a Docs page`);
  const link = (page) => (page ? { label: page.label, href: page.href } : undefined);
  return { prev: link(order[i - 1]), next: link(order[i + 1]) };
}
