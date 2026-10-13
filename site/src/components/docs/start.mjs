// start.mjs: the Getting started sections that other parts of the site link to by anchor. They are
// README "Install" subsections, rendered as H2 on that page, so each link is checked against the
// README when the site builds: a renamed section stops the build instead of leaving a dead anchor.
// Plain Node, tested in site/test/docs-route.test.mjs.
//
//   START                  the headings, by role: check (the skills are there), setup (ab-project-start),
//                          all (the installer for every tool at once).
//   startAnchor(heading)   the section's id on Getting started ("set-up-your-project"); throws when the
//                          page's README Markdown has no H2 with that text.

import { parseHeadings } from '../../lib/readme.mjs';
import { getReadmePages } from '../../lib/site.mjs';

export const START = {
  check: 'Check that your tool sees the skills',
  setup: 'Set up your project',
  all: 'Set up every tool at once',
};

let markdown;

/** @param {string} heading @returns {string} */
export function startAnchor(heading) {
  markdown ??= getReadmePages().find((page) => page.slug === 'getting-started')?.markdown ?? '';
  const slug = parseHeadings(markdown).find((h) => h.depth === 2 && h.text === heading)?.slug;
  if (!slug) {
    throw new Error(`Getting started has no README section "${heading}" to link to; update site/src/components/docs/start.mjs`);
  }
  return slug;
}
