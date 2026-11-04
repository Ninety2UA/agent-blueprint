// hosted-data.mjs: the deploy routes the Hosted page's configurator shows (KTD2, KTD3, KTD4). Plain Node,
// tested in site/test/hosted-data.test.mjs.
//
// Everything comes from eve/README.md, read as text at build time (R9): the "Variables" table, the preset
// tables of "Roster", the Vercel Hobby row of "Plan tier and session limits", the command block under "Your
// own server" and the button address in "Railway". The channels are the ones the table's "Prompted when"
// tokens name (channel=web, channel=slack, and each channel whose rows land later), on every host, except
// the web chat, which runs on Vercel only. The table follows the rules of eve/agent/lib/env.ts: six columns in the README's
// order, one code span per name, Sensitive yes or no, one link per row, code-span tokens in "Prompted
// when", and none or one code span as the default, where {preset} or {sandbox} stands for the choice. A
// README that cannot support the page stops the build with an error naming the section: a changed header,
// a missing description or link, a default on a sensitive row, an unknown choice in a token, a relative
// link whose anchor is no README heading, a missing Vercel Hobby row, a Railway address that is not a
// railway.com template, a preset table that is missing, malformed or leaves a role out, a channel token
// the page has no name for, a command block with no npm run build line.
//
// Exports
//   VARIABLE_HEADER          the Variables table's column names, in order.
//   DEFAULT_CHOICE           { host, sandbox, channel, preset } of the default route (R6).
//   WEB_CHAT_REASON          why the web chat is disabled off Vercel (the copy deck's line).
//   ENV_DESCRIPTION          the sentence Vercel's clone page shows above the variables it asks for.
//   CHANNEL_LABEL            channel id to the name the configurator shows, in the order it shows them:
//                            the 4.2.0 channels (rulings 35 and 36). Only those the table names are offered.
//   parseRoster(readme)      { roles, presets }: the roles in the README's order and, per preset table,
//                            each role's Gateway model id.
//   parseVariables(readme)   [{ name, description, link, prompts, sensitive, default }] from the table;
//                            `link` as written, `default` null for none.
//   buildHosted(readme, { repoUrl })  a Hosted (the typedefs below).
//   resolveChoice(hosted, { host, channel, sandbox? })  { state, reason }: the route state for a choice, or
//                            state null for a pairing no route serves, with WEB_CHAT_REASON as the reason
//                            when the web chat is chosen off Vercel. Vercel and Railway fix the sandbox.
//   getHosted(root?)         buildHosted over the repository's eve/README.md, memoized per root.

import { readFileSync } from 'node:fs';
import { join, posix } from 'node:path';

import { firstFence, getSection, githubSlug, parseHeadings, parseLink, parseTable, splitRow } from '../../lib/readme.mjs';
import { findRepoRoot, getSiteData } from '../../lib/site.mjs';
import { exportLine, modelVars } from './model-vars.mjs';

/**
 * @typedef {object} RouteName  a variable a route state asks for.
 * @property {string} name
 * @property {string} description
 * @property {string} link  absolute
 * @property {boolean} sensitive
 * @property {string | null} value  the value it takes in the state; always null for a sensitive name
 */
/**
 * @typedef {object} RouteState
 * @property {string} id  <host>-<channel> (vercel-web, railway-slack), server-<sandbox>-<channel> on your own server
 * @property {'vercel' | 'railway' | 'server'} host
 * @property {'vercel' | 'docker' | 'daytona'} sandbox
 * @property {'oidc' | 'key'} gateway
 * @property {string} channel  a key of CHANNEL_LABEL
 * @property {string} preset
 * @property {RouteName[]} names  in README order
 * @property {string | null} link  the Vercel clone link; null off Vercel
 */
/**
 * @typedef {object} ListedName  one item of the page's names list.
 * @property {string} name
 * @property {string} description
 * @property {string} link  absolute
 * @property {boolean} sensitive
 * @property {Record<string, string | null>} states  state id to the value the name takes there
 */
/**
 * @typedef {object} Hosted
 * @property {RouteState[]} states  default first
 * @property {string} defaultState  the default state's id
 * @property {ListedName[]} names  every name some state asks for, in README order
 * @property {[
 *   { id: 'vercel', links: Record<string, string> },
 *   { id: 'railway', address: string | null, href: string },
 *   { id: 'server', commands: string[], copy: string, exportAt: number },
 * ]} hosts  `href` is the template address, or the README's Railway section while there is none; the
 *   server commands carry the default preset's export line at index `exportAt`, before npm run build
 * @property {{ id: string, label: string }[]} channels  the channels the table names, in CHANNEL_LABEL order
 * @property {{ variable: string, model: string, preset: string, roles: string[], presets: Record<string, Record<string, string>> }} roster
 *   the preset variable (AB_ROSTER), the role variable pattern (AB_MODEL_<ROLE>), the default preset, the
 *   roles in README order and each preset's model per role
 * @property {number} tierMinutes  the Vercel Hobby session limit
 * @property {{ variables: string, afterDeploy: string, preflight: string, railway: string }} links  README sections on GitHub main
 */

export const VARIABLE_HEADER = ['Name', 'Description', 'Link', 'Prompted when', 'Sensitive', 'Default'];
export const WEB_CHAT_REASON = 'The web chat runs on Vercel only';
export const ENV_DESCRIPTION = 'The Variables table in eve/README.md says what each value is, and its Roster section shows how to pick a different model for any role.';

const PRESET = 'quality';
// the presets 4.2.0 ships (ruling 29); a Roster section without a table for each stops the build
const PRESETS = [PRESET, 'budget'];
export const DEFAULT_CHOICE = Object.freeze({ host: 'vercel', sandbox: 'vercel', channel: 'web', preset: PRESET });
export const CHANNEL_LABEL = Object.freeze({ web: 'Web chat', slack: 'Slack', linear: 'Linear', telegram: 'Telegram', mcp: 'MCP' });
// The role variable the Roster section describes; the preset variable is the row whose default is {preset}.
const MODEL_VARIABLE = 'AB_MODEL_<ROLE>';
const ROSTER_HEADER = ['Role', 'Model', 'Reasoning'];

// The values each choice can take; a README token or placeholder outside them stops the build. The presets
// are the Roster section's tables (parseRoster).
const CHOICES = {
  host: ['vercel', 'railway', 'server'],
  gateway: ['oidc', 'key'],
  sandbox: ['vercel', 'docker', 'daytona'],
  channel: Object.keys(CHANNEL_LABEL),
  preset: [PRESET],
};
const GATEWAY = { vercel: 'oidc', railway: 'key', server: 'key' };
const FIXED_SANDBOX = { vercel: 'vercel', railway: 'daytona' };
// Each host with the sandboxes it runs, in the configurator's order; the routes are these times the channels.
const HOST_SANDBOXES = [
  ['vercel', ['vercel']],
  ['railway', ['daytona']],
  ['server', ['docker', 'daytona']],
];

const CLONE = 'https://vercel.com/new/clone';
const PROJECT = 'agent-blueprint';
const RAILWAY_TEMPLATE = /^https:\/\/railway\.com\/(?:deploy|template)\/[\w-]+(?:\?\S*)?$/;

const where = (section) => `eve/README.md > ${section}`;
const fail = (section, message) => new Error(`README "${where(section)}": ${message}`);
const oneSpan = (cell) => cell.match(/^`([^`]+)`$/)?.[1];

function parseToken(name, token, choices) {
  const value = oneSpan(token);
  if (!value) throw fail('Variables', `${name}: "Prompted when" token "${token}" is not one code span`);
  if (value === 'always' || value === 'never') return value;
  const [key, choice, extra] = value.split('=');
  if (extra !== undefined || !Object.hasOwn(choices, key) || !choices[key].includes(choice)) {
    throw fail('Variables', `${name} is prompted on "${value}", which names no choice; the choices are ${Object.entries(choices).map(([k, v]) => `${k}=${v.join('|')}`).join(', ')}`);
  }
  return value;
}

/**
 * @param {string} readme
 * @returns {{ roles: string[], presets: Record<string, Record<string, string>> }}
 */
export function parseRoster(readme) {
  const lines = getSection(readme, 'Roster').lines;
  /** @type {Record<string, Record<string, string>>} */
  const presets = {};
  /** @type {string[]} */
  let roles = [];
  lines.forEach((line, i) => {
    const preset = line.match(/their `(\w+)` settings:\s*$/)?.[1];
    if (!preset) return;
    const next = lines.findIndex((l, j) => j > i && l.trim() !== '');
    if (next === -1 || splitRow(lines[next]).join(' | ') !== ROSTER_HEADER.join(' | ')) {
      throw fail('Roster', `no "${ROSTER_HEADER.join(' | ')}" table follows the line naming the ${preset} preset`);
    }
    /** @type {Record<string, string>} */
    const models = {};
    for (const [roleCell, modelCell] of parseTable(lines.slice(next), ROSTER_HEADER, where('Roster'))) {
      const model = oneSpan(modelCell);
      if (!model) throw fail('Roster', `${preset}: the model "${modelCell}" is not one code span`);
      for (const role of roleCell.split(',').map((r) => r.trim())) {
        if (!/^[a-z]+$/.test(role) || Object.hasOwn(models, role)) throw fail('Roster', `${preset}: the role "${role}" is not a single lower-case word listed once`);
        models[role] = model;
      }
    }
    if (!roles.length) roles = Object.keys(models);
    if (Object.keys(models).join() !== roles.join()) {
      throw fail('Roster', `the ${preset} table lists the roles ${Object.keys(models).join(', ')}; every table lists ${roles.join(', ')}, in that order`);
    }
    presets[preset] = models;
  });
  const tables = lines.filter((l) => l.trim().startsWith('|') && /^\|\s*Role\s*\|/.test(l.trim())).length;
  if (tables !== Object.keys(presets).length) throw fail('Roster', `${tables} role tables, but ${Object.keys(presets).length} lines naming a preset ("The roles and their \`<preset>\` settings:")`);
  const missing = PRESETS.filter((p) => !Object.hasOwn(presets, p));
  if (missing.length) throw fail('Roster', `no table for the ${missing.join(' and ')} preset; the configurator offers ${PRESETS.join(' and ')}`);
  return { roles, presets };
}

export function parseVariables(readme) {
  const choices = { ...CHOICES, preset: Object.keys(parseRoster(readme).presets) };
  const lines = getSection(readme, 'Variables').lines;
  return parseTable(lines, VARIABLE_HEADER, where('Variables')).map(([nameCell, description, linkCell, prompts, sensitive, fallback]) => {
    const name = oneSpan(nameCell);
    if (!name) throw fail('Variables', `the name cell "${nameCell}" is not one code span`);
    if (!description) throw fail('Variables', `${name} has no description`);
    const link = parseLink(linkCell, `${where('Variables')} > ${name}`).href;
    if (sensitive !== 'yes' && sensitive !== 'no') throw fail('Variables', `${name}: Sensitive must be yes or no, found "${sensitive}"`);
    let value = null;
    if (fallback !== 'none') {
      value = oneSpan(fallback);
      if (!value) throw fail('Variables', `${name}: the default "${fallback}" is neither none nor one code span`);
      if (sensitive === 'yes') throw fail('Variables', `${name} is sensitive and has a default; a sensitive variable never has one`);
      const placeholder = value.match(/^\{(\w+)\}$/)?.[1];
      if (value.includes('{') && !Object.hasOwn(choices, placeholder ?? '')) {
        throw fail('Variables', `${name}: the default "${value}" names no choice; use {${Object.keys(choices).join('}, {')}}`);
      }
    }
    return {
      name,
      description,
      link,
      prompts: prompts.split(',').map((token) => parseToken(name, token.trim(), choices)),
      sensitive: sensitive === 'yes',
      default: value,
    };
  });
}

function linkResolver(readme, repoUrl) {
  const slugs = new Set(parseHeadings(readme).map((h) => h.slug));
  const base = `${repoUrl}/blob/main/eve/README.md`;
  return (href, section, owner) => {
    if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return href;
    const [path, fragment] = href.split('#');
    if (!path) {
      if (!slugs.has(fragment)) throw fail(section, `${owner} links to "${href}", which matches no heading in eve/README.md`);
      return `${base}#${fragment}`;
    }
    const target = posix.join('eve', path);
    if (target.startsWith('..')) throw fail(section, `${owner} links to "${href}", outside the repository`);
    return `${repoUrl}/blob/main/${target}${fragment ? `#${fragment}` : ''}`;
  };
}

const prompted = (variable, state) =>
  variable.prompts.some((token) => {
    if (token === 'always' || token === 'never') return token === 'always';
    const [key, value] = token.split('=');
    return state[key] === value;
  });

function valueIn(variable, state) {
  if (variable.sensitive || variable.default === null) return null;
  const placeholder = variable.default.match(/^\{(\w+)\}$/)?.[1];
  return placeholder ? state[placeholder] : variable.default;
}

function cloneLink(names, { repoUrl, variablesLink }) {
  const defaults = Object.fromEntries(names.filter((n) => n.value !== null).map((n) => [n.name, n.value]));
  const params = [
    ['repository-url', repoUrl],
    ['root-directory', 'eve'],
    ['project-name', PROJECT],
    ['env', names.map((n) => n.name).join(',')],
    ...(Object.keys(defaults).length ? [['envDefaults', JSON.stringify(defaults)]] : []),
    ['envDescription', ENV_DESCRIPTION],
    ['envLink', variablesLink],
  ];
  return `${CLONE}?${params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}`;
}

function tierMinutes(readme) {
  const section = 'Plan tier and session limits';
  const rows = parseTable(getSection(readme, section).lines, ['Host', 'Sandbox', 'Session limit', 'What a full run needs'], where(section));
  const row = rows.find(([host]) => host === 'Vercel Hobby');
  if (!row) throw fail(section, 'the table has no Vercel Hobby row; the Vercel choice reads its session limit there');
  const minutes = row[2].match(/(\d+) minutes/)?.[1];
  if (!minutes) throw fail(section, `the Vercel Hobby session limit "${row[2]}" names no minutes`);
  return Number(minutes);
}

// The README's block without comments, with the model line before the build, since the lead's model is
// read at build (the Roster section); model-choice.ts rewrites that line for the reader's choice.
function serverCommands(readme, line) {
  const section = 'Your own server';
  const commands = firstFence(getSection(readme, section).lines, where(section))
    .split('\n')
    .filter((l) => !/^\s*#/.test(l))
    .map((l) => l.replace(/\s+#.*$/, '').trimEnd());
  const exportAt = commands.indexOf('npm run build');
  if (exportAt === -1) throw fail(section, 'the command block has no "npm run build" line, which the model line goes before');
  commands.splice(exportAt, 0, line);
  return { commands, exportAt };
}

function railwayAddress(readme) {
  const section = 'Railway';
  const paragraph = getSection(readme, section).lines.find((line) => line.startsWith('**With the button.**')) ?? '';
  const urls = [...paragraph.matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)].map((m) => m[1]);
  if (urls.length > 1) throw fail(section, `the "With the button." paragraph links ${urls.length} addresses; the button takes one`);
  if (!urls.length) return null;
  if (!RAILWAY_TEMPLATE.test(urls[0])) throw fail(section, `the button address ${urls[0]} is not a railway.com template address (https://railway.com/deploy/<code>)`);
  return urls[0];
}

/**
 * @param {string} readme  the text of eve/README.md
 * @param {{ repoUrl: string }} options
 * @returns {Hosted}
 */
export function buildHosted(readme, { repoUrl }) {
  const resolve = linkResolver(readme, repoUrl);
  const { roles, presets } = parseRoster(readme);
  const variables = parseVariables(readme).map((v) => ({ ...v, link: resolve(v.link, 'Variables', v.name) }));
  const presetVariable = variables.filter((v) => v.default === '{preset}');
  if (presetVariable.length !== 1) throw fail('Variables', `${presetVariable.length} rows default to {preset}; the preset variable is the one row that does`);
  if (!variables.some((v) => v.name === MODEL_VARIABLE)) throw fail('Variables', `no ${MODEL_VARIABLE} row, the variable a role's model is set with`);
  const roster = { variable: presetVariable[0].name, model: MODEL_VARIABLE, preset: PRESET, roles, presets };
  const links = {
    variables: resolve(`#${githubSlug('Variables')}`, 'Variables', 'the Vercel link'),
    afterDeploy: resolve(`#${githubSlug('After the deploy')}`, 'After the deploy', 'the Slack sentence'),
    preflight: resolve(`#${githubSlug('Pre-flight')}`, 'Pre-flight', 'the Linear and Telegram sentence'),
    railway: resolve(`#${githubSlug('Railway')}`, 'Railway', 'the Railway button'),
  };

  // the channels the table names, in the configurator's order; the web chat runs on Vercel only
  const named = new Set(variables.flatMap((v) => v.prompts).filter((t) => t.startsWith('channel=')).map((t) => t.slice('channel='.length)));
  const channels = Object.entries(CHANNEL_LABEL).filter(([id]) => named.has(id)).map(([id, label]) => ({ id, label }));
  const routes = HOST_SANDBOXES.flatMap(([host, sandboxes]) =>
    sandboxes.flatMap((sandbox) => channels.filter((c) => c.id !== 'web' || host === 'vercel').map((c) => ({ host, sandbox, channel: c.id }))),
  );
  const first = routes[0];
  if (!first || first.host !== DEFAULT_CHOICE.host || first.channel !== DEFAULT_CHOICE.channel) {
    throw fail('Variables', `no row is prompted on channel=${DEFAULT_CHOICE.channel}, the default route's channel`);
  }

  const states = routes.map((route) => {
    const state = { ...route, gateway: GATEWAY[route.host], preset: PRESET };
    const names = variables
      .filter((v) => prompted(v, state))
      .map((v) => ({ name: v.name, description: v.description, link: v.link, sensitive: v.sensitive, value: valueIn(v, state) }));
    return {
      id: route.host === 'server' ? `server-${route.sandbox}-${route.channel}` : `${route.host}-${route.channel}`,
      ...state,
      names,
      link: route.host === 'vercel' ? cloneLink(names, { repoUrl, variablesLink: links.variables }) : null,
    };
  });

  const names = variables
    .map((v) => ({
      name: v.name,
      description: v.description,
      link: v.link,
      sensitive: v.sensitive,
      states: Object.fromEntries(states.filter((s) => s.names.some((n) => n.name === v.name)).map((s) => [s.id, valueIn(v, s)])),
    }))
    .filter((n) => Object.keys(n.states).length);

  const { commands, exportAt } = serverCommands(readme, exportLine(modelVars(roster, PRESET)));
  const address = railwayAddress(readme);
  return {
    states,
    defaultState: states[0].id,
    names,
    hosts: [
      { id: 'vercel', links: Object.fromEntries(states.filter((s) => s.host === 'vercel').map((s) => [s.channel, s.link])) },
      { id: 'railway', address, href: address ?? links.railway },
      { id: 'server', commands, copy: commands.join('\n'), exportAt },
    ],
    channels,
    roster,
    tierMinutes: tierMinutes(readme),
    links,
  };
}

/**
 * @param {Hosted} hosted
 * @param {{ host: string, channel: string, sandbox?: string }} choice
 * @returns {{ state: RouteState | null, reason: string | null }}
 */
export function resolveChoice(hosted, { host, channel, sandbox }) {
  if (channel === 'web' && host !== 'vercel') return { state: null, reason: WEB_CHAT_REASON };
  const chosen = sandbox ?? FIXED_SANDBOX[host];
  const state = hosted.states.find((s) => s.host === host && s.channel === channel && s.sandbox === chosen);
  return { state: state ?? null, reason: null };
}

/** @type {Map<string, Hosted>} */
const cache = new Map();

/**
 * @param {string} [root]
 * @returns {Hosted}
 */
export function getHosted(root = findRepoRoot()) {
  if (cache.has(root)) return cache.get(root);
  const readme = readFileSync(join(root, 'eve', 'README.md'), 'utf8');
  const hosted = buildHosted(readme, { repoUrl: getSiteData(root).repoUrl });
  cache.set(root, hosted);
  return hosted;
}
