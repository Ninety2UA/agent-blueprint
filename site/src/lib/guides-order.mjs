// guides-order.mjs: the Guides section's reading order and page names (R1, R4). The labels are the
// guides' names everywhere: sidebar, page heading, and previous and next. Which README sections a
// guide renders is readme-map.mjs; site/test/guides-order.test.mjs holds the two lists to the same
// pages. The first guide is where /guides/ redirects (site/vercel.json) and where the header's
// Guides item goes (components/nav.ts).
//
// Exports
//   GUIDES                 [{ slug, label }] in reading order.
//   guidesOrder()          [{ slug, label, href }] for every guide, in order.
//   guidesSidebar(slug)    DocsLayout's sidebar shape: one group of every guide, `slug` marked current.
//   guidesNeighbors(slug)  { prev, next } as { label, href }, each undefined at the ends of the order.
//                          Throws naming the slug when it is not a guide.

import { pageUrl } from './readme-map.mjs';

export const GUIDES = [
  { slug: 'unattended-runs', label: 'Unattended runs' },
  { slug: 'team-work-and-swarms', label: 'Team work and swarms' },
  { slug: 'model-and-effort', label: 'Model and effort' },
  { slug: 'knowledge-compounding', label: 'Knowledge compounding' },
  { slug: 'session-continuity', label: 'Session continuity' },
];

export function guidesOrder() {
  return GUIDES.map(({ slug, label }) => ({ slug, label, href: pageUrl('guides', slug) }));
}

export function guidesSidebar(slug) {
  return [
    {
      title: 'Guides',
      items: guidesOrder().map((g) => ({ label: g.label, href: g.href, ...(g.slug === slug ? { current: true } : {}) })),
    },
  ];
}

export function guidesNeighbors(slug) {
  const order = guidesOrder();
  const i = order.findIndex((g) => g.slug === slug);
  if (i === -1) throw new Error(`guides-order: "${slug}" is not a guide`);
  const link = (g) => (g ? { label: g.label, href: g.href } : undefined);
  return { prev: link(order[i - 1]), next: link(order[i + 1]) };
}
