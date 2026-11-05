// /guides/<slug>.md: the page's Markdown, built from the repository (lib/page-markdown.mjs).
import type { APIRoute } from 'astro';

import { guidesOrder } from '../../lib/guides-order.mjs';
import { MARKDOWN_HEADERS, pageMarkdown } from '../../lib/page-markdown.mjs';

export function getStaticPaths() {
  return guidesOrder().map(({ slug }) => ({ params: { slug } }));
}

export const GET: APIRoute = ({ params }) =>
  new Response(pageMarkdown('guides', params.slug ?? ''), { headers: MARKDOWN_HEADERS });
