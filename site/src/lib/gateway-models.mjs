// gateway-models.mjs: the models the Hosted page's per-role dropdowns offer (rulings 33 and 37). Plain Node,
// tested in site/test/gateway-models.test.mjs.
//
// Each site build reads the AI Gateway's public model list once, with a short timeout, and keeps the models
// that can run a role: type "language", an id that does not end in -batch, and "tools" among the supported
// parameters. When the Gateway cannot be reached, answers with an error, or sends a list with no such model,
// the build uses the saved copy in src/data/gateway-models.json (the same filter, id and name only), and the
// build log says which source it used. Either list must hold every preset model, or the build stops naming
// the missing id: a preset the Gateway no longer serves needs a release, not a quieter page.
//
// Exports
//   GATEWAY_MODELS_URL       the Gateway's public list.
//   roleModels(list)         [{ id, name }] of the models in a Gateway list that can run a role.
//   groupModels(models)      [{ provider, models }]: one group per id prefix in name order, each sorted by
//                            name with the numbers in a name compared as numbers (Opus 4.8 before Opus 5).
//   savedModels()            { fetched, models } of the saved copy.
//   loadGatewayModels({ fetch?, log?, timeoutMs?, require? })  { source: 'gateway' | 'saved', models };
//                            `require` lists ids that must be in the list.
//   getGatewayModels(require?)  loadGatewayModels with the global fetch, once per build.

import { readFileSync } from 'node:fs';

export const GATEWAY_MODELS_URL = 'https://ai-gateway.vercel.sh/v1/models';
const TIMEOUT_MS = 5000;
const SAVED = new URL('../data/gateway-models.json', import.meta.url);

/**
 * @typedef {{ id: string, name: string }} GatewayModel
 */

/**
 * @param {Array<{ id: string, name: string, type?: string, supported_parameters?: string[] }>} list
 * @returns {GatewayModel[]}
 */
export const roleModels = (list) =>
  list
    .filter((m) => m.type === 'language' && !m.id.endsWith('-batch') && (m.supported_parameters ?? []).includes('tools'))
    .map(({ id, name }) => ({ id, name }));

// a name as text and number pieces, so "Opus 10" sorts after "Opus 9"
const pieces = (/** @type {string} */ name) => name.toLowerCase().split(/(\d+)/).map((p, i) => (i % 2 ? Number(p) : p));
/** @param {GatewayModel} a @param {GatewayModel} b */
function byName(a, b) {
  const x = pieces(a.name);
  const y = pieces(b.name);
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  }
  return x.length - y.length || (a.id < b.id ? -1 : 1);
}

/**
 * @param {GatewayModel[]} models
 * @returns {{ provider: string, models: GatewayModel[] }[]}
 */
export function groupModels(models) {
  /** @type {Map<string, GatewayModel[]>} */
  const groups = new Map();
  for (const m of models) {
    const provider = m.id.split('/')[0];
    groups.set(provider, [...(groups.get(provider) ?? []), m]);
  }
  return [...groups.keys()].sort().map((provider) => ({ provider, models: [...(groups.get(provider) ?? [])].sort(byName) }));
}

/** @returns {{ fetched: string, models: GatewayModel[] }} */
export function savedModels() {
  const { fetched, models } = JSON.parse(readFileSync(SAVED, 'utf8'));
  return { fetched, models };
}

/**
 * @param {{ fetch: typeof fetch, timeoutMs: number }} options
 * @returns {Promise<GatewayModel[]>}
 */
async function fresh({ fetch, timeoutMs }) {
  const res = await fetch(GATEWAY_MODELS_URL, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  if (!Array.isArray(body?.data)) throw new Error('the answer holds no data list');
  const models = roleModels(body.data);
  if (!models.length) throw new Error('the list holds no model that can run a role');
  return models;
}

/**
 * @param {{ fetch?: typeof fetch, log?: (line: string) => void, timeoutMs?: number, require?: string[] }} [options]
 * @returns {Promise<{ source: 'gateway' | 'saved', models: GatewayModel[] }>}
 */
export async function loadGatewayModels({ fetch = globalThis.fetch, log = console.log, timeoutMs = TIMEOUT_MS, require = [] } = {}) {
  /** @type {{ source: 'gateway' | 'saved', models: GatewayModel[] }} */
  let out;
  try {
    out = { source: 'gateway', models: await fresh({ fetch, timeoutMs }) };
    log(`Hosted page: ${out.models.length} models from the AI Gateway (${GATEWAY_MODELS_URL})`);
  } catch (error) {
    const saved = savedModels();
    out = { source: 'saved', models: saved.models };
    const reason = error instanceof Error ? error.message : String(error);
    log(`Hosted page: ${out.models.length} models from the saved copy src/data/gateway-models.json (fetched ${saved.fetched}); the AI Gateway gave no list: ${reason}`);
  }
  const ids = new Set(out.models.map((m) => m.id));
  const missing = require.filter((id) => !ids.has(id));
  if (missing.length) {
    throw new Error(`The ${out.source === 'gateway' ? 'AI Gateway list' : 'saved Gateway list'} does not hold the preset model ${missing.join(', ')}; eve/README.md > Roster names a model the Gateway does not list.`);
  }
  return out;
}

/** @type {Promise<{ source: 'gateway' | 'saved', models: GatewayModel[] }> | null} */
let once = null;

/**
 * @param {string[]} [require]
 */
export function getGatewayModels(require = []) {
  once ??= loadGatewayModels({ require });
  return once;
}
