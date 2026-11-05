// /agent-blueprint.md: the one file a coding agent acts on to install Agent Blueprint, generated from the
// README's install table at build time (lib/agent-guide.mjs). A table the guide cannot use stops the build.
import type { APIRoute } from 'astro';

import { getAgentGuide } from '../lib/agent-guide.mjs';
import { MARKDOWN_HEADERS } from '../lib/page-markdown.mjs';

export const GET: APIRoute = () => new Response(getAgentGuide(), { headers: MARKDOWN_HEADERS });
