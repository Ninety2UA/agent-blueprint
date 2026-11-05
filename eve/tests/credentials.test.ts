// The credential layer against stubs at its two boundaries: a stubbed GitHub API for the
// mint, and a sandbox that runs real git on this machine against a local smart-HTTP server
// that requires the token, the way github.com does. No real token or App is used.
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { createSign, createVerify, generateKeyPairSync } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, writeFileSync, chmodSync, mkdirSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, before, describe, test } from "node:test";
import type { SandboxCommandResult, SandboxNetworkPolicy, SandboxSession } from "eve/sandbox";
import {
  READ_PERMISSIONS,
  basePolicy,
  gitHubAppFromEnv,
  mintInstallationToken,
  parseAllowedHosts,
  windowPolicy,
  withGitHubToken,
} from "../agent/lib/credentials.ts";

const DEFAULT_HOSTS = "registry.npmjs.org,pypi.org,files.pythonhosted.org";
const TOKEN = "stub-installation-token-for-tests";

describe("network policy", () => {
  test("Vercel and Daytona at the default list: the GitHub pair and the registries, nothing else", () => {
    const hosts = parseAllowedHosts(undefined, DEFAULT_HOSTS);
    const expected = { allow: ["github.com", "api.github.com", "registry.npmjs.org", "pypi.org", "files.pythonhosted.org"] };
    assert.deepEqual(basePolicy("vercel", hosts), expected);
    assert.deepEqual(basePolicy("daytona", hosts), expected);
  });

  test("an empty AB_ALLOWED_HOSTS leaves the GitHub pair exactly", () => {
    const hosts = parseAllowedHosts("", DEFAULT_HOSTS);
    assert.deepEqual(basePolicy("vercel", hosts), { allow: ["github.com", "api.github.com"] });
    assert.deepEqual(basePolicy("daytona", hosts), { allow: ["github.com", "api.github.com"] });
  });

  test("Docker: any allowed host is allow-all, none is deny-all", () => {
    assert.equal(basePolicy("docker", parseAllowedHosts(undefined, DEFAULT_HOSTS)), "allow-all");
    assert.equal(basePolicy("docker", parseAllowedHosts(" , ", DEFAULT_HOSTS)), "deny-all");
  });

  test("the window policy puts the token on github.com only", () => {
    const policy = windowPolicy(["registry.npmjs.org"], TOKEN) as { allow: Record<string, unknown[]> };
    assert.deepEqual(Object.keys(policy.allow), ["github.com", "api.github.com", "registry.npmjs.org"]);
    const basic = Buffer.from(`x-access-token:${TOKEN}`).toString("base64");
    assert.deepEqual(policy.allow["github.com"], [{ transform: [{ headers: { authorization: `Basic ${basic}` } }] }]);
    assert.deepEqual(policy.allow["api.github.com"], []);
    assert.deepEqual(policy.allow["registry.npmjs.org"], []);
  });
});

describe("minting", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pem = privateKey.export({ type: "pkcs1", format: "pem" }).toString();

  function stubGitHub(installed: boolean) {
    const calls: { url: string; init?: RequestInit }[] = [];
    const stub = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.endsWith("/repos/acme/widgets/installation")) {
        return installed ? Response.json({ id: 42 }) : new Response("{}", { status: 404 });
      }
      if (url.endsWith("/app/installations/42/access_tokens")) {
        return Response.json({ token: TOKEN, expires_at: "2026-10-29T03:00:00Z" }, { status: 201 });
      }
      return new Response("{}", { status: 500 });
    }) as typeof fetch;
    return { calls, stub };
  }

  test("resolves the installation for the named repository and mints a token for it alone", async () => {
    const { calls, stub } = stubGitHub(true);
    const now = Date.UTC(2026, 9, 29, 2, 0, 0);
    const minted = await mintInstallationToken(
      { appId: "123456", privateKey: pem, fetch: stub, now: () => now },
      { owner: "acme", name: "widgets" },
      READ_PERMISSIONS,
    );
    assert.deepEqual(minted, { token: TOKEN, expiresAt: "2026-10-29T03:00:00Z" });
    assert.equal(calls.length, 2);
    assert.equal(calls[0].url, "https://api.github.com/repos/acme/widgets/installation");
    assert.equal(calls[1].init?.method, "POST");
    assert.deepEqual(JSON.parse(String(calls[1].init?.body)), {
      repositories: ["widgets"],
      permissions: { contents: "read", metadata: "read" },
    });

    const jwt = String((calls[0].init?.headers as Record<string, string>).authorization).replace(/^Bearer /, "");
    const [header, payload, signature] = jwt.split(".");
    assert.ok(createVerify("RSA-SHA256").update(`${header}.${payload}`).verify(publicKey, Buffer.from(signature, "base64url")));
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
    assert.deepEqual(claims, { iat: now / 1_000 - 60, exp: now / 1_000 + 540, iss: "123456" });
  });

  test("refuses, naming the repository, when the App is not installed there", async () => {
    const { calls, stub } = stubGitHub(false);
    await assert.rejects(
      mintInstallationToken({ appId: "123456", privateKey: pem, fetch: stub }, { owner: "acme", name: "widgets" }, READ_PERMISSIONS),
      /The GitHub App 123456 is not installed on acme\/widgets/,
    );
    assert.equal(calls.length, 1, "no token is requested");
  });

  test("a missing App variable is named", () => {
    assert.throws(() => gitHubAppFromEnv({ AB_GITHUB_APP_PRIVATE_KEY: "x" }), /AB_GITHUB_APP_ID is not set/);
    assert.throws(() => gitHubAppFromEnv({ AB_GITHUB_APP_ID: "1", AB_GITHUB_APP_PRIVATE_KEY: " " }), /AB_GITHUB_APP_PRIVATE_KEY is not set/);
  });

  // A one-line field in a deploy form can strip a pasted key's line breaks, and signing
  // with such a key fails only when a run first needs a token.
  for (const [name, flatten] of [
    ["kept", (pem: string) => pem],
    ["stripped", (pem: string) => pem.replaceAll("\n", "")],
    ["turned into spaces", (pem: string) => pem.replaceAll("\n", " ")],
    ["written as a literal \\n", (pem: string) => pem.replaceAll("\n", "\\n")],
    ["CRLF", (pem: string) => pem.replaceAll("\n", "\r\n")],
  ] as const) {
    test(`a key whose line breaks were ${name} signs`, () => {
      const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
      for (const type of ["pkcs1", "pkcs8"] as const) {
        const pem = privateKey.export({ type, format: "pem" }).toString();
        const app = gitHubAppFromEnv({ AB_GITHUB_APP_ID: "1", AB_GITHUB_APP_PRIVATE_KEY: flatten(pem) });
        assert.equal(app.privateKey, pem, `${type} comes back as the original file`);
        const signature = createSign("RSA-SHA256").update("x").sign(app.privateKey);
        assert.ok(createVerify("RSA-SHA256").update("x").verify(publicKey, signature));
      }
    });
  }

  test("several PEM blocks in one value pass through unchanged", () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const outer = publicKey.export({ type: "spki", format: "pem" }).toString();
    const bundle = `${outer}${privateKey.export({ type: "pkcs1", format: "pem" })}${outer}`.trim();
    const app = gitHubAppFromEnv({ AB_GITHUB_APP_ID: "1", AB_GITHUB_APP_PRIVATE_KEY: bundle });
    assert.equal(app.privateKey, bundle);
    assert.ok(createSign("RSA-SHA256").update("x").sign(app.privateKey));
  });

  test("a value that is not a PEM key passes through unchanged", () => {
    const app = gitHubAppFromEnv({ AB_GITHUB_APP_ID: "1", AB_GITHUB_APP_PRIVATE_KEY: " not a key " });
    assert.equal(app.privateKey, "not a key");
  });
});

// A sandbox whose commands run in bash on this machine, recording what crossed the boundary.
function localSandbox(root: string) {
  const runs: { command: string; env: Record<string, string> }[] = [];
  const written: string[] = [];
  const parts: Pick<SandboxSession, "run" | "writeFiles" | "removePath" | "resolvePath"> = {
    run: ({ command, env = {} }) => {
      runs.push({ command, env });
      return new Promise<SandboxCommandResult>((resolve) => {
        execFile("bash", ["-c", command], { cwd: root, env: { ...process.env, ...env } }, (error, stdout, stderr) => {
          const code = error && typeof error.code === "number" ? error.code : error ? 1 : 0;
          resolve({ exitCode: code, stdout, stderr });
        });
      });
    },
    writeFiles: async ({ files }) => {
      for (const file of files) {
        written.push(file.path);
        await mkdir(dirname(file.path), { recursive: true });
        await writeFile(file.path, file.content);
      }
    },
    removePath: ({ path, recursive, force }) => rm(path, { recursive, force }),
    resolvePath: (path) => join(root, path),
  };
  return { sandbox: parts as SandboxSession, runs, written };
}

describe("per-command token against a server that requires it", () => {
  let server: ReturnType<typeof createServer>;
  let port = 0;
  let work = "";
  const seen: { host: string; authorized: boolean }[] = [];

  before(async () => {
    work = mkdtempSync(join(tmpdir(), "ab-cred-test-"));
    const serve = join(work, "serve");
    mkdirSync(serve);
    const run = (args: string[], cwd: string) =>
      new Promise<void>((resolve, reject) =>
        execFile("git", args, { cwd }, (error) => (error ? reject(error) : resolve())),
      );
    await run(["init", "-q", "--bare", "widgets.git"], serve);
    const seed = join(work, "seed");
    mkdirSync(seed);
    await run(["init", "-q", "-b", "main"], seed);
    writeFileSync(join(seed, "README.md"), "widgets\n");
    await run(["add", "README.md"], seed);
    await run(["-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "-q", "-m", "seed"], seed);
    await run(["push", "-q", join(serve, "widgets.git"), "main"], seed);

    const backend = join(
      await new Promise<string>((resolve) => execFile("git", ["--exec-path"], (_e, out) => resolve(out.trim()))),
      "git-http-backend",
    );
    const expected = `Basic ${Buffer.from(`x-access-token:${TOKEN}`).toString("base64")}`;
    server = createServer((request: IncomingMessage, response: ServerResponse) => {
      const authorized = request.headers.authorization === expected;
      seen.push({ host: String(request.headers.host), authorized });
      if (!authorized) {
        response.writeHead(401, { "www-authenticate": 'Basic realm="test"' }).end();
        return;
      }
      const url = new URL(request.url ?? "/", "http://local");
      const cgi = spawn(backend, [], {
        env: {
          GIT_PROJECT_ROOT: serve,
          GIT_HTTP_EXPORT_ALL: "1",
          PATH_INFO: url.pathname,
          QUERY_STRING: url.search.slice(1),
          REQUEST_METHOD: request.method ?? "GET",
          CONTENT_TYPE: request.headers["content-type"] ?? "",
          REMOTE_USER: "x-access-token",
        },
      });
      request.pipe(cgi.stdin);
      const chunks: Buffer[] = [];
      cgi.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
      cgi.on("close", () => {
        const raw = Buffer.concat(chunks);
        const split = raw.indexOf("\r\n\r\n");
        const headers: Record<string, string> = {};
        let status = 200;
        for (const line of raw.subarray(0, split).toString().split("\r\n")) {
          const [key, ...rest] = line.split(":");
          if (key.toLowerCase() === "status") status = Number.parseInt(rest.join(":"), 10);
          else headers[key] = rest.join(":").trim();
        }
        response.writeHead(status, headers).end(raw.subarray(split + 4));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as { port: number }).port;
  });

  after(async () => {
    server.close();
    await rm(work, { recursive: true, force: true });
  });

  test("anonymous fails, the token route fetches, and nothing is left behind or obeyed", async () => {
    const root = join(work, "workspace");
    mkdirSync(root);
    const { sandbox, runs, written } = localSandbox(root);
    const remote = `http://127.0.0.1:${port}/widgets.git`;
    const git = (args: string[]) => sandbox.run({ command: ["git", ...args].join(" "), env: { GIT_TERMINAL_PROMPT: "0" } });

    await git(["init", "-q"]);
    // A credential in the remote URL, as a careless clone would leave it.
    await git(["remote", "add", "origin", `http://x-access-token:leaked@127.0.0.1:${port}/widgets.git`]);
    await git(["config", "remote.origin.pushurl", `http://someone:secret@127.0.0.1:${port}/widgets.git`]);
    // Hostile repository configuration: a helper that would store the token, a hook that would run.
    const log = join(work, "planted.log");
    await git(["config", "credential.helper", `'!f() { echo "helper $1" >> ${log}; cat >> ${log}; }; f'`]);
    mkdirSync(join(root, ".git", "hooks"), { recursive: true });
    writeFileSync(join(root, ".git", "hooks", "reference-transaction"), `#!/bin/sh\necho hook >> ${log}\n`);
    chmodSync(join(root, ".git", "hooks", "reference-transaction"), 0o755);

    const anonymous = await git(["-c", "credential.helper=", "fetch", "-q", remote]);
    assert.notEqual(anonymous.exitCode, 0, "the server refuses a fetch without the token");

    const runsBefore = runs.length;
    const result = await withGitHubToken(
      sandbox,
      { route: "command", token: TOKEN, hosts: [], host: `127.0.0.1:${port}`, protocol: "http" },
      async (tokenGit) => {
        const fetched = await tokenGit(["fetch", "-q", "origin", "main:refs/remotes/origin/main"]);
        // A URL rewrite in the repository's configuration sends the next fetch to another host name.
        await git(["config", `url.http://localhost:${port}/.insteadOf`, remote]);
        const redirected = await tokenGit(["fetch", "-q", remote, "main"]);
        return { fetched, redirected };
      },
    );

    assert.equal(result.fetched.exitCode, 0, result.fetched.stderr);
    assert.notEqual(result.redirected.exitCode, 0, "the helper answers for one host only");
    assert.ok(
      seen.some((request) => request.host === `localhost:${port}`) &&
        seen.every((request) => !(request.host === `localhost:${port}` && request.authorized)),
      "the rewritten host never received the token",
    );
    const head = await git(["rev-parse", "refs/remotes/origin/main"]);
    assert.match(head.stdout, /^[0-9a-f]{40}$/m);

    assert.equal(existsSync(log), false, "neither the planted helper nor the planted hook ran");
    const urls = await git(["config", "--get-regexp", "^remote\\.origin\\."]);
    assert.match(urls.stdout, new RegExp(`remote.origin.url http://127.0.0.1:${port}/widgets.git`));
    assert.match(urls.stdout, new RegExp(`remote.origin.pushurl http://127.0.0.1:${port}/widgets.git`));
    assert.doesNotMatch(urls.stdout, /@/, "remote URLs are bare");

    for (const run of runs.slice(runsBefore)) {
      assert.ok(!run.command.includes(TOKEN), "the token is in no command line");
      assert.ok(!Object.values(run.env).some((value) => value.includes(TOKEN)), "the token is in no command environment");
    }
    assert.ok(written.length >= 2 && written.every((path) => path.startsWith("/tmp/ab-git-")));
    for (const path of written) assert.equal(existsSync(path), false, `${path} was removed`);
    assert.deepEqual(readdirSync("/tmp").filter((name) => written.some((path) => path.includes(name))), []);
    assert.ok(!(await readFile(join(root, ".git", "config"), "utf8")).includes(TOKEN));
  });
});

describe("credential window", () => {
  function windowSandbox(fail: boolean) {
    const policies: SandboxNetworkPolicy[] = [];
    const commands: string[] = [];
    const sandbox = {
      run: async ({ command, env }: { command: string; env?: Record<string, string> }) => {
        commands.push(`${command} ${JSON.stringify(env ?? {})}`);
        if (fail && command.includes("fetch")) throw new Error("sandbox went away");
        return { exitCode: 0, stdout: "", stderr: "" };
      },
      setNetworkPolicy: async (policy: SandboxNetworkPolicy) => {
        policies.push(policy);
      },
    } as unknown as SandboxSession;
    return { sandbox, policies, commands };
  }

  test("sets the transform for the work and restores the transform-free policy", async () => {
    const { sandbox, policies, commands } = windowSandbox(false);
    await withGitHubToken(sandbox, { route: "window", token: TOKEN, hosts: ["pypi.org"] }, (git) => git(["fetch", "origin"]));
    assert.deepEqual(policies, [windowPolicy(["pypi.org"], TOKEN), { allow: ["github.com", "api.github.com", "pypi.org"] }]);
    assert.ok(commands.every((command) => !command.includes(TOKEN)), "the token never enters the sandbox");
    assert.ok(commands.some((command) => command.includes("'core.hooksPath=/dev/null'")));
  });

  test("a step that throws inside the window still leaves the transform-free policy", async () => {
    const { sandbox, policies } = windowSandbox(true);
    await assert.rejects(
      withGitHubToken(sandbox, { route: "window", token: TOKEN, hosts: [] }, (git) => git(["fetch", "origin"])),
      /sandbox went away/,
    );
    assert.deepEqual(policies.at(-1), { allow: ["github.com", "api.github.com"] });
  });
});
