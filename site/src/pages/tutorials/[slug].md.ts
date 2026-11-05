// /tutorials/<slug>.md: the page's Markdown, built from the repository (lib/page-markdown.mjs).
import type { APIRoute } from 'astro';

import { tutorialsOrder } from '../../lib/tutorials-order.mjs';
import { MARKDOWN_HEADERS, pageMarkdown } from '../../lib/page-markdown.mjs';

export function getStaticPaths() {
  return tutorialsOrder().map(({ slug }) => ({ params: { slug } }));
}

export const GET: APIRoute = ({ params }) =>
  new Response(pageMarkdown('tutorials', params.slug ?? ''), { headers: MARKDOWN_HEADERS });
