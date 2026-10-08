// guide-html.mjs: changes a guide page makes to its README section. Plain Node, tested in
// site/test/guide-html.test.mjs.
//
//   linkSkills(html, names)   the rendered README section with every <code>name</code> whose text is
//                             a skill name wrapped in a link to /skills/<name>/. Code inside a link,
//                             a code block or a heading stays as it is (a heading is a link target
//                             of its own, and the contents list repeats its text).
//   skillsNamed(texts, names) the skills the texts name, once each, in the order of first mention.
//                             A name counts wherever it appears: in code, in a link, in a path.
//   dropTitleHeading(html, title)  the section without its first element when that is an H2 whose
//                             text is the page title, its subsections lifted one level so no heading
//                             level is skipped: a guide that maps several README sections gets each
//                             as an H2, and the first can repeat the H1 right above it.
//   eagerFirstImage(html)     the section with its first <img> loaded eagerly and at high priority
//                             (loading="lazy" becomes loading="eager" fetchpriority="high") when that
//                             image comes before the section's first H2. Such an image sits right
//                             under the short intro, in the first viewport, and is the page's largest
//                             paint; the build marks every Markdown image lazy, which delays it.

const SKIP = new Set(['a', 'pre', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
const TOKEN = /(<[^>]+>)/;

export function linkSkills(html, names) {
  const known = new Set(names);
  const parts = html.split(TOKEN);
  let skipped = 0;
  for (let i = 0; i < parts.length; i++) {
    const tag = parts[i].match(/^<(\/?)([a-zA-Z][\w-]*)/);
    if (!tag) continue;
    const name = tag[2].toLowerCase();
    if (SKIP.has(name)) skipped += tag[1] ? -1 : 1;
    if (skipped === 0 && parts[i] === '<code>' && parts[i + 2] === '</code>' && known.has(parts[i + 1])) {
      parts[i] = `<a href="/skills/${parts[i + 1]}/"><code>`;
      parts[i + 2] = '</code></a>';
      i += 2;
    }
  }
  return parts.join('');
}

export function skillsNamed(texts, names) {
  const known = new Set(names);
  const found = new Set();
  for (const text of texts) {
    for (const [name] of text.matchAll(/\bab-[a-z0-9]+(?:-[a-z0-9]+)*/g)) {
      if (known.has(name)) found.add(name);
    }
  }
  return [...found];
}

export function dropTitleHeading(html, title) {
  const first = html.match(/^\s*<h2\b[^>]*>([\s\S]*?)<\/h2>/);
  if (!first || first[1].replace(/<[^>]+>/g, '').trim() !== title) return html;
  const rest = html.slice(first[0].length);
  const end = rest.search(/<h2\b/);
  const section = end === -1 ? rest : rest.slice(0, end);
  const lifted = section.replace(/<(\/?)h([3-6])\b/g, (_, close, n) => `<${close}h${Number(n) - 1}`);
  return lifted + (end === -1 ? '' : rest.slice(end));
}

export function eagerFirstImage(html) {
  const img = html.search(/<img\b/);
  const h2 = html.search(/<h2\b/);
  if (img === -1 || (h2 !== -1 && h2 < img)) return html;
  return html.replace(/<img\b[^>]*>/, (tag) => tag.replace(/\sloading="lazy"/, ' loading="eager" fetchpriority="high"'));
}
