// The Kit (/kit/) and the README GIF it offers (/media/readme-hero.gif) are the maintainer's media
// kit: `npm run dev` serves them, the production build never builds them, so they stay off the
// public site, its sitemap and its search index.
import { fileURLToPath } from 'node:url';

/** @returns {import('astro').AstroIntegration} */
export default function kitDevRoute() {
  return {
    name: 'agent-blueprint:kit-dev-route',
    hooks: {
      'astro:config:setup': ({ command, injectRoute }) => {
        if (command !== 'dev') return;
        injectRoute({ pattern: '/kit', entrypoint: fileURLToPath(new URL('./kit.astro', import.meta.url)) });
        injectRoute({ pattern: '/media/readme-hero.gif', entrypoint: fileURLToPath(new URL('./readme-hero.gif.ts', import.meta.url)) });
      },
    },
  };
}
