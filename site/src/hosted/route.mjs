// route.mjs: the integration that builds /hosted/ when the release switch allows it (KTD1), the way
// src/dev/kit-route.mjs injects the Kit. The page component lives outside src/pages/, so a build
// without the switch has no page, no sitemap entry and no search record for it.
//
// The page's data is loaded on every build, switch on or off, so a change to eve/README.md that the
// page cannot use fails today's build rather than the release build. The one exception is a tree
// with no eve/README.md (a Git build of the public main before the release): with the switch off the
// load is skipped; with it on the build fails, naming the missing file.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getHosted } from '../components/hosted/hosted-data.mjs';
import { hostedEnabled } from '../lib/hosted-release.mjs';
import { findRepoRoot } from '../lib/site.mjs';

/**
 * @param {object} [options]  for tests; a build passes none
 * @param {boolean} [options.enabled]  defaults to hostedEnabled() at config setup
 * @param {string} [options.root]  the repository root; defaults to findRepoRoot()
 * @param {(root: string) => unknown} [options.load]  the data loader; defaults to getHosted
 * @returns {import('astro').AstroIntegration}
 */
export default function hostedRoute({ enabled, root, load = getHosted } = {}) {
  return {
    name: 'agent-blueprint:hosted-route',
    hooks: {
      'astro:config:setup': ({ injectRoute }) => {
        const on = enabled ?? hostedEnabled();
        const repo = root ?? findRepoRoot();
        if (existsSync(join(repo, 'eve', 'README.md'))) {
          load(repo);
        } else if (on) {
          throw new Error(`The Hosted page is switched on, but ${join(repo, 'eve', 'README.md')} is missing; the page's data comes from it.`);
        }
        if (on) injectRoute({ pattern: '/hosted', entrypoint: fileURLToPath(new URL('./HostedPage.astro', import.meta.url)) });
      },
    },
  };
}
