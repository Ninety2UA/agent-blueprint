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
      // "Archivo Fallback" is the set of metric-matched Arial faces in src/styles/global.css, one
      // per font-stretch band, so the layout made before Archivo arrives already has Archivo's
      // line breaks. Astro's generated fallback is one Arial face for every width; it left the
      // 118% headings a line short and body text a line long (CLS up to 0.06 on cold Slow 4G).
      fallbacks: ['Archivo Fallback', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      optimizedFallbacks: false,
      options: {
        variants: [
          {
            // Instanced to the ranges the site and the motion sources use (weights 400 to 700,
            // widths 100% to 120%): 55 KB instead of 90 KB for the one preloaded file.
            weight: '400 700',
            stretch: '100% 120%',
            style: 'normal',
            // block, not swap: until this preloaded file arrives the text is laid out invisibly
            // in the fallback faces, so a slow connection never shows Arial at the wrong width.
            // optional showed the fallback on a cold Fast 4G load. On cold Fast 4G the hero is set
            // in Archivo with CLS 0 and LCP about 0.5 s.
            display: 'block',
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
