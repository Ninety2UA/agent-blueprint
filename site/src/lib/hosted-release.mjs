// hosted-release.mjs: the Hosted page's release switch (KTD1). Plain Node, tested in
// site/test/hosted-release.test.mjs.
//
// The committed value stays false until the release that publishes the page (U10 turns it on and
// removes the interim /hosted redirect from site/vercel.json in the same commit). Before that, a build
// carries the page only with the preview override, which fails closed: AB_HOSTED_PREVIEW=1 counts when
// VERCEL_ENV is exactly "preview", or on a local build where neither VERCEL nor CI is set. GitHub
// Actions sets CI=true on every step, so the CI site job's preview step sets VERCEL_ENV=preview too.
// The environment is read from process.env only: Astro loads .env files into import.meta.env, which
// astro.config.mjs and its integrations never see.
//
// Exports
//   HOSTED_RELEASED            the committed switch.
//   HOSTED_PATH                the page's path, as NAV writes it.
//   hostedEnabled(released?, env?)  whether this build carries /hosted/; pure over its arguments.
//   enabledNav(nav, enabled?)  `nav` without the Hosted item while the page is not built. Server only:
//                              the header, the footer and llms.txt call it, so components/nav.ts, which
//                              the client-side mobile menu imports, never reads the environment.

export const HOSTED_RELEASED = false;
export const HOSTED_PATH = '/hosted/';

const isSet = (value) => value !== undefined && value !== '';

/**
 * @param {boolean} [released]
 * @param {Record<string, string | undefined>} [env]
 */
export function hostedEnabled(released = HOSTED_RELEASED, env = process.env) {
  if (released) return true;
  if (env.AB_HOSTED_PREVIEW !== '1') return false;
  if (env.VERCEL_ENV === 'preview') return true;
  return !isSet(env.VERCEL) && !isSet(env.CI) && !isSet(env.VERCEL_ENV);
}

/**
 * @template {{ href: string }} T
 * @param {readonly T[]} nav
 * @param {boolean} [enabled]
 * @returns {T[]}
 */
export function enabledNav(nav, enabled = hostedEnabled()) {
  return enabled ? [...nav] : nav.filter((item) => item.href !== HOSTED_PATH);
}
