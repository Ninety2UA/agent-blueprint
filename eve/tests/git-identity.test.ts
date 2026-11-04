// The clone's git identity (ruling 65): a repository with no identity gets the fixed one in its
// local config; a configured one is left as it is. Ruling 76: when the agent supplied it, every
// command the bash tool runs carries git's identity variables, so the model cannot replace it by
// config. Real git in a scratch repository, with the machine's own global and system config kept
// out, and Eve's own bash executor on a sandbox that runs commands on this machine.
import assert from "node:assert/strict";
import { execFile, execFileSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { after, describe, test } from "node:test";
import type { SandboxCommandResult, SandboxRunOptions } from "eve/sandbox";
import type { ToolContext } from "eve/tools";

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
const { GIT_IDENTITY, IDENTITY_MARK, ensureGitIdentity, identityEnv, readIdentityOwner } = await import("../agent/lib/git-identity.ts");
const { withIdentity } = await import("../agent/tools/bash.ts");
const { bash } = await import("eve/tools/bash");
type IdentityOwner = Awaited<ReturnType<typeof readIdentityOwner>>;

const scratch = mkdtempSync(join(tmpdir(), "ab-identity-"));
after(() => rmSync(scratch, { recursive: true, force: true }));
const globalConfig = join(scratch, "gitconfig");
writeFileSync(globalConfig, "");
const env: NodeJS.ProcessEnv = { ...process.env, GIT_CONFIG_GLOBAL: globalConfig, GIT_CONFIG_NOSYSTEM: "1", HOME: scratch };
const IDENTITY_VARIABLES = ["GIT_AUTHOR_NAME", "GIT_AUTHOR_EMAIL", "GIT_COMMITTER_NAME", "GIT_COMMITTER_EMAIL"];
for (const name of IDENTITY_VARIABLES) delete env[name];

let repositories = 0;
function repository(): string {
  const root = join(scratch, `repo-${(repositories += 1)}`);
  execFileSync("git", ["init", "-q", root], { env });
  return root;
}

interface Calls {
  runs: SandboxRunOptions[];
  spawns: SandboxRunOptions[];
}

function sandbox(root: string, calls: Calls = { runs: [], spawns: [] }) {
  return {
    run: (options: SandboxRunOptions) => {
      calls.runs.push(options);
      return new Promise<SandboxCommandResult>((resolve) => {
        execFile("bash", ["-c", options.command], { cwd: root, env: { ...env, ...options.env } }, (error, stdout, stderr) => {
          resolve({ exitCode: error ? (typeof error.code === "number" ? error.code : 1) : 0, stdout, stderr });
        });
      });
    },
    spawn: async (options: SandboxRunOptions) => {
      calls.spawns.push(options);
      const child = spawn("bash", ["-c", options.command], { cwd: root, env: { ...env, ...options.env } });
      const exited = new Promise<{ exitCode: number }>((resolve) => child.on("close", (code) => resolve({ exitCode: code ?? 1 })));
      return {
        pid: child.pid,
        stdout: Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>,
        stderr: Readable.toWeb(child.stderr) as ReadableStream<Uint8Array>,
        wait: () => exited,
        kill: async () => void child.kill(),
      };
    },
  };
}

const local = (root: string, key: string) => {
  try {
    return execFileSync("git", ["config", "--local", key], { cwd: root, env, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
};

const lastCommit = (root: string) =>
  execFileSync("git", ["log", "-1", "--format=%an <%ae>|%cn <%ce>"], { cwd: root, env, encoding: "utf8" }).trim();

const OURS = `${GIT_IDENTITY.name} <${GIT_IDENTITY.email}>`;

function store(initial: IdentityOwner = null) {
  let owner = initial;
  return { get: () => owner, set: (next: IdentityOwner) => void (owner = next) };
}

/** One command through the bash tool's path: the identity wrapper, then Eve's own bash executor. */
async function runBash(root: string, command: string, owners: ReturnType<typeof store>, calls: Calls = { runs: [], spawns: [] }) {
  const box = sandbox(root, calls);
  const ctx = { getSandbox: async () => box, abortSignal: new AbortController().signal } as unknown as ToolContext;
  const result = await bash.execute({ command }, await withIdentity(ctx, owners));
  return result as { status: string; exitCode: number; stdout: string; stderr: string };
}

describe("the clone's git identity", () => {
  test("no identity: the fixed one and the mark are written to the local config, and a commit carries it", async () => {
    const root = repository();
    assert.equal(await ensureGitIdentity(sandbox(root)), true);
    assert.equal(local(root, "user.name"), "Agent Blueprint");
    assert.equal(local(root, "user.email"), "agent-blueprint@users.noreply.github.com");
    assert.equal(local(root, IDENTITY_MARK), "supplied");
    assert.deepEqual(GIT_IDENTITY, { name: "Agent Blueprint", email: "agent-blueprint@users.noreply.github.com" });
    execFileSync("git", ["commit", "-q", "--allow-empty", "-m", "probe"], { cwd: root, env });
    assert.equal(lastCommit(root), `${OURS}|${OURS}`);
  });

  test("a local identity stays as it is", async () => {
    const root = repository();
    execFileSync("git", ["config", "--local", "user.name", "Ada"], { cwd: root, env });
    execFileSync("git", ["config", "--local", "user.email", "ada@example.com"], { cwd: root, env });
    assert.equal(await ensureGitIdentity(sandbox(root)), false);
    assert.equal(local(root, "user.name"), "Ada");
    assert.equal(local(root, "user.email"), "ada@example.com");
    assert.equal(local(root, IDENTITY_MARK), "");
  });

  test("a global identity stays the one in use: nothing is written locally", async () => {
    const root = repository();
    writeFileSync(globalConfig, "[user]\n\tname = Grace\n\temail = grace@example.com\n");
    try {
      assert.equal(await ensureGitIdentity(sandbox(root)), false);
      assert.equal(local(root, "user.email"), "");
      assert.equal(await readIdentityOwner(sandbox(root)), "deployer");
    } finally {
      writeFileSync(globalConfig, "");
    }
  });

  test("a second call changes nothing", async () => {
    const root = repository();
    assert.equal(await ensureGitIdentity(sandbox(root)), true);
    assert.equal(await ensureGitIdentity(sandbox(root)), false);
  });

  test("the owner read from the sandbox: the mark or our address is the agent's, another address a deployer's, none nobody's", async () => {
    const marked = repository();
    await ensureGitIdentity(sandbox(marked));
    execFileSync("git", ["config", "--local", "user.email", "agent@agent-blueprint.dev"], { cwd: marked, env });
    assert.equal(await readIdentityOwner(sandbox(marked)), "agent", "the mark holds after the model rewrote the address");
    const older = repository();
    execFileSync("git", ["config", "--local", "user.email", GIT_IDENTITY.email], { cwd: older, env });
    assert.equal(await readIdentityOwner(sandbox(older)), "agent", "a clone made before the mark existed");
    const deployer = repository();
    execFileSync("git", ["config", "--local", "user.email", "ada@example.com"], { cwd: deployer, env });
    assert.equal(await readIdentityOwner(sandbox(deployer)), "deployer");
    assert.equal(await readIdentityOwner(sandbox(repository())), null);
  });
});

describe("the bash tool pins the agent's identity (ruling 76)", () => {
  test("the agent supplied it: Eve's bash spawns the command with the four variables", async () => {
    const root = repository();
    await ensureGitIdentity(sandbox(root));
    const calls: Calls = { runs: [], spawns: [] };
    const result = await runBash(root, "true", store("agent"), calls);
    assert.equal(result.exitCode, 0);
    assert.equal(calls.spawns.length, 1);
    for (const name of IDENTITY_VARIABLES) {
      assert.equal(calls.spawns[0].env?.[name], name.endsWith("_NAME") ? GIT_IDENTITY.name : GIT_IDENTITY.email, name);
    }
    assert.equal(calls.runs.length, 0, "a session that knows the owner reads nothing from the sandbox first");
  });

  test("git -c user.* and a rewritten user.email in the model's command still commit as the agent", async () => {
    const root = repository();
    await ensureGitIdentity(sandbox(root));
    const owners = store("agent");
    const dashC = await runBash(root, "git -c user.name=Other -c user.email=other@example.com commit -q --allow-empty -m 'chore: probe'", owners);
    assert.equal(dashC.exitCode, 0, dashC.stderr);
    assert.equal(lastCommit(root), `${OURS}|${OURS}`);
    const rewritten = await runBash(
      root,
      "git config user.name 'Agent Blueprint' && git config user.email agent@agent-blueprint.dev && git commit -q --allow-empty -m 'chore: probe two'",
      owners,
    );
    assert.equal(rewritten.exitCode, 0, rewritten.stderr);
    assert.equal(lastCommit(root), `${OURS}|${OURS}`, "the pull request #8 case");
  });

  test("a deployer's identity: nothing is injected and the commit is the deployer's", async () => {
    const root = repository();
    execFileSync("git", ["config", "--local", "user.name", "Ada"], { cwd: root, env });
    execFileSync("git", ["config", "--local", "user.email", "ada@example.com"], { cwd: root, env });
    assert.equal(await ensureGitIdentity(sandbox(root)), false);
    for (const initial of ["deployer", null] as const) {
      const owners = store(initial);
      const calls: Calls = { runs: [], spawns: [] };
      const result = await runBash(root, "git commit -q --allow-empty -m 'chore: probe'", owners, calls);
      assert.equal(result.exitCode, 0, result.stderr);
      assert.equal(lastCommit(root), "Ada <ada@example.com>|Ada <ada@example.com>");
      for (const name of IDENTITY_VARIABLES) assert.equal(calls.spawns[0].env?.[name], undefined, name);
      assert.equal(owners.get(), initial, "a session's answer is only ever kept as the agent's");
    }
  });

  test("a helper's fresh session finds the mark in the shared clone and keeps the answer", async () => {
    const root = repository();
    await ensureGitIdentity(sandbox(root));
    execFileSync("git", ["config", "--local", "user.email", "agent@agent-blueprint.dev"], { cwd: root, env });
    const owners = store(null);
    const calls: Calls = { runs: [], spawns: [] };
    const result = await runBash(root, "git commit -q --allow-empty -m 'chore: helper probe'", owners, calls);
    assert.equal(result.exitCode, 0, result.stderr);
    assert.equal(lastCommit(root), `${OURS}|${OURS}`);
    assert.equal(owners.get(), "agent");
    assert.equal(calls.runs.length, 1, "one read of the sandbox");
    await runBash(root, "true", owners, calls);
    assert.equal(calls.runs.length, 1, "later commands use the kept answer");
  });

  test("no repository and no identity: nothing is injected and nothing is kept", async () => {
    const owners = store(null);
    assert.deepEqual(await identityEnv(sandbox(scratch), owners), {});
    assert.equal(owners.get(), null);
  });
});
