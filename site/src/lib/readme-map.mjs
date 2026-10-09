// readme-map.mjs: which README sections each Docs and Guides page renders (KTD2, R13).
//
// Exports
//   DOCS_PAGES      [{ slug, headings }] for the twelve /docs/<slug>/ pages, in the plan's Docs order.
//   GUIDE_PAGES     [{ slug, headings }] for the five /guides/<slug>/ pages.
//   README_PAGES    both lists joined, each entry with `kind` ("docs" | "guides") and `url` (the page's
//                   root-relative site URL, used to rewrite README anchor links).
//   ANCHOR_FALLBACKS  [[RegExp, url]] for top-level README headings no page renders: a README link to
//                   such a heading, or to anything under it, goes to the first matching URL; "/" otherwise.
//   pageUrl(kind, slug)  the site URL of a Docs, Guides or Tutorials page.
//
// `headings` lists README heading texts exactly as written after the #s (inline code included). A page
// renders each listed section with everything under it, except a subsection that another page lists
// itself, which renders only there. A heading listed here that the README no longer has stops the build
// with the page's slug in the message (readme.mjs extractPages).

export function pageUrl(kind, slug) {
  return `/${kind}/${slug}/`;
}

export const DOCS_PAGES = [
  { slug: 'getting-started', headings: ['Install'] },
  { slug: 'quick-start', headings: ['Quick start'] },
  { slug: 'update', headings: ['Update'] },
  { slug: 'upgrade-from-v3', headings: ['Upgrade from v3'] },
  { slug: 'project-files', headings: ['What you get', 'Documentation structure'] },
  { slug: 'customization', headings: ['Customization'] },
  { slug: 'how-it-works', headings: ['How it works under the hood'] },
  { slug: 'hooks-and-native-features', headings: ['Native features in each tool'] },
  { slug: 'consistency-gates', headings: ['Consistency gates (CI)'] },
  { slug: 'error-recovery', headings: ['Error recovery'] },
  { slug: 'tested-in-each-tool', headings: ['Tested in each tool'] },
  { slug: 'faq', headings: ['FAQ'] },
];

export const GUIDE_PAGES = [
  { slug: 'unattended-runs', headings: ['Unattended runs'] },
  { slug: 'team-work-and-swarms', headings: ['Team work and swarms', 'How helpers run'] },
  { slug: 'model-and-effort', headings: ['Model and effort'] },
  { slug: 'knowledge-compounding', headings: ['Knowledge loop (`ab-knowledge-compounding`)'] },
  { slug: 'session-continuity', headings: ['Session continuity'] },
];

export const README_PAGES = [
  ...DOCS_PAGES.map((page) => ({ ...page, kind: 'docs', url: pageUrl('docs', page.slug) })),
  ...GUIDE_PAGES.map((page) => ({ ...page, kind: 'guides', url: pageUrl('guides', page.slug) })),
];

export const ANCHOR_FALLBACKS = [
  [/^What's new in v/, '/changelog/'],
  [/^Release history$/, '/changelog/'],
  [/^Workflow$/, '/workflow/'],
  [/^Skills reference$/, '/skills/'],
  [/^Helper prompts reference$/, '/skills/'],
];
