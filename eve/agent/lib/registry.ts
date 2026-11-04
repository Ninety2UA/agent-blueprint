import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, open, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { IDLE_TIMEOUT_MS, SESSIONS_PER_ADDRESS, SESSIONS_PER_COOKIE, utcDay } from "./caps";

// The demo's app-wide registry (KTD13). Eve's durable state is per session and never reaches a
// helper copy, so the counts that span sessions live here: each session's cookie id, address,
// branch, stage, last activity and tokens, and the day's first 402 from the AI Gateway key.
// The whole registry is one JSON document behind one compare-and-set:
//   Vercel Blob   on Vercel: a private blob, written with If-Match on the ETag it was read at
//   file          everywhere else: .workflow-data/agent-blueprint/registry.json beside the app,
//                 for local dev and the mocked evals, written under an exclusive lock file
// The day rolls over at 00:00 UTC: the 402 mark clears and ended sessions older than 8 days go.
// The web gate reads it before a session starts; hooks/cap-guard.ts writes it as runs go.

export const REGISTRY_SCHEMA = 1;
const RETENTION_MS = 8 * 24 * 60 * 60 * 1_000;
const BLOB_PATH = "agent-blueprint/registry.json";
const CAS_ATTEMPTS = 50;

export type SessionStatus = "running" | "ended";
export type SessionOutcome = "token-cap" | "blocked" | "idle-ended" | "resting" | "done" | "completed" | "failed";

export interface SessionEntry {
  readonly sessionId: string;
  readonly cookieId: string;
  readonly address: string;
  readonly repository: string | null;
  readonly branch: string | null;
  readonly stage: string | null;
  /** The last commit pushed to the branch for this session, when one was. */
  readonly pushedSha: string | null;
  readonly startedAt: string;
  readonly lastActivity: string;
  /** New input tokens the session has used, as limits.sessionUsage counts them. */
  readonly tokens: number;
  readonly status: SessionStatus;
  readonly outcome: SessionOutcome | null;
  readonly endedAt: string | null;
}

export interface RegistryDocument {
  readonly schema: typeof REGISTRY_SCHEMA;
  /** The UTC day the document was last reset for. */
  readonly day: string;
  /** When the AI Gateway key first answered 402 on that day; null while the demo is open. */
  readonly restingSince: string | null;
  readonly sessions: Readonly<Record<string, SessionEntry>>;
}

export class RegistryConflictError extends Error {
  constructor() {
    super("the registry changed since it was read");
  }
}

/** One document, read with its version and written only if the version still matches. */
export interface RegistryBackend {
  read(): Promise<{ document: RegistryDocument; version: string } | null>;
  /** Writes when the stored version is `expected` (null: nothing stored yet); throws RegistryConflictError otherwise. */
  write(document: RegistryDocument, expected: string | null): Promise<void>;
}

export function emptyDocument(now: Date): RegistryDocument {
  return { schema: REGISTRY_SCHEMA, day: utcDay(now), restingSince: null, sessions: {} };
}

/** The UTC reset, the idle rule and the retention, applied before any read or change. */
export function settle(document: RegistryDocument, now: Date): RegistryDocument {
  let next = document;
  if (next.day !== utcDay(now)) next = { ...next, day: utcDay(now), restingSince: null };
  const sessions: Record<string, SessionEntry> = {};
  for (const [id, entry] of Object.entries(next.sessions)) {
    if (entry.status === "ended" && entry.endedAt && now.getTime() - Date.parse(entry.endedAt) > RETENTION_MS) continue;
    const idle = entry.status === "running" && now.getTime() - Date.parse(entry.lastActivity) >= IDLE_TIMEOUT_MS;
    sessions[id] = idle ? { ...entry, status: "ended", outcome: "idle-ended", endedAt: now.toISOString() } : entry;
  }
  return { ...next, sessions };
}

export type Admission =
  | { readonly kind: "admitted"; readonly entry: SessionEntry }
  | { readonly kind: "resting"; readonly since: string }
  | { readonly kind: "busy-cookie" }
  | { readonly kind: "busy-address" }
  | { readonly kind: "ended"; readonly entry: SessionEntry }
  | { readonly kind: "not-owner" };

export interface Caller {
  readonly sessionId: string;
  readonly cookieId: string;
  readonly address: string;
}

export class Registry {
  private readonly backend: RegistryBackend;
  private readonly clock: () => Date;

  constructor(backend: RegistryBackend, clock: () => Date = () => new Date()) {
    this.backend = backend;
    this.clock = clock;
  }

  /** The registry's clock: the time its idle rule and the gate's waits are read against. */
  now(): Date {
    return this.clock();
  }

  /** Reads the settled document; nothing is written. */
  async snapshot(): Promise<RegistryDocument> {
    const now = this.clock();
    const stored = await this.backend.read();
    return settle(stored?.document ?? emptyDocument(now), now);
  }

  /** Applies a change with compare-and-set, re-reading and re-applying on a conflict. */
  async change<T>(apply: (document: RegistryDocument, now: Date) => { document: RegistryDocument; result: T }): Promise<T> {
    for (let attempt = 0; attempt < CAS_ATTEMPTS; attempt += 1) {
      const now = this.clock();
      const stored = await this.backend.read();
      const { document, result } = apply(settle(stored?.document ?? emptyDocument(now), now), now);
      try {
        await this.backend.write(document, stored?.version ?? null);
        return result;
      } catch (error) {
        if (!(error instanceof RegistryConflictError)) throw error;
        await new Promise((resolve) => setTimeout(resolve, Math.random() * 20 * (attempt + 1)));
      }
    }
    throw new Error(`the registry stayed busy through ${CAS_ATTEMPTS} attempts`);
  }

  /**
   * Admits a session's turn: a session another cookie started is refused (ruling 52); the day's
   * 402 mark rests the demo; a session already ended stays ended; a new session is refused when
   * its cookie already has a running session or its address has two. An admitted session's
   * activity time moves to now.
   */
  admit(caller: Caller): Promise<Admission> {
    return this.change<Admission>((document, now) => {
      const refused = refusal(document, caller);
      if (refused) return { document, result: refused };
      const existing = document.sessions[caller.sessionId];
      const at = now.toISOString();
      const entry: SessionEntry = existing
        ? { ...existing, lastActivity: at }
        : {
            ...caller,
            repository: null,
            branch: null,
            stage: null,
            pushedSha: null,
            startedAt: at,
            lastActivity: at,
            tokens: 0,
            status: "running",
            outcome: null,
            endedAt: null,
          };
      return { document: withSession(document, entry), result: { kind: "admitted", entry } };
    });
  }

  /** Records the session's token total; a lower value than the stored one never wins. */
  recordTokens(sessionId: string, tokens: number): Promise<SessionEntry | null> {
    return this.update(sessionId, (entry, now) => ({ ...entry, tokens: Math.max(entry.tokens, tokens), lastActivity: now }));
  }

  /** Records where the run's work is: the repository, its branch and the last stage pushed. */
  recordProgress(
    sessionId: string,
    progress: { repository?: string | null; branch?: string | null; stage?: string | null; pushedSha?: string | null },
  ): Promise<SessionEntry | null> {
    return this.update(sessionId, (entry, now) => ({
      ...entry,
      repository: progress.repository ?? entry.repository,
      branch: progress.branch ?? entry.branch,
      stage: progress.stage ?? entry.stage,
      pushedSha: progress.pushedSha ?? entry.pushedSha ?? null,
      lastActivity: now,
    }));
  }

  /** Ends a session with its outcome; the first outcome recorded stays. */
  end(sessionId: string, outcome: SessionOutcome): Promise<SessionEntry | null> {
    return this.update(sessionId, (entry, now) =>
      entry.status === "ended" ? entry : { ...entry, status: "ended", outcome, endedAt: now, lastActivity: now },
    );
  }

  /** Records the day's first 402; later ones keep the first time. */
  markResting(): Promise<string> {
    return this.change((document, now) => {
      const since = document.restingSince ?? now.toISOString();
      return { document: { ...document, restingSince: since }, result: since };
    });
  }

  private update(sessionId: string, apply: (entry: SessionEntry, now: string) => SessionEntry): Promise<SessionEntry | null> {
    return this.change((document, now) => {
      const entry = document.sessions[sessionId];
      if (!entry) return { document, result: null };
      const next = apply(entry, now.toISOString());
      return { document: withSession(document, next), result: next };
    });
  }
}

/** Why a turn of this caller's session would not be admitted, or null when it would. */
export function refusal(document: RegistryDocument, caller: Caller): Exclude<Admission, { kind: "admitted" }> | null {
  const existing = document.sessions[caller.sessionId];
  if (existing && existing.cookieId !== caller.cookieId) return { kind: "not-owner" };
  if (existing?.status === "ended") return { kind: "ended", entry: existing };
  if (document.restingSince) return { kind: "resting", since: document.restingSince };
  if (existing) return null;
  const running = Object.values(document.sessions).filter((entry) => entry.status === "running");
  if (running.filter((entry) => entry.cookieId === caller.cookieId).length >= SESSIONS_PER_COOKIE) return { kind: "busy-cookie" };
  if (running.filter((entry) => entry.address === caller.address).length >= SESSIONS_PER_ADDRESS) return { kind: "busy-address" };
  return null;
}

function withSession(document: RegistryDocument, entry: SessionEntry): RegistryDocument {
  return { ...document, sessions: { ...document.sessions, [entry.sessionId]: entry } };
}

/** The local backend: one JSON file, its revision in the file, each write under an exclusive lock. */
export function fileBackend(path: string): RegistryBackend {
  const lock = `${path}.lock`;
  const readStored = async () => {
    try {
      const stored = JSON.parse(await readFile(path, "utf8")) as { revision: string; document: RegistryDocument };
      return { document: stored.document, version: stored.revision };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  };
  return {
    read: readStored,
    async write(document, expected) {
      await mkdir(dirname(path), { recursive: true });
      const handle = await acquire(lock);
      try {
        const current = await readStored();
        if ((current?.version ?? null) !== expected) throw new RegistryConflictError();
        const temp = `${path}.${randomUUID()}.tmp`;
        await writeFile(temp, JSON.stringify({ revision: randomUUID(), document }));
        await rename(temp, path);
      } finally {
        await handle.close();
        await rm(lock, { force: true });
      }
    },
  };
}

async function acquire(lock: string) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await open(lock, "wx");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      // A lock left by a process that died mid-write is taken over after five seconds.
      const age = await stat(lock).then((info) => Date.now() - info.mtimeMs, () => 0);
      if (age > 5_000) await rm(lock, { force: true });
      if (attempt > 2_000) throw new Error(`the registry lock ${lock} stayed held`);
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }
}

type BlobClient = Pick<typeof import("@vercel/blob"), "get" | "put" | "BlobPreconditionFailedError" | "BlobError">;

/** The strong form of an ETag: Blob's If-Match never matches a weak one (W/"..."). */
export function strongEtag(etag: string): string {
  return etag.replace(/^W\//, "");
}

/**
 * The Vercel backend: a private blob, created only if absent and replaced only at the ETag it was read at.
 * Blob answered the demo's compressed reads with a weak ETag and refused every write made at it
 * (ruling 66), so the read asks for the bytes as stored and the version is the ETag's strong form.
 */
export function blobBackend(pathname: string = BLOB_PATH, client: () => Promise<BlobClient> = () => import("@vercel/blob")): RegistryBackend {
  return {
    async read() {
      const { get } = await client();
      const found = await get(pathname, { access: "private", useCache: false, headers: { "accept-encoding": "identity" } });
      if (!found || found.statusCode !== 200 || !found.stream) return null;
      const text = await new Response(found.stream).text();
      return { document: JSON.parse(text) as RegistryDocument, version: strongEtag(found.blob.etag) };
    },
    async write(document, expected) {
      const { put, BlobPreconditionFailedError, BlobError } = await client();
      try {
        await put(pathname, JSON.stringify(document), {
          access: "private",
          addRandomSuffix: false,
          contentType: "application/json",
          ...(expected === null ? { allowOverwrite: false } : { allowOverwrite: true, ifMatch: expected }),
        });
      } catch (error) {
        if (error instanceof BlobPreconditionFailedError) throw new RegistryConflictError();
        if (expected === null && error instanceof BlobError && /already exists/i.test(error.message)) throw new RegistryConflictError();
        throw error;
      }
    },
  };
}

/** The folder of the eve app: the nearest one up from here with agent/agent.ts. */
export function appRoot(start: string = process.cwd()): string {
  for (let dir = start; ; dir = dirname(dir)) {
    if (existsSync(join(dir, "agent", "agent.ts")) && existsSync(join(dir, "package.json"))) return dir;
    if (dirname(dir) === dir) return start;
  }
}

/** Blob on Vercel, the file under .workflow-data/ everywhere else. */
export function defaultRegistry(env: NodeJS.ProcessEnv = process.env): Registry {
  if (env.VERCEL) {
    if (!env.BLOB_READ_WRITE_TOKEN && !env.BLOB_STORE_ID) {
      throw new Error("The demo's registry needs a Vercel Blob store connected to this project (BLOB_READ_WRITE_TOKEN or BLOB_STORE_ID).");
    }
    return new Registry(blobBackend());
  }
  return new Registry(fileBackend(join(appRoot(), ".workflow-data", "agent-blueprint", "registry.json")));
}
