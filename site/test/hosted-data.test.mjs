// Tests for site/src/components/hosted/hosted-data.mjs against the real eve/README.md and copies of
// its text edited inside each test. Expected rows and lines are read from the README without the
// parser where the test can.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CHANNEL_LABEL,
  DEFAULT_CHOICE,
  VARIABLE_HEADER,
  WEB_CHAT_REASON,
  buildHosted,
  getHosted,
  parseRoster,
  parseVariables,
  resolveChoice,
} from '../src/components/hosted/hosted-data.mjs';
import { exportLine, modelVars, withModels } from '../src/components/hosted/model-vars.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const README = readFileSync(join(ROOT, 'eve', 'README.md'), 'utf8');
const REPO = JSON.parse(readFileSync(join(ROOT, '.claude-plugin', 'plugin.json'), 'utf8')).repository;
const build = (readme = README) => buildHosted(readme, { repoUrl: REPO });
const HOSTED = build();
const byId = (id) => HOSTED.states.find((s) => s.id === id);
const namesOf = (id) => byId(id).names.map((n) => n.name);
const pairs = (id) => byId(id).names.map((n) => (n.value === null ? n.name : `${n.name}=${n.value}`));

// The rows of the "## Variables" table, read without the parser.
function rawRows() {
  const lines = README.split('\n');
  const start = lines.indexOf('## Variables');
  assert.ok(start >= 0, 'eve/README.md has no "## Variables" heading');
  const table = [];
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith('|')) table.push(line);
    else if (table.length) break;
  }
  return table;
}

// Replaces one exact piece of the README text, failing when the piece is gone.
function edit(from, to) {
  assert.ok(README.includes(from), `eve/README.md no longer contains: ${from}`);
  return README.replace(from, to);
}

const ROW = (name) => rawRows().find((line) => line.startsWith(`| \`${name}\` |`));

test('parseVariables reads every row of the real table, with the six column names as its header', () => {
  const [header, , ...rows] = rawRows();
  assert.deepEqual(VARIABLE_HEADER, ['Name', 'Description', 'Link', 'Prompted when', 'Sensitive', 'Default']);
  assert.equal(header, `| ${VARIABLE_HEADER.join(' | ')} |`);
  const variables = parseVariables(README);
  assert.equal(variables.length, rows.length);
  assert.deepEqual(
    variables.map((v) => v.name),
    rows.map((row) => row.match(/^\| `([^`]+)` \|/)[1]),
  );
  const roster = variables.find((v) => v.name === 'AB_ROSTER');
  assert.deepEqual(roster.prompts, ['always']);
  assert.equal(roster.sensitive, false);
  assert.equal(roster.default, '{preset}');
  const sandbox = variables.find((v) => v.name === 'AB_SANDBOX');
  assert.deepEqual(sandbox.prompts, ['sandbox=daytona']);
  assert.equal(sandbox.default, '{sandbox}');
});

test('a changed header, a broken cell count, a bad Sensitive cell or two links in one cell throw naming "Variables"', () => {
  const header = `| ${VARIABLE_HEADER.join(' | ')} |`;
  const broken = [
    edit(header, header.replace('Prompted when', 'Asked when')),
    edit(ROW('AB_ROSTER'), ROW('AB_ROSTER').replace(' | no |', ' |')),
    edit(ROW('AB_TRUST_PROXY'), ROW('AB_TRUST_PROXY').replace(' | no |', ' | maybe |')),
    edit(ROW('AB_ROSTER'), ROW('AB_ROSTER').replace('[roster](#roster)', '[roster](#roster) [sandbox](#sandbox)')),
  ];
  for (const text of broken) assert.throws(() => parseVariables(text), /Variables/);
});

test('a default on a sensitive row, an empty description or link, or an unknown token key throws', () => {
  const key = ROW('AB_GITHUB_APP_ID');
  assert.throws(() => parseVariables(edit(key, key.replace(/\| none \|$/, '| `123` |'))), /AB_GITHUB_APP_ID.*sensitive/);
  const roster = ROW('AB_ROSTER');
  const description = roster.split(' | ')[1];
  assert.throws(() => parseVariables(edit(roster, roster.replace(description, ''))), /AB_ROSTER.*description/);
  assert.throws(() => parseVariables(edit(roster, roster.replace('[roster](#roster)', '[roster]()'))), /Variables/);
  assert.throws(() => parseVariables(edit(roster, roster.replace('`always`', '`region=eu`'))), /AB_ROSTER.*region/);
});

test('the route states come in a fixed order, default first', () => {
  assert.deepEqual(
    HOSTED.states.map(({ host, sandbox, channel }) => `${host}/${sandbox}/${channel}`),
    [
      'vercel/vercel/web', 'vercel/vercel/slack', 'vercel/vercel/linear', 'vercel/vercel/telegram', 'vercel/vercel/mcp',
      'railway/daytona/slack', 'railway/daytona/linear', 'railway/daytona/telegram', 'railway/daytona/mcp',
      'server/docker/slack', 'server/docker/linear', 'server/docker/telegram', 'server/docker/mcp',
      'server/daytona/slack', 'server/daytona/linear', 'server/daytona/telegram', 'server/daytona/mcp',
    ],
  );
  const first = HOSTED.states[0];
  assert.deepEqual(
    { host: first.host, sandbox: first.sandbox, channel: first.channel, preset: first.preset },
    DEFAULT_CHOICE,
  );
  assert.equal(HOSTED.defaultState, first.id);
  assert.deepEqual(HOSTED.states.map((s) => s.gateway), [...Array(5).fill('oidc'), ...Array(12).fill('key')]);
});

test('non-sensitive names carry the value they take in each state; sensitive names never carry one', () => {
  assert.deepEqual(pairs('vercel-web'), ['AB_ROSTER=quality', 'AB_GITHUB_APP_ID', 'AB_GITHUB_APP_PRIVATE_KEY', 'EVE_CHAT_PASSWORD']);
  assert.ok(pairs('server-daytona-slack').includes('AB_SANDBOX=daytona'));
  assert.ok(pairs('railway-slack').includes('AB_SANDBOX=daytona'));
  for (const id of ['vercel-web', 'vercel-slack', 'server-docker-slack']) {
    assert.ok(!namesOf(id).includes('AB_SANDBOX'), `${id} lists AB_SANDBOX`);
  }
  for (const state of HOSTED.states) {
    for (const name of state.names) if (name.sensitive) assert.equal(name.value, null, `${state.id} ${name.name}`);
  }
});

test('each state lists the names its choices prompt for, in README order', () => {
  assert.deepEqual(namesOf('vercel-web'), ['AB_ROSTER', 'AB_GITHUB_APP_ID', 'AB_GITHUB_APP_PRIVATE_KEY', 'EVE_CHAT_PASSWORD']);
  assert.deepEqual(namesOf('vercel-slack'), [
    'AB_ROSTER', 'AB_GITHUB_APP_ID', 'AB_GITHUB_APP_PRIVATE_KEY', 'SLACK_BOT_TOKEN', 'SLACK_SIGNING_SECRET',
  ]);
  assert.deepEqual(namesOf('railway-slack'), [
    'AB_ROSTER', 'AI_GATEWAY_API_KEY', 'AB_GITHUB_APP_ID', 'AB_GITHUB_APP_PRIVATE_KEY',
    'SLACK_BOT_TOKEN', 'SLACK_SIGNING_SECRET', 'AB_SANDBOX', 'DAYTONA_API_KEY',
  ]);
  assert.deepEqual(namesOf('server-docker-slack'), [
    'AB_ROSTER', 'AI_GATEWAY_API_KEY', 'AB_GITHUB_APP_ID', 'AB_GITHUB_APP_PRIVATE_KEY', 'SLACK_BOT_TOKEN', 'SLACK_SIGNING_SECRET',
  ]);
  assert.deepEqual(namesOf('server-daytona-slack'), [...namesOf('server-docker-slack'), 'AB_SANDBOX', 'DAYTONA_API_KEY']);
  // every prompted name has a description and an absolute link
  for (const state of HOSTED.states) {
    for (const name of state.names) {
      assert.ok(name.description.length > 0, `${name.name} description`);
      assert.match(name.link, /^https:\/\//, `${name.name} link`);
    }
  }
});

test('the one names list carries each prompted name once, with the states it belongs to and its value there', () => {
  const sandbox = HOSTED.names.find((n) => n.name === 'AB_SANDBOX');
  assert.deepEqual(sandbox.states, {
    'railway-slack': 'daytona', 'railway-linear': 'daytona', 'railway-telegram': 'daytona', 'railway-mcp': 'daytona',
    'server-daytona-slack': 'daytona', 'server-daytona-linear': 'daytona', 'server-daytona-telegram': 'daytona', 'server-daytona-mcp': 'daytona',
  });
  const password = HOSTED.names.find((n) => n.name === 'EVE_CHAT_PASSWORD');
  assert.deepEqual(password.states, { 'vercel-web': null });
  const roster = HOSTED.names.find((n) => n.name === 'AB_ROSTER');
  assert.deepEqual(Object.keys(roster.states), HOSTED.states.map((s) => s.id));
  assert.ok(Object.values(roster.states).every((v) => v === 'quality'));
  assert.equal(new Set(HOSTED.names.map((n) => n.name)).size, HOSTED.names.length);
  assert.ok(!HOSTED.names.some((n) => n.name === 'AB_DEMO'), 'a never-prompted name is listed');
});

test('disallowed pairings yield no state; web chat off Vercel carries the reason', () => {
  for (const host of ['railway', 'server']) {
    const out = resolveChoice(HOSTED, { host, channel: 'web', sandbox: host === 'server' ? 'docker' : undefined });
    assert.equal(out.state, null);
    assert.equal(out.reason, WEB_CHAT_REASON);
  }
  assert.equal(WEB_CHAT_REASON, 'The web chat runs on Vercel only');
  for (const choice of [
    { host: 'vercel', channel: 'web', sandbox: 'docker' },
    { host: 'vercel', channel: 'slack', sandbox: 'daytona' },
    { host: 'railway', channel: 'slack', sandbox: 'docker' },
  ]) {
    assert.deepEqual(resolveChoice(HOSTED, choice), { state: null, reason: null }, JSON.stringify(choice));
  }
  assert.equal(resolveChoice(HOSTED, DEFAULT_CHOICE).state.id, HOSTED.defaultState);
  assert.equal(resolveChoice(HOSTED, { host: 'railway', channel: 'slack' }).state.id, 'railway-slack');
  assert.equal(resolveChoice(HOSTED, { host: 'server', channel: 'slack', sandbox: 'daytona' }).state.id, 'server-daytona-slack');
});

// Covers AE1.
test('the web chat link asks for the default names, prefills only AB_ROSTER and carries no demo parameter', () => {
  const url = new URL(byId('vercel-web').link);
  assert.equal(`${url.origin}${url.pathname}`, 'https://vercel.com/new/clone');
  const p = url.searchParams;
  assert.equal(p.get('repository-url'), REPO);
  assert.equal(p.get('root-directory'), 'eve');
  assert.equal(p.get('project-name'), 'agent-blueprint');
  assert.deepEqual(p.get('env').split(','), ['AB_ROSTER', 'AB_GITHUB_APP_ID', 'AB_GITHUB_APP_PRIVATE_KEY', 'EVE_CHAT_PASSWORD']);
  assert.deepEqual(JSON.parse(p.get('envDefaults')), { AB_ROSTER: 'quality' });
  assert.ok(p.get('envDescription').trim().length > 0);
  assert.match(p.get('envLink'), /^https:\/\/.+#variables$/);
  assert.ok(![...p.keys()].some((k) => k.startsWith('demo-')));
  assert.equal(HOSTED.hosts.find((h) => h.id === 'vercel').links.web, byId('vercel-web').link);
  assert.equal(HOSTED.hosts.find((h) => h.id === 'vercel').links.slack, byId('vercel-slack').link);
});

test('neither Vercel link gives a sensitive name a default, and both stay under 2 KB', () => {
  const sensitive = new Set(parseVariables(README).filter((v) => v.sensitive).map((v) => v.name));
  for (const id of ['vercel-web', 'vercel-slack']) {
    const link = byId(id).link;
    const defaults = JSON.parse(new URL(link).searchParams.get('envDefaults'));
    assert.deepEqual(Object.keys(defaults).filter((k) => sensitive.has(k)), [], id);
    assert.ok(link.length < 2048, `${id} link is ${link.length} characters`);
  }
  assert.deepEqual(new URL(byId('vercel-slack').link).searchParams.get('env').split(','), namesOf('vercel-slack'));
  for (const id of ['railway-slack', 'server-docker-slack', 'server-daytona-slack']) assert.equal(byId(id).link, null);
});

test('the Telegram rows bring a Telegram state on every host, asking for the bot token, the secret and the user list', () => {
  const telegram = ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_WEBHOOK_SECRET_TOKEN', 'AB_TELEGRAM_USERS'];
  assert.deepEqual(namesOf('vercel-telegram'), ['AB_ROSTER', 'AB_GITHUB_APP_ID', 'AB_GITHUB_APP_PRIVATE_KEY', ...telegram]);
  assert.deepEqual(namesOf('railway-telegram'), [
    'AB_ROSTER', 'AI_GATEWAY_API_KEY', 'AB_GITHUB_APP_ID', 'AB_GITHUB_APP_PRIVATE_KEY', ...telegram, 'AB_SANDBOX', 'DAYTONA_API_KEY',
  ]);
  assert.deepEqual(namesOf('server-docker-telegram'), ['AB_ROSTER', 'AI_GATEWAY_API_KEY', 'AB_GITHUB_APP_ID', 'AB_GITHUB_APP_PRIVATE_KEY', ...telegram]);
  assert.deepEqual(namesOf('server-daytona-telegram'), [...namesOf('server-docker-telegram'), 'AB_SANDBOX', 'DAYTONA_API_KEY']);
  // the user list is not sensitive and has no default, so the link asks for it and fills nothing in
  const users = byId('vercel-telegram').names.find((n) => n.name === 'AB_TELEGRAM_USERS');
  assert.deepEqual({ sensitive: users.sensitive, value: users.value }, { sensitive: false, value: null });
  for (const name of byId('vercel-telegram').names.filter((n) => n.name.startsWith('TELEGRAM_'))) assert.equal(name.sensitive, true, name.name);
  const p = new URL(byId('vercel-telegram').link).searchParams;
  assert.deepEqual(p.get('env').split(','), namesOf('vercel-telegram'));
  assert.deepEqual(JSON.parse(p.get('envDefaults')), { AB_ROSTER: 'quality' });
  assert.ok(byId('vercel-telegram').link.length < 2048);
  assert.equal(HOSTED.hosts.find((h) => h.id === 'vercel').links.telegram, byId('vercel-telegram').link);
  for (const name of byId('vercel-telegram').names) assert.match(name.link, /#after-the-deploy$|#roster$|#pre-flight$/, name.name);
});

test('the Linear rows bring a Linear state on every host, asking for the client ID, the client secret and the webhook secret', () => {
  const linear = ['LINEAR_CLIENT_ID', 'LINEAR_CLIENT_SECRET', 'LINEAR_WEBHOOK_SECRET'];
  assert.deepEqual(namesOf('vercel-linear'), ['AB_ROSTER', 'AB_GITHUB_APP_ID', 'AB_GITHUB_APP_PRIVATE_KEY', ...linear]);
  assert.deepEqual(namesOf('railway-linear'), [
    'AB_ROSTER', 'AI_GATEWAY_API_KEY', 'AB_GITHUB_APP_ID', 'AB_GITHUB_APP_PRIVATE_KEY', ...linear, 'AB_SANDBOX', 'DAYTONA_API_KEY',
  ]);
  assert.deepEqual(namesOf('server-docker-linear'), ['AB_ROSTER', 'AI_GATEWAY_API_KEY', 'AB_GITHUB_APP_ID', 'AB_GITHUB_APP_PRIVATE_KEY', ...linear]);
  assert.deepEqual(namesOf('server-daytona-linear'), [...namesOf('server-docker-linear'), 'AB_SANDBOX', 'DAYTONA_API_KEY']);
  // the client ID is not sensitive and has no default, so the link asks for it and fills nothing in
  const id = byId('vercel-linear').names.find((n) => n.name === 'LINEAR_CLIENT_ID');
  assert.deepEqual({ sensitive: id.sensitive, value: id.value }, { sensitive: false, value: null });
  for (const name of ['LINEAR_CLIENT_SECRET', 'LINEAR_WEBHOOK_SECRET']) assert.equal(byId('vercel-linear').names.find((n) => n.name === name).sensitive, true, name);
  const p = new URL(byId('vercel-linear').link).searchParams;
  assert.deepEqual(p.get('env').split(','), namesOf('vercel-linear'));
  assert.deepEqual(JSON.parse(p.get('envDefaults')), { AB_ROSTER: 'quality' });
  assert.ok(byId('vercel-linear').link.length < 2048);
  assert.equal(HOSTED.hosts.find((h) => h.id === 'vercel').links.linear, byId('vercel-linear').link);
  for (const other of ['railway-linear', 'server-docker-linear', 'server-daytona-linear']) assert.equal(byId(other).link, null);
  for (const name of byId('vercel-linear').names) assert.match(name.link, /#after-the-deploy$|#roster$|#pre-flight$/, name.name);
});

test('the own-server commands are the README block without its comments, with the model line before the build', () => {
  const lines = README.split('\n');
  const start = lines.indexOf('### Your own server');
  const open = lines.findIndex((l, i) => i > start && l.startsWith('```'));
  const close = lines.findIndex((l, i) => i > open && l.startsWith('```'));
  const block = lines.slice(open + 1, close).map((l) => l.replace(/\s+#.*$/, ''));
  const at = block.indexOf('npm run build');
  assert.ok(at > 0, 'the README block has no npm run build line');
  const expected = [...block.slice(0, at), 'export AB_ROSTER=quality', ...block.slice(at)];
  const server = HOSTED.hosts.find((h) => h.id === 'server');
  assert.deepEqual(server.commands, expected);
  assert.equal(server.exportAt, at, 'the index of the model line');
  assert.throws(() => build(edit('npm run build                            #', 'npm run compile                          #')), /Your own server.*npm run build/);
  assert.ok(server.commands.every((l) => !l.includes('#') && l === l.trimEnd()));
  assert.equal(server.copy, expected.join('\n'));
  assert.ok(!server.copy.endsWith('\n'));
});

test('the tier minutes are the number in the Vercel Hobby row; without that row the build throws', () => {
  const row = README.split('\n').find((l) => l.startsWith('| Vercel Hobby |'));
  assert.ok(row, 'eve/README.md has no Vercel Hobby row');
  assert.equal(HOSTED.tierMinutes, Number(row.split('|')[3].match(/(\d+) minutes/)[1]));
  assert.throws(() => build(edit(`${row}\n`, '')), /Plan tier and session limits.*Vercel Hobby/);
});

test('a relative link to a missing anchor throws', () => {
  const roster = ROW('AB_ROSTER');
  assert.throws(() => build(edit(roster, roster.replace('(#roster)', '(#no-such-heading)'))), /no-such-heading/);
});

test('the Railway address: absent is reported as absent; a non-template address throws', () => {
  const published = 'https://railway.com/deploy/agent-blueprint-railway';
  const live = HOSTED.hosts.find((h) => h.id === 'railway');
  assert.equal(live.address, published);
  assert.equal(live.href, published);
  const marker = `**With the button.** The [Railway template](${published}) deploys`;
  const absent = build(edit(marker, '**With the button.** The Railway template deploys')).hosts.find((h) => h.id === 'railway');
  assert.equal(absent.address, null);
  assert.equal(absent.href, `${REPO}/blob/main/eve/README.md#railway`);
  const withAddress = (url) => build(edit(marker, `**With the button.** The [Railway template](${url}) deploys`));
  assert.throws(() => withAddress('https://example.com/deploy/agent-blueprint'), /Railway.*railway\.com/);
});

test('the README links the Slack sentence and the Variables link resolve to GitHub main', () => {
  assert.equal(HOSTED.links.afterDeploy, `${REPO}/blob/main/eve/README.md#after-the-deploy`);
  assert.equal(HOSTED.links.preflight, `${REPO}/blob/main/eve/README.md#pre-flight`);
  assert.equal(HOSTED.links.variables, `${REPO}/blob/main/eve/README.md#variables`);
});

test('getHosted reads the real eve/README.md and matches the pure build', () => {
  assert.deepEqual(getHosted(), HOSTED);
});

// ---- the roster presets, the channels and the model variables (rulings 29 to 37) ----

// The two preset tables of the "## Roster" section, read without the parser: { preset: { role: model } }.
function rawPresets() {
  const lines = README.split('\n');
  const start = lines.indexOf('## Roster');
  const end = lines.findIndex((l, i) => i > start && l.startsWith('## '));
  const out = {};
  let preset = null;
  for (const line of lines.slice(start + 1, end)) {
    const intro = line.match(/their `(\w+)` settings:$/);
    if (intro) preset = intro[1];
    const row = line.match(/^\| ([a-z, ]+) \| `([^`]+)` \| \w+ \|$/);
    if (row && preset) for (const role of row[1].split(', ')) (out[preset] ??= {})[role] = row[2];
  }
  return out;
}
const ROLES = ['lead', 'planner', 'builder', 'reviewer', 'tester', 'analyst', 'documenter'];

test('parseRoster reads both preset tables of the Roster section, each role in the README order', () => {
  const roster = parseRoster(README);
  assert.deepEqual(roster.roles, ROLES);
  assert.deepEqual(Object.keys(roster.presets), ['quality', 'budget']);
  assert.deepEqual(roster.presets, rawPresets());
  for (const preset of Object.values(roster.presets)) assert.deepEqual(Object.keys(preset), ROLES);
  assert.equal(roster.presets.budget.reviewer, 'deepseek/deepseek-v4.1-flash-1017');
  assert.equal(roster.presets.quality.reviewer, 'openai/gpt-6-astra');
});

test('a missing or malformed preset table stops the build naming "Roster"', () => {
  const budgetIntro = 'The roles and their `budget` settings:';
  const budgetTable = [
    budgetIntro,
    '',
    '| Role | Model | Reasoning |',
    '|---|---|---|',
    '| lead, planner, builder | `zai/glm-5.3` | high |',
    '| reviewer | `deepseek/deepseek-v4.1-flash-1017` | xhigh |',
    '| tester, analyst, documenter | `deepseek/deepseek-v4.1-flash-1017` | high |',
  ].join('\n');
  const budgetRow = '| reviewer | `deepseek/deepseek-v4.1-flash-1017` | xhigh |';
  const qualityRow = '| documenter | `anthropic/claude-haiku-5.5` | medium |';
  const broken = {
    'no budget table': edit(budgetTable, ''),
    'a table with no intro before it': edit(budgetIntro, 'The cheaper settings:'),
    'a model that is not one code span': edit(budgetRow, '| reviewer | deepseek | xhigh |'),
    'a role missing from one preset': edit(`${qualityRow}\n`, ''),
    'a role listed twice': edit(budgetRow, '| reviewer, tester | `deepseek/deepseek-v4.1-flash-1017` | xhigh |'),
    'an intro with no table under it': edit(budgetIntro, `${budgetIntro}\n\nSome words first.`),
    'a changed header': edit('The roles and their `quality` settings:\n\n| Role | Model | Reasoning |', 'The roles and their `quality` settings:\n\n| Role | Model id | Reasoning |'),
  };
  for (const [what, text] of Object.entries(broken)) {
    assert.notEqual(text, README, what);
    assert.throws(() => parseRoster(text), /Roster/, what);
    assert.throws(() => build(text), /Roster/, what);
  }
  // the default preset must be one of the tables
  assert.throws(() => build(edit('their `quality` settings:', 'their `fast` settings:')), /Roster.*quality/);
});

test('the Hosted data carries the roster: the preset and model variables, the roles and both presets', () => {
  assert.deepEqual(HOSTED.roster, {
    variable: 'AB_ROSTER',
    model: 'AB_MODEL_<ROLE>',
    preset: 'quality',
    roles: ROLES,
    presets: rawPresets(),
  });
  const model = ROW('AB_MODEL_<ROLE>');
  assert.throws(() => build(edit(`${model}\n`, '')), /Variables.*AB_MODEL_<ROLE>/);
  // a preset token is checked against the Roster tables
  const sandbox = ROW('AB_SANDBOX');
  assert.doesNotThrow(() => parseVariables(edit(sandbox, sandbox.replace('`sandbox=daytona`', '`preset=budget`'))));
  assert.throws(() => parseVariables(edit(sandbox, sandbox.replace('`sandbox=daytona`', '`preset=fast`'))), /AB_SANDBOX.*preset=fast/);
});

test('the channels come from the Variables table: today the web chat, Slack, Linear, Telegram and MCP', () => {
  assert.deepEqual(HOSTED.channels, [
    { id: 'web', label: 'Web chat' }, { id: 'slack', label: 'Slack' }, { id: 'linear', label: 'Linear' }, { id: 'telegram', label: 'Telegram' }, { id: 'mcp', label: 'MCP' },
  ]);
  assert.deepEqual(Object.keys(CHANNEL_LABEL), ['web', 'slack', 'linear', 'telegram', 'mcp']);
  assert.deepEqual(Object.values(CHANNEL_LABEL), ['Web chat', 'Slack', 'Linear', 'Telegram', 'MCP']);
});

test('a channel\'s rows taken out of the README take its channel off every host, the web chat staying on Vercel', () => {
  const rows = ['LINEAR_CLIENT_ID', 'LINEAR_CLIENT_SECRET', 'LINEAR_WEBHOOK_SECRET'].map(ROW);
  const slack = ROW('SLACK_SIGNING_SECRET');
  const hosted = build(edit([slack, ...rows].join('\n'), slack));
  assert.deepEqual(hosted.channels.map((c) => c.id), ['web', 'slack', 'telegram', 'mcp']);
  assert.deepEqual(hosted.states.map((s) => s.id), [
    'vercel-web', 'vercel-slack', 'vercel-telegram', 'vercel-mcp', 'railway-slack', 'railway-telegram', 'railway-mcp',
    'server-docker-slack', 'server-docker-telegram', 'server-docker-mcp', 'server-daytona-slack', 'server-daytona-telegram', 'server-daytona-mcp',
  ]);
  assert.ok(!hosted.names.some((n) => n.name.startsWith('LINEAR_')));
  assert.equal(resolveChoice(hosted, { host: 'railway', channel: 'web' }).reason, WEB_CHAT_REASON);
  // a channel token the page has no name for stops the build
  const discord = slack.replace('`SLACK_SIGNING_SECRET`', '`DISCORD_TOKEN`').replace('`channel=slack`', '`channel=discord`');
  assert.throws(() => build(edit(slack, `${slack}\n${discord}`)), /Variables.*channel=discord/);
});

test('modelVars: the preset, then a role variable for each pick that differs from it, in the README role order', () => {
  const roster = HOSTED.roster;
  assert.deepEqual(modelVars(roster, 'quality'), [['AB_ROSTER', 'quality']]);
  assert.deepEqual(modelVars(roster, 'budget', { ...roster.presets.budget }), [['AB_ROSTER', 'budget']], 'picks equal to the preset add nothing');
  assert.deepEqual(
    modelVars(roster, 'budget', { documenter: 'moonshotai/kimi-k2', reviewer: 'openai/gpt-6-astra', lead: 'zai/glm-5.3' }),
    [['AB_ROSTER', 'budget'], ['AB_MODEL_REVIEWER', 'openai/gpt-6-astra'], ['AB_MODEL_DOCUMENTER', 'moonshotai/kimi-k2']],
  );
  assert.equal(exportLine(modelVars(roster, 'quality')), 'export AB_ROSTER=quality');
  assert.equal(exportLine(modelVars(roster, 'budget', { reviewer: 'openai/gpt-6-astra' })), 'export AB_ROSTER=budget AB_MODEL_REVIEWER=openai/gpt-6-astra');
});

// The three example links of the approved mock's notes ("The three links, decoded").
test('withModels: the quality link is the static one, and the budget links decode as the mock notes record', () => {
  const roster = HOSTED.roster;
  const base = byId('vercel-web').link;
  assert.equal(withModels(base, modelVars(roster, 'quality')), base, 'the default link is unchanged');
  const decoded = (link) => {
    const p = new URL(link).searchParams;
    return { env: p.get('env').split(','), envDefaults: JSON.parse(p.get('envDefaults')), keys: [...p.keys()] };
  };
  const keys = ['repository-url', 'root-directory', 'project-name', 'env', 'envDefaults', 'envDescription', 'envLink'];
  const web = ['AB_GITHUB_APP_ID', 'AB_GITHUB_APP_PRIVATE_KEY', 'EVE_CHAT_PASSWORD'];
  assert.deepEqual(decoded(base), { env: ['AB_ROSTER', ...web], envDefaults: { AB_ROSTER: 'quality' }, keys });
  assert.deepEqual(decoded(withModels(base, modelVars(roster, 'budget'))), { env: ['AB_ROSTER', ...web], envDefaults: { AB_ROSTER: 'budget' }, keys });
  const astra = withModels(base, modelVars(roster, 'budget', { reviewer: 'openai/gpt-6-astra' }));
  assert.deepEqual(decoded(astra), {
    env: ['AB_ROSTER', 'AB_MODEL_REVIEWER', ...web],
    envDefaults: { AB_ROSTER: 'budget', AB_MODEL_REVIEWER: 'openai/gpt-6-astra' },
    keys,
  });
  const p = new URL(astra).searchParams;
  assert.equal(p.get('repository-url'), REPO);
  assert.equal(p.get('root-directory'), 'eve');
  assert.equal(p.get('project-name'), 'agent-blueprint');
  assert.equal(p.get('envLink'), `${REPO}/blob/main/eve/README.md#variables`);
  assert.equal(p.get('envDescription'), 'The Variables table in eve/README.md says what each value is, and its Roster section shows how to pick a different model for any role.');
  // with Slack the sensitive names swap and the model defaults stay
  const slack = decoded(withModels(byId('vercel-slack').link, modelVars(roster, 'budget', { reviewer: 'openai/gpt-6-astra' })));
  assert.deepEqual(slack.env, ['AB_ROSTER', 'AB_MODEL_REVIEWER', 'AB_GITHUB_APP_ID', 'AB_GITHUB_APP_PRIVATE_KEY', 'SLACK_BOT_TOKEN', 'SLACK_SIGNING_SECRET']);
  assert.deepEqual(slack.envDefaults, { AB_ROSTER: 'budget', AB_MODEL_REVIEWER: 'openai/gpt-6-astra' });
  // every role changed: no sensitive default, still under 2 KB
  const all = withModels(base, modelVars(roster, 'budget', Object.fromEntries(ROLES.map((r) => [r, 'nvidia/nemotron-3-super-120b-a12b']))));
  const sensitive = new Set(parseVariables(README).filter((v) => v.sensitive).map((v) => v.name));
  assert.equal(decoded(all).env.length, web.length + 1 + ROLES.length);
  assert.deepEqual(Object.keys(decoded(all).envDefaults).filter((k) => sensitive.has(k)), []);
  assert.ok(all.length < 2048, `${all.length} characters`);
});

// ---- the MCP channel's rows (U5, KTD10) ----

test('the MCP rows: AB_MCP_TOKEN asked for on every MCP route, the three OAuth rows never prompted', () => {
  const [token, issuer, subjects, resource] = ['AB_MCP_TOKEN', 'AB_MCP_OAUTH_ISSUER', 'AB_MCP_OAUTH_SUBJECTS', 'AB_MCP_OAUTH_RESOURCE'].map((name) =>
    parseVariables(README).find((v) => v.name === name),
  );
  assert.deepEqual([token.prompts, token.sensitive, token.default], [['channel=mcp'], true, null]);
  for (const row of [issuer, subjects, resource]) assert.deepEqual([row.prompts, row.sensitive, row.default], [['never'], false, null], row.name);
  assert.equal(token.link, '#after-the-deploy');
  for (const row of [issuer, subjects, resource]) assert.equal(row.link, '#web-chat-and-channels', row.name);
  for (const name of ['AB_MCP_OAUTH_ISSUER', 'AB_MCP_OAUTH_SUBJECTS', 'AB_MCP_OAUTH_RESOURCE']) {
    assert.ok(!HOSTED.names.some((n) => n.name === name), `${name} is listed`);
  }
});

test('each MCP route lists its host\'s names with AB_MCP_TOKEN in place of the Slack pair; the Vercel link stays under 2 KB', () => {
  // README order: AB_MCP_TOKEN's row comes after the sandbox rows
  const swap = (id) => [...namesOf(id.replace('-mcp', '-slack')).filter((n) => !n.startsWith('SLACK_')), 'AB_MCP_TOKEN'];
  for (const id of ['vercel-mcp', 'railway-mcp', 'server-docker-mcp', 'server-daytona-mcp']) assert.deepEqual(namesOf(id), swap(id), id);
  assert.deepEqual(namesOf('vercel-mcp'), ['AB_ROSTER', 'AB_GITHUB_APP_ID', 'AB_GITHUB_APP_PRIVATE_KEY', 'AB_MCP_TOKEN']);
  const link = byId('vercel-mcp').link;
  assert.deepEqual(new URL(link).searchParams.get('env').split(','), namesOf('vercel-mcp'));
  assert.deepEqual(JSON.parse(new URL(link).searchParams.get('envDefaults')), { AB_ROSTER: 'quality' });
  assert.ok(link.length < 2048, `${link.length} characters`);
  assert.equal(HOSTED.hosts.find((h) => h.id === 'vercel').links.mcp, link);
  for (const id of ['railway-mcp', 'server-docker-mcp', 'server-daytona-mcp']) assert.equal(byId(id).link, null);
  assert.equal(resolveChoice(HOSTED, { host: 'railway', channel: 'mcp' }).state.id, 'railway-mcp');
  assert.equal(resolveChoice(HOSTED, { host: 'server', channel: 'mcp', sandbox: 'docker' }).state.id, 'server-docker-mcp');
});
