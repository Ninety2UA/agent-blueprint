// tutorial-md.mjs: reads a tutorial (src/content/tutorials/<slug>.md) into the parts its page shows.
// Plain Node, tested in site/test/tutorials.test.mjs. The tutorials collection (content.config.ts)
// renders each Markdown part; the page (pages/tutorials/[slug].astro) lays them out.
//
// A tutorial file is written like this:
//
//   ---
//   description: the page's meta description, one line
//   recorded: the date of the recorded run, e.g. 2026-10-08
//   project: the scratch project the run built
//   tool: the coding CLI and its version
//   model: the model and effort the run used
//   mode: the permission mode
//   took: how long the whole run took
//   ---
//
//   Intro (Markdown, no H2).
//
//   ## A step's title
//
//   Skills: `ab-one`, `ab-two`        optional: the step's skill chips
//   Time: about 4 minutes             optional
//
//   Markdown, with at least one ```prompt block (typed into the coding CLI) or ```bash block (run
//   in a terminal); each becomes a copyable command.
//
//   ### What happens
//   ### Why it matters
//   ### Checkpoint                    all three, in this order, each with Markdown under it
//
//   ## Recap                          last: a table of which skill produced what
//
// The frontmatter is plain `key: value` lines, not YAML: every value is the rest of its line.
// Headings and blocks inside fenced code are text, not structure.
//
// Exports
//   parseTutorial(text, file)  { meta, intro, steps, recap }. meta has every frontmatter key; intro
//                              and recap are Markdown; each step is { title, id, skills, time, lead,
//                              happens, why, checkpoint, markdown }, where lead is a list of
//                              { kind: 'md', md } and { kind: 'cmd', lang: 'prompt' | 'bash', text }
//                              and markdown is the step's own text from its heading on. Throws naming
//                              the file (and the step) when the text does not follow the form above.

import { githubSlug } from '../../lib/readme.mjs';

/**
 * @typedef {{ kind: 'md', md: string } | { kind: 'cmd', lang: 'prompt' | 'bash', text: string }} LeadSegment
 * @typedef {{ title: string, id: string, skills: string[], time: string, lead: LeadSegment[],
 *   happens: string, why: string, checkpoint: string, markdown: string }} Step
 * @typedef {{ meta: Record<string, string>, intro: string, steps: Step[], recap: string }} Tutorial
 */

const META = ['description', 'recorded', 'project', 'tool', 'model', 'mode', 'took'];
const PARTS = [
  ['What happens', 'happens'],
  ['Why it matters', 'why'],
  ['Checkpoint', 'checkpoint'],
];
const COMMANDS = new Set(['prompt', 'bash']);
const FENCE_OPEN = /^(`{3,}|~{3,})\s*([\w-]*)/;

// The fence a line closes or opens: `open` is the open fence before the line, the result the one after.
function fenceAfter(line, open) {
  if (open) {
    const close = line.trim().match(/^(`{3,}|~{3,})$/);
    return close && close[1][0] === open[0] && close[1].length >= open.length ? null : open;
  }
  return line.match(FENCE_OPEN)?.[1] ?? null;
}

// Lines split at headings that start with `prefix`, outside fenced code: [{ heading, lines }],
// the first chunk (before any such heading) with heading null.
function splitAt(lines, prefix) {
  const chunks = [{ heading: null, lines: [] }];
  let fence = null;
  for (const line of lines) {
    if (!fence && line.startsWith(prefix)) chunks.push({ heading: line.slice(prefix.length).trim(), lines: [] });
    else chunks.at(-1).lines.push(line);
    fence = fenceAfter(line, fence);
  }
  return chunks;
}

// Lines as text without the blank lines at either end.
function text(lines) {
  const out = [...lines];
  while (out.length && !out[0].trim()) out.shift();
  while (out.length && !out.at(-1).trim()) out.pop();
  return out.join('\n');
}

// The lead of a step: Markdown runs and the ```prompt and ```bash blocks between them.
/** @returns {LeadSegment[]} */
function leadSegments(lines) {
  /** @type {LeadSegment[]} */
  const segments = [];
  let md = [];
  const flush = () => {
    if (text(md)) segments.push({ kind: 'md', md: text(md) });
    md = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const open = lines[i].match(FENCE_OPEN);
    if (!open) {
      md.push(lines[i]);
      continue;
    }
    const body = [];
    let j = i + 1;
    while (j < lines.length && fenceAfter(lines[j], open[1])) body.push(lines[j++]);
    if (COMMANDS.has(open[2])) {
      flush();
      segments.push({ kind: 'cmd', lang: /** @type {'prompt' | 'bash'} */ (open[2]), text: body.join('\n') });
    } else {
      md.push(...lines.slice(i, j + 1));
    }
    i = j;
  }
  flush();
  return segments;
}

/**
 * @param {string} source
 * @param {string} file
 * @returns {Tutorial}
 */
export function parseTutorial(source, file) {
  const fail = (message) => {
    throw new Error(`${file}: ${message}`);
  };
  const front = source.match(/^---\n([\s\S]*?)\n---\n/);
  if (!front) fail('no frontmatter; the file starts with a --- block of key: value lines');
  const meta = {};
  for (const line of front[1].split('\n')) {
    const m = line.match(/^([a-z]+): (\S.*)$/);
    if (!m || !META.includes(m[1])) fail(`frontmatter line "${line}" is not "key: value" with a key of ${META.join(', ')}`);
    meta[m[1]] = m[2].trim();
  }
  const missing = META.filter((key) => !(key in meta));
  if (missing.length) fail(`the frontmatter has no ${missing.join(', ')}`);

  const [intro, ...sections] = splitAt(source.slice(front[0].length).split('\n'), '## ');
  const recapAt = sections.findIndex((s) => s.heading === 'Recap');
  if (recapAt === -1) fail('no "## Recap" section');
  if (recapAt !== sections.length - 1) fail('"## Recap" is not the last section');

  const steps = sections.slice(0, recapAt).map(({ heading: title, lines }) => {
    const where = `step "${title}"`;
    const body = [...lines];
    while (body.length && !body[0].trim()) body.shift();
    let skills = [];
    let time = '';
    for (let m; body.length && (m = body[0].match(/^(Skills|Time): (.*)$/)); body.shift()) {
      if (m[1] === 'Time') time = m[2].trim();
      else if (/^`[^`]+`(?:, `[^`]+`)*$/.test(m[2].trim())) skills = [...m[2].matchAll(/`([^`]+)`/g)].map((s) => s[1]);
      else fail(`${where}: the Skills line is not a comma-separated list of skill names in backticks`);
    }
    const [lead, ...parts] = splitAt(body, '### ');
    const headings = parts.map((p) => p.heading);
    const expected = PARTS.map(([heading]) => heading);
    if (headings.join('|') !== expected.join('|')) {
      fail(`${where} has the parts ${headings.join(', ') || '(none)'}; it needs ${expected.join(', ')}, in that order`);
    }
    const segments = leadSegments(lead.lines);
    if (!segments.some((s) => s.kind === 'cmd')) fail(`${where} has no \`\`\`prompt or \`\`\`bash block to paste`);
    const step = { title, id: githubSlug(title), skills, time, lead: segments };
    parts.forEach((part, i) => {
      step[PARTS[i][1]] = text(part.lines);
    });
    step.markdown = [`## ${title}`, ...lines].join('\n');
    return step;
  });

  const ids = steps.map((s) => s.id);
  const repeated = ids.find((id, i) => ids.indexOf(id) !== i || ['overview', 'recap'].includes(id));
  if (repeated) fail(`two headings would share the anchor #${repeated}; give the step another title`);

  return { meta, intro: text(intro.lines), steps, recap: text(sections[recapAt].lines) };
}
