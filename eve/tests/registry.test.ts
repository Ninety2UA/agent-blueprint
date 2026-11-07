// The demo's registry on its file backend (KTD13), the cap rules and the posture rule, with no
// Eve runtime: compare-and-set under concurrent writers, the concurrency counts, the daily 402
// mark and its UTC reset, the idle timeout, and the posture each caller gets.
import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
const { Registry, RegistryConflictError, blobBackend, emptyDocument, fileBackend, helperStop, owesPush, strongEtag } = await import("../agent/lib/registry.ts");
const caps = await import("../agent/lib/caps.ts");
const { postureFor, withPostureDecision } = await import("../agent/lib/posture.ts");
const { newRecord } = await import("../agent/lib/run-state.ts");

const scratch = mkdtempSync(join(tmpdir(), "ab-registry-"));
after(() => rmSync(scratch, { recursive: true, force: true }));
let files = 0;
const freshFile = () => join(scratch, `registry-${(files += 1)}.json`);

describe("compare-and-set", () => {
  test("a write at a stale version is refused", async () => {
    const backend = fileBackend(freshFile());
    const now = new Date();
    const empty = { schema: 1 as const, day: caps.utcDay(now), restingSince: null, sessions: {} };
    await backend.write(empty, null);
    const read = await backend.read();
    await backend.write(empty, read!.version);
    await assert.rejects(backend.write(empty, read!.version), RegistryConflictError);
    await assert.rejects(backend.write(empty, null), RegistryConflictError, "a create when the document exists");
  });

  test("two concurrent sessions increment the registry and the sum is exact", async () => {
    const path = freshFile();
    const a = new Registry(fileBackend(path));
    const b = new Registry(fileBackend(path));
    await a.admit({ sessionId: "sess-a", cookieId: "cookie-a", address: "203.0.113.1" });
    await b.admit({ sessionId: "sess-b", cookieId: "cookie-b", address: "203.0.113.2" });
    const steps = Array.from({ length: 40 }, (_, index) => index + 1);
    await Promise.all([
      ...steps.map((step) => a.recordTokens("sess-a", step * 1_000)),
      ...steps.map((step) => b.recordTokens("sess-b", step * 10)),
      ...steps.map((step) => (step % 2 ? a : b).recordProgress(step % 4 < 2 ? "sess-a" : "sess-b", { stage: `stage-${step}` })),
    ]);
    const document = await a.snapshot();
    assert.equal(document.sessions["sess-a"].tokens, 40_000);
    assert.equal(document.sessions["sess-b"].tokens, 400);
    assert.equal(document.sessions["sess-a"].tokens + document.sessions["sess-b"].tokens, 40_400);
    assert.deepEqual(Object.keys(document.sessions).sort(), ["sess-a", "sess-b"]);
  });

  test("writers in separate processes lose no session", async () => {
    const path = freshFile();
    const worker = join(scratch, "worker.mjs");
    writeFileSync(
      worker,
      `import { registerHooks } from "node:module";
registerHooks({ resolve(s, c, n) { try { return n(s, c); } catch (e) { if (s.startsWith(".")) return n(s + ".ts", c); throw e; } } });
const { Registry, fileBackend } = await import(${JSON.stringify(join(import.meta.dirname, "..", "agent", "lib", "registry.ts"))});
const registry = new Registry(fileBackend(process.argv[2]));
const tag = process.argv[3];
await Promise.all(Array.from({ length: 15 }, (_, i) => registry.admit({ sessionId: tag + "-" + i, cookieId: tag + "-" + i, address: tag + "-" + i })));
`,
    );
    const run = (tag: string) =>
      new Promise<number>((resolve) => fork(worker, [path, tag], { stdio: "inherit" }).on("exit", (code) => resolve(code ?? 1)));
    assert.deepEqual(await Promise.all([run("p1"), run("p2")]), [0, 0]);
    const document = await new Registry(fileBackend(path)).snapshot();
    assert.equal(Object.keys(document.sessions).length, 30);
  });
});

describe("the caps in the registry", () => {
  test("one running session per cookie and two per address; an ended session frees its place", async () => {
    const registry = new Registry(fileBackend(freshFile()));
    assert.equal((await registry.admit({ sessionId: "s1", cookieId: "c1", address: "a1" })).kind, "admitted");
    assert.equal((await registry.admit({ sessionId: "s1", cookieId: "c1", address: "a1" })).kind, "admitted", "the same session's next turn");
    assert.equal((await registry.admit({ sessionId: "s2", cookieId: "c1", address: "a1" })).kind, "busy-cookie");
    assert.equal((await registry.admit({ sessionId: "s3", cookieId: "c2", address: "a1" })).kind, "admitted");
    assert.equal((await registry.admit({ sessionId: "s4", cookieId: "c3", address: "a1" })).kind, "busy-address");
    await registry.end("s1", "done");
    assert.equal((await registry.admit({ sessionId: "s5", cookieId: "c1", address: "a1" })).kind, "admitted");
    const ended = await registry.admit({ sessionId: "s1", cookieId: "c1", address: "a1" });
    assert.equal(ended.kind, "ended");
  });

  test("ruling 52: a session's turn is refused to a cookie other than the one that started it", async () => {
    let clock = new Date("2026-10-31T10:00:00Z");
    const registry = new Registry(fileBackend(freshFile()), () => clock);
    assert.equal((await registry.admit({ sessionId: "s1", cookieId: "owner", address: "a1" })).kind, "admitted");
    clock = new Date("2026-10-31T10:05:00Z");
    assert.equal((await registry.admit({ sessionId: "s1", cookieId: "stranger", address: "a2" })).kind, "not-owner");
    assert.equal((await registry.snapshot()).sessions.s1.lastActivity, "2026-10-31T10:00:00.000Z", "a refused turn moves nothing");
    assert.equal((await registry.snapshot()).sessions.s1.cookieId, "owner");
    assert.equal((await registry.admit({ sessionId: "s1", cookieId: "owner", address: "a1" })).kind, "admitted", "the owner's next turn");
    await registry.end("s1", "done");
    assert.equal((await registry.admit({ sessionId: "s1", cookieId: "stranger", address: "a2" })).kind, "not-owner", "an ended session says nothing to a stranger");
    assert.equal((await registry.admit({ sessionId: "s1", cookieId: "owner", address: "a1" })).kind, "ended");
  });

  test("the day's first 402 rests the demo for new and running sessions, and 00:00 UTC clears it", async () => {
    let clock = new Date("2026-10-29T23:40:00Z");
    const registry = new Registry(fileBackend(freshFile()), () => clock);
    await registry.admit({ sessionId: "s1", cookieId: "c1", address: "a1" });
    const first = await registry.markResting();
    clock = new Date("2026-10-29T23:50:00Z");
    assert.equal(await registry.markResting(), first, "a later 402 keeps the first time");
    assert.equal((await registry.admit({ sessionId: "s2", cookieId: "c2", address: "a2" })).kind, "resting");
    assert.equal((await registry.admit({ sessionId: "s1", cookieId: "c1", address: "a1" })).kind, "resting");
    clock = new Date("2026-10-30T00:00:00Z");
    assert.equal((await registry.admit({ sessionId: "s2", cookieId: "c2", address: "a2" })).kind, "admitted");
    assert.equal(caps.secondsUntilUtcMidnight(new Date("2026-10-29T23:59:30Z")), 30);
  });

  test("a session idle for 30 minutes ends with the idle outcome and frees its cookie", async () => {
    let clock = new Date("2026-10-29T10:00:00Z");
    const registry = new Registry(fileBackend(freshFile()), () => clock);
    await registry.admit({ sessionId: "s1", cookieId: "c1", address: "a1" });
    clock = new Date("2026-10-29T10:29:59Z");
    assert.equal((await registry.admit({ sessionId: "s2", cookieId: "c1", address: "a1" })).kind, "busy-cookie");
    clock = new Date("2026-10-29T10:30:00Z");
    const back = await registry.admit({ sessionId: "s1", cookieId: "c1", address: "a1" });
    assert.equal(back.kind, "ended");
    assert.equal(back.kind === "ended" && back.entry.outcome, "idle-ended");
    assert.equal((await registry.admit({ sessionId: "s2", cookieId: "c1", address: "a1" })).kind, "admitted");
  });

  test("the token cap is the preset's budget, counted as limits.sessionUsage counts it", () => {
    assert.equal(caps.sessionTokenCap(), 40_000_000);
    assert.equal(caps.newInputTokens({ inputTokens: 1_000, cacheReadTokens: 400 }), 600);
    assert.equal(caps.capReached(39_999_999), false);
    assert.equal(caps.capReached(40_000_000), true);
  });

  test("a 402 is the daily budget, a 429 a rate limit, a failed sandbox creation is blocked", () => {
    assert.equal(caps.classifyFailure({ code: "APICallError", message: "402 Payment Required" }), "daily-budget");
    assert.equal(caps.classifyFailure({ code: "rate_limit_exceeded", message: "Too Many Requests" }), "rate-limited");
    assert.equal(caps.classifyFailure({ code: "x", message: "429 Too Many Requests (scripted)" }), "rate-limited");
    assert.equal(caps.classifyFailure({ code: "SandboxError", message: "Failed to create sandbox: quota" }), "sandbox");
    assert.equal(caps.classifyFailure({ code: "x", message: "command exited 1" }), null);
  });
});

describe("a helper's child record", () => {
  const root = { sessionId: "root", cookieId: "c1", address: "a1" };

  test("admitting a helper records whose it is, counts no session, and a stranger writes nothing", async () => {
    const registry = new Registry(fileBackend(freshFile()));
    await registry.admit(root);
    const helper = await registry.admit({ ...root, helperId: "helper1" });
    assert.equal(helper.kind, "admitted");
    const document = await registry.snapshot();
    assert.deepEqual(document.children, { helper1: { rootSessionId: "root", cookieId: "c1" } });
    assert.deepEqual(Object.keys(document.sessions), ["root"]);
    assert.equal(("helperId" in document.sessions.root), false);
    const stranger = await registry.admit({ sessionId: "root", helperId: "helper2", cookieId: "c2", address: "a2" });
    assert.equal(stranger.kind, "not-owner");
    assert.equal((await registry.snapshot()).children?.helper2, undefined);
  });

  test("a helper admitted before its root keeps the entry clean of its own id", async () => {
    const registry = new Registry(fileBackend(freshFile()));
    await registry.admit({ ...root, helperId: "helper0" });
    const document = await registry.snapshot();
    assert.equal("helperId" in document.sessions.root, false);
    assert.equal(document.sessions.root.cookieId, "c1");
    assert.deepEqual(document.children, { helper0: { rootSessionId: "root", cookieId: "c1" } });
  });

  test("a helper refused because its root ended still has its owner", async () => {
    const registry = new Registry(fileBackend(freshFile()));
    await registry.admit(root);
    await registry.end("root", "done");
    assert.equal((await registry.admit({ ...root, helperId: "late" })).kind, "ended");
    assert.equal((await registry.snapshot()).children?.late?.cookieId, "c1");
  });

  test("a child leaves with its root at the end of retention; a document with no children settles as it was", async () => {
    let clock = new Date("2026-11-01T10:00:00Z");
    const registry = new Registry(fileBackend(freshFile()), () => clock);
    assert.equal((await registry.snapshot()).children, undefined);
    await registry.admit(root);
    await registry.admit({ ...root, helperId: "helper1" });
    await registry.end("root", "done");
    clock = new Date("2026-11-20T10:00:00Z");
    const document = await registry.snapshot();
    assert.equal(document.sessions.root, undefined);
    assert.deepEqual(document.children, {});
  });
});

describe("the push a stop owes", () => {
  const caller = { sessionId: "s1", cookieId: "c1", address: "a1" };
  const started = async () => {
    const registry = new Registry(fileBackend(freshFile()));
    await registry.admit(caller);
    return registry;
  };

  test("a stop that asks for a push owes one, even after an earlier stage push, until a push lands", async () => {
    const registry = await started();
    await registry.recordProgress("s1", { pushedSha: "a".repeat(40) });
    const ended = await registry.end("s1", "blocked", true);
    assert.equal(owesPush(ended!), true);
    const failed = await registry.recordProgress("s1", { pushLanded: false });
    assert.equal(owesPush(failed!), true, "a push that did not land stays owed");
    const landed = await registry.recordProgress("s1", { pushedSha: "b".repeat(40), pushLanded: true });
    assert.equal(owesPush(landed!), false);
  });

  test("a stop that asks for none owes none, and the first stop's answer stays", async () => {
    const registry = await started();
    const ended = await registry.end("s1", "blocked", false);
    assert.equal(owesPush(ended!), false, "a sandbox that could not be created");
    assert.equal(owesPush((await registry.end("s1", "token-cap", true))!), false);
  });

  test("a running session owes nothing", async () => {
    const registry = await started();
    assert.equal(owesPush((await registry.snapshot()).sessions.s1), false);
  });

  test("an entry stored before the field keeps the old rule", async () => {
    const registry = await started();
    const entry = { ...(await registry.end("s1", "blocked"))! };
    delete (entry as { owesPush?: boolean }).owesPush;
    assert.equal(owesPush(entry), true);
    assert.equal(owesPush({ ...entry, pushedSha: "a".repeat(40) }), false);
    assert.equal(owesPush({ ...entry, outcome: "done" }), false);
  });
});

describe("what a returned helper means for its root", () => {
  const entry = (fields: object) => ({ sessionId: "s1", cookieId: "c1", address: "a1", repository: null, branch: null, stage: null, pushedSha: null, startedAt: "", lastActivity: "", tokens: 0, status: "running", outcome: null, endedAt: null, ...fields });

  test("a root entry the helper's stop ended: the root takes that outcome and the push it owes", () => {
    assert.deepEqual(helperStop({ status: "cancelled" }, entry({ status: "ended", outcome: "token-cap", owesPush: true }), null), { outcome: "token-cap", push: true });
    assert.deepEqual(helperStop({ status: "cancelled" }, entry({ status: "ended", outcome: "blocked", owesPush: false }), null), { outcome: "blocked", push: false });
    assert.deepEqual(helperStop({ status: "cancelled" }, entry({ status: "ended", outcome: "done", owesPush: false }), null), { outcome: "done", push: false });
  });

  test("a person's new message interrupted the helper: the run goes on", () => {
    assert.equal(helperStop({ status: "cancelled", interrupted: true }, undefined, null), null);
    assert.equal(helperStop({ status: "cancelled", interrupted: true }, entry({}), null), null);
  });

  test("off the demo a cancelled helper was the cap hook's: the run ends blocked, the branch pushed", () => {
    assert.deepEqual(helperStop({ status: "cancelled", interrupted: false }, undefined, null), { outcome: "blocked", push: true });
  });

  test("on the demo with the root still running, a cancelled helper is the visitor's own, unless the demo is resting", () => {
    assert.equal(helperStop({ status: "cancelled", interrupted: false }, entry({}), null), null);
    assert.deepEqual(helperStop({ status: "cancelled", interrupted: false }, entry({}), "2026-11-06T10:00:00Z"), { outcome: "resting", push: true });
  });

  test("a stop the registry holds wins over a steering message that raced it", () => {
    assert.deepEqual(helperStop({ status: "cancelled", interrupted: true }, entry({ status: "ended", outcome: "token-cap", owesPush: true }), null), { outcome: "token-cap", push: true });
  });

  test("a helper that completed or failed makes no stop here", () => {
    assert.equal(helperStop({ status: "completed" }, undefined, null), null);
    assert.equal(helperStop({ status: "failed" }, entry({}), null), null);
  });
});

describe("posture by channel", () => {
  test("people are interactive; a service or runtime bearer and a schedule are unattended", () => {
    const user = { authenticator: "chat-cookie", principalType: "user" };
    assert.equal(postureFor({ channel: "channel:eve", principal: user }).posture, "interactive");
    assert.equal(postureFor({ channel: "channel:slack", principal: { authenticator: "slack-webhook", principalType: "user" } }).posture, "interactive");
    assert.equal(postureFor({ channel: "channel:eve", principal: { authenticator: "local-dev", principalType: "local-dev" } }).posture, "interactive");
    assert.equal(postureFor({ channel: "channel:eve", principal: { authenticator: "oidc", principalType: "user" } }).posture, "interactive");
    assert.equal(postureFor({ channel: "channel:eve", principal: { authenticator: "oidc", principalType: "service" } }).posture, "unattended");
    assert.equal(postureFor({ channel: "channel:eve", principal: { authenticator: "oidc", principalType: "runtime" } }).posture, "unattended");
    assert.equal(postureFor({ channel: "schedule", principal: null }).posture, "unattended");
  });

  test("Linear, Telegram and MCP are interactive by channel, whatever the principal's type", () => {
    for (const channel of ["channel:linear", "channel:telegram", "channel:mcp"]) {
      const result = postureFor({ channel, principal: { authenticator: "webhook", principalType: "user" } });
      assert.equal(result.posture, "interactive", channel);
    }
    const oauth = postureFor({ channel: "channel:mcp", principal: { authenticator: "oidc", principalType: "service" } });
    assert.equal(oauth.posture, "interactive", "an OIDC caller Eve types service is still interactive on MCP");
    assert.match(oauth.reason, /MCP/);
  });

  test("the posture goes into the run's decisions once, and again only when it changes", () => {
    const record = newRecord({ versions: { eve: "0.86.0", product: "4.1.1" }, sessionId: "sess0123", repository: "a/b", branch: "ab/x-sess0123", base: "abc", now: "t0" });
    const once = withPostureDecision(record, "unattended", "an HTTP call authenticated as a service (oidc)", "t1");
    assert.equal(once.decisions.length, 1);
    assert.equal(once.decisions[0].choice, "unattended");
    assert.match(once.decisions[0].reason, /derived from an HTTP call/);
    assert.equal(withPostureDecision(once, "unattended", "same", "t2"), once);
    assert.equal(withPostureDecision(once, "interactive", "the web chat", "t3").decisions.length, 2);
  });
});

// Ruling 66: Blob answered the demo's reads with a weak ETag (W/"...") and refused every write made
// at it, so a run's hook gave up after 50 attempts. A fake Blob that hands out a weak ETag and
// accepts only the stored strong one stands in for the store.
describe("blob backend", () => {
  class FakeBlobError extends Error {}
  class FakePreconditionFailedError extends FakeBlobError {}

  function fakeBlob(stored: { etag: string; body: string }, strong: string) {
    const seen = { getOptions: [] as { headers?: unknown }[], ifMatch: [] as (string | undefined)[] };
    const client = {
      async get(_pathname: string, options: { headers?: unknown }) {
        seen.getOptions.push(options);
        return { statusCode: 200, stream: new Response(stored.body).body, headers: new Headers(), blob: { etag: stored.etag } };
      },
      async put(_pathname: string, body: string, options: { ifMatch?: string }) {
        seen.ifMatch.push(options.ifMatch);
        if (options.ifMatch !== strong) throw new FakePreconditionFailedError("Vercel Blob: Precondition failed: ETag mismatch.");
        stored = { etag: '"after"', body };
        return { etag: '"after"' };
      },
      BlobPreconditionFailedError: FakePreconditionFailedError,
      BlobError: FakeBlobError,
    };
    return { client: async () => client as never, seen };
  }

  test("a weak ETag from the read is written back in its strong form, and the read asks for the stored bytes", async () => {
    const blob = fakeBlob({ etag: 'W/"1dcc"', body: JSON.stringify(emptyDocument(new Date())) }, '"1dcc"');
    const since = await new Registry(blobBackend("registry.json", blob.client)).markResting();
    assert.ok(since);
    assert.deepEqual(blob.seen.ifMatch, ['"1dcc"']);
    assert.deepEqual(blob.seen.getOptions[0]?.headers, { "accept-encoding": "identity" });
  });

  test("a strong ETag stays as it is", () => {
    assert.equal(strongEtag('"1dcc"'), '"1dcc"');
    assert.equal(strongEtag('W/"1dcc"'), '"1dcc"');
  });
});
