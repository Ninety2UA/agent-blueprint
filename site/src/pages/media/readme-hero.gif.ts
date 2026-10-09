// /media/readme-hero.gif: the README hero GIF the Kit page offers. The repository keeps it once, at
// docs/images/hero.gif (the README shows it from there); the build copies that file here, so a new
// render of the hero changes the Kit page with no second copy under site/.
import type { APIRoute } from 'astro';
import { readFileSync } from 'node:fs';

import { README_GIF } from '../../components/kit/kit-data';

export const GET: APIRoute = () => new Response(readFileSync(README_GIF.file), { headers: { 'Content-Type': 'image/gif' } });
