// guides-order.mjs: the Guides section's reading order and page names (R1, R4). The labels are the
// guides' names everywhere: sidebar, page heading, and previous and next. Which README sections a
// guide renders is readme-map.mjs; site/test/guides-order.test.mjs holds the two lists to the same
// pages. The first guide is where /guides/ redirects (site/vercel.json) and where the header's
// Guides item goes (components/nav.ts).
//
// Exports
//   GUIDES                 [{ slug, label }] in reading order.
//   guidesOrder()          [{ slug, label, href, group }] for every guide, in order.
//   guidesSidebar(slug)    DocsLayout's sidebar shape: one group of every guide, `slug` marked current.
//   guidesNeighbors(slug)  { prev, next } as { label, href }, each undefined at the ends of the order.
// The three functions are section-order.mjs over one "Guides" group.

import { sectionOrder } from './section-order.mjs';

export const GUIDES = [
  { slug: 'unattended-runs', label: 'Unattended runs' },
  { slug: 'team-work-and-swarms', label: 'Team work and swarms' },
  { slug: 'model-and-effort', label: 'Model and effort' },
  { slug: 'knowledge-compounding', label: 'Knowledge compounding' },
  { slug: 'session-continuity', label: 'Session continuity' },
];

export const {
  order: guidesOrder,
  sidebar: guidesSidebar,
  neighbors: guidesNeighbors,
} = sectionOrder({ kind: 'guides', groups: [{ title: 'Guides', items: GUIDES }] });
