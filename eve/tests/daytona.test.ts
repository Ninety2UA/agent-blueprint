// The Daytona provider driven at eve's contract boundary with a stubbed SDK client: no
// Daytona account, no sandbox spend. The real run waits for approval (see the U7 notes).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { SandboxConnection, SandboxPrepareContext, SandboxSessionContext } from "eve/sandbox/provider";
import {
  EVE_IMAGE,
  connect,
  daytonaLifecycle,
  daytonaNetwork,
  sandboxName,
  type DaytonaApi,
  type DaytonaBox,
  type DaytonaCreate,
} from "../agent/sandbox/providers/daytona.ts";

// The SDK's errors carry the HTTP status as statusCode.
class HttpError extends Error {
  readonly statusCode: number;
  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
}

interface StubBox extends DaytonaBox {
  state: string;
  calls: string[];
  files: Map<string, Buffer>;
}

function stubBox(name: string, state = "started"): StubBox {
  const calls: string[] = [];
  const files = new Map<string, Buffer>();
  const box: StubBox = {
    name,
    state,
    calls,
    files,
    start: async () => {
      calls.push("start");
      box.state = "started";
    },
    stop: async () => {
      calls.push("stop");
      box.state = "stopped";
    },
    refreshData: async () => undefined,
    getWorkDir: async () => "/home/daytona/workspace",
    createSnapshot: async (snapshot) => void calls.push(`snapshot ${snapshot}`),
    process: {
      createSession: async (id) => void calls.push(`session ${id}`),
      deleteSession: async (id) => void calls.push(`end ${id}`),
      executeSessionCommand: async (_id, request) => {
        calls.push(`exec ${request.command} async=${request.runAsync}`);
        return { cmdId: "cmd-1" };
      },
      getSessionCommandLogs: async (_id, _cmd, onStdout, onStderr) => {
        onStdout("hello ");
        onStdout("world\n");
        onStderr("warning\n");
      },
      getSessionCommand: async () => ({ exitCode: 3 }),
      executeCommand: async (command) => {
        calls.push(`run ${command}`);
        return { exitCode: 0, result: "" };
      },
    },
    fs: {
      downloadFile: async (path) => {
        const file = files.get(path);
        if (!file) throw new HttpError(`File not found: ${path}`, 404);
        return file;
      },
      uploadFiles: async (uploads) => {
        for (const upload of uploads) files.set(upload.destination, upload.source);
      },
    },
  };
  return box;
}

function stubClient(existing: StubBox[] = [], snapshots: string[] = []) {
  const boxes = new Map(existing.map((box) => [box.name, box]));
  const created: DaytonaCreate[] = [];
  const deleted: string[] = [];
  const client: DaytonaApi = {
    create: async (params) => {
      created.push(params);
      const box = stubBox(params.name);
      boxes.set(params.name, box);
      return box;
    },
    get: async (name) => {
      const box = boxes.get(name);
      if (!box) throw new HttpError(`Sandbox ${name} not found`, 404);
      return box;
    },
    delete: async (box) => {
      deleted.push(box.name);
      boxes.delete(box.name);
    },
    snapshot: {
      get: async (name) => {
        if (!snapshots.includes(name)) throw new HttpError(`Snapshot ${name} not found`, 404);
        return { name };
      },
    },
  };
  return { client, boxes, created, deleted };
}

const session = (id: string) => ({ session: { id }, kind: "session" }) as unknown as SandboxSessionContext;
const ARTIFACT = { snapshot: "eve-tpl-abc" };

async function text(stream: ReadableStream<Uint8Array>): Promise<string> {
  return new Response(stream).text();
}

describe("daytona provider", () => {
  test("no key: start fails with a message naming the variable", async () => {
    const saved = process.env.DAYTONA_API_KEY;
    delete process.env.DAYTONA_API_KEY;
    try {
      await assert.rejects(daytonaLifecycle({}).start(session("s1"), undefined, ARTIFACT), /DAYTONA_API_KEY is not set/);
    } finally {
      if (saved !== undefined) process.env.DAYTONA_API_KEY = saved;
    }
  });

  test("start creates one sandbox per session from the snapshot, with the allow-list, and reuses it", async () => {
    const { client, created } = stubClient();
    const lifecycle = daytonaLifecycle({ client });
    const open = { networkPolicy: { allow: ["github.com", "api.github.com", "pypi.org"] } };
    const first = await lifecycle.start(session("session-1"), open, ARTIFACT);
    const again = await lifecycle.start(session("session-1"), open, ARTIFACT);
    assert.equal(created.length, 1);
    assert.deepEqual(created[0], {
      name: sandboxName("session-1"),
      snapshot: "eve-tpl-abc",
      envVars: { AI_AGENT: "eve" },
      labels: { "eve-sandbox": sandboxName("session-1") },
      domainAllowList: "github.com,api.github.com,pypi.org",
    });
    assert.deepEqual(first.state, { name: sandboxName("session-1"), workspaceRoot: "/home/daytona/workspace" });
    assert.deepEqual(again.state, first.state);
    assert.equal(first.connection.workspaceRoot, "/home/daytona/workspace", "the working directory is the workspace root");
  });

  test("a create that loses a race returns the sandbox the other caller made", async () => {
    const { client, boxes } = stubClient();
    const racing: DaytonaApi = {
      ...client,
      create: async (params) => {
        boxes.set(params.name, stubBox(params.name));
        throw new HttpError("Sandbox with this name already exists", 409);
      },
    };
    const started = await daytonaLifecycle({ client: racing }).start(session("s2"), undefined, ARTIFACT);
    assert.equal(started.state.name, sandboxName("s2"));
  });

  test("a tier that refuses a sandbox allow-list gets the sandbox without it; deny-all never drops", async () => {
    const refusal = () => Object.assign(new Error("Network access is restricted and cannot be overridden at the sandbox level. Remove domainAllowList from the request."), { name: "DaytonaValidationError", statusCode: 400 });
    const { client, created } = stubClient();
    const tiered: DaytonaApi = {
      ...client,
      create: async (params) => {
        if (params.domainAllowList !== undefined || params.networkBlockAll !== undefined) {
          created.push(params);
          throw refusal();
        }
        return client.create(params);
      },
    };
    const warned: string[] = [];
    const saved = console.warn;
    console.warn = (...args: unknown[]) => void warned.push(args.join(" "));
    try {
      const started = await daytonaLifecycle({ client: tiered }).start(session("s4"), { networkPolicy: { allow: ["github.com"] } }, ARTIFACT);
      assert.equal(started.state.name, sandboxName("s4"));
      assert.equal(created.length, 2, "one refused create with the list, one without it");
      assert.equal(created[0].domainAllowList, "github.com");
      assert.equal(created[1].domainAllowList, undefined);
      assert.match(warned.join("\n"), /\[daytona\].*organisation's network policy/);
      await assert.rejects(daytonaLifecycle({ client: tiered }).start(session("s5"), { networkPolicy: "deny-all" }, ARTIFACT), /cannot be overridden/);
    } finally {
      console.warn = saved;
    }
  });

  test("resume restarts a stopped sandbox and throws the gone error only when it is deleted", async () => {
    const stopped = stubBox(sandboxName("s3"), "stopped");
    const { client, boxes } = stubClient([stopped]);
    const lifecycle = daytonaLifecycle({ client });
    const state = { name: stopped.name, workspaceRoot: "/home/daytona/workspace" };
    await lifecycle.resume(session("s3"), ARTIFACT, state);
    assert.deepEqual(stopped.calls, ["start"]);
    assert.equal(stopped.state, "started");

    boxes.delete(stopped.name);
    await assert.rejects(lifecycle.resume(session("s3"), ARTIFACT, state), (error: Error) => error.name === "SandboxSessionGoneError");
    boxes.set(stopped.name, Object.assign(stubBox(stopped.name), { state: "destroyed" }));
    await assert.rejects(lifecycle.resume(session("s3"), ARTIFACT, state), (error: Error) => error.name === "SandboxSessionGoneError");
  });

  test("session end deletes the sandbox, by state or by session id, and succeeds when nothing exists", async () => {
    const { client, deleted } = stubClient([stubBox(sandboxName("s4")), stubBox(sandboxName("s5"))]);
    const lifecycle = daytonaLifecycle({ client });
    await lifecycle.onSessionEnd(session("s4"), { name: sandboxName("s4"), workspaceRoot: null });
    await lifecycle.onSessionEnd(session("s5"), null);
    await lifecycle.onSessionEnd(session("s5"), null);
    assert.deepEqual(deleted, [sandboxName("s4"), sandboxName("s5")]);
  });

  test("prepare builds a snapshot from eve's image through populate, deletes the build sandbox, and reuses a snapshot", async () => {
    const { client, created, deleted, boxes } = stubClient();
    const populated: SandboxConnection[] = [];
    const ctx = {
      templateKey: () => "f".repeat(64),
      log: () => undefined,
      populate: async (connection: SandboxConnection) => void populated.push(connection),
    } as unknown as SandboxPrepareContext;
    const artifact = await daytonaLifecycle({ client }).prepare(ctx);
    const snapshot = `eve-tpl-${"f".repeat(32)}`;
    assert.deepEqual(artifact, { snapshot });
    assert.equal(created[0].image, EVE_IMAGE);
    assert.match(EVE_IMAGE, /^ghcr\.io\/vercel\/eve:dockerfile-/);
    assert.equal(populated.length, 1);
    assert.equal(populated[0].workspaceRoot, "/home/daytona/workspace");
    assert.deepEqual(deleted, [`${snapshot}-build`]);
    assert.equal(boxes.size, 0);

    const reuse = stubClient([], [snapshot]);
    assert.deepEqual(await daytonaLifecycle({ client: reuse.client }).prepare(ctx), { snapshot });
    assert.equal(reuse.created.length, 0);
  });

  test("the connection maps spawn, read, write, remove and stop onto the SDK", async () => {
    const box = stubBox("eve-x");
    const live = connect(box, "/home/daytona/workspace");

    const child = await live.spawn({ command: "echo 'hi'", env: { GIT_TERMINAL_PROMPT: "0" }, workingDirectory: "/home/daytona/workspace/src" });
    const [stdout, stderr, exit] = await Promise.all([text(child.stdout), text(child.stderr), child.wait()]);
    assert.equal(stdout, "hello world\n");
    assert.equal(stderr, "warning\n");
    assert.deepEqual(exit, { exitCode: 3 });
    const exec = box.calls.find((call) => call.startsWith("exec "));
    assert.equal(exec, `exec cd '/home/daytona/workspace/src' && env GIT_TERMINAL_PROMPT='0' bash -lc 'echo '\\''hi'\\''' async=true`);
    assert.ok(box.calls.some((call) => call.startsWith("end eve-")), "the process's session is ended");
    await assert.rejects(live.spawn({ command: "cat", env: {}, workingDirectory: "/", stdin: true }), /no stdin/);

    await live.writeFiles({ files: [{ path: "/home/daytona/workspace/a/b.txt", content: new TextEncoder().encode("bytes") }] });
    assert.ok(box.calls.includes("run mkdir -p -- '/home/daytona/workspace/a'"));
    assert.equal(new TextDecoder().decode((await live.readFile({ path: "/home/daytona/workspace/a/b.txt" })) as Uint8Array), "bytes");
    assert.equal(await live.readFile({ path: "/missing" }), null);

    await live.removePath({ path: "/home/daytona/workspace/a", recursive: true, force: true });
    await live.removePath({ path: "/home/daytona/workspace/x.txt" });
    assert.ok(box.calls.includes("run rm -rf -- '/home/daytona/workspace/a'"));
    assert.ok(box.calls.includes("run rm -d -- '/home/daytona/workspace/x.txt'"));

    await live.stop();
    await live.stop();
    assert.equal(box.calls.filter((call) => call === "stop").length, 1, "stop is a no-op on a stopped sandbox");
  });

  test("network: deny-all blocks all, transforms and subnets are refused", () => {
    assert.deepEqual(daytonaNetwork(undefined), {});
    assert.deepEqual(daytonaNetwork("allow-all"), {});
    assert.deepEqual(daytonaNetwork("deny-all"), { networkBlockAll: true });
    assert.deepEqual(daytonaNetwork({ allow: [] }), { networkBlockAll: true });
    assert.deepEqual(daytonaNetwork({ allow: { "github.com": [], "pypi.org": [] } }), { domainAllowList: "github.com,pypi.org" });
    assert.throws(
      () => daytonaNetwork({ allow: { "github.com": [{ transform: [{ headers: { authorization: "x" } }] }] } }),
      /cannot apply request rules/,
    );
    assert.throws(() => daytonaNetwork({ subnets: { allow: ["10.0.0.0/8"] } }), /subnet/);
  });
});
