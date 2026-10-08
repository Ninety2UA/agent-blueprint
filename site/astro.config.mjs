// @ts-check
import { defineConfig, fontProviders } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import pagefind from 'astro-pagefind';
import tailwindcss from '@tailwindcss/vite';
import interactionDirective from './src/directives/integration.mjs';
import escapeSkillHtml from './src/lib/markdown/escape-skill-html.mjs';
import { SITE_URL } from './src/lib/site.mjs';

// https://astro.build/config
export default defineConfig({
  site: SITE_URL,
  trailingSlash: 'always',
  build: {
    // One request fewer before first paint; the global CSS is about 10 KB gzipped.
    inlineStylesheets: 'always',
  },
  // escapeSkillHtml: raw HTML in SKILL.md bodies renders as text, so <base-branch> stays visible.
  integrations: [react(), sitemap(), pagefind(), interactionDirective(), escapeSkillHtml()],
  fonts: [
    {
      provider: fontProviders.local(),
      name: 'Archivo',
      cssVariable: '--font-archivo',
      fallbacks: ['ui-sans-serif', 'system-ui', 'sans-serif'],
      options: {
        variants: [
          {
            // Instanced to the ranges the site and the motion sources use (weights 400 to 700,
            // widths 100% to 120%): 55 KB instead of 90 KB for the one preloaded file.
            weight: '400 700',
            stretch: '100% 120%',
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
            weight: '400 700',
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
