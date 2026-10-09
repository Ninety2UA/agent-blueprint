// /llms.txt: the site's sections and every skill page with its one-line summary, generated from the
// repository at build time (lib/llms.mjs).
import type { APIRoute } from 'astro';

import { NAV } from '../components/nav';
import { llmsTxt } from '../lib/llms.mjs';
import { getSiteData } from '../lib/site.mjs';

export const GET: APIRoute = () =>
  new Response(llmsTxt(getSiteData(), NAV), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
