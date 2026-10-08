// @ts-check
import { defineConfig, fontProviders } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import pagefind from 'astro-pagefind';
import tailwindcss from '@tailwindcss/vite';
import interactionDirective from './src/directives/integration.mjs';
import { SITE_URL } from './src/lib/site.mjs';

// https://astro.build/config
export default defineConfig({
  site: SITE_URL,
  trailingSlash: 'always',
  build: {
    // One request fewer before first paint; the global CSS is about 10 KB gzipped.
    inlineStylesheets: 'always',
  },
  integrations: [react(), sitemap(), pagefind(), interactionDirective()],
  fonts: [
    {
      provider: fontProviders.local(),
      name: 'Archivo',
      cssVariable: '--font-archivo',
      fallbacks: ['ui-sans-serif', 'system-ui', 'sans-serif'],
      options: {
        variants: [
          {
            weight: '100 900',
            stretch: '62% 125%',
            style: 'normal',
            display: 'swap',
            src: ['./src/assets/fonts/Archivo-var.woff2'],
          },
        ],
      },
    },
    {
      provider: fontProviders.local(),
      name: 'Azeret Mono',
      cssVariable: '--font-azeret',
      fallbacks: ['ui-monospace', 'monospace'],
      options: {
        variants: [
          {
            weight: '100 900',
            style: 'normal',
            display: 'swap',
            src: ['./src/assets/fonts/AzeretMono-var.woff2'],
          },
        ],
      },
    },
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
