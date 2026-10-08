// Content collections generated from the repository at build time (KTD2, R13). Nothing here is
// copied into site/: each collection reads the repository files in place on every build.
//
//   skills    one entry per skills/<name>/SKILL.md, id = the folder name. The schema requires
//             `name` and `description` and passes every other frontmatter field through. `body` is
//             the raw SKILL.md text after the frontmatter (pages render it with raw HTML escaped).
//   readme    one entry per Docs and Guides page of src/lib/readme-map.mjs, id = the page slug
//             (unique across Docs and Guides). data: { slug, kind, url, headings }; `body` is the
//             page's README Markdown with links rewritten; render(entry) gives <Content /> and the
//             headings for an on-page contents list. README images go through Astro's image
//             pipeline. A mapped heading missing from README.md stops the build naming the page.
//   releases  one entry per README release-history row, id = the version ("4.0.1"). data:
//             { version, date, summary }; entries with docs/releases/v<version>-release-notes.md
//             carry it as `body`, and render(entry) renders it.

import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { findRepoRoot, getReadmePages, getSiteData } from './lib/site.mjs';

const root = findRepoRoot(fileURLToPath(new URL('.', import.meta.url)));

const skills = defineCollection({
  loader: glob({
    pattern: '*/SKILL.md',
    base: new URL('../../skills/', import.meta.url),
    generateId: ({ entry }) => entry.split('/')[0],
  }),
  schema: z.looseObject({
    name: z.string(),
    description: z.string(),
  }),
});

const readme = defineCollection({
  loader: {
    name: 'readme-sections',
    async load({ config, store, parseData, renderMarkdown }) {
      const readmePath = join(root, 'README.md');
      const filePath = relative(fileURLToPath(config.root), readmePath).split(sep).join('/');
      store.clear();
      for (const page of getReadmePages(root)) {
        const { slug, kind, url, headings } = page;
        const data = await parseData({ id: slug, data: { slug, kind, url, headings } });
        const rendered = await renderMarkdown(page.markdown, { fileURL: pathToFileURL(readmePath) });
        store.set({
          id: slug,
          data,
          body: page.markdown,
          filePath,
          rendered,
          assetImports: rendered.metadata?.imagePaths,
        });
      }
    },
  },
  schema: z.object({
    slug: z.string(),
    kind: z.enum(['docs', 'guides']),
    url: z.string(),
    headings: z.array(z.string()),
  }),
});

const releases = defineCollection({
  loader: {
    name: 'release-notes',
    async load({ store, parseData, renderMarkdown }) {
      store.clear();
      for (const { version, date, summary, notes } of getSiteData(root).releases) {
        const data = await parseData({ id: version, data: { version, date, summary } });
        store.set(notes ? { id: version, data, body: notes, rendered: await renderMarkdown(notes) } : { id: version, data });
      }
    },
  },
  schema: z.object({
    version: z.string(),
    date: z.string(),
    summary: z.string(),
  }),
});

export const collections = { skills, readme, releases };
