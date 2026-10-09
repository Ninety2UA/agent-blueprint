// The home page's content, ported from the approved f/src/home.py and svg.py.
//
// Counts, the version, tools, commands, phases, skill summaries and helper paths all come
// from getSiteData() (KTD4). What stays here is editorial: which skills each loop station
// shows, which skills the catalog preview features, which pipelines the dimension lines
// draw, and the runner's note for each tool. Those name skills and helpers only; every
// name is looked up in the repository data, so a renamed or removed skill stops the build
// with a message that points at this file instead of shipping a broken link.
import { getSiteData, type Helper, type Phase, type Skill } from '../../lib/site.mjs';
import { numberWord } from '../number-word';

const data = getSiteData();
export const site = {
  counts: data.counts,
  repoUrl: data.repoUrl,
  tools: data.tools,
  phases: data.phases,
  cloneLines: data.cloneCommand.split('\n'),
  installCommand: data.installCommand,
};

const HERE = 'site/src/components/home/home-data.ts';
const skillMap = new Map(data.skills.map((s) => [s.name, s]));
const helperMap = new Map(data.helpers.map((h) => [h.name, h]));

/** A skill by name; fails the build when the repository has no such skill. */
export function skill(name: string): Skill {
  const s = skillMap.get(name);
  if (!s) throw new Error(`The home page names the skill ${name}, which skills/ does not have. Update ${HERE}.`);
  return s;
}

/** A helper prompt by name; fails the build when the README's helper table has no such helper. */
export function helper(name: string): Helper {
  const h = helperMap.get(name);
  if (!h) throw new Error(`The home page names the helper prompt ${name}, which the README does not list. Update ${HERE}.`);
  return h;
}

export function phase(slug: string): Phase {
  const p = site.phases.find((x) => x.slug === slug);
  if (!p) throw new Error(`No README phase with the slug ${slug}`);
  return p;
}

export const skillHref = (name: string) => `/skills/${skill(name).name}/`;

// md: README one-liners keep `code` (escaped text, then the code spans). cap: "eight" -> "Eight".
export { capitalize as cap, inlineCode as md } from '../../lib/text.mjs';
export { numberWord };

/** The install command: the clone lines with the installer on the last one, as the footer shows it. */
export const install = {
  lines: [...site.cloneLines.slice(0, -1), `${site.cloneLines.at(-1)} && ${site.installCommand}`],
  copy: [...site.cloneLines, site.installCommand].join(' && '),
};

// ---------- The loop: the stations from idea to pull request ----------

export interface Station {
  name: string;
  /** what happens at the station */
  desc: string;
  /** the skill the hero drawing names under the station */
  lead: string;
  helpers: string[];
  skills: string[];
  /** the station shows the files it writes instead of helpers */
  files?: string[];
}

export const STATIONS: Station[] = [
  {
    name: 'Design',
    desc: 'Settle what the repository already answers, challenge the premise, compare two or three approaches and get your approval before any code is written.',
    lead: 'ab-brainstorming',
    helpers: ['learnings-researcher', 'best-practices-researcher', 'codebase-context-mapper'],
    skills: ['ab-brainstorming', 'ab-discuss', 'ab-ideation', 'ab-deep-research', 'ab-spike-exploration', 'ab-scope-cutting'],
  },
  {
    name: 'Plan',
    desc: 'The approved design becomes tasks that record decisions: file paths, each test and what it asserts, signatures and a review focus. You read the saved plan before anything runs.',
    lead: 'ab-writing-plans',
    helpers: ['plan-checker', 'pattern-mapper'],
    skills: ['ab-writing-plans', 'ab-deepen-plan', 'ab-codebase-mapping', 'ab-migration-planning'],
  },
  {
    name: 'Build',
    desc: 'Test first, one task at a time in this session, with a fresh helper per task, or as team work in dependency-ordered waves.',
    lead: 'ab-orchestrate',
    helpers: ['implementer', 'spec-reviewer', 'integration-verifier'],
    skills: [
      'ab-test-driven-development',
      'ab-executing-plans',
      'ab-subagent-driven-development',
      'ab-orchestrate',
      'ab-autonomous-loop',
      'ab-source-driven-development',
      'ab-using-git-worktrees',
    ],
  },
  {
    name: 'Review',
    desc: 'Narrow reviewers run in parallel, then the change is fixed and reviewed again until the findings converge. Nothing is called done without fresh evidence.',
    lead: 'ab-review-swarm',
    helpers: ['code-reviewer', 'security-sentinel', 'findings-validator', 'findings-synthesizer'],
    skills: [
      'ab-review-swarm',
      'ab-iterative-refinement',
      'ab-requesting-code-review',
      'ab-receiving-code-review',
      'ab-verification-before-completion',
      'ab-browser-testing',
    ],
  },
  {
    name: 'Ship',
    desc: 'Tests and a plan audit against the diff, then merge, push and open the pull request, with a body that is scanned for secrets.',
    lead: 'ab-pr-workflow',
    helpers: ['deployment-verifier', 'pr-comment-resolver'],
    skills: ['ab-finishing-a-development-branch', 'ab-pr-workflow', 'ab-deployment-verification', 'ab-changelog-generation'],
  },
  {
    name: 'Learn',
    desc: `Record what was solved and where the work stands, so the next session starts from it, in whichever of the ${numberWord(site.counts.tools)} tools opens the repository.`,
    lead: 'ab-knowledge-compounding',
    helpers: [],
    files: ['docs/solutions/', 'docs/context/STATUS.md'],
    skills: ['ab-knowledge-compounding', 'ab-session-wrap', 'ab-resume-session', 'ab-project-status'],
  },
];

// Check every name once, when the page is built.
for (const st of STATIONS) {
  skill(st.lead);
  st.skills.forEach(skill);
  st.helpers.forEach(helper);
}

/** The pipelines drawn as dimension lines under the stations: from station a to station b (1-based). */
export const PIPES = [
  { name: 'ab-build-pipeline', text: 'eight supervised stages, a checkpoint after each', a: 1, b: 6 },
  { name: 'ab-ship-pipeline', text: 'end to end with no checkpoints', a: 1, b: 6 },
  { name: 'ab-orchestrate', text: 'team work in dependency-ordered waves', a: 3, b: 4 },
  { name: 'ab-quick-fix', text: 'under three files, obvious approach', a: 3, b: 5 },
].map((p) => ({ ...p, name: skill(p.name).name }));

// ---------- Catalog preview ----------

export const FEATURED: Skill[] = [
  'ab-build-pipeline',
  'ab-ship-pipeline',
  'ab-quick-fix',
  'ab-orchestrate',
  'ab-brainstorming',
  'ab-test-driven-development',
  'ab-review-swarm',
  'ab-iterative-refinement',
  'ab-verification-before-completion',
  'ab-knowledge-compounding',
  'ab-session-wrap',
  'ab-resume-session',
].map(skill);

// ---------- Unattended runs: what each tool may do in the ship runner ----------
// From the README's "How much each tool is allowed to do". A tool the README adds later
// gets the general note until it has its own line here.

const UNGUARDED =
  'can only run unguarded, so the runner asks for <code>--allow-unguarded</code> before it starts. The agent then holds your git and <code>gh</code> credentials.';
export const HOST_NOTES: Record<string, { note: string; unguarded?: boolean }> = {
  claude: { note: 'Claude Code runs with <code>--permission-mode auto</code>.' },
  codex: {
    note: 'Codex runs <code>workspace-write</code> with network on. Where it cannot write to <code>.git</code>, the skill leaves the work uncommitted and the runner commits after each iteration.',
  },
  agy: { note: `Antigravity ${UNGUARDED}`, unguarded: true },
  grok: { note: 'Grok Build runs with <code>--always-approve --sandbox workspace</code>.' },
  pi: { note: `Pi ${UNGUARDED}`, unguarded: true },
  'cursor-agent': { note: 'Cursor CLI runs with <code>--force --sandbox enabled</code>.' },
  amp: { note: `Amp ${UNGUARDED}`, unguarded: true },
};
export const HOST_NOTE_DEFAULT =
  'Each tool runs with the least privilege that still finishes a run. Add <code>--dry-run</code> first to see the preflight and the command.';
/** The host the runner command shows first, as in the README's example. */
export const RUNNER_HOST = 'codex';
