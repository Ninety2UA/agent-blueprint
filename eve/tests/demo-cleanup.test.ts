// The demo's scheduled cleanup (KTD13, R17) against a stubbed GitHub REST API and the registry's file
// backend: which pull requests close, which branches go, which stay, and the dry run, maintenance
// and non-demo paths. No real App, token or repository is used.
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, test } from "node:test";

// The agent's modules import each other without extensions, as Eve's bundler wants; Node needs them.
registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (error) {
      if (specifier.startsWith(".")) return next(`${specifier}.ts`, context);
      throw error;
    }
  },
});
const { CLEANUP_PERMISSIONS, scheduledCleanup } = await import("../agent/lib/demo-cleanup.ts");
const { Registry, fileBackend } = await import("../agent/lib/registry.ts");
const { utcDay } = await import("../agent/lib/caps.ts");
type SessionEntry = import("../agent/lib/registry.ts").SessionEntry;

const REPO = "Ninety2UA/agent-blueprint-sample";
const API = "https://api.github.test";
const NOW = new Date("2026-10-29T12:00:00.000Z");
const HOUR = 60 * 60 * 1_000;
const DAY = 24 * HOUR;
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

const scratch = mkdtempSync(join(tmpdir(), "ab-cleanup-"));
after(() => rmSync(scratch, { recursive: true, force: true }));
let files = 0;

const pem = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();

function session(id: string, branch: string, fields: Partial<SessionEntry>): SessionEntry {
  return {
    sessionId: id,
    cookieId: `cookie-${id}`,
    address: "198.51.100.1",
    repository: REPO,
    branch,
    stage: "plan",
    pushedSha: null,
    startedAt: ago(8 * DAY),
    lastActivity: ago(7 * DAY),
    tokens: 1_000,
    status: "ended",
    outcome: "done",
    endedAt: ago(7 * DAY),
    ...fields,
  };
}

/** The registry the schedule reads: one ended session per old branch, one parked session. */
async function seededRegistry() {
  const backend = fileBackend(join(scratch, `registry-${(files += 1)}.json`));
  const sessions = [
    session("s-old", "ab/old-ended-sessold1", { endedAt: ago(7.5 * DAY) }),
    session("s-young", "ab/young-ended-sessyou1", { endedAt: ago(2 * DAY) }),
    // Parked on a question 10 minutes ago: running, inside the 30-minute idle timeout.
    session("s-parked", "ab/parked-sesspar1", { status: "running", outcome: null, endedAt: null, lastActivity: ago(10 * 60 * 1_000) }),
  ];
  await backend.write({ schema: 1, day: utcDay(NOW), restingSince: null, sessions: Object.fromEntries(sessions.map((s) => [s.sessionId, s])) }, null);
  return new Registry(backend, () => NOW);
}

interface Call {
  readonly method: string;
  readonly path: string;
  readonly auth: string | null;
  readonly body: unknown;
}

/** A GitHub API with branches, their tip dates and open pull requests, as the App's installation sees them. */
function stubGitHub() {
  const refs = new Map<string, { sha: string; date: string }>([
    ["main", { sha: "a".repeat(40), date: ago(30 * DAY) }],
    ["feature/manual", { sha: "b".repeat(40), date: ago(30 * DAY) }],
    ["ab/old-ended-sessold1", { sha: "c".repeat(40), date: ago(7.6 * DAY) }],
    ["ab/young-ended-sessyou1", { sha: "d".repeat(40), date: ago(2.1 * DAY) }],
    ["ab/parked-sesspar1", { sha: "e".repeat(40), date: ago(9 * DAY) }],
    ["ab/orphan-sessorp1", { sha: "f".repeat(40), date: ago(20 * DAY) }],
  ]);
  const pulls = [
    { number: 1, created_at: ago(2 * DAY), head: { ref: "ab/old-ended-sessold1", repo: { full_name: REPO } } },
    { number: 2, created_at: ago(2 * HOUR), head: { ref: "ab/young-ended-sessyou1", repo: { full_name: REPO } } },
    { number: 3, created_at: ago(3 * DAY), head: { ref: "feature/manual", repo: { full_name: REPO } } },
    { number: 4, created_at: ago(2 * DAY), head: { ref: "ab/parked-sesspar1", repo: { full_name: REPO } } },
    { number: 5, created_at: ago(3 * DAY), head: { ref: "ab/from-a-fork", repo: { full_name: "someone/fork" } } },
  ];
  const open = new Set(pulls.map((pull) => pull.number));
  const calls: Call[] = [];
  const minted: unknown[] = [];
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  const fetch = async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const method = init.method ?? "GET";
    const path = url.pathname;
    const auth = new Headers(init.headers).get("authorization");
    const body = init.body ? JSON.parse(String(init.body)) : null;
    calls.push({ method, path, auth, body });
    if (method === "GET" && path === `/repos/${REPO}/installation`) return json(200, { id: 77 });
    if (method === "POST" && path === "/app/installations/77/access_tokens") {
      minted.push(body);
      return json(201, { token: "ghs_stubbed", expires_at: ago(-HOUR) });
    }
    if (auth !== "Bearer ghs_stubbed") return json(401, { message: "Bad credentials" });
    if (method === "GET" && path === `/repos/${REPO}/pulls`) {
      assert.equal(url.searchParams.get("state"), "open");
      const page = Number(url.searchParams.get("page") ?? "1");
      return json(200, page === 1 ? pulls.filter((pull) => open.has(pull.number)) : []);
    }
    const pull = /^\/repos\/[^/]+\/[^/]+\/pulls\/(\d+)$/.exec(path);
    if (method === "PATCH" && pull) {
      open.delete(Number(pull[1]));
      return json(200, { number: Number(pull[1]), state: "closed" });
    }
    const matching = new RegExp(`^/repos/${REPO}/git/matching-refs/heads/(.*)$`).exec(path);
    if (method === "GET" && matching) {
      const prefix = decodeURIComponent(matching[1]);
      return json(
        200,
        [...refs].filter(([name]) => name.startsWith(prefix)).map(([name, ref]) => ({ ref: `refs/heads/${name}`, object: { sha: ref.sha, type: "commit" } })),
      );
    }
    const commit = new RegExp(`^/repos/${REPO}/commits/([0-9a-f]{40})$`).exec(path);
    if (method === "GET" && commit) {
      const found = [...refs.values()].find((ref) => ref.sha === commit[1]);
      return found ? json(200, { sha: found.sha, commit: { committer: { date: found.date } } }) : json(404, {});
    }
    const ref = new RegExp(`^/repos/${REPO}/git/refs/heads/(.+)$`).exec(path);
    if (method === "DELETE" && ref) {
      const name = decodeURIComponent(ref[1]);
      if (!refs.delete(name)) return json(422, { message: "Reference does not exist" });
      return new Response(null, { status: 204 });
    }
    return json(404, { message: `stub has no ${method} ${path}` });
  };
  return { fetch: fetch as typeof globalThis.fetch, calls, minted, refs, open };
}

const DEMO_ENV = { AB_DEMO: "1", AB_GITHUB_APP_ID: "123456", AB_GITHUB_APP_PRIVATE_KEY: pem, AB_DEMO_REPOSITORY: REPO };

async function run(env: Record<string, string>, github = stubGitHub(), registry?: InstanceType<typeof Registry>) {
  const lines: string[] = [];
  const report = await scheduledCleanup(env, {
    fetch: github.fetch,
    apiUrl: API,
    registry: registry ?? (await seededRegistry()),
    now: () => NOW,
    log: (line) => lines.push(line),
  });
  return { report, lines, github };
}

const writes = (calls: readonly Call[]) => calls.filter((call) => call.method === "PATCH" || call.method === "DELETE");

describe("the scheduled demo cleanup", () => {
  test("a hand-triggered run closes the old pull request, deletes the old ended branch and keeps the rest; a second run changes nothing", async () => {
    const github = stubGitHub();
    const registry = await seededRegistry();
    const { report, lines } = await run(DEMO_ENV, github, registry);

    assert.equal(report.status, "done");
    // The token is minted for the one repository with exactly these permissions.
    assert.deepEqual(github.minted, [{ repositories: ["agent-blueprint-sample"], permissions: CLEANUP_PERMISSIONS }]);
    assert.deepEqual(CLEANUP_PERMISSIONS, { contents: "write", pull_requests: "write", metadata: "read" });

    // Older than 24 hours on an ab/ branch: closed. Two hours old, a non-pattern head, a live
    // session's head and a fork's head: left open.
    assert.deepEqual(report.closed, [1]);
    assert.deepEqual([...github.open].sort(), [2, 3, 4, 5]);
    // Older than 7 days with its session ended: deleted.
    assert.deepEqual(report.deleted, ["ab/old-ended-sessold1"]);
    assert.equal(github.refs.has("ab/old-ended-sessold1"), false);
    // main, the non-pattern branch, the young ended branch, the parked session's branch and the
    // branch the registry does not know all stay.
    for (const name of ["main", "feature/manual", "ab/young-ended-sessyou1", "ab/parked-sesspar1", "ab/orphan-sessorp1"]) {
      assert.equal(github.refs.has(name), true, name);
    }
    const kept = Object.fromEntries(report.kept.map((item) => [item.name, item.reason]));
    assert.match(kept["ab/parked-sesspar1"], /running/);
    assert.match(kept["ab/young-ended-sessyou1"], /younger than 7 days/);
    assert.match(kept["ab/orphan-sessorp1"], /no session in the registry/);
    assert.match(kept["#4"], /running/);

    // Every write went to an ab/ branch or a pull request on one, with the App's token.
    for (const call of writes(github.calls)) {
      assert.equal(call.auth, "Bearer ghs_stubbed");
      assert.doesNotMatch(call.path, /heads\/(main|feature)/);
    }
    assert.deepEqual(
      writes(github.calls).map((call) => `${call.method} ${call.path}`),
      [`PATCH /repos/${REPO}/pulls/1`, `DELETE /repos/${REPO}/git/refs/heads/ab/old-ended-sessold1`],
    );
    assert.ok(lines.some((line) => /closed #1/.test(line)));
    assert.ok(lines.every((line) => !line.includes("ghs_stubbed")), "the token is never logged");

    // The second run on the same repository and registry finds nothing to do.
    const before = github.calls.length;
    const again = await run(DEMO_ENV, github, registry);
    assert.deepEqual(again.report.closed, []);
    assert.deepEqual(again.report.deleted, []);
    assert.equal(writes(github.calls.slice(before)).length, 0);
  });

  test("a dry run logs what it would close and delete and writes nothing", async () => {
    const { report, lines, github } = await run({ ...DEMO_ENV, AB_CLEANUP_DRY_RUN: "1" });
    assert.equal(report.status, "dry-run");
    assert.deepEqual(report.closed, [1]);
    assert.deepEqual(report.deleted, ["ab/old-ended-sessold1"]);
    assert.equal(writes(github.calls).length, 0);
    assert.equal(github.open.has(1), true);
    assert.equal(github.refs.has("ab/old-ended-sessold1"), true);
    assert.ok(lines.some((line) => /would close #1/.test(line)));
    assert.ok(lines.some((line) => /would delete ab\/old-ended-sessold1/.test(line)));
  });

  test("while AB_MAINTENANCE is set it does nothing and says so", async () => {
    const { report, lines, github } = await run({ ...DEMO_ENV, AB_MAINTENANCE: "upgrading" });
    assert.equal(report.status, "skipped");
    assert.equal(github.calls.length, 0);
    assert.ok(lines.some((line) => /AB_MAINTENANCE/.test(line)));
  });

  test("a copy that is not the demo does nothing", async () => {
    const { AB_DEMO: _, ...deployer } = DEMO_ENV;
    const { report, github } = await run(deployer);
    assert.equal(report.status, "skipped");
    assert.equal(github.calls.length, 0);
  });
});
