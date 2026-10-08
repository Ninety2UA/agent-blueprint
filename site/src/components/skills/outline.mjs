// outline.mjs: what a skill page derives from its SKILL.md and its description (R2). Plain
// string functions over the HTML the Markdown pipeline rendered, so they run in node:test too.
//
// Exports
//   parseStep(text)              { label, title } for a step heading ("Step 1: Scope", "Stage 2: Plan",
//                                "Phase 0: Resume", "Pass 1: Accuracy", "3. Hand off", "2a. Review"),
//                                else null.
//   skillOutline(html, headings) { kind, steps, report }
//                                kind 'steps': the step headings of the shallowest level that has two or
//                                more, plus any step heading above that level, in document order.
//                                kind 'sections': no such level, so the H2 sections, numbered in order.
//                                kind null: neither (steps is empty).
//                                Each step: { label, title, id, intro }; id is the heading's id in the
//                                body prepareBody() returns; intro the HTML of the paragraph right under
//                                the heading, or null when the section starts with anything else.
//                                report: the last section titled like the skill's output (Report, Final
//                                report, Report Format, Present Results, Produce report, Write the ...
//                                Report), as { title, id, html } with its own headings set under an h2
//                                and their ids dropped, or null.
//   prepareBody(html, headings)  the full body for the page: heading ids prefixed with "md-" (so they
//                                never collide with the page's own section ids) and the heading levels
//                                in use mapped, in order, onto h3 to h6 under the page's h2.
//   splitDescription(text)       { what, use: [clause], not } from a SKILL.md description: the sentences
//                                before "Use ...", the "Use ..." clauses (split on semicolons) and any
//                                later sentence, and the "Not ..." sentence (null without one).
//   inlineCode(text)             README cell text as HTML: escaped, `code` spans as <code>.
//   formatText(text, names)      text as HTML: escaped, every name in `names` (a Set) as <code>.

/** @typedef {{ depth: number; slug: string; text: string }} Heading */
/** @typedef {{ label: string; title: string; id: string; intro: string | null }} Step */
/** @typedef {{ title: string; id: string; html: string }} Report */
/** @typedef {{ kind: 'steps' | 'sections' | null; steps: Step[]; report: Report | null }} Outline */

export const BODY_PREFIX = 'md-';

const STEP = /^(?:(?:step|stage|phase|pass)\s+(\d+(?:\.\d+)?[a-z]?)\b\s*[:.)\-–—]?|(\d+(?:\.\d+)?[a-z]?)[.:)])\s*(\S.*)$/i;
const REPORT = /^(?:(?:final|present|produce|document|write the(?:\s+\w+)?)\s+)?(?:report|results)(?:\s+format)?$/i;
const HEADING_TAG = /<(\/?)h([1-6])\b([^>]*)>/g;

/** @param {string} text @returns {{ label: string; title: string } | null} */
export function parseStep(text) {
  const m = text.trim().match(STEP);
  return m ? { label: m[1] ?? m[2], title: m[3].trim() } : null;
}

const reEscape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Where a heading sits in the HTML: the end of its element and its level. */
function locate(html, slug) {
  const m = new RegExp(`<h([1-6])\\b[^>]*\\bid="${reEscape(slug)}"[^>]*>[\\s\\S]*?</h\\1>`).exec(html);
  if (!m) throw new Error(`skill outline: no heading with id "${slug}" in the rendered SKILL.md`);
  return { end: m.index + m[0].length, depth: Number(m[1]) };
}

/** The start of the next heading after `from` whose level is at most `maxDepth`. */
function nextHeading(html, from, maxDepth = 6) {
  const re = /<h([1-6])\b/g;
  re.lastIndex = from;
  for (let m = re.exec(html); m; m = re.exec(html)) if (Number(m[1]) <= maxDepth) return m.index;
  return html.length;
}

const VOID = /^<(?:br|img|hr|wbr|input)\b/i;

/** A paragraph's first sentence: up to the first . ! or ? outside code and quotations, with every
 *  tag closed, that ends the paragraph or is followed by a space and a capital, a quote or a bracket. */
function firstSentence(p) {
  let open = 0;
  let code = 0;
  let quoted = 0;
  for (let i = 0; i < p.length; i++) {
    if (p[i] === '“') quoted++;
    else if (p[i] === '”') quoted--;
    else if (p[i] === '<') {
      const end = p.indexOf('>', i);
      const tag = p.slice(i, end + 1);
      if (tag.startsWith('</')) open--;
      else if (!VOID.test(tag) && !tag.endsWith('/>')) open++;
      if (/^<code\b/.test(tag)) code++;
      else if (tag === '</code>') code--;
      i = end;
      continue;
    }
    if (code || !/[.!?]/.test(p[i])) continue;
    // closing quotes, brackets and tags that belong to the sentence
    let j = i + 1;
    let depth = open;
    let quotes = quoted;
    for (;;) {
      if (p[j] === '”') {
        j++;
        quotes--;
      } else if (/["’)]/.test(p[j] ?? '')) j++;
      else if (p.startsWith('</', j)) {
        j = p.indexOf('>', j) + 1;
        depth--;
      } else break;
    }
    if (depth === 0 && quotes <= 0 && (j >= p.length || /^\s+[A-Z“"‘(]/.test(p.slice(j)))) return p.slice(0, j);
  }
  return p;
}

/** The first sentence of the first plain paragraph under a heading. Bold lead-in notes (the
 *  "Working folder." and "Asking the user." paragraphs) are passed over; a section that opens with
 *  a list, code or a table, or whose sentence only introduces one (ends with a colon), has none. */
function intro(html, slug) {
  const { end } = locate(html, slug);
  let rest = html.slice(end, nextHeading(html, end)).trimStart();
  while (rest.startsWith('<p>')) {
    const close = rest.indexOf('</p>');
    const p = rest.slice(3, close);
    rest = rest.slice(close + 4).trimStart();
    if (p.startsWith('<strong>')) continue;
    const sentence = firstSentence(p).trim();
    return sentence.endsWith(':') ? null : sentence;
  }
  return null;
}

function reportOf(html, headings) {
  const found = headings.filter((x) => x.depth >= 2 && REPORT.test(parseStep(x.text)?.title ?? x.text.trim())).at(-1);
  if (!found) return null;
  const { end, depth } = locate(html, found.slug);
  const body = html
    .slice(end, nextHeading(html, end, depth))
    .trim()
    .replace(HEADING_TAG, (_, close, level, attrs) => {
      const to = Math.min(6, Number(level) - depth + 2);
      return close ? `</h${to}>` : `<h${to}${attrs.replace(/\s+id="[^"]*"/, '')}>`;
    });
  return { title: parseStep(found.text)?.title ?? found.text.trim(), id: BODY_PREFIX + found.slug, html: body };
}

/** @param {string} html @param {Heading[]} headings @returns {Outline} */
export function skillOutline(html, headings) {
  const report = reportOf(html, headings);
  const candidates = headings
    .filter((x) => x.depth >= 2)
    .map((x) => ({ ...x, step: parseStep(x.text) }))
    .filter((x) => x.step);
  const perDepth = new Map();
  for (const c of candidates) perDepth.set(c.depth, (perDepth.get(c.depth) ?? 0) + 1);
  const level = [...perDepth].filter(([, n]) => n >= 2).map(([d]) => d).sort((a, b) => a - b)[0];

  if (level !== undefined) {
    const steps = candidates
      .filter((c) => c.depth <= level)
      .map((c) => ({ label: c.step.label, title: c.step.title, id: BODY_PREFIX + c.slug, intro: intro(html, c.slug) }));
    return { kind: 'steps', steps, report };
  }
  const sections = headings.filter((x) => x.depth === 2);
  if (!sections.length) return { kind: null, steps: [], report };
  const steps = sections.map((x, i) => ({ label: String(i + 1), title: x.text.trim(), id: BODY_PREFIX + x.slug, intro: intro(html, x.slug) }));
  return { kind: 'sections', steps, report };
}

/** @param {string} html @param {Heading[]} headings @returns {string} */
export function prepareBody(html, headings) {
  const depths = [...new Set(headings.map((x) => x.depth))].sort((a, b) => a - b);
  const levelOf = (d) => Math.min(6, 3 + (depths.includes(d) ? depths.indexOf(d) : d - 1));
  return html.replace(HEADING_TAG, (_, close, level, attrs) => {
    const to = levelOf(Number(level));
    return close ? `</h${to}>` : `<h${to}${attrs.replace(/\bid="/, `id="${BODY_PREFIX}`)}>`;
  });
}

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const clause = (s) => capitalize(s.trim().replace(/^(?:and|or)\s+/, '').replace(/[.;]\s*$/, '').trim());

/** @param {string} text @returns {{ what: string; use: string[]; not: string | null }} */
export function splitDescription(text) {
  const sentences = text.trim().split(/(?<=[.!?])\s+(?=[A-Z])/);
  let first = sentences.findIndex((s) => /^(?:Use|Not)\b/.test(s));
  if (first === -1) first = sentences.length;
  const use = [];
  let not = null;
  for (const s of sentences.slice(first)) {
    if (/^Use\b/.test(s)) use.push(...s.replace(/^Use\s+/, '').split(/;\s+/).map(clause));
    else if (/^Not\b/.test(s)) not = not ? `${not} ${s}` : s;
    else use.push(clause(s));
  }
  return { what: sentences.slice(0, first).join(' '), use, not };
}

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** @param {string} text @returns {string} */
export function inlineCode(text) {
  return escapeHtml(text).replace(/`([^`]+)`/g, '<code>$1</code>');
}

/** @param {string} text @param {Set<string>} names @returns {string} */
export function formatText(text, names) {
  return escapeHtml(text).replace(/\bab-[a-z0-9]+(?:-[a-z0-9]+)*/g, (name) => (names.has(name) ? `<code>${name}</code>` : name));
}
