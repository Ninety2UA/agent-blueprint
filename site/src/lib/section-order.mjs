// section-order.mjs: a section's reading order, sidebar and previous and next, from its sidebar
// groups. Docs (docs-sidebar.mjs), Guides (guides-order.mjs) and Tutorials (tutorials-order.mjs) each
// hold only their pages and export these three functions under their own names. Every link is
// pageUrl(kind, slug), so the URL scheme lives in readme-map.mjs alone.
//
//   sectionOrder({ kind, groups })   kind is the URL segment ('docs', 'guides', 'tutorials');
//                                    groups is [{ title, items: [{ slug, label }] }] in sidebar order.
//                                    Returns:
//     order()          [{ slug, label, href, group }] for every page, in sidebar order.
//     sidebar(slug)    the groups in DocsLayout's shape ({ title, items: [{ label, href, current }] }),
//                      with the page `slug` marked current.
//     neighbors(slug)  { prev, next } as { label, href }, each undefined at the ends of the order.
//                      Throws naming the slug when it is not a page of the section.

import { pageUrl } from './readme-map.mjs';

/** @typedef {{ title: string, items: { slug: string, label: string }[] }} SectionGroup */

/** @param {{ kind: string, groups: SectionGroup[] }} section */
export function sectionOrder({ kind, groups }) {
  const order = () =>
    groups.flatMap((group) =>
      group.items.map(({ slug, label }) => ({ slug, label, href: pageUrl(kind, slug), group: group.title })),
    );

  const sidebar = (slug) =>
    groups.map((group) => ({
      title: group.title,
      items: group.items.map((item) => ({
        label: item.label,
        href: pageUrl(kind, item.slug),
        ...(item.slug === slug ? { current: true } : {}),
      })),
    }));

  const neighbors = (slug) => {
    const pages = order();
    const i = pages.findIndex((page) => page.slug === slug);
    if (i === -1) throw new Error(`section-order: "${slug}" is not a page under /${kind}/`);
    const link = (page) => (page ? { label: page.label, href: page.href } : undefined);
    return { prev: link(pages[i - 1]), next: link(pages[i + 1]) };
  };

  return { order, sidebar, neighbors };
}
