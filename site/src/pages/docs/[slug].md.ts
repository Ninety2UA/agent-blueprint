// /docs/<slug>.md: the page's Markdown, built from the repository (lib/page-markdown.mjs).
import type { APIRoute } from 'astro';

import { docsOrder } from '../../lib/docs-sidebar.mjs';
import { MARKDOWN_HEADERS, pageMarkdown } from '../../lib/page-markdown.mjs';

export function getStaticPaths() {
  return docsOrder().map(({ slug }) => ({ params: { slug } }));
}

export const GET: APIRoute = ({ params }) =>
  new Response(pageMarkdown('docs', params.slug ?? ''), { headers: MARKDOWN_HEADERS });
