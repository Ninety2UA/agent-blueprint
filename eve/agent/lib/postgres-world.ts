// The Postgres workflow world with a delivery proof (ruling 83). agent.ts selects this module at build
// through lib/workflow-world.ts when WORKFLOW_TARGET_WORLD is @workflow/world-postgres. The world's queue route,
// /.well-known/workflow/v1/flow, is as public as the server, and world-postgres trusts whatever headers
// and body reach it. Eve guards the route on its local world only, with a secret that never leaves the
// process. Here the secret is AB_WORKFLOW_SECRET, which every deployment on one database shares, because
// a message queued by one build can be delivered by the next. The secret stays in the process too: each
// queued message carries a proof in a header, stored with the job, and the route refuses a delivery
// whose proof does not match. The proof is a random nonce and an HMAC of the nonce, the queue name and
// the message body under the secret. Graphile prints a failed job's headers to the log, so a log reader
// can learn a proof, but not the secret, and a proof admits only the same message on the same queue.
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { reenqueueActiveRuns } from "@workflow/world";
import { createWorld as createPostgresWorld } from "@workflow/world-postgres";
import { releaseJobsOnSigterm } from "./sigterm-release";

export const DELIVERY_HEADER = "x-ab-workflow-delivery";
// world-postgres sets this on every delivery to the name the message was queued under (dist/queue.js).
const QUEUE_NAME_HEADER = "x-vqs-queue-name";
const MIN_SECRET_LENGTH = 32;
const PROOF = /^([0-9a-f]{32})\.([0-9a-f]{64})$/;

type Headers = Record<string, string>;

/** The parts of a World this module touches. */
export interface DeliveryWorld {
  queue(name: string, message: never, opts?: { headers?: Headers }): Promise<unknown>;
  createQueueHandler(prefix: string, handler: never): (req: Request) => Promise<Response>;
  runs: { list(params: never): Promise<{ data: unknown[]; cursor?: string | null; hasMore: boolean }> };
  start?(): Promise<void>;
}

/** AB_WORKFLOW_SECRET, or an error naming it when it is missing, under 32 characters, or padded. */
export function workflowSecret(env: Record<string, string | undefined> = process.env): string {
  const secret = env.AB_WORKFLOW_SECRET ?? "";
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `AB_WORKFLOW_SECRET must be set to ${MIN_SECRET_LENGTH} characters or more when the workflow store is Postgres (WORKFLOW_TARGET_WORLD=@workflow/world-postgres). Make one with openssl rand -hex 32 and set it on every deployment that shares the database.`,
    );
  }
  // A pasted value often brings a line break, and a copy with it and a copy without refuse each other's messages.
  if (/^\s|\s$|[\u0000-\u001f\u007f]/.test(secret)) {
    throw new Error(
      "AB_WORKFLOW_SECRET has a space or line break at its start or end, or a control character. Set it again without them, with the same value on every deployment that shares the database.",
    );
  }
  return secret;
}

/** world-postgres's queue transport (dist/queue.js): the bytes it stores for a message and delivers as the body. */
function transportBytes(message: unknown): Buffer {
  return Buffer.from(JSON.stringify(message, (_key, v) => (v instanceof Uint8Array ? { __type: "Uint8Array", data: Buffer.from(v).toString("base64") } : v)));
}

function mac(secret: string, nonce: string, queueName: string, body: Uint8Array): Buffer {
  const bodyDigest = createHash("sha256").update(body).digest("hex");
  return createHmac("sha256", secret).update(`${nonce}\n${queueName}\n${bodyDigest}`).digest();
}

function deliveryProof(secret: string, queueName: string, body: Uint8Array): string {
  const nonce = randomBytes(16).toString("hex");
  return `${nonce}.${mac(secret, nonce, queueName, body).toString("hex")}`;
}

function validProof(proof: string | null, queueName: string | null, body: Uint8Array, secret: string): boolean {
  if (proof === null || queueName === null) return false;
  const parts = PROOF.exec(proof);
  return parts !== null && timingSafeEqual(Buffer.from(parts[2], "hex"), mac(secret, parts[1], queueName, body));
}

/** Stamps the proof on every queued message and refuses deliveries without a matching one. Mutates and returns `world`. */
export function authenticateWorkflowDeliveries<W extends DeliveryWorld>(world: W, secret: string): W {
  const queue = world.queue.bind(world);
  world.queue = (name, message, opts) =>
    queue(name, message, { ...opts, headers: { ...opts?.headers, [DELIVERY_HEADER]: deliveryProof(secret, name, transportBytes(message)) } });

  const createQueueHandler = world.createQueueHandler.bind(world);
  world.createQueueHandler = (prefix, handler) => {
    const route = createQueueHandler(prefix, handler);
    return async (req) => {
      const body = new Uint8Array(await req.clone().arrayBuffer());
      return validProof(req.headers.get(DELIVERY_HEADER), req.headers.get(QUEUE_NAME_HEADER), body, secret)
        ? await route(req)
        : Response.json({ error: "Untrusted workflow delivery." }, { status: 401 });
    };
  };

  // world-postgres's start() re-enqueues active runs past the stamped queue, so the route would refuse
  // those wakes. Its run listing answers empty while it starts, and the recovery runs here instead.
  const start = world.start?.bind(world);
  world.start = async () => {
    const list = world.runs.list;
    world.runs.list = async () => ({ data: [], cursor: null, hasMore: false });
    try {
      await start?.();
    } finally {
      world.runs.list = list;
    }
    await reenqueueActiveRuns(world.runs as never, world.queue as never, "world-postgres");
  };
  return world;
}

/**
 * The factory Eve's build output calls: refuses to start without AB_WORKFLOW_SECRET, and on a redeploy
 * releases the server's running jobs for retry before it exits (lib/sigterm-release.ts, ruling 91).
 */
export function createWorld() {
  const secret = workflowSecret();
  const world = authenticateWorkflowDeliveries(createPostgresWorld(), secret);
  releaseJobsOnSigterm();
  return world;
}
