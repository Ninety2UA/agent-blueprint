// The delivery proof on the Postgres workflow world (ruling 83), with no Postgres: a fake world that
// queues and delivers like @workflow/world-postgres stands in. Every message queued through the world
// carries a proof made from AB_WORKFLOW_SECRET, the queue name and the message body, never the secret
// itself, and the queue route refuses a delivery whose proof does not match, the way Eve's local world
// refuses one without its secret. The world's own start-up recovery, which enqueues past the wrapped
// queue, is replaced by one through it. On a redeploy the world's server releases its running jobs for
// retry before it exits (ruling 91, fix A), driven here with mocked timers, a fake process and one real one.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";
import { describe, test } from "node:test";

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
const { authenticateWorkflowDeliveries, createWorld, DELIVERY_HEADER, workflowSecret } = await import("../agent/lib/postgres-world.ts");
const { EXIT_BY_MS, FORCE_AFTER_MS, releaseJobsOnSigterm } = await import("../agent/lib/sigterm-release.ts");
const { workflowWorld } = await import("../agent/lib/workflow-world.ts");
// The installed world-postgres's own pieces: how a queued job's payload is stored, and how its Graphile
// logger prints a failed job. Neither is in the package's exports, so they load by path.
const { MessageData } = await import("../node_modules/@workflow/world-postgres/dist/message.js");
const { serializeGraphileMeta } = await import("../node_modules/@workflow/world-postgres/dist/queue.js");

const SECRET = "0123456789abcdef".repeat(4);
const PREFIX = "__eve6167656e742d626c75657072696e742d657665_wkf_workflow_";
const QUEUE = `${PREFIX}workflow//eve//workflowEntry`;
const PROOF = /^[0-9a-f]{32}\.[0-9a-f]{64}$/;

type Headers = Record<string, string>;
interface Queued {
  readonly name: string;
  readonly message: unknown;
  readonly opts?: { headers?: Headers; idempotencyKey?: string };
}

/** A world shaped like world-postgres: start() re-enqueues active runs through its own queue function. */
function fakeWorld() {
  const queued: Queued[] = [];
  const handled: unknown[] = [];
  const active = [{ runId: "wrun_1", workflowName: "workflow//eve//workflowEntry", status: "running" }];
  const rawQueue = async (name: string, message: unknown, opts?: Queued["opts"]) => {
    queued.push({ name, message, opts });
    return { messageId: `msg_${queued.length}` };
  };
  const world = {
    queue: rawQueue,
    runs: { list: async (_params: unknown) => ({ data: active, cursor: null, hasMore: false }) },
    createQueueHandler: (_prefix: string, handler: (message: unknown) => Promise<void>) => async (req: Request) => {
      await handler(await req.json());
      return Response.json({ ok: true });
    },
    start: async () => {
      const page = await world.runs.list({ status: ["pending", "running"], resolveData: "none", pagination: {} });
      for (const run of page.data) await rawQueue(`${PREFIX}${run.workflowName}`, { runId: run.runId });
    },
  };
  return { world, queued, handled, record: async (message: unknown) => void handled.push(message) };
}

/** world-postgres's queue transport: the bytes it stores for a message and later delivers as the body. */
function storedBody(message: unknown): string {
  return JSON.stringify(message, (_key, v) => (v instanceof Uint8Array ? { __type: "Uint8Array", data: Buffer.from(v).toString("base64") } : v));
}

/** The request world-postgres sends for a stored message: its headers plus its own x-vqs ones. */
function delivery(headers: Headers = {}, queueName = QUEUE, body = storedBody({ runId: "wrun_1" })) {
  return new Request("http://localhost/.well-known/workflow/v1/flow", {
    method: "POST",
    headers: { ...headers, "content-type": "application/json", "x-vqs-queue-name": queueName, "x-vqs-message-id": "msg_1", "x-vqs-message-attempt": "1" },
    body,
  });
}

/** Queues one message through the guarded world and returns the guarded world, its route and what was stored. */
async function queuedThrough(message: unknown = { runId: "wrun_1" }, name = QUEUE) {
  const fake = fakeWorld();
  const guarded = authenticateWorkflowDeliveries(fake.world, SECRET);
  await guarded.queue(name, message as never);
  const route = guarded.createQueueHandler(PREFIX, fake.record as never);
  return { ...fake, guarded, route, headers: fake.queued[0].opts?.headers ?? {} };
}

describe("the queue route", () => {
  test("refuses a delivery without the proof with Eve's 401, and never runs the handler", async () => {
    const { world, handled, record } = fakeWorld();
    const route = authenticateWorkflowDeliveries(world, SECRET).createQueueHandler(PREFIX, record);
    const response = await route(delivery());
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "Untrusted workflow delivery." });
    assert.equal(handled.length, 0);
  });

  test("refuses the raw secret and malformed proofs", async () => {
    const { headers, route, handled } = await queuedThrough();
    const [nonce, mac] = headers[DELIVERY_HEADER].split(".");
    const proofs = [SECRET, "", ".", `${nonce}.`, `.${mac}`, `${nonce}.${mac}.0`, `${nonce}${mac}`, `${nonce.toUpperCase()}.${mac}`, `${nonce}.${mac.slice(1)}`, `${nonce}.${mac}0`, `${nonce.slice(2)}.${mac}`, `${nonce}.${"0".repeat(64)}`];
    for (const proof of proofs) {
      const response = await route(delivery({ [DELIVERY_HEADER]: proof }));
      assert.equal(response.status, 401, `proof ${JSON.stringify(proof)}`);
    }
    assert.equal(handled.length, 0);
  });

  test("refuses a stored proof delivered under another queue name, with another body, or without the queue name", async () => {
    const { headers, route, handled } = await queuedThrough();
    for (const request of [
      delivery(headers, `${PREFIX}workflow//eve//workflowToolRunWorkflow`),
      delivery(headers, QUEUE, storedBody({ runId: "wrun_2" })),
      delivery(headers, QUEUE, storedBody({ runId: "wrun_1", runInput: { input: [] } })),
    ]) {
      assert.equal((await route(request)).status, 401);
    }
    const nameless = delivery(headers);
    nameless.headers.delete("x-vqs-queue-name");
    assert.equal((await route(nameless)).status, 401);
    assert.equal(handled.length, 0);
  });

  test("refuses a proof made with another secret", async () => {
    const other = fakeWorld();
    await authenticateWorkflowDeliveries(other.world, "f".repeat(64)).queue(QUEUE, { runId: "wrun_1" } as never);
    const { route, handled } = await queuedThrough();
    assert.equal((await route(delivery(other.queued[0].opts?.headers))).status, 401);
    assert.equal(handled.length, 0);
  });
});

describe("the queue", () => {
  test("stamps a proof on every message, never the secret, and keeps the caller's headers and options", async () => {
    const { world, queued } = fakeWorld();
    const guarded = authenticateWorkflowDeliveries(world, SECRET);
    await guarded.queue(QUEUE, { runId: "wrun_2" } as never, { headers: { "x-other": "1" }, idempotencyKey: "k" } as never);
    await guarded.queue(QUEUE, { runId: "wrun_2" } as never);
    const [first, second] = queued;
    assert.equal(first.name, QUEUE);
    assert.deepEqual(first.message, { runId: "wrun_2" });
    assert.equal(first.opts?.idempotencyKey, "k");
    assert.equal(first.opts?.headers?.["x-other"], "1");
    for (const message of queued) {
      assert.match(message.opts?.headers?.[DELIVERY_HEADER] ?? "", PROOF);
      assert.ok(!JSON.stringify(message).includes(SECRET));
    }
    assert.notEqual(first.opts?.headers?.[DELIVERY_HEADER], second.opts?.headers?.[DELIVERY_HEADER], "a fresh nonce per message");
  });

  test("a message queued through the world passes the route when delivered with its stored headers and body", async () => {
    const message = { runId: "wrun_1", runInput: { input: new Uint8Array([1, 2, 3]), deploymentId: "postgres" } };
    const { headers, route, handled } = await queuedThrough(message);
    const response = await route(delivery(headers, QUEUE, storedBody(message)));
    assert.equal(response.status, 200);
    assert.equal(handled.length, 1);
  });

  test("start-up recovery re-enqueues each active run through the stamped queue, none past it", async () => {
    const { world, queued, handled, record } = fakeWorld();
    const guarded = authenticateWorkflowDeliveries(world, SECRET);
    await guarded.start();
    assert.equal(queued.length, 1, "one wake per active run");
    const [wake] = queued;
    assert.deepEqual(wake.message, { runId: "wrun_1" });
    const route = guarded.createQueueHandler(PREFIX, record);
    assert.equal((await route(delivery(wake.opts?.headers, wake.name, storedBody(wake.message)))).status, 200);
    assert.equal(handled.length, 1);
  });
});

describe("a failed delivery in the log", () => {
  test("Graphile's failed-job line, as world-postgres prints it, carries the proof and nothing the secret follows from", async () => {
    const message = { runId: "wrun_1" };
    const { headers } = await queuedThrough(message);
    // The job row Graphile hands its logger at worker.js "Failed task", with the payload world-postgres's
    // addGraphileJob stores (MessageData.encode), and the error its task throws on a non-OK delivery.
    const payload = MessageData.encode({ id: "workflow//eve//workflowEntry", prefix: PREFIX, data: Buffer.from(storedBody(message)), attempt: 1, messageId: "msg_01M6H76FZ19736FN0KWQWWYD6M", createdAt: new Date().toISOString(), headers } as never);
    const job = { id: "42", queue_name: null, task_identifier: "workflow_flows", payload, priority: 0, run_at: new Date(), attempts: 1, max_attempts: 25, last_error: null, created_at: new Date(), updated_at: new Date(), key: "msg_01M6H76FZ19736FN0KWQWWYD6M", locked_at: new Date(), locked_by: "worker-1", revision: 0, flags: null, is_available: false };
    const error = new Error('[postgres world] Queue execution failed (401): {"error":"Untrusted workflow delivery."}');
    const line = `[Graphile Worker] Failed task 42 (workflow_flows) with error '${error.message}' ${serializeGraphileMeta({ failure: true, job, error, duration: 3 })}\n`;

    assert.ok(line.includes(DELIVERY_HEADER), "the stored headers are in the line, so the check below sees them");
    const forms = [SECRET, Buffer.from(SECRET).toString("base64"), Buffer.from(SECRET).toString("hex"), createHash("sha256").update(SECRET).digest("hex"), createHash("sha256").update(SECRET).digest("base64")];
    for (const form of forms) assert.ok(!line.includes(form), `the line contains a form of the secret: ${form.slice(0, 8)}...`);
  });
});

describe("the secret", () => {
  test("is read from AB_WORKFLOW_SECRET with 32 characters or more", () => {
    assert.equal(workflowSecret({ AB_WORKFLOW_SECRET: SECRET }), SECRET);
    assert.equal(workflowSecret({ AB_WORKFLOW_SECRET: "a".repeat(32) }), "a".repeat(32));
  });

  test("missing or short, the world refuses to start and names the variable", () => {
    for (const env of [{}, { AB_WORKFLOW_SECRET: "" }, { AB_WORKFLOW_SECRET: "a".repeat(31) }]) {
      assert.throws(() => workflowSecret(env), /AB_WORKFLOW_SECRET .*32 characters/);
    }
    const saved = process.env.AB_WORKFLOW_SECRET;
    delete process.env.AB_WORKFLOW_SECRET;
    try {
      assert.throws(() => createWorld(), /AB_WORKFLOW_SECRET/);
    } finally {
      if (saved !== undefined) process.env.AB_WORKFLOW_SECRET = saved;
    }
  });

  test("with a space or line break at either end, or a control character, the world refuses to start and names the variable", () => {
    for (const secret of [` ${SECRET}`, `${SECRET} `, `${SECRET}\n`, `${SECRET}\r\n`, `\t${SECRET}`, `${SECRET.slice(0, 32)}\u0000${SECRET.slice(32)}`, `${SECRET}\u007f`]) {
      assert.throws(() => workflowSecret({ AB_WORKFLOW_SECRET: secret }), /AB_WORKFLOW_SECRET/, JSON.stringify(secret));
    }
  });
});

describe("the world selection agent.ts makes at build", () => {
  test("the Postgres target maps to this module through package.json's #* imports", () => {
    const specifier = workflowWorld("@workflow/world-postgres");
    assert.equal(specifier, "#lib/postgres-world.ts");
    const file = fileURLToPath(import.meta.resolve(specifier!));
    assert.ok(existsSync(file), file);
    assert.equal(file, fileURLToPath(new URL("../agent/lib/postgres-world.ts", import.meta.url)));
  });

  test("another target is kept as given, and none stays none", () => {
    assert.equal(workflowWorld("@workflow/world-local"), "@workflow/world-local");
    const saved = process.env.WORKFLOW_TARGET_WORLD;
    delete process.env.WORKFLOW_TARGET_WORLD;
    try {
      assert.equal(workflowWorld(), undefined);
      process.env.WORKFLOW_TARGET_WORLD = "@workflow/world-postgres";
      assert.equal(workflowWorld(), "#lib/postgres-world.ts", "reads WORKFLOW_TARGET_WORLD by default");
    } finally {
      if (saved === undefined) delete process.env.WORKFLOW_TARGET_WORLD;
      else process.env.WORKFLOW_TARGET_WORLD = saved;
    }
  });

  test("agent.ts takes its world from workflowWorld() and leaves world-postgres out of its imports", () => {
    const agent = readFileSync(new URL("../agent/agent.ts", import.meta.url), "utf8");
    assert.match(agent, /=\s*workflowWorld\(\)/);
    assert.match(agent, /from "\.\/lib\/workflow-world"/);
    assert.doesNotMatch(agent, /postgres-world"/, "every build would bundle world-postgres, pg and Graphile");
    const selector = readFileSync(new URL("../agent/lib/workflow-world.ts", import.meta.url), "utf8");
    assert.doesNotMatch(selector, /^import /m);
  });
});

// The wrapper leans on three things inside @workflow/world-postgres 5.0.5. A version that changes any of
// them fails here before it reaches a deploy.
describe("the installed world-postgres", () => {
  const dist = (file: string) => readFileSync(new URL(`../node_modules/@workflow/world-postgres/dist/${file}`, import.meta.url), "utf8");

  test("start() recovers through queue.queue, which the wrapper replaces with a stamped recovery", () => {
    assert.ok(dist("index.js").includes("reenqueueActiveRuns(storage.runs, queue.queue"));
  });

  test("a queued message's headers are stored with the job and sent back on every delivery", () => {
    const queue = dist("queue.js");
    assert.ok(queue.includes("headers: opts?.headers,"), "queue() stores the caller's headers");
    assert.ok(queue.includes("headers: messageData.headers,"), "the task delivers and reschedules with the stored headers");
    assert.ok(queue.includes("headers: message.headers,"), "the executor transfer keeps them");
  });

  test("the delivered queue name and body are the ones queued", () => {
    const queue = dist("queue.js");
    assert.ok(queue.includes("const { prefix, id: queueId } = parseQueueName(queue);"), "queue() splits the name it was given");
    assert.ok(queue.includes("const queueName = `${prefix}${messageData.id}`;"), "the task joins it again");
    assert.ok(queue.includes("headers.set('x-vqs-queue-name', queueName);"), "and sends it as x-vqs-queue-name");
    assert.ok(queue.includes("body: messageData.data,"), "the body sent is the stored bytes");
    assert.ok(
      queue.includes("return Buffer.from(JSON.stringify(value, (_key, v) => v instanceof Uint8Array\n                ? { __type: 'Uint8Array', data: Buffer.from(v).toString('base64') }\n                : v));"),
      "the stored bytes are the transport's JSON, which the wrapper repeats",
    );
  });
});

// Releasing the server's running jobs on a redeploy (ruling 91, fix A). Railway stops a container with one
// SIGTERM, eve's start command passes it to the server once and SIGKILLs the server 20 s later, and
// graphile-worker 0.16.6 unlocks a running job for retry only on its forceful path, which needs a second
// termination signal. The handler sends that signal itself once graphile's 5 s switch has passed, exits
// when graphile signals itself after releasing, and exits by 15 s at the latest.
const PID = 4242;

/** A process with SIGTERM listeners, a kill that delivers the signal on a later turn, and a recorded exit. */
function fakeProcess() {
  const listeners: Array<() => void> = [];
  const log: string[] = [];
  const signal = () => {
    for (const listener of [...listeners]) listener();
  };
  const proc = {
    pid: PID,
    on(event: "SIGTERM", listener: () => void) {
      assert.equal(event, "SIGTERM");
      listeners.push(listener);
    },
    kill(pid: number, event: "SIGTERM") {
      log.push(`kill ${pid} ${event} @${Date.now()}`);
      queueMicrotask(signal);
    },
    exit(code: number) {
      log.push(`exit ${code} @${Date.now()}`);
    },
  };
  return { proc, log, signal };
}

/**
 * graphile-worker 0.16.6's global handlers (dist/main.js), reduced to their order: the first signal starts a
 * graceful shutdown that waits for the running job and arms the forceful handler 5 s later; a signal after
 * that runs the forceful shutdown, which fails (unlocks) the running job and then signals the process again.
 * A job that finishes first ends the graceful shutdown, which signals the process too.
 */
function graphileModel(fake: ReturnType<typeof fakeProcess>, jobEndsAt = Infinity) {
  let graceful = false;
  let forceful = false;
  let forcefulArmed = false;
  fake.proc.on("SIGTERM", () => {
    if (forcefulArmed && !forceful) {
      forceful = true;
      fake.log.push(`graphile forceful @${Date.now()}`);
      void Promise.resolve().then(() => {
        fake.log.push(`graphile failJobs @${Date.now()}`);
        fake.proc.kill(PID, "SIGTERM");
      });
      return;
    }
    if (graceful) return;
    graceful = true;
    fake.log.push(`graphile graceful @${Date.now()}`);
    const switchTimer = setTimeout(() => {
      forcefulArmed = true;
      fake.log.push(`graphile switch @${Date.now()}`);
    }, 5000);
    if (jobEndsAt !== Infinity) {
      setTimeout(() => {
        clearTimeout(switchTimer);
        fake.log.push(`graphile graceful complete @${Date.now()}`);
        fake.proc.kill(PID, "SIGTERM");
      }, jobEndsAt);
    }
  });
}

type MockContext = { mock: { timers: { enable(options: object): void; tick(ms: number): void } } };

/** Mocked setTimeout and Date from 0, and a fake process. */
function setup(t: MockContext) {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 });
  return fakeProcess();
}

/** Advances the mocked clock in steps, letting each signal kill() delivers run before the next step. */
async function advance(t: MockContext, ms: number, step = 100) {
  for (let done = 0; done < ms; done += step) {
    t.mock.timers.tick(Math.min(step, ms - done));
    for (let i = 0; i < 5; i++) await Promise.resolve();
  }
}

describe("the SIGTERM handler", () => {
  test("a second install on the same process adds nothing, so one counter sees every signal (review #1)", async (t) => {
    const fake = setup(t);
    releaseJobsOnSigterm(fake.proc, globalThis);
    releaseJobsOnSigterm(fake.proc, globalThis);
    fake.signal();
    await advance(t, FORCE_AFTER_MS, FORCE_AFTER_MS);
    assert.deepEqual(fake.log, [`kill ${PID} SIGTERM @${FORCE_AFTER_MS}`], "one self-signal, taken as its own");
  });

  test("waits past graphile's 5 s switch, then signals its own process once", async (t) => {
    const fake = setup(t);
    releaseJobsOnSigterm(fake.proc, globalThis);
    fake.signal();
    await advance(t, FORCE_AFTER_MS - 1, FORCE_AFTER_MS - 1);
    assert.deepEqual(fake.log, []);
    await advance(t, 1, 1);
    assert.deepEqual(fake.log, [`kill ${PID} SIGTERM @${FORCE_AFTER_MS}`], "its own signal is not taken as graphile's");
    assert.ok(FORCE_AFTER_MS > 5000 && FORCE_AFTER_MS <= 6000, "just after graphile's 5 s switch");
  });

  test("exits with 0 on the SIGTERM after its own, the one graphile sends once it has released the jobs", async (t) => {
    const fake = setup(t);
    releaseJobsOnSigterm(fake.proc, globalThis);
    fake.signal();
    await advance(t, FORCE_AFTER_MS);
    assert.deepEqual(fake.log, [`kill ${PID} SIGTERM @${FORCE_AFTER_MS}`]);
    t.mock.timers.tick(200);
    fake.signal();
    assert.deepEqual(fake.log, [`kill ${PID} SIGTERM @${FORCE_AFTER_MS}`, `exit 0 @${FORCE_AFTER_MS + 200}`]);
  });

  test("exits with 0 on graphile's graceful self-signal when the job finished before the switch", async (t) => {
    const fake = setup(t);
    releaseJobsOnSigterm(fake.proc, globalThis);
    fake.signal();
    await advance(t, 2000);
    fake.signal();
    assert.deepEqual(fake.log, ["exit 0 @2000"], "no self-signal before graphile's own");
  });

  test("exits with 0 by 15 s when graphile never signals again, below eve's 20 s SIGKILL", async (t) => {
    const fake = setup(t);
    releaseJobsOnSigterm(fake.proc, globalThis);
    fake.signal();
    await advance(t, EXIT_BY_MS - 100);
    assert.deepEqual(fake.log, [`kill ${PID} SIGTERM @${FORCE_AFTER_MS}`]);
    await advance(t, 100);
    assert.deepEqual(fake.log, [`kill ${PID} SIGTERM @${FORCE_AFTER_MS}`, `exit 0 @${EXIT_BY_MS}`]);
    assert.ok(EXIT_BY_MS <= 15_000 && EXIT_BY_MS > FORCE_AFTER_MS);
  });

  test("with graphile's handlers, the running job is failed for retry and the process exits right after", async (t) => {
    const fake = setup(t);
    graphileModel(fake);
    releaseJobsOnSigterm(fake.proc, globalThis);
    fake.signal();
    await advance(t, FORCE_AFTER_MS);
    assert.deepEqual(fake.log, [
      "graphile graceful @0",
      "graphile switch @5000",
      `kill ${PID} SIGTERM @${FORCE_AFTER_MS}`,
      `graphile forceful @${FORCE_AFTER_MS}`,
      `graphile failJobs @${FORCE_AFTER_MS}`,
      `kill ${PID} SIGTERM @${FORCE_AFTER_MS}`,
      `exit 0 @${FORCE_AFTER_MS}`,
    ]);
  });

  test("with graphile's handlers, a job that finishes in time ends the process with nothing failed", async (t) => {
    const fake = setup(t);
    graphileModel(fake, 3000);
    releaseJobsOnSigterm(fake.proc, globalThis);
    fake.signal();
    await advance(t, 3000);
    assert.deepEqual(fake.log, ["graphile graceful @0", "graphile graceful complete @3000", `kill ${PID} SIGTERM @3000`, "exit 0 @3000"]);
  });

  /** eve's sandboxShutdownPlugin: on the first SIGTERM, process.exit(143) once its sandbox stops settle, which can be at once. */
  function eveSandboxShutdown(fake: ReturnType<typeof fakeProcess>) {
    let fired = false;
    fake.proc.on("SIGTERM", () => {
      if (fired) return;
      fired = true;
      void Promise.resolve().finally(() => fake.proc.exit(143));
    });
  }

  test("holds eve's immediate exit(143) past the self-signal, and exits 0 after graphile releases the job", async (t) => {
    const fake = setup(t);
    eveSandboxShutdown(fake);
    graphileModel(fake);
    releaseJobsOnSigterm(fake.proc, globalThis);
    fake.signal();
    await advance(t, FORCE_AFTER_MS);
    assert.deepEqual(fake.log, [
      "graphile graceful @0",
      "graphile switch @5000",
      `kill ${PID} SIGTERM @${FORCE_AFTER_MS}`,
      `graphile forceful @${FORCE_AFTER_MS}`,
      `graphile failJobs @${FORCE_AFTER_MS}`,
      `kill ${PID} SIGTERM @${FORCE_AFTER_MS}`,
      `exit 0 @${FORCE_AFTER_MS}`,
    ]);
  });

  test("with eve's exit held, the backstop still exits 0 by 15 s when no release signal comes", async (t) => {
    const fake = setup(t);
    eveSandboxShutdown(fake);
    releaseJobsOnSigterm(fake.proc, globalThis);
    fake.signal();
    await advance(t, EXIT_BY_MS - 100);
    assert.deepEqual(fake.log, [`kill ${PID} SIGTERM @${FORCE_AFTER_MS}`]);
    await advance(t, 100);
    assert.deepEqual(fake.log, [`kill ${PID} SIGTERM @${FORCE_AFTER_MS}`, `exit 0 @${EXIT_BY_MS}`]);
  });

  test("in a real process with real signals and a listener that never exits, the SIGTERM ends it after the release", { timeout: 20_000 }, async (t) => {
    const module = fileURLToPath(new URL("../agent/lib/sigterm-release.ts", import.meta.url));
    // The first listener stands for eve's sandboxShutdownPlugin with no sandbox to stop: exit(143) at once.
    // The second stands for srvx's, which stays attached and never exits; the open interval stands for the
    // running step. The third is graphile's, reduced as in graphileModel.
    const script = `
      const { releaseJobsOnSigterm } = await import(${JSON.stringify(module)});
      let forceful = false;
      process.once("SIGTERM", () => { Promise.resolve().finally(() => process.exit(143)); });
      process.on("SIGTERM", () => {});
      process.on("SIGTERM", function gracefulHandler() {
        process.removeListener("SIGTERM", gracefulHandler);
        setTimeout(() => process.on("SIGTERM", () => {
          if (forceful) return;
          forceful = true;
          setTimeout(() => { process.stdout.write("released\\n"); process.kill(process.pid, "SIGTERM"); }, 50);
        }), 5000);
      });
      releaseJobsOnSigterm();
      setInterval(() => {}, 1000);
      process.stdout.write("ready\\n");`;
    const child = spawn(process.execPath, ["--input-type=module", "-e", script], { stdio: ["ignore", "pipe", "inherit"] });
    t.after(() => void child.kill("SIGKILL"));
    let out = "";
    child.stdout.setEncoding("utf8");
    const exited = new Promise<[number | null, string | null]>((resolve) => child.on("exit", (code, signal) => resolve([code, signal])));
    await new Promise<void>((resolve) =>
      child.stdout.on("data", (chunk: string) => {
        out += chunk;
        if (out.includes("ready")) resolve();
      }),
    );
    const sent = Date.now();
    child.kill("SIGTERM");
    const [code, signal] = await Promise.race([exited, new Promise<[null, "still running"]>((resolve) => setTimeout(() => resolve([null, "still running"]), 18_000).unref())]);
    const took = Date.now() - sent;
    assert.deepEqual([code, signal], [0, null]);
    assert.match(out, /released/);
    assert.ok(took >= FORCE_AFTER_MS - 50 && took < EXIT_BY_MS - 3000, `exited after ${took} ms`);
  });
});

describe("the SIGTERM handler's wiring", () => {
  test("the Postgres world's factory installs one SIGTERM listener on the process", () => {
    // In a child: world-postgres opens a connection as soon as it is made, and none is listening here.
    const module = fileURLToPath(new URL("../agent/lib/postgres-world.ts", import.meta.url));
    const script = `
      const { registerHooks } = await import("node:module");
      registerHooks({ resolve: (s, c, next) => { try { return next(s, c); } catch (e) { if (s.startsWith(".")) return next(s + ".ts", c); throw e; } } });
      const { createWorld } = await import(${JSON.stringify(module)});
      const before = process.listenerCount("SIGTERM");
      createWorld();
      process.stdout.write(String(process.listenerCount("SIGTERM") - before));
      process.exit(0);`;
    const added = execFileSync(process.execPath, ["--input-type=module", "-e", script], { env: { ...process.env, AB_WORKFLOW_SECRET: SECRET }, encoding: "utf8" });
    assert.equal(added, "1");
  });

  test("a build without Postgres installs nothing: loading adds no listener, and only the Postgres world imports the handler", () => {
    assert.notEqual(workflowWorld("@workflow/world-local"), "#lib/postgres-world.ts");
    const modules = ["workflow-world.ts", "sigterm-release.ts", "postgres-world.ts"].map((name) => fileURLToPath(new URL(`../agent/lib/${name}`, import.meta.url)));
    const loading = `
      const { registerHooks } = await import("node:module");
      registerHooks({ resolve: (s, c, next) => { try { return next(s, c); } catch (e) { if (s.startsWith(".")) return next(s + ".ts", c); throw e; } } });
      await import("@workflow/world-postgres"); // its signal-exit dependency adds one listener on load
      const before = process.listenerCount("SIGTERM");
      for (const module of ${JSON.stringify(modules)}) await import(module);
      process.stdout.write(String(process.listenerCount("SIGTERM") - before));`;
    const cwd = fileURLToPath(new URL("..", import.meta.url));
    assert.equal(execFileSync(process.execPath, ["--input-type=module", "-e", loading], { cwd, encoding: "utf8" }), "0", "loading the modules adds no listener");
    const root = fileURLToPath(new URL("../agent/", import.meta.url));
    const files = (dir: string): string[] => readdirSync(dir).flatMap((name) => (statSync(join(dir, name)).isDirectory() ? files(join(dir, name)) : [join(dir, name)]));
    const importers = files(root)
      .filter((file) => /\.tsx?$/.test(file) && !file.endsWith("sigterm-release.ts") && readFileSync(file, "utf8").includes("sigterm-release"))
      .map((file) => relative(root, file));
    assert.deepEqual(importers, ["lib/postgres-world.ts"]);
  });
});

// The handler leans on graphile-worker 0.16.6's signal handling, world-postgres 5.0.5 leaving it on, and eve's
// 20 s SIGKILL. A version that changes any of them fails here before it reaches a deploy.
describe("the installed packages the SIGTERM handler leans on", () => {
  const read = (path: string) => readFileSync(new URL(`../node_modules/${path}`, import.meta.url), "utf8");

  test("graphile arms its forceful handler 5 s after the first signal and signals itself when a shutdown ends", () => {
    assert.equal(JSON.parse(read("graphile-worker/package.json")).version, "0.16.6");
    const main = read("graphile-worker/dist/main.js");
    assert.ok(main.includes("const switchTimeout = setTimeout(switchToForcefulHandler, 5000);"));
    assert.ok(main.includes("logger.error(`Global graceful shutdown complete; killing self via ${signal}`);\n                process.kill(process.pid, signal);"));
    assert.ok(main.includes("logger.error(`Global forceful shutdown completed; killing self via ${signal}`);\n            process.kill(process.pid, signal);"));
  });

  test("graphile's forceful shutdown fails only the running jobs its own workers locked", () => {
    const main = read("graphile-worker/dist/main.js");
    assert.ok(main.includes("const cancelledJobs = await (0, failJob_1.failJobs)(compiledSharedOptions, withPgClient, workerIds, jobsInProgress, message);"));
    assert.ok(read("graphile-worker/dist/sql/failJob.js").includes("where id = any($1::int[]) and locked_by = any($3::text[])"));
  });

  test("world-postgres leaves graphile's signal handlers on unless the application manages shutdown", () => {
    const queue = read("@workflow/world-postgres/dist/queue.js");
    assert.ok(queue.includes("...(config.applicationManagedShutdown === true && {\n                noHandleSignals: true,\n            }),"));
  });

  test("eve's start command SIGKILLs the server 20 s after its one SIGTERM", () => {
    const host = read("eve/dist/src/internal/nitro/host/start-production-server.js");
    assert.ok(host.includes("e.kill(`SIGTERM`),await Promise.race([once(e,`exit`),setTimeout(2e4).then(()=>`timeout`)])===`timeout`&&e.exitCode===null&&(e.kill(`SIGKILL`)"));
  });
});
