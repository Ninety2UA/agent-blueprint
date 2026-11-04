import { createHash, randomUUID } from "node:crypto";
import type { SandboxNetworkPolicy, SandboxProcess } from "eve/sandbox";
import {
  defineSandboxProvider,
  SANDBOX_AGENT_ENV,
  SandboxSessionGoneError,
  type SandboxConnection,
  type SandboxPrepareContext,
  type SandboxSessionContext,
} from "eve/sandbox/provider";

// The Daytona sandbox (KTD7), on eve's custom-provider contract. `eve build` runs prepare:
// a build sandbox from eve's default image, seeded by ctx.populate (workspace, skills and
// the authored prepare, which installs git, gh and python3), captured as a Daytona
// snapshot. Each session then gets its own sandbox from that snapshot, named from the
// session id; resume restarts a stopped one, and session end deletes it. Commands run in
// the sandbox's working directory, which is the workspace root.

// The parts of @daytona/sdk this provider calls. The SDK's Daytona client satisfies it
// (sandbox.ts assigns one); tests pass a stub.
export interface DaytonaBox {
  readonly name: string;
  readonly state?: string;
  start(timeout?: number): Promise<void>;
  stop(timeout?: number): Promise<void>;
  refreshData(): Promise<void>;
  getWorkDir(): Promise<string | undefined>;
  createSnapshot(name: string, timeout?: number): Promise<void>;
  readonly process: {
    createSession(sessionId: string): Promise<void>;
    deleteSession(sessionId: string): Promise<void>;
    executeSessionCommand(sessionId: string, request: { command: string; runAsync?: boolean }): Promise<{ cmdId: string }>;
    getSessionCommandLogs(
      sessionId: string,
      commandId: string,
      onStdout: (chunk: string) => void,
      onStderr: (chunk: string) => void,
    ): Promise<void>;
    getSessionCommand(sessionId: string, commandId: string): Promise<{ exitCode?: number | null }>;
    executeCommand(command: string): Promise<{ exitCode: number; result: string }>;
  };
  readonly fs: {
    downloadFile(path: string): Promise<Buffer>;
    uploadFiles(files: { source: Buffer; destination: string }[]): Promise<void>;
  };
}

export interface DaytonaCreate {
  readonly name: string;
  readonly image?: string;
  readonly snapshot?: string;
  readonly envVars: Record<string, string>;
  readonly labels?: Record<string, string>;
  readonly domainAllowList?: string;
  readonly networkBlockAll?: boolean;
}

export interface DaytonaApi {
  create(params: DaytonaCreate, options?: { timeout?: number }): Promise<DaytonaBox>;
  get(sandboxIdOrName: string): Promise<DaytonaBox>;
  delete(sandbox: DaytonaBox, timeout?: number): Promise<void>;
  readonly snapshot: { get(name: string): Promise<{ name: string }> };
}

export interface DaytonaEnvironmentOptions {
  /** Defaults to DAYTONA_API_KEY. */
  readonly apiKey?: string;
  /** Replaces the SDK client, for tests. */
  readonly client?: DaytonaApi;
}

export interface DaytonaOpenOptions {
  readonly networkPolicy?: SandboxNetworkPolicy;
}

type Artifact = { readonly snapshot: string };
type State = { readonly name: string; readonly workspaceRoot: string | null };

// eve's default sandbox image, the one Docker and Vercel Sandbox start from. eve does not
// export it, so this follows its rule: the tag eve 0.86.0 pins, or EVE_SANDBOX_IMAGE_TAG.
// Check the tag when eve is upgraded.
export const EVE_IMAGE = `ghcr.io/vercel/eve:${process.env.EVE_SANDBOX_IMAGE_TAG?.trim() || "dockerfile-fc0279bf1664"}`;

const GONE = new Set(["destroyed", "destroying"]);
const POLL_MS = 250;

function notFound(error: unknown): boolean {
  const status = (error as { statusCode?: number } | null)?.statusCode;
  return status === 404 || (error instanceof Error && /NotFoundError$/.test(error.name));
}

function conflict(error: unknown): boolean {
  return (error as { statusCode?: number } | null)?.statusCode === 409;
}

// Daytona tiers 1 and 2 refuse a per-sandbox allow-list outright (400, "cannot be overridden at the
// sandbox level") and apply the organisation's own restricted policy instead.
function allowListRefused(error: unknown): boolean {
  return (error as { statusCode?: number } | null)?.statusCode === 400 && error instanceof Error && /cannot be overridden at the sandbox level/i.test(error.message);
}

function quote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

/** Session ids can be long, so they are hashed into a bounded sandbox name. */
export function sandboxName(sessionId: string): string {
  return `eve-${createHash("sha256").update(sessionId).digest("hex").slice(0, 32)}`;
}

/**
 * Daytona's network settings for eve's policy: an allow-list becomes domainAllowList and
 * deny-all becomes networkBlockAll. Daytona applies them on tiers 3 and 4 only; tiers 1
 * and 2 keep the organisation's policy. Rules on a domain (header transforms, forwarding)
 * and subnets are refused, since Daytona cannot enforce them.
 */
export function daytonaNetwork(policy: SandboxNetworkPolicy | undefined): { domainAllowList?: string; networkBlockAll?: boolean } {
  if (policy === undefined || policy === "allow-all") return {};
  if (policy === "deny-all") return { networkBlockAll: true };
  if (policy.subnets) throw new Error("The Daytona sandbox cannot apply subnet rules.");
  const allow = policy.allow ?? [];
  let domains: string[];
  if (Array.isArray(allow)) {
    domains = [...(allow as readonly string[])];
  } else {
    const rules = allow as Readonly<Record<string, readonly unknown[]>>;
    for (const [domain, list] of Object.entries(rules)) {
      if (list.length) throw new Error(`The Daytona sandbox cannot apply request rules such as header transforms; ${domain} has ${list.length}.`);
    }
    domains = Object.keys(rules);
  }
  // An empty domainAllowList counts as unset at Daytona, which would allow everything.
  return domains.length ? { domainAllowList: domains.join(",") } : { networkBlockAll: true };
}

function streamPair() {
  let out!: ReadableStreamDefaultController<Uint8Array>;
  let err!: ReadableStreamDefaultController<Uint8Array>;
  const stdout = new ReadableStream<Uint8Array>({ start: (controller) => void (out = controller) });
  const stderr = new ReadableStream<Uint8Array>({ start: (controller) => void (err = controller) });
  return { stdout, stderr, out, err };
}

async function spawn(
  box: DaytonaBox,
  options: { command: string; env: Readonly<Record<string, string>>; workingDirectory: string; signal?: AbortSignal; stdin?: boolean },
): Promise<SandboxProcess> {
  if (options.stdin) throw new Error("The Daytona sandbox has no stdin stream for a process.");
  // A session per process: its id is the handle that kill() ends.
  const sessionId = `eve-${randomUUID()}`;
  await box.process.createSession(sessionId);
  const env = Object.entries(options.env).map(([name, value]) => `${name}=${quote(value)}`);
  const command = `cd ${quote(options.workingDirectory)} && ${env.length ? `env ${env.join(" ")} ` : ""}bash -lc ${quote(options.command)}`;
  const { cmdId } = await box.process.executeSessionCommand(sessionId, { command, runAsync: true });

  const encoder = new TextEncoder();
  const { stdout, stderr, out, err } = streamPair();
  const logs = box.process
    .getSessionCommandLogs(sessionId, cmdId, (chunk) => out.enqueue(encoder.encode(chunk)), (chunk) => err.enqueue(encoder.encode(chunk)))
    .finally(() => {
      out.close();
      err.close();
    });

  let ended = false;
  const kill = async () => {
    if (ended) return;
    ended = true;
    await box.process.deleteSession(sessionId).catch(() => undefined);
  };
  options.signal?.addEventListener("abort", () => void kill(), { once: true });

  let exit: Promise<{ exitCode: number }> | undefined;
  const wait = () =>
    (exit ??= (async () => {
      await logs.catch(() => undefined);
      for (;;) {
        const { exitCode } = await box.process.getSessionCommand(sessionId, cmdId);
        if (typeof exitCode === "number") {
          await kill();
          return { exitCode };
        }
        if (ended) return { exitCode: 137 };
        await new Promise((resolve) => setTimeout(resolve, POLL_MS));
      }
    })());
  return { stdout, stderr, wait, kill };
}

export function connect(box: DaytonaBox, workspaceRoot: string | null): SandboxConnection {
  return {
    // Unset, eve uses /workspace, which is eve's image's own working directory.
    ...(workspaceRoot ? { workspaceRoot } : {}),
    spawn: (options) => spawn(box, options),
    async readFile({ path }) {
      try {
        return new Uint8Array(await box.fs.downloadFile(path));
      } catch (error) {
        if (notFound(error)) return null;
        throw error;
      }
    },
    async writeFiles({ files }) {
      if (!files.length) return;
      const folders = [...new Set(files.map((file) => file.path.slice(0, file.path.lastIndexOf("/")) || "/"))];
      const made = await box.process.executeCommand(`mkdir -p -- ${folders.map(quote).join(" ")}`);
      if (made.exitCode !== 0) throw new Error(`creating ${folders.join(", ")} failed: ${made.result}`);
      await box.fs.uploadFiles(files.map((file) => ({ source: Buffer.from(file.content), destination: file.path })));
    },
    async removePath({ path, force, recursive }) {
      const flags = `${recursive ? "-r" : "-d"}${force ? "f" : ""}`;
      const removed = await box.process.executeCommand(`rm ${flags} -- ${quote(path)}`);
      if (removed.exitCode !== 0) throw new Error(`removing ${path} failed: ${removed.result}`);
    },
    async stop() {
      await box.refreshData();
      if (box.state === "stopped" || box.state === "archived") return;
      await box.stop();
    },
  };
}

/** The lifecycle, exported so tests can drive it with a stub client. */
export function daytonaLifecycle(options: DaytonaEnvironmentOptions) {
  let cached: DaytonaApi | undefined = options.client;
  const client = async (): Promise<DaytonaApi> => {
    if (cached) return cached;
    const apiKey = options.apiKey ?? process.env.DAYTONA_API_KEY?.trim();
    if (!apiKey) throw new Error("DAYTONA_API_KEY is not set; the Daytona sandbox needs it at eve build and at run time.");
    const { Daytona } = await import("@daytona/sdk");
    const sdk: DaytonaApi = new Daytona({ apiKey });
    cached = sdk;
    return sdk;
  };

  async function findBox(api: DaytonaApi, name: string): Promise<DaytonaBox | null> {
    try {
      const box = await api.get(name);
      return box.state && GONE.has(box.state) ? null : box;
    } catch (error) {
      if (notFound(error)) return null;
      throw error;
    }
  }

  async function running(box: DaytonaBox): Promise<DaytonaBox> {
    if (box.state !== "started") await box.start();
    return box;
  }

  return {
    async prepare(ctx: SandboxPrepareContext): Promise<Artifact> {
      const api = await client();
      const snapshot = `eve-tpl-${ctx.templateKey({ provider: "daytona", image: EVE_IMAGE, version: 1 }).slice(0, 32)}`;
      try {
        await api.snapshot.get(snapshot);
        ctx.log(`daytona: snapshot ${snapshot} exists`);
        return { snapshot };
      } catch (error) {
        if (!notFound(error)) throw error;
      }
      ctx.log(`daytona: building snapshot ${snapshot} from ${EVE_IMAGE}`);
      const box = await api.create({ name: `${snapshot}-build`, image: EVE_IMAGE, envVars: { ...SANDBOX_AGENT_ENV } }, { timeout: 600 });
      try {
        await ctx.populate(connect(box, (await box.getWorkDir()) ?? null));
        await box.createSnapshot(snapshot, 900);
      } finally {
        await api.delete(box, 120);
      }
      return { snapshot };
    },

    async start(ctx: SandboxSessionContext, open: Readonly<DaytonaOpenOptions> | undefined, artifact: Readonly<Artifact>) {
      const api = await client();
      const name = sandboxName(ctx.session.id);
      let box = await findBox(api, name);
      if (!box) {
        const params = { name, snapshot: artifact.snapshot, envVars: { ...SANDBOX_AGENT_ENV }, labels: { "eve-sandbox": name } };
        const network = daytonaNetwork(open?.networkPolicy);
        try {
          try {
            box = await api.create({ ...params, ...network });
          } catch (error) {
            // Only an allow-list falls back; deny-all must hold or fail.
            if (network.domainAllowList === undefined || !allowListRefused(error)) throw error;
            console.warn("[daytona] this Daytona tier refuses a per-sandbox allow-list; the sandbox runs under the organisation's network policy");
            box = await api.create(params);
          }
        } catch (error) {
          // Another caller created it first; the upsert returns that one.
          if (!conflict(error)) throw error;
          box = await findBox(api, name);
          if (!box) throw error;
        }
      }
      await running(box);
      const state: State = { name, workspaceRoot: (await box.getWorkDir()) ?? null };
      return { connection: connect(box, state.workspaceRoot), state };
    },

    async resume(_ctx: SandboxSessionContext, _artifact: Readonly<Artifact>, state: Readonly<State>) {
      if (typeof state?.name !== "string") throw new SandboxSessionGoneError("The recorded Daytona sandbox state has no name.");
      const box = await findBox(await client(), state.name);
      if (!box) throw new SandboxSessionGoneError(`Daytona sandbox "${state.name}" is gone.`);
      // A stopped (or auto-stopped, or archived) sandbox keeps its files; start it again.
      await running(box);
      return connect(box, state.workspaceRoot ?? null);
    },

    async onSessionEnd(ctx: SandboxSessionContext, state: Readonly<State> | null) {
      const api = await client();
      const box = await findBox(api, state?.name ?? sandboxName(ctx.session.id));
      if (!box) return;
      try {
        await api.delete(box, 120);
      } catch (error) {
        if (!notFound(error)) throw error;
      }
    },
  };
}

export const DaytonaSandbox = defineSandboxProvider({
  name: "daytona",
  stateProtocolVersion: 1,
  environment: (options: DaytonaEnvironmentOptions) => daytonaLifecycle(options),
});
