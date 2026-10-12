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
//   breakCodeAfterSlashes(html)  where inline <code> wraps in rendered Markdown (paths, names and
//                            commands in prose, table cells and SKILL.md bodies):
//                            - a word with a slash inside it gets a <wbr> after each inner slash
//                              run, and, unless it holds a quote (a value such as model:"a/b", not
//                              a path), each segment of up to SHORT_CODE characters goes in a
//                              <span class="seg">, which never wraps, so docs/context/ breaks only
//                              after a slash, even in a phone table where other code may break
//                              anywhere; a longer segment may still wrap;
//                            - any other word of up to SHORT_CODE characters that holds a hyphen
//                              goes in a <span class="nowrap">, so ab-project-start never wraps as
//                              "ab-" and "project-start" in prose (a phone table may still break it,
//                              see docs-pages.css); a flag (--effort) is marked "nowrap flag" and
//                              stays whole there too;
//                            - any other word gets a <wbr> after each inner |, = or , (between
//                              values: none|minimal|low, effort=high), and, when it is longer than
//                              LONG_WORD, after each inner _ and after a dot that starts a name of
//                              five letters or more (CLAUDE_CODE_EFFORT_LEVEL,
//                              delegation.reasoning_effort). Chrome offers no break at any of these,
//                              so a table column would otherwise take the whole word's width; no
//                              table needs to break code anywhere else.
//                            Code blocks (<pre>) keep their lines, and prose, tags and attributes are
//                            left as they are.
//   SHORT_CODE               the longest segment or hyphenated word kept whole: 30.
//   LONG_WORD                the length above which a word also breaks after _ and a dot: 20.
//   keepFlagsWhole(html)     the HTML with each space-separated word of its text that starts with
//                            "-" or "[-" (-q, --host, [--pr], [--wave-size) in a
//                            <span class="nowrap">. Chrome offers a line break after every hyphen,
//                            so [--pr] could otherwise split into "[-" and "-pr]". Tags and
//                            attribute values are not touched; the visible text stays the same.

const TAG = /(<[^>]*>)/;
const PATH_WORD = /\S*[^\s/]\/+[^\s/]\S*/g;
const FLAG = /^\[?--?[^\s-]/;
const HAS_INNER_SLASH = /[^\s/]\/+[^\s/]/;
// a quoted value with a slash in it (model:"provider/id") is not a path: it only gets the <wbr>s
const QUOTED = /["']|&quot;|&#39;/;
export const SHORT_CODE = 30;
export const LONG_WORD = 20;
// after an inner |, = or , (between values), at any length
const SEPARATOR = /([|=,])(?=[^\s])/g;
// in a long word, also after an inner _ or a dot that starts a name of five letters or more (not .md, .toml)
const LONG_SEPARATOR = /(_|\.(?=[A-Za-z_]{5}))(?=[^\s])/g;
// characters as a reader sees them: an entity such as &lt; counts as one
const textLength = (s) => s.replace(/&\w+;|&#\d+;/g, '_').length;

// One word with a slash inside it: a <wbr> after each inner run of slashes. In a command each
// hyphenated segment goes in a nowrap span; in inline code (`seg`) every segment of up to
// SHORT_CODE characters goes in a seg span, and a longer one may still wrap, so it cannot overflow.
// split() keeps the slash runs at the odd indexes, so an empty neighbour means the run starts or
// ends the word.
const breakPath = (word, seg = false) =>
  word
    .split(/(\/+)/)
    .map((piece, i, pieces) => {
      if (i % 2) return pieces[i - 1] && pieces[i + 1] ? `${piece}<wbr>` : piece;
      if (seg) return piece && textLength(piece) <= SHORT_CODE ? `<span class="seg">${piece}</span>` : piece;
      return piece.includes('-') ? `<span class="nowrap">${piece}</span>` : piece;
    })
    .join('');

/** @param {string} html @returns {string} */
export function breakAfterSlashes(html) {
  return html
    .split(TAG)
    .map((part) => (part.startsWith('<') ? part : part.replace(PATH_WORD, (word) => breakPath(word))))
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
      parts[i] = parts[i]
        .split(/(\s+)/)
        .map((word) =>
          HAS_INNER_SLASH.test(word) ? breakPath(word, !QUOTED.test(word))
          : word.includes('-') && textLength(word) <= SHORT_CODE ? `<span class="${FLAG.test(word) ? 'nowrap flag' : 'nowrap'}">${word}</span>`
          : (textLength(word) > LONG_WORD ? word.replace(LONG_SEPARATOR, '$1<wbr>') : word).replace(SEPARATOR, '$1<wbr>'),
        )
        .join('');
    }
  }
  return parts.join('');
}
