// wrap-points.mjs: where code wraps on a narrow screen. Plain Node, tested in
// site/test/wrap-points.test.mjs.
//
//   breakAfterSlashes(html)  the HTML with a <wbr> after each run of slashes that sits between two
//                            non-space characters of its text, so a long path or URL in a command
//                            wraps at a slash instead of inside a name. Each segment of such a path
//                            that holds a hyphen goes in a <span class="nowrap">: Chrome also offers
//                            a break after a hyphen, so the clone URL could otherwise end a line
//                            with "agent-". A slash that starts or ends a word (/ab-review-swarm,
//                            docs/) is left alone. Tags and attribute values are not touched, and a
//                            <wbr> or a span adds no characters, so the text a copy button reads
//                            from the command stays the same.
//   breakCodeAfterSlashes(html)  the same <wbr>s, in the text of inline <code> only (rendered
//                            Markdown: paths in prose and table cells). Code blocks (<pre>) keep
//                            their lines, and prose, tags and attributes are left as they are.
//   keepFlagsWhole(html)     the HTML with each space-separated word of its text that starts with
//                            "-" or "[-" (-q, --host, [--pr], [--wave-size) in a
//                            <span class="nowrap">. Chrome offers a line break after every hyphen,
//                            so [--pr] could otherwise split into "[-" and "-pr]". Tags and
//                            attribute values are not touched; the visible text stays the same.

const TAG = /(<[^>]*>)/;
const INNER_SLASHES = /(?<=[^\s/])(\/+)(?=[^\s/])/g;
const PATH_WORD = /\S*[^\s/]\/+[^\s/]\S*/g;
const FLAG = /^\[?--?[^\s-]/;

// One word with a slash inside it: a <wbr> after each inner run of slashes, each hyphenated
// segment whole. split() keeps the slash runs at the odd indexes, so an empty neighbour means the
// run starts or ends the word.
const breakPath = (word) =>
  word
    .split(/(\/+)/)
    .map((piece, i, pieces) => {
      if (i % 2) return pieces[i - 1] && pieces[i + 1] ? `${piece}<wbr>` : piece;
      return piece.includes('-') ? `<span class="nowrap">${piece}</span>` : piece;
    })
    .join('');

/** @param {string} html @returns {string} */
export function breakAfterSlashes(html) {
  return html
    .split(TAG)
    .map((part) => (part.startsWith('<') ? part : part.replace(PATH_WORD, breakPath)))
    .join('');
}

/** @param {string} html @returns {string} */
export function keepFlagsWhole(html) {
  return html
    .split(TAG)
    .map((part) =>
      part.startsWith('<')
        ? part
        : part
            .split(/(\s+)/)
            .map((word) => (FLAG.test(word) ? `<span class="nowrap">${word}</span>` : word))
            .join(''),
    )
    .join('');
}

/** @param {string} html @returns {string} */
export function breakCodeAfterSlashes(html) {
  const parts = html.split(TAG);
  let code = 0;
  let pre = 0;
  for (let i = 0; i < parts.length; i++) {
    const tag = parts[i].match(/^<(\/?)(code|pre)\b/i);
    if (tag) {
      const step = tag[1] ? -1 : 1;
      if (tag[2].toLowerCase() === 'pre') pre += step;
      else code += step;
    } else if (code > 0 && pre === 0 && !parts[i].startsWith('<')) {
      parts[i] = parts[i].replace(INNER_SLASHES, '$1<wbr>');
    }
  }
  return parts.join('');
}
