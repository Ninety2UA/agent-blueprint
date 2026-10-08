// The Kit page's content, ported from the approved f/src/kit.py. Counts, the version, the tools and
// the repository URL come from getSiteData() (KTD4); every file fact comes from the file itself
// (files.mjs, ../media.ts). What stays here is editorial: the captions and text alternatives of the
// loops, the sheet index, and the drawing of the mark at the sizes the page shows.
import { join } from 'node:path';

import { findRepoRoot, getSiteData } from '../../lib/site.mjs';
import { numberWord } from '../number-word';

const data = getSiteData();
export const site = {
  version: data.version as string,
  repoUrl: data.repoUrl as string,
  counts: data.counts as { skills: number; helpers: number; hooks: number; tools: number },
  tools: (data.tools as { name: string }[]).map((t) => t.name),
};

/** The README hero GIF: kept once in the repository, served into the build by pages/media/readme-hero.gif.ts. */
export const README_GIF = { file: join(findRepoRoot(), 'docs', 'images', 'hero.gif'), href: '/media/readme-hero.gif' };

const listJoin = (items: string[]) => `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * A text with current-state counts, as plain text for the copy button and as HTML in which each
 * count carries its data-claim (KTD5). Parts are strings, or [claim, text] pairs.
 */
type Part = string | [claim: 'skills' | 'helpers' | 'hooks' | 'tools' | 'version', text: string];
export interface Claimed {
  text: string;
  html: string;
}
function claimed(parts: Part[]): Claimed {
  return {
    text: parts.map((p) => (typeof p === 'string' ? p : p[1])).join(''),
    html: parts.map((p) => (typeof p === 'string' ? esc(p) : `<span data-claim="${p[0]}">${esc(p[1])}</span>`)).join(''),
  };
}

const { skills, helpers, tools } = site.counts;
const toolsWord = numberWord(tools);

// The README's own alt text for its hero.
const ALT_PARTS: Part[] = [
  'Agent Blueprint: ',
  ['skills', `${skills} skills`],
  ' that take a coding agent from an idea to a reviewed pull request, in ',
  ['tools', toolsWord],
  ' coding CLIs',
];
export const ALT = claimed(ALT_PARTS).text;
export const SNIPPET = claimed(['[![', ...ALT_PARTS, '](readme-hero.gif)](', site.repoUrl, ')']);

export const SHORT = claimed([...ALT_PARTS, '.']);
export const LONG = claimed([
  'Agent Blueprint is a set of ',
  ['skills', `${skills} skills`],
  ' that take an AI coding agent from an idea to a reviewed pull request. They work the same way in ',
  ['tools', toolsWord],
  ` coding CLIs: ${listJoin(site.tools)}. Skills carry a feature from design through review to a pull request, and `,
  ['helpers', `${helpers} helper prompts`],
  ' run the checks that need a fresh context. Project documents under docs/ carry decisions and solved problems ' +
    'from one session to the next. Agent Blueprint is MIT licensed: ',
  site.repoUrl.replace(/^https:\/\//, ''),
]);

// The sheet index at the top of the page: anchor, contents, file types.
export const INDEX = [
  { id: 'readme', title: 'README header', files: 'GIF, MP4' },
  { id: 'film', title: 'The film', files: 'MP4, chapters' },
  { id: 'loops', title: 'Four loops', files: 'MP4' },
  { id: 'mark', title: 'The mark', files: 'SVG' },
  { id: 'blurb', title: 'Description', files: 'Text' },
];

// The loops, in the order the gallery shows them, with the text alternatives the home page uses.
export const LOOPS = [
  {
    name: 'loop-review',
    caption: 'Two review passes, until no P1 is left',
    label: 'the review loop',
    alt:
      'Looping animation, no sound: the change fans out to five reviewers, three that always run and two the diff ' +
      'calls for. Their findings merge into a report: pass 1 has P1 2, P2 3, P3 4. After the fixes, pass 2 has ' +
      'P1 0, P2 1, P3 2. No P1 is left, so the loop stops.',
  },
  {
    name: 'loop-waves',
    caption: 'Team work in waves, <code>ab-orchestrate</code>',
    label: 'the waves loop',
    alt:
      'Looping animation, no sound: the lead line of ab-orchestrate. Tasks 1 and 2 run in parallel as wave 1, ' +
      'an integration check follows and the lead commits them, then tasks 3 and 4 run as wave 2 and are checked. ' +
      "Under it the ledger shows each task's file and status: waiting, running, done, committed by the lead.",
  },
  {
    name: 'loop-runner',
    caption: 'The ship runner, a fresh session per iteration',
    label: 'the runner loop',
    alt:
      'Looping animation, no sound: the ship runner with --host codex. Each iteration is a fresh session on a new ' +
      'sheet while .agent-blueprint/run/state.json carries over and its status, stage and iteration change. When the ' +
      'status is done, the runner scans for secrets, pushes, and the pull request opens.',
  },
  {
    name: 'loop-handoff',
    caption: 'Claude Code hands off to Codex',
    label: 'the handoff loop',
    alt:
      'Looping animation, no sound: session 1 in Claude Code finishes three of four tasks and ab-session-wrap writes ' +
      'docs/context/STATUS.md and a docs/solutions/ entry. Session 2 in Codex runs ab-resume-session, reads both and ' +
      'starts on task 4.',
  },
];

// ---------- The mark at drawing scale (f/src/parts.py mark_cells, f/src/kit.py small_mark) ----------

/** The path through the 3 by 3 grid, as [column, row], in loop order. */
export const PATH: [number, number][] = [[0, 0], [1, 0], [1, 1], [2, 1], [2, 2]];
const at = (col: number, row: number) => PATH.findIndex(([c, r]) => c === col && r === row);
const num = (n: number) => String(Math.round(n * 1000) / 1000);

interface CellOptions {
  on?: string;
  last?: string;
  line?: string;
  /** cell size and pitch, in grid units */
  cell?: number;
  step?: number;
  /** outline width of the skipped cells */
  sw?: number;
  /** mark the path cells for the fill animation (class mk-on, --i) */
  animate?: boolean;
}

/** The nine cells as SVG rects: path cells filled (the last one in the accent), the others outlined. */
export function markCells({ on = 'var(--ink)', last = 'var(--accent)', line = 'var(--mark-line)', cell = 8, step = 10, sw = 1, animate = false }: CellOptions = {}) {
  const out: string[] = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const x = col * step;
      const y = row * step;
      const i = at(col, row);
      if (i >= 0) {
        const cls = animate ? ` class="mk-on" style="--i:${i}"` : '';
        out.push(`<rect${cls} x="${x}" y="${y}" width="${cell}" height="${cell}" fill="${i === 4 ? last : on}"/>`);
      } else {
        const h = sw / 2;
        out.push(`<rect x="${num(x + h)}" y="${num(y + h)}" width="${num(cell - sw)}" height="${num(cell - sw)}" fill="none" stroke="${line}" stroke-width="${num(sw)}"/>`);
      }
    }
  }
  return out.join('');
}

/** The small-size drawing (the favicon geometry): 8 unit cells, 4 unit gaps, 2 unit outlines on a 32 grid. */
export function smallMark(on = 'var(--ink)', last = 'var(--accent)', line = 'var(--mark-line-sm)') {
  const out: string[] = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const x = col * 12;
      const y = row * 12;
      const i = at(col, row);
      out.push(
        i >= 0
          ? `<rect x="${x}" y="${y}" width="8" height="8" fill="${i === 4 ? last : on}"/>`
          : `<rect x="${x + 1}" y="${y + 1}" width="6" height="6" fill="none" stroke="${line}" stroke-width="2"/>`,
      );
    }
  }
  return out.join('');
}
