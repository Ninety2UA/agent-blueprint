// readme-images.mjs: the README diagrams on docs and guide pages, opened full size. Plain Node,
// tested in site/test/readme-images.test.mjs.
//
//   linkFullSize(html)  the rendered README section with each <img> wrapped in a link to the image's
//                       own file (its src, the full-size build output), so a reader on a phone can
//                       open a diagram whose labels are too small in the page column. The image
//                       keeps its alt text and loading attributes. The link has no aria-label: its
//                       name is the image's alt text followed by FULL_SIZE_HINT in a visually hidden
//                       span, so each diagram's link has a name of its own. An image that is already
//                       inside a link stays as it is.

const FULL_SIZE_HINT = '<span class="sr-only"> (opens the full-size image)</span>';

const TAG = /(<[^>]+>)/;

/** @param {string} html @returns {string} */
export function linkFullSize(html) {
  const parts = html.split(TAG);
  let inLink = 0;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (/^<a\b/i.test(part)) inLink++;
    else if (/^<\/a\s*>/i.test(part)) inLink = Math.max(0, inLink - 1);
    else if (inLink === 0 && /^<img\b/i.test(part)) {
      const src = part.match(/\ssrc="([^"]*)"/);
      if (src) parts[i] = `<a class="img-full" href="${src[1]}">${part}${FULL_SIZE_HINT}</a>`;
    }
  }
  return parts.join('');
}
