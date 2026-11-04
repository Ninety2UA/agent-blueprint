// Tests for site/src/lib/gateway-models.mjs, the model list the Hosted page's per-role dropdowns offer
// (ruling 37: read fresh from the AI Gateway at each build, the saved copy when it cannot be reached).
// Every test passes its own fetch; none reaches the network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { GATEWAY_MODELS_URL, groupModels, loadGatewayModels, roleModels, savedModels } from '../src/lib/gateway-models.mjs';
import { getHosted } from '../src/components/hosted/hosted-data.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SAVED = JSON.parse(readFileSync(join(ROOT, 'site', 'src', 'data', 'gateway-models.json'), 'utf8'));
const roster = getHosted(ROOT).roster;
const presetIds = [...new Set(Object.values(roster.presets).flatMap((p) => Object.values(p)))];

const model = (id, extra = {}) => ({ id, name: id.split('/')[1], type: 'language', supported_parameters: ['tools', 'temperature'], ...extra });
// a Gateway list in the shape of https://ai-gateway.vercel.sh/v1/models, every preset model included
const gatewayList = () => ({
  object: 'list',
  data: [
    ...presetIds.map((id) => model(id)),
    model('acme/fast-batch'),
    model('acme/no-tools', { supported_parameters: ['temperature'] }),
    model('acme/no-params', { supported_parameters: undefined }),
    model('acme/picture', { type: 'image' }),
    model('acme/embed', { type: 'embedding' }),
    model('acme/chat-2', { name: 'Acme Chat 2', description: 'a long text the page never shows', pricing: { input: '1' } }),
  ],
});
const response = (body, init = {}) => ({ ok: init.ok ?? true, status: init.status ?? 200, json: async () => body });

function logger() {
  const lines = [];
  return { lines, log: (line) => lines.push(line) };
}

test('roleModels keeps the language models that take tool calls, drops the batch copies, and keeps only id and name', () => {
  const kept = roleModels(gatewayList().data);
  assert.deepEqual(kept.map((m) => m.id).sort(), [...presetIds, 'acme/chat-2'].sort());
  assert.deepEqual(kept.find((m) => m.id === 'acme/chat-2'), { id: 'acme/chat-2', name: 'Acme Chat 2' });
  assert.ok(kept.every((m) => Object.keys(m).join() === 'id,name'));
});

test('the saved copy is the filtered list: id and name only, no duplicate, every preset model in it', () => {
  assert.equal(SAVED.source, GATEWAY_MODELS_URL);
  assert.match(SAVED.fetched, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  assert.ok(SAVED.models.length > 0);
  assert.ok(SAVED.models.every((m) => Object.keys(m).join() === 'id,name' && m.id.includes('/') && m.name.length > 0));
  assert.equal(new Set(SAVED.models.map((m) => m.id)).size, SAVED.models.length);
  assert.ok(SAVED.models.every((m) => !m.id.endsWith('-batch')));
  const ids = new Set(SAVED.models.map((m) => m.id));
  assert.deepEqual(presetIds.filter((id) => !ids.has(id)), [], 'a preset model is missing from the saved list');
  assert.deepEqual(savedModels(), { fetched: SAVED.fetched, models: SAVED.models });
  // the page labels the preset models by the Gateway's own names
  const name = (id) => SAVED.models.find((m) => m.id === id).name;
  assert.equal(name('openai/gpt-6-astra'), 'GPT-6 Astra');
  assert.equal(name('deepseek/deepseek-v4.1-flash-1017'), 'DeepSeek V4.1 Flash 1017');
});

test('groupModels: one group per provider prefix in name order, each sorted by name with numbers in order', () => {
  const groups = groupModels([
    { id: 'zai/glm-5.3', name: 'GLM 5.3' },
    { id: 'anthropic/claude-opus-5', name: 'Claude Opus 5' },
    { id: 'anthropic/claude-opus-4.8', name: 'Claude Opus 4.8' },
    { id: 'anthropic/claude-opus-10', name: 'Claude Opus 10' },
    { id: 'anthropic/claude-haiku-5.5', name: 'claude Haiku 5.5' },
  ]);
  assert.deepEqual(groups.map((g) => g.provider), ['anthropic', 'zai']);
  assert.deepEqual(groups[0].models.map((m) => m.name), ['claude Haiku 5.5', 'Claude Opus 4.8', 'Claude Opus 5', 'Claude Opus 10']);
  const saved = groupModels(SAVED.models);
  assert.equal(saved.reduce((n, g) => n + g.models.length, 0), SAVED.models.length);
  assert.deepEqual(saved.map((g) => g.provider), [...new Set(SAVED.models.map((m) => m.id.split('/')[0]))].sort());
});

test('a reachable Gateway gives the fresh list, and the build log says so', async () => {
  const calls = [];
  const { lines, log } = logger();
  const fetch = async (url, init) => (calls.push([url, init]), response(gatewayList()));
  const out = await loadGatewayModels({ fetch, log });
  assert.equal(out.source, 'gateway');
  assert.deepEqual(out.models, roleModels(gatewayList().data));
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], GATEWAY_MODELS_URL);
  assert.ok(calls[0][1]?.signal, 'the request carries an abort signal for its timeout');
  assert.equal(lines.length, 1);
  assert.match(lines[0], /AI Gateway/);
  assert.match(lines[0], new RegExp(`${out.models.length} models`));
});

test('an unreachable or broken Gateway gives the saved copy, and the build log says which source and why', async () => {
  const cases = {
    'a network error': async () => {
      throw new Error('getaddrinfo ENOTFOUND');
    },
    'an HTTP error': async () => response({}, { ok: false, status: 503 }),
    'a body that is not JSON': async () => ({ ok: true, status: 200, json: async () => JSON.parse('<html>') }),
    'a body without a data list': async () => response({ object: 'list' }),
    'a list with no model that can run a role': async () => response({ data: [model('acme/picture', { type: 'image' })] }),
  };
  for (const [what, fetch] of Object.entries(cases)) {
    const { lines, log } = logger();
    const out = await loadGatewayModels({ fetch, log });
    assert.equal(out.source, 'saved', what);
    assert.deepEqual(out.models, SAVED.models, what);
    assert.equal(lines.length, 1, what);
    assert.match(lines[0], /saved copy/, what);
    assert.match(lines[0], new RegExp(SAVED.fetched), what);
  }
});

test('a Gateway that does not answer in time gives the saved copy', async () => {
  const { lines, log } = logger();
  const fetch = (_url, { signal }) =>
    new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason ?? new Error('aborted'))));
  const started = Date.now();
  const out = await loadGatewayModels({ fetch, log, timeoutMs: 30 });
  assert.equal(out.source, 'saved');
  assert.ok(Date.now() - started < 2000, 'the timeout ended the wait');
  assert.match(lines[0], /saved copy/);
});

test('a fresh list that lacks a preset model stops the build naming the model', async () => {
  const list = gatewayList();
  list.data = list.data.filter((m) => m.id !== 'openai/gpt-6-astra');
  await assert.rejects(loadGatewayModels({ fetch: async () => response(list), log: () => {}, require: presetIds }), /openai\/gpt-6-astra/);
  // the same rule holds for the saved copy
  await assert.rejects(
    loadGatewayModels({ fetch: async () => response({}, { ok: false, status: 500 }), log: () => {}, require: ['acme/not-listed'] }),
    /acme\/not-listed/,
  );
});
