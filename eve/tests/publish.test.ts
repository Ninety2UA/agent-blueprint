// The publish tool and the durable record against stubs at their boundaries: a stubbed GitHub
// REST API, a sandbox that runs real git on this machine, and a local smart-HTTP server that
// requires the token, as github.com does. No real token, App or sandbox is used.
import assert from "node:assert/strict";
import { execFile, execFileSync, spawn } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, before, beforeEach, describe, test } from "node:test";
import type { SandboxCommandResult, SandboxSession } from "eve/sandbox";

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
const { continuedBody, restartRecord } = await import("../agent/lib/run-state.ts");
const { default: publishTool, publish, demoBody, stageList, readiness, approvedEarlier, approvalHolds, visitorText } = await import("../agent/tools/publish_branch.ts");
const state = await import("../agent/lib/run-state.ts");
type PublishDeps = Parameters<typeof publish>[0];
type RunRecord = NonNullable<ReturnType<PublishDeps["store"]["get"]>>;

const TOKEN = "stub-installation-token-for-publish-tests";
const SESSION = "sess_0123456789abcdef";
const VERSIONS = { eve: "0.86.0", product: "4.1.1" };
const SCRIPTS = join(import.meta.dirname, "..", "..", "skills", "ab-ship-pipeline", "scripts");
const REQUEST = "Add widget search to the catalogue page";
// Assembled at run time so no literal in this file looks like a key.
const KEY = ["AK", "IA", "Z7Q3W5E8R2T4Y6U9"].join("");

let work = "";
let serve = "";
let port = 0;
const authorized: boolean[] = [];
let server: ReturnType<typeof createServer> | undefined;

function git(args: string[], cwd: string, env: Record<string, string> = {}): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.com", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.com", ...env },
  }).trim();
}

function remoteHeads(): string {
  return git(["for-each-ref", "--format=%(refname) %(objectname)", "refs/heads/"], join(serve, "widgets.git"));
}

function remoteTipOf(branch: string): string | null {
  return git(["for-each-ref", "--format=%(objectname)", `refs/heads/${branch}`], join(serve, "widgets.git")) || null;
}

before(async () => {
  work = mkdtempSync(join(tmpdir(), "ab-publish-test-"));
  serve = join(work, "serve");
  mkdirSync(serve);
  git(["init", "-q", "--bare", "-b", "main", "widgets.git"], serve);
  const seed = join(work, "seed");
  mkdirSync(seed);
  git(["init", "-q", "-b", "main"], seed);
  writeFileSync(join(seed, "README.md"), "widgets\n");
  git(["add", "README.md"], seed);
  git(["commit", "-q", "-m", "seed"], seed);
  git(["push", "-q", join(serve, "widgets.git"), "main"], seed);

  const backend = join(git(["--exec-path"], work), "git-http-backend");
  const expected = `Basic ${Buffer.from(`x-access-token:${TOKEN}`).toString("base64")}`;
  server = createServer((request: IncomingMessage, response: ServerResponse) => {
    const ok = request.headers.authorization === expected;
    authorized.push(ok);
    if (!ok) {
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
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  port = (server!.address() as { port: number }).port;
});

after(async () => {
  server?.close();
  await rm(work, { recursive: true, force: true });
});

// A fresh clone, as clone_repository leaves one: origin names github.com, origin/HEAD is set.
let clones = 0;
function freshClone(): string {
  const root = join(work, `clone-${(clones += 1)}`);
  execFileSync("git", ["clone", "-q", join(serve, "widgets.git"), root]);
  git(["remote", "set-url", "origin", "https://github.com/acme/widgets"], root);
  git(["checkout", "-q", "-b", "work"], root);
  git(["config", "user.name", "t"], root);
  git(["config", "user.email", "t@example.com"], root);
  return root;
}

function commitFile(root: string, path: string, content: string, message = "feat(widgets): add search"): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
  git(["add", path], root);
  git(["commit", "-q", "-m", message], root);
}

function runFiles(root: string, body = "Adds widget search.\n"): void {
  mkdirSync(join(root, ".agent-blueprint", "run", "provenance"), { recursive: true });
  mkdirSync(join(root, ".agent-blueprint", "team"), { recursive: true });
  writeFileSync(join(root, ".agent-blueprint", ".gitignore"), "run/\nteam/\nreview-runs/\ncache/\n.gitignore\n");
  writeFileSync(join(root, ".agent-blueprint", "run", "pr-body.md"), body);
  writeFileSync(join(root, ".agent-blueprint", "run", "provenance", "ab-ship-pipeline.json"), '{"skill": "ab-ship-pipeline", "version": "4.1.1"}\n');
  writeFileSync(join(root, ".agent-blueprint", "team", "ledger.md"), "- plan: done\n");
}

interface Recorder {
  runs: { command: string; env: Record<string, string> }[];
  /** Throws instead of running a command that matches, once each. */
  failOn: RegExp[];
  /** Runs before a command that matches, once each. */
  before: { match: RegExp; action: () => void }[];
}

function localSandbox(root: string, recorder: Recorder): SandboxSession {
  const parts: Pick<SandboxSession, "run" | "writeFiles" | "removePath" | "resolvePath"> = {
    run: ({ command, env = {} }) => {
      recorder.runs.push({ command, env });
      const fail = recorder.failOn.findIndex((pattern) => pattern.test(command));
      if (fail >= 0) {
        recorder.failOn.splice(fail, 1);
        return Promise.reject(new Error("the sandbox went away"));
      }
      const hook = recorder.before.findIndex((entry) => entry.match.test(command));
      if (hook >= 0) recorder.before.splice(hook, 1)[0].action();
      return new Promise<SandboxCommandResult>((resolve) => {
        execFile("bash", ["-c", command], { cwd: root, env: { ...process.env, ...env }, maxBuffer: 1 << 24 }, (error, stdout, stderr) => {
          const code = error && typeof error.code === "number" ? error.code : error ? 1 : 0;
          resolve({ exitCode: code, stdout, stderr });
        });
      });
    },
    writeFiles: async ({ files }) => {
      for (const file of files) {
        await mkdir(dirname(file.path), { recursive: true });
        await writeFile(file.path, file.content);
      }
    },
    removePath: ({ path, recursive, force }) => rm(path, { recursive, force }),
    resolvePath: (path) => join(root, path),
  };
  return parts as SandboxSession;
}

interface Pull {
  number: number;
  html_url: string;
  draft: boolean;
  head: string;
  title: string;
  body: string;
  labels: string[];
}

function stubApi(options: { draftsUnavailable?: boolean } = {}) {
  const pulls: Pull[] = [];
  const calls: string[] = [];
  const stub = (async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push(`${method} ${url.replace("https://api.test", "")}`);
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    const path = new URL(url).pathname;
    if (method === "GET" && path === "/repos/acme/widgets") return Response.json({ default_branch: "main" });
    if (method === "GET" && path === "/repos/acme/widgets/pulls") {
      const head = new URL(url).searchParams.get("head");
      return Response.json(pulls.filter((pull) => `acme:${pull.head}` === head));
    }
    if (method === "POST" && path === "/repos/acme/widgets/pulls") {
      if (body.draft && options.draftsUnavailable) {
        return Response.json({ message: "Validation Failed", errors: [{ message: "Draft pull requests are not supported in this repository." }] }, { status: 422 });
      }
      const pull = { number: pulls.length + 1, html_url: `https://github.com/acme/widgets/pull/${pulls.length + 1}`, draft: body.draft, head: body.head, title: body.title, body: body.body, labels: [] };
      pulls.push(pull);
      return Response.json(pull, { status: 201 });
    }
    const patch = /^\/repos\/acme\/widgets\/pulls\/(\d+)$/.exec(path);
    if (method === "PATCH" && patch) {
      const pull = pulls[Number(patch[1]) - 1];
      pull.body = body.body;
      return Response.json(pull);
    }
    const labels = /^\/repos\/acme\/widgets\/issues\/(\d+)\/labels$/.exec(path);
    if (method === "POST" && labels) {
      pulls[Number(labels[1]) - 1].labels.push(...body.labels);
      return Response.json([]);
    }
    return new Response("{}", { status: 500 });
  }) as typeof fetch;
  return { pulls, calls, stub };
}

function setup(root: string, options: Partial<PublishDeps> & { recorder?: Recorder; github?: ReturnType<typeof stubApi> } = {}) {
  const { recorder: givenRecorder, github, ...overrides } = options;
  const recorder = givenRecorder ?? { runs: [], failOn: [], before: [] };
  let record: RunRecord | null = null;
  const minted: string[] = [];
  const api = github ?? stubApi();
  const deps: PublishDeps = {
    sandbox: localSandbox(root, recorder),
    store: { get: () => record, set: (value) => (record = value) },
    sessionId: SESSION,
    posture: "interactive",
    demo: false,
    route: "command",
    hosts: [],
    versions: VERSIONS,
    scripts: { outgoing: readFileSync(join(SCRIPTS, "outgoing-commits.sh"), "utf8"), scan: readFileSync(join(SCRIPTS, "scan-secrets.sh"), "utf8") },
    mint: async (repository, permissions) => {
      minted.push(`${repository} ${JSON.stringify(permissions)}`);
      return TOKEN;
    },
    api: { fetch: api.stub, url: "https://api.test" },
    remoteUrl: () => `http://127.0.0.1:${port}/widgets.git`,
    tokenHost: { host: `127.0.0.1:${port}`, protocol: "http" },
    listProcesses: async () => [],
    stopProcesses: async () => {},
    now: () => "2026-10-29T03:00:00.000Z",
    ...overrides,
  };
  return { deps, recorder, minted, api, record: () => record, setRecord: (value: RunRecord | null) => (record = value) };
}

const BRANCH = state.branchName(REQUEST, SESSION);

// Every test starts with the run's branch absent from the remote.
beforeEach(() => {
  if (serve && remoteTipOf(BRANCH)) git(["update-ref", "-d", `refs/heads/${BRANCH}`], join(serve, "widgets.git"));
});

describe("branch name", () => {
  test("ab/<feature slug, at most 40 characters>-<last 8 of the session id>", () => {
    assert.equal(BRANCH, "ab/add-widget-search-to-the-catalogue-page-89abcdef");
    // Two Eve ids from the same hour share their time prefix and differ in the random tail.
    assert.notEqual(
      state.branchName(REQUEST, "wrun_01M6ZQ8K4T3H7Y2B9C5D6E7F8G"),
      state.branchName(REQUEST, "wrun_01M6ZQ8K4TAJKMNPQRSTVWXYZ0"),
    );
    assert.equal(state.featureSlug("Fix: the  LOGIN page!! now"), "fix-the-login-page-now");
    assert.ok(state.featureSlug("x".repeat(80)).length <= 40);
    // Ruling 60: a long request is cut between words, not inside one.
    assert.equal(state.featureSlug("Add a greeting script to the widgets repository."), "add-a-greeting-script-to-the-widgets");
  });
});

// Ruling 60: the live Linear run's first call carried no request, so its branch was ab/feature-...
// and its pull request title was that branch name; the Telegram run's title was cut mid-word.
describe("the feature text, the branch and the title (ruling 60)", () => {
  test("a long text is cut at a word boundary to 72 characters, with no trailing punctuation", () => {
    const long = "Add a short usage section to the README of Ninety2UA/agent-blueprint-sample, with examples";
    const title = state.pullRequestTitle(long);
    assert.equal(title, "Add a short usage section to the README of");
    assert.ok(title.length <= 72);
    assert.equal(state.pullRequestTitle("Fix the login page, then the sign-up page, then the password reset page too"), "Fix the login page, then the sign-up page, then the password reset page");
    assert.equal(state.pullRequestTitle("Short title"), "Short title");
    assert.ok(!/[,;:\s-]$/.test(state.pullRequestTitle(`${"word ".repeat(13)}end, and more words after it`)));
    assert.equal(state.pullRequestTitle("x".repeat(90)).length, 72, "one long word is cut at the limit");
  });

  test("the body's first heading or line names the feature; a generic heading is skipped", () => {
    assert.equal(state.featureFromBody("# Add widget search\n\nMore text.\n"), "Add widget search");
    assert.equal(state.featureFromBody("## Summary\n\nAdds the **export** button to `reports`.\n"), "Adds the export button to reports.");
    assert.equal(state.featureFromBody("<!-- template -->\n\n- Fixes [the crash](https://example.com) on start\n"), "Fixes the crash on start");
    assert.equal(state.featureFromBody("Keeps user_id as it is.\n"), "Keeps user_id as it is.");
    assert.equal(state.featureFromBody("\n\n"), null);
  });

  test("no request: a pull-request call names the branch and the title from the body's heading", async () => {
    const root = freshClone();
    commitFile(root, "src/a.ts", "a\n");
    runFiles(root, "# Add a short usage section to the README\n\nThe section shows two commands.\n");
    const { deps, api, record } = setup(root);
    const result = await publish(deps, { mode: "pull-request" });
    assert.equal(result.status, "done", JSON.stringify(result));
    const branch = state.branchName("Add a short usage section to the README", SESSION);
    assert.equal(branch, "ab/add-a-short-usage-section-to-the-readme-89abcdef");
    assert.equal(record()?.branch, branch);
    assert.equal(api.pulls[0].head, branch);
    assert.equal(api.pulls[0].title, "Add a short usage section to the README");
  });

  test("no request: check and stage name the same branch; a long request cuts the title at a word", async () => {
    const root = freshClone();
    commitFile(root, "src/a.ts", "a\n");
    runFiles(root, "## Summary\n\nAdds widget export to the catalogue.\n");
    const { deps, record } = setup(root);
    const checked = await publish(deps, { mode: "check" });
    assert.equal(checked.status, "ready", JSON.stringify(checked));
    const branch = state.branchName("Adds widget export to the catalogue.", SESSION);
    assert.equal("branch" in checked && checked.branch, branch);
    assert.equal(record(), null, "check still writes no record");
    const staged = await publish(deps, { mode: "stage", stage: "plan" });
    assert.equal(staged.status, "pushed", JSON.stringify(staged));
    assert.equal(record()?.branch, branch, "the stage call fixes the branch check named");
    git(["update-ref", "-d", `refs/heads/${branch}`], join(serve, "widgets.git"));

    const other = freshClone();
    commitFile(other, "src/b.ts", "b\n");
    runFiles(other);
    const second = setup(other, { sessionId: "sess_long_request_0001" });
    const request = "Add a short usage section to the README of Ninety2UA/agent-blueprint-sample with two examples";
    const opened = await publish(second.deps, { mode: "pull-request", request });
    assert.equal(opened.status, "done", JSON.stringify(opened));
    assert.equal(second.api.pulls[0].title, "Add a short usage section to the README of");
    assert.equal(second.record()?.branch, "ab/add-a-short-usage-section-to-the-readme-uest0001");
  });

  test("no request and no body: the newest commit subject names the branch, never the bare word feature", async () => {
    const root = freshClone();
    commitFile(root, "src/a.ts", "a\n", "feat(widgets): add search");
    const { deps, record } = setup(root, { sessionId: "sess_commit_subject_01" });
    const staged = await publish(deps, { mode: "stage", stage: "plan" });
    assert.equal(staged.status, "pushed", JSON.stringify(staged));
    assert.equal(record()?.branch, "ab/feat-widgets-add-search-ubject01");
  });
});

describe("stage push (push-only mode)", () => {
  test("commits with the trailers, pushes the scanned commit, finalises the checkpoint; no hook runs, no token in a command", async () => {
    const root = freshClone();
    commitFile(root, "src/search.ts", "export const search = () => [];\n");
    runFiles(root);
    const log = join(work, "pre-push.log");
    writeFileSync(join(root, ".git", "hooks", "pre-push"), `#!/bin/sh\necho ran >> ${log}\n`);
    chmodSync(join(root, ".git", "hooks", "pre-push"), 0o755);
    const { deps, recorder, record, minted } = setup(root);

    const result = await publish(deps, { mode: "stage", stage: "plan", request: REQUEST });
    assert.equal(result.status, "pushed", JSON.stringify(result));
    const head = git(["rev-parse", "HEAD"], root);
    assert.equal(remoteTipOf(BRANCH), head);
    const trailers = state.parseTrailers(git(["log", "-1", "--format=%B"], root));
    assert.deepEqual(trailers, { "Agent-Blueprint-Stage": "plan", "Agent-Blueprint-Session": SESSION });

    const saved = record();
    assert.ok(saved);
    assert.equal(saved.lastPushedSha, head);
    assert.equal(saved.stage, "plan");
    assert.equal(saved.pending, null);
    assert.equal(saved.base, git(["rev-parse", "origin/main"], root));
    assert.deepEqual(Object.keys(saved.files).sort(), [
      ".agent-blueprint/run/pr-body.md",
      ".agent-blueprint/run/provenance/ab-ship-pipeline.json",
      ".agent-blueprint/team/ledger.md",
    ]);
    assert.equal(Buffer.from(saved.files[".agent-blueprint/run/pr-body.md"], "base64").toString(), "Adds widget search.\n");
    assert.deepEqual(saved.versions, VERSIONS);

    assert.equal(existsSync(log), false, "the planted pre-push hook did not run");
    assert.ok(minted.every((line) => line.includes('"contents":"write"')), "the push token carries contents write");
    for (const run of recorder.runs) {
      assert.ok(!run.command.includes(TOKEN) && !Object.values(run.env).some((value) => value.includes(TOKEN)), "the token is in no command or environment");
      assert.ok(!/--force|--force-with-lease|\s-f\s/.test(run.command), "no force");
    }
    assert.ok(!git(["config", "--get-regexp", "^remote\\."], root).includes("@"), "remote URLs stay bare");
  });

  test("the stage commit is the agent's when the agent supplied the identity, the deployer's otherwise (ruling 76)", async () => {
    const author = (root: string) => git(["log", "-1", "--format=%an <%ae>|%cn <%ce>"], root);
    const deployer = freshClone();
    commitFile(deployer, "src/a.ts", "a\n");
    runFiles(deployer);
    assert.equal((await publish(setup(deployer).deps, { mode: "stage", stage: "plan", request: REQUEST })).status, "pushed");
    assert.equal(author(deployer), "t <t@example.com>|t <t@example.com>");
    git(["update-ref", "-d", `refs/heads/${BRANCH}`], join(serve, "widgets.git"));

    // The clone tool's mark, then an address the model wrote over the agent's.
    const agent = freshClone();
    git(["config", "agent-blueprint.identity", "supplied"], agent);
    git(["config", "user.email", "agent@agent-blueprint.dev"], agent);
    commitFile(agent, "src/b.ts", "b\n");
    runFiles(agent);
    assert.equal((await publish(setup(agent).deps, { mode: "stage", stage: "plan", request: REQUEST })).status, "pushed");
    const ours = "Agent Blueprint <agent-blueprint@users.noreply.github.com>";
    assert.equal(author(agent), `${ours}|${ours}`);
    git(["update-ref", "-d", `refs/heads/${BRANCH}`], join(serve, "widgets.git"));
  });
});

describe("workflow-file refusal (AE9, R25)", () => {
  for (const [label, overrides, status] of [
    ["interactive: needs-human", { posture: "interactive" as const }, "needs-human"],
    ["unattended: refused", { posture: "unattended" as const }, "refused"],
    ["the demo: refused", { posture: "interactive" as const, demo: true }, "refused"],
  ] as const) {
    test(`${label}, the file named, nothing pushed`, async () => {
      const root = freshClone();
      commitFile(root, ".github/workflows/release.yml", "on: push\n", "ci(release): add a workflow");
      runFiles(root);
      const before = remoteHeads();
      const { deps } = setup(root, overrides);
      const result = await publish(deps, { mode: "stage", stage: "execute", request: REQUEST });
      assert.equal(result.status, status, JSON.stringify(result));
      assert.deepEqual("files" in result ? result.files : null, [".github/workflows/release.yml"]);
      assert.match(String("reason" in result ? result.reason : ""), /\.github\/workflows\/release\.yml/);
      assert.equal(remoteHeads(), before, "nothing was pushed");
    });
  }
});

describe("secret scan", () => {
  test("a key-shaped string refuses the push and names the file, even with the sandbox's scripts replaced", async () => {
    const root = freshClone();
    commitFile(root, "config/settings.py", `AWS = "${KEY}"\n`);
    // The sandbox's own copies report success; the tool runs its packaged copies instead.
    for (const name of ["scan-secrets.sh", "outgoing-commits.sh"]) {
      mkdirSync(join(root, "skills", "ab-ship-pipeline", "scripts"), { recursive: true });
      writeFileSync(join(root, "skills", "ab-ship-pipeline", "scripts", name), "#!/bin/sh\nexit 0\n");
    }
    runFiles(root);
    const before = remoteHeads();
    const { deps } = setup(root);
    const result = await publish(deps, { mode: "stage", stage: "execute", request: REQUEST });
    assert.equal(result.status, "needs-human", JSON.stringify(result));
    assert.ok("files" in result && result.files?.some((file) => file.includes("config/settings.py")), JSON.stringify(result));
    assert.ok(!JSON.stringify(result).includes(KEY), "the value is masked");
    assert.equal(remoteHeads(), before);
  });
});

describe("the branch on the remote", () => {
  test("a foreign commit on the branch is needs-human and nothing is pushed", async () => {
    const root = freshClone();
    commitFile(root, "src/a.ts", "a\n");
    runFiles(root);
    const { deps } = setup(root);
    assert.equal((await publish(deps, { mode: "stage", stage: "plan", request: REQUEST })).status, "pushed");
    // A CLI user pushes to the hosted branch.
    const other = freshClone();
    git(["fetch", "-q", join(serve, "widgets.git"), `${BRANCH}:${BRANCH}`], other);
    git(["checkout", "-q", BRANCH], other);
    commitFile(other, "src/b.ts", "b\n", "feat(widgets): a CLI commit");
    git(["push", "-q", join(serve, "widgets.git"), BRANCH], other);
    const foreign = remoteTipOf(BRANCH);

    commitFile(root, "src/c.ts", "c\n");
    const result = await publish(deps, { mode: "stage", stage: "execute" });
    assert.equal(result.status, "needs-human", JSON.stringify(result));
    assert.match(String("reason" in result ? result.reason : ""), /did not push/);
    assert.equal(remoteTipOf(BRANCH), foreign);
  });

  test("a rejected non-fast-forward push is reported, not retried with force", async () => {
    const root = freshClone();
    commitFile(root, "src/a.ts", "a\n");
    runFiles(root);
    const recorder: Recorder = { runs: [], failOn: [], before: [] };
    const { deps } = setup(root, { recorder });
    assert.equal((await publish(deps, { mode: "stage", stage: "plan", request: REQUEST })).status, "pushed");
    commitFile(root, "src/c.ts", "c\n");
    // Someone pushes between the tool's check and its push.
    recorder.before.push({
      match: /'push'/,
      action: () => {
        const other = freshClone();
        git(["fetch", "-q", join(serve, "widgets.git"), `${BRANCH}:${BRANCH}`], other);
        git(["checkout", "-q", BRANCH], other);
        commitFile(other, "src/race.ts", "race\n");
        git(["push", "-q", join(serve, "widgets.git"), BRANCH], other);
      },
    });
    const result = await publish(deps, { mode: "stage", stage: "execute" });
    assert.equal(result.status, "needs-human", JSON.stringify(result));
    assert.match(String("reason" in result ? result.reason : ""), /non-fast-forward .* not retried with force/);
    assert.equal(recorder.runs.filter((run) => run.command.includes("'push'")).length, 2, "one push per publish, no retry");
  });
});

describe("crash recovery and resume (AE2, KTD6)", () => {
  test("AE2: the sandbox replaced after the plan stage, restore fetches the branch and writes the run files back", async () => {
    const root = freshClone();
    commitFile(root, "docs/plan.md", "# Plan\n");
    runFiles(root, "Plan for widget search.\n");
    const first = setup(root);
    assert.equal((await publish(first.deps, { mode: "stage", stage: "plan", request: REQUEST })).status, "pushed");
    const pushed = git(["rev-parse", "HEAD"], root);

    const replaced = freshClone();
    const second = setup(replaced);
    second.setRecord(first.record());
    const result = await publish(second.deps, { mode: "restore" });
    assert.deepEqual(result, {
      status: "resumed",
      stage: "plan",
      branch: BRANCH,
      head: pushed,
      checkpoint: "none",
      files: [".agent-blueprint/run/pr-body.md", ".agent-blueprint/run/provenance/ab-ship-pipeline.json", ".agent-blueprint/team/ledger.md"],
    });
    assert.equal(git(["rev-parse", "HEAD"], replaced), pushed);
    assert.equal(readFileSync(join(replaced, ".agent-blueprint", "run", "pr-body.md"), "utf8"), "Plan for widget search.\n");
    assert.equal(readFileSync(join(replaced, ".agent-blueprint", "team", "ledger.md"), "utf8"), "- plan: done\n");
  });

  test("a crash between the push and the finalisation: the resume finds the push and finalises the checkpoint", async () => {
    const root = freshClone();
    commitFile(root, "src/a.ts", "a\n");
    runFiles(root, "Execute body.\n");
    const first = setup(root);
    // The sandbox goes away right after the push, before the tool reads the remote back.
    const originalRun = first.deps.sandbox.run;
    let pushedOnce = false;
    (first.deps.sandbox as { run: SandboxSession["run"] }).run = async (options) => {
      if (pushedOnce && /ls-remote/.test(options.command)) throw new Error("the sandbox went away");
      const result = await originalRun(options);
      if (/'push'/.test(options.command)) pushedOnce = true;
      return result;
    };
    await assert.rejects(publish(first.deps, { mode: "stage", stage: "execute", request: REQUEST }), /the sandbox went away/);
    const crashed = first.record();
    assert.ok(crashed?.pending, "the pending checkpoint was written before the push");
    assert.equal(crashed.lastPushedSha, null);
    assert.equal(remoteTipOf(BRANCH), crashed.pending.sha, "the push itself landed");

    const replaced = freshClone();
    const second = setup(replaced);
    second.setRecord(crashed);
    const result = await publish(second.deps, { mode: "restore" });
    assert.equal(result.status, "resumed", JSON.stringify(result));
    assert.equal("checkpoint" in result && result.checkpoint, "finalised");
    assert.equal(second.record()?.lastPushedSha, crashed.pending.sha);
    assert.equal(second.record()?.stage, "execute");
    assert.ok(second.record()?.stagesPushed?.includes("execute"), "a push that landed before the crash is listed");
    assert.equal(readFileSync(join(replaced, ".agent-blueprint", "run", "pr-body.md"), "utf8"), "Execute body.\n");
  });

  test("a crash before the push: the resume discards the pending checkpoint", async () => {
    const root = freshClone();
    commitFile(root, "src/a.ts", "a\n");
    runFiles(root, "Plan body.\n");
    const recorder: Recorder = { runs: [], failOn: [], before: [] };
    const first = setup(root, { recorder });
    assert.equal((await publish(first.deps, { mode: "stage", stage: "plan", request: REQUEST })).status, "pushed");
    const planSha = remoteTipOf(BRANCH);
    commitFile(root, "src/b.ts", "b\n");
    writeFileSync(join(root, ".agent-blueprint", "run", "pr-body.md"), "Execute body, never pushed.\n");
    recorder.failOn.push(/'push'/);
    await assert.rejects(publish(first.deps, { mode: "stage", stage: "execute" }), /the sandbox went away/);
    assert.ok(first.record()?.pending);

    const replaced = freshClone();
    const second = setup(replaced);
    second.setRecord(first.record());
    const result = await publish(second.deps, { mode: "restore" });
    assert.equal(result.status, "resumed", JSON.stringify(result));
    assert.equal("checkpoint" in result && result.checkpoint, "discarded");
    assert.equal(second.record()?.pending, null);
    assert.equal(second.record()?.stage, "plan");
    assert.equal(git(["rev-parse", "HEAD"], replaced), planSha);
    assert.equal(readFileSync(join(replaced, ".agent-blueprint", "run", "pr-body.md"), "utf8"), "Plan body.\n");
  });

  test("a record from other versions whose resume fails reports the session stranded, naming the branch", async () => {
    const replaced = freshClone();
    const { deps, setRecord } = setup(replaced, { remoteUrl: () => `http://127.0.0.1:${port}/gone.git` });
    const old = { ...state.newRecord({ versions: { eve: "0.85.2", product: "4.1.0" }, sessionId: SESSION, repository: "acme/widgets", branch: BRANCH, base: "0".repeat(40), now: "x" }), lastPushedSha: "a".repeat(40), stage: "plan" };
    setRecord(old);
    const result = await publish(deps, { mode: "restore" });
    assert.equal(result.status, "stranded", JSON.stringify(result));
    assert.match(String("reason" in result ? result.reason : ""), new RegExp(`^Stranded: .*Eve 0\\.85\\.2.*Eve 0\\.86\\.0.*${BRANCH.replaceAll("/", "\\/")} at aaaaaaaaaaaa`));
  });
});

describe("pull request (REST from the runtime)", () => {
  test("running the tool twice opens one pull request", async () => {
    const root = freshClone();
    commitFile(root, "src/a.ts", "a\n");
    runFiles(root);
    const { deps, api, minted } = setup(root);
    const first = await publish(deps, { mode: "pull-request", request: REQUEST, title: "feat(widgets): add search" });
    assert.equal(first.status, "done", JSON.stringify(first));
    const second = await publish(deps, { mode: "pull-request" });
    assert.equal(second.status, "done", JSON.stringify(second));
    assert.equal(api.pulls.length, 1);
    assert.equal(api.pulls[0].draft, true);
    assert.equal("pullRequest" in second && second.pullRequest.reused, true);
    assert.equal(api.calls.filter((call) => call.startsWith("POST /repos/acme/widgets/pulls")).length, 1);
    assert.ok(minted.some((line) => line.includes('"pull_requests":"write"')));
  });

  test("a draft refused for the repository's plan opens it ready once and records why", async () => {
    const root = freshClone();
    commitFile(root, "src/a.ts", "a\n");
    runFiles(root);
    const api = stubApi({ draftsUnavailable: true });
    const { deps, record } = setup(root, { github: api });
    const result = await publish(deps, { mode: "pull-request", request: REQUEST });
    assert.equal(result.status, "done", JSON.stringify(result));
    assert.equal(api.pulls.length, 1);
    assert.equal(api.pulls[0].draft, false);
    assert.match(api.pulls[0].body, /opened ready: drafts unavailable on this plan/);
    assert.equal(api.calls.filter((call) => call.startsWith("POST /repos/acme/widgets/pulls")).length, 2, "one retry");
    assert.equal(record()?.decisions.at(-1)?.reason, "opened ready: drafts unavailable on this plan");
  });

  test("no commits since the base is not done", async () => {
    const root = freshClone();
    runFiles(root);
    const { deps, api } = setup(root);
    const result = await publish(deps, { mode: "pull-request", request: REQUEST });
    assert.equal(result.status, "refused");
    assert.match(String("reason" in result ? result.reason : ""), /no commits since the run's base/);
    assert.equal(api.pulls.length, 0);
    assert.equal(remoteTipOf(BRANCH), null);
  });

  test("the demo: the fixed template, the label, one pull request per session", async () => {
    const root = freshClone();
    commitFile(root, "src/a.ts", "a\n");
    runFiles(root, "The visitor's model wrote this body.\n");
    const { deps, api } = setup(root, { demo: true });
    const request = `Make it ${"very ".repeat(100)}fast \`\`\` and close the fence`;
    const result = await publish(deps, { mode: "pull-request", request });
    assert.equal(result.status, "done", JSON.stringify(result));
    assert.equal(api.pulls[0].body, demoBody(request, []));
    assert.ok(!api.pulls[0].body.includes("The visitor's model wrote"));
    assert.equal((api.pulls[0].body.match(/```/g) ?? []).length, 2, "the request cannot close the fence");
    assert.deepEqual(api.pulls[0].labels, ["automated-demo"]);
  });
  test("the demo: the body lists the stages this tool pushed, not the decisions or a commit message", async () => {
    const root = freshClone();
    commitFile(root, "src/a.ts", "a\n");
    runFiles(root, "The visitor's model wrote this body.\n");
    commitFile(root, "src/b.ts", "b\n", "docs: x\n\nAgent-Blueprint-Stage: Verify\nAgent-Blueprint-Stage: [click](https://evil.example)");
    const { deps, api } = setup(root, { demo: true });
    for (const stage of ["plan", "continuation", "Execute", "Review", "[click](https://evil.example)"]) {
      assert.equal((await publish(deps, { mode: "stage", stage, request: REQUEST })).status, "pushed");
    }
    const result = await publish(deps, { mode: "pull-request", request: REQUEST });
    assert.equal(result.status, "done", JSON.stringify(result));
    assert.ok(api.pulls[0].body.includes("Stages run:\n- Plan\n- Execute\n- Review\n- Ship\n"), api.pulls[0].body);
  });

  test("the demo: the visitor's recorded words fill the body when the model leaves request out, capped", async () => {
    const root = freshClone();
    commitFile(root, "src/a.ts", "a\n");
    runFiles(root);
    const words = `Add a --version flag to the command-line entry point, with a test. ${"More. ".repeat(80)}`;
    const { deps, api } = setup(root, { demo: true, visitorRequest: words });
    const result = await publish(deps, { mode: "pull-request", title: "Add a version flag" });
    assert.equal(result.status, "done", JSON.stringify(result));
    assert.equal(api.pulls[0].body, demoBody(words, []));
    const fenced = /```text\n([\s\S]*?)\n```/.exec(api.pulls[0].body)?.[1] ?? "";
    assert.ok(fenced.startsWith("Add a --version flag to the command-line entry point, with a test."), fenced);
    assert.equal(fenced.length, 300);
  });

  test("the demo: the recorded words win over the model's paraphrase", async () => {
    const root = freshClone();
    commitFile(root, "src/a.ts", "a\n");
    runFiles(root);
    const { deps, api } = setup(root, { demo: true, visitorRequest: "  Add a usage section to the README.  " });
    assert.equal((await publish(deps, { mode: "pull-request", request: REQUEST })).status, "done");
    assert.equal(api.pulls[0].body, demoBody("Add a usage section to the README.", []));
  });

  test("the demo: with no words recorded, the model's request fills the body as before", async () => {
    const root = freshClone();
    commitFile(root, "src/a.ts", "a\n");
    runFiles(root);
    const { deps, api } = setup(root, { demo: true, visitorRequest: null });
    assert.equal((await publish(deps, { mode: "pull-request", request: REQUEST })).status, "done");
    assert.equal(api.pulls[0].body, demoBody(REQUEST, []));
  });

  test("the demo (ruling 78): a run that changed BACKLOG.md is not done until the file is back as it was at the base", async () => {
    const root = freshClone();
    commitFile(root, "src/a.ts", "a\n");
    commitFile(root, "BACKLOG.md", "- [ ] Add a --json flag\n", "docs: note a follow-up");
    runFiles(root);
    const { deps, api } = setup(root, { demo: true });
    for (const mode of ["check", "pull-request"] as const) {
      const result = await publish(deps, { mode, request: REQUEST });
      assert.equal(result.status, "refused", JSON.stringify(result));
      assert.match(String("reason" in result ? result.reason : ""), /the demo leaves BACKLOG\.md out of a visitor's pull request[\s\S]*followUps/);
    }
    assert.equal(api.pulls.length, 0);
    assert.equal(remoteTipOf(BRANCH), null);
    git(["rm", "-q", "BACKLOG.md"], root);
    git(["commit", "-q", "-m", "chore: leave BACKLOG.md out of the demo pull request"], root);
    assert.equal((await publish(deps, { mode: "pull-request", request: REQUEST })).status, "done");
  });

  test("the demo (ruling 78, review #8): a stage push after the pull request opened cannot add BACKLOG.md to it", async () => {
    const root = freshClone();
    commitFile(root, "src/a.ts", "a\n");
    runFiles(root);
    const { deps, api, minted } = setup(root, { demo: true });
    assert.equal((await publish(deps, { mode: "pull-request", request: REQUEST })).status, "done");
    const opened = remoteTipOf(BRANCH);
    assert.ok(opened);
    const mintedBefore = minted.length;
    // A helper's skill appends a deferred finding, as ab-review-swarm's Defer row says to.
    writeFileSync(join(root, "BACKLOG.md"), "- [ ] Add a --json flag\n");
    const result = await publish(deps, { mode: "stage", stage: "review", request: REQUEST });
    assert.equal(result.status, "refused", JSON.stringify(result));
    assert.match(String("reason" in result ? result.reason : ""), /the demo leaves BACKLOG\.md out of a visitor's pull request[\s\S]*followUps/);
    assert.equal(remoteTipOf(BRANCH), opened, "the open pull request's branch is unchanged");
    assert.equal(minted.length, mintedBefore, "no token was minted for the refused push");
    assert.equal(api.pulls.length, 1);
    // Put back as the refusal says, the next stage push goes ahead.
    git(["rm", "-q", "BACKLOG.md"], root);
    git(["commit", "-q", "-m", "chore: leave BACKLOG.md out of the demo pull request"], root);
    assert.equal((await publish(deps, { mode: "stage", stage: "review", request: REQUEST })).status, "pushed");
    assert.ok(!git(["diff", "--name-only", "origin/main", remoteTipOf(BRANCH) ?? ""], root).includes("BACKLOG.md"));
  });

  test("the demo (ruling 78): BACKLOG.md at the base, changed or deleted by the run, is refused until checked out from the base", async () => {
    const root = freshClone();
    // The sample keeps a BACKLOG.md; here the base carries one, as origin/HEAD would after a fetch.
    commitFile(root, "BACKLOG.md", "- [ ] An item the repository already tracks\n", "docs: the repository's backlog");
    git(["update-ref", "refs/remotes/origin/main", "HEAD"], root);
    const base = git(["rev-parse", "HEAD"], root);
    commitFile(root, "src/a.ts", "a\n");
    runFiles(root);
    const { deps } = setup(root, { demo: true });
    const reason = async () => {
      const result = await publish(deps, { mode: "check", request: REQUEST });
      return result.status === "ready" ? null : String("reason" in result ? result.reason : result.status);
    };

    // Changed, then restored with the refusal's own remedy.
    commitFile(root, "BACKLOG.md", "- [ ] An item the repository already tracks\n- [ ] Add a --json flag\n", "docs: note a follow-up");
    const changed = await reason();
    assert.match(String(changed), /the demo leaves BACKLOG\.md out of a visitor's pull request/);
    assert.ok(String(changed).includes(`git checkout ${base} -- BACKLOG.md`), String(changed));
    git(["checkout", base, "--", "BACKLOG.md"], root);
    git(["commit", "-q", "-m", "chore: leave BACKLOG.md out of the demo pull request"], root);
    assert.equal(await reason(), null);

    // Deleted, then brought back the same way.
    git(["rm", "-q", "BACKLOG.md"], root);
    git(["commit", "-q", "-m", "chore: drop the backlog"], root);
    assert.match(String(await reason()), /the demo leaves BACKLOG\.md out of a visitor's pull request/);
    git(["checkout", base, "--", "BACKLOG.md"], root);
    git(["commit", "-q", "-m", "chore: leave BACKLOG.md out of the demo pull request"], root);
    assert.equal(await reason(), null);
  });

  test("off the demo, a run that changed BACKLOG.md publishes as before", async () => {
    const root = freshClone();
    commitFile(root, "BACKLOG.md", "- [ ] Add a --json flag\n", "docs: note a follow-up");
    runFiles(root);
    const { deps, api } = setup(root);
    assert.equal((await publish(deps, { mode: "pull-request", request: REQUEST, followUps: ["Add a --json flag"] })).status, "done");
    assert.equal(api.pulls[0].body, "Adds widget search.\n", "a deployer's body is pr-body.md, followUps unused");
  });

  test("the demo: the follow-ups go into the body in a fence, after the stages; the schema's 5 of 120 characters land whole (review #7)", async () => {
    const root = freshClone();
    commitFile(root, "src/a.ts", "a\n");
    runFiles(root);
    const { deps, api } = setup(root, { demo: true });
    const followUps = ["Close the fence ``` here ".padEnd(120, "y"), ...[1, 2, 3, 4].map((n) => `Follow-up ${n} `.padEnd(120, "x"))];
    const schema = publishTool.inputSchema;
    assert.ok(schema.safeParse({ mode: "pull-request", followUps }).success, "the most the schema takes");
    assert.ok(!schema.safeParse({ mode: "pull-request", followUps: [...followUps, "a sixth"] }).success, "at most 5");
    assert.ok(!schema.safeParse({ mode: "pull-request", followUps: ["z".repeat(121)] }).success, "at most 120 characters each");
    assert.match(String(schema.shape.followUps.description), /up to 5 follow-ups of 120 characters each/);

    assert.equal((await publish(deps, { mode: "pull-request", request: REQUEST, followUps })).status, "done");
    const body = api.pulls[0].body;
    assert.equal(body, demoBody(REQUEST, [], followUps));
    assert.ok(body.indexOf("Stages run:") < body.indexOf("Follow-ups for later:"), body);
    const fenced = /Follow-ups for later:\n\n```text\n([\s\S]*?)\n```/.exec(body)?.[1] ?? "";
    assert.equal(fenced, followUps.map((item) => `- ${item.replaceAll("`", "'")}`).join("\n"), "every follow-up the schema allows lands whole");
    assert.equal((body.match(/```/g) ?? []).length, 4, "neither the request nor a follow-up can close a fence");
    assert.ok(!demoBody(REQUEST, []).includes("Follow-ups"), "no follow-ups, no section");

    // The last defence for a caller past the schema: the list stops at what 5 whole items take.
    const oversized = /Follow-ups for later:\n\n```text\n([\s\S]*?)\n```/.exec(demoBody(REQUEST, [], Array.from({ length: 10 }, () => "z".repeat(500))))?.[1] ?? "";
    assert.equal(oversized.length, fenced.length);
  });

  test("the visitor's words are the text parts of the first delivery; files are left out", () => {
    assert.equal(visitorText([{ kind: "text", text: "  Add a --version flag.  " }]), "Add a --version flag.");
    assert.equal(visitorText([{ kind: "text", text: "First line" }, { kind: "file" }, { kind: "text", text: "second line" }]), "First line\nsecond line");
    assert.equal(visitorText([{ kind: "file" }]), "");
    assert.equal(visitorText([]), "");
  });
});

describe("the idle sandbox before the window", () => {
  test("a background process is stopped first; one that will not stop is needs-human and nothing is pushed", async () => {
    const root = freshClone();
    commitFile(root, "src/a.ts", "a\n");
    runFiles(root);
    const stopped: number[][] = [];
    const stubborn = setup(root, {
      listProcesses: async () => [{ pid: 4242, args: "bash -c while true; do git push; done" }],
      stopProcesses: async (pids) => void stopped.push([...pids]),
    });
    const result = await publish(stubborn.deps, { mode: "stage", stage: "plan", request: REQUEST });
    assert.equal(result.status, "needs-human", JSON.stringify(result));
    assert.match(String("reason" in result ? result.reason : ""), /4242/);
    assert.deepEqual(stopped, [[4242]]);
    assert.equal(remoteTipOf(BRANCH), null);
    assert.equal(stubborn.minted.length, 0, "no token is minted while a straggler runs");

    let running = [{ pid: 4343, args: "sleep 600" }];
    const stoppable = setup(root, {
      listProcesses: async () => running,
      stopProcesses: async () => void (running = []),
    });
    assert.equal((await publish(stoppable.deps, { mode: "stage", stage: "plan", request: REQUEST })).status, "pushed");
  });
});

// Ruling 60: every live run asked "Approve Publish branch?" for each pull-request call. An approved
// call records who approved it for the session and branch; the approval policy lets a later call of
// the same run go ahead only when that record and Eve's own memory of the person's answer agree.
describe("a later run on the session's branch (ruling 136)", () => {
  const BASE = "a".repeat(40);
  test("its description joins the body between its markers, and a retry replaces only that", () => {
    const first = continuedBody("Adds a greeting.\n", BASE, "Adds a farewell.\n");
    assert.equal(first, `Adds a greeting.\n\n<!-- ab-run:${BASE} -->\nAdds a farewell.\n<!-- /ab-run:${BASE} -->\n`);
    const edited = `A person's note.\n\n${first}\nA later note.\n`;
    const retried = continuedBody(edited, BASE, "Adds a kinder farewell.\n");
    assert.ok(retried.startsWith("A person's note.\n\nAdds a greeting."));
    assert.ok(retried.endsWith("\nA later note.\n"));
    assert.ok(retried.includes("Adds a kinder farewell."));
    assert.ok(!retried.includes("Adds a farewell."));
    const third = continuedBody(retried, "b".repeat(40), "A third change.\n");
    assert.ok(third.includes("Adds a kinder farewell.") && third.includes("A third change."), "each run keeps its own section");
    assert.equal(continuedBody("", BASE, "Only this.\n"), `<!-- ab-run:${BASE} -->\nOnly this.\n<!-- /ab-run:${BASE} -->\n`);
    // A person removes the closing marker and writes below it: two retries keep everything.
    const unclosed = `${first.replace(`<!-- /ab-run:${BASE} -->`, "")}\nA person's line.\n`;
    const once = continuedBody(unclosed, BASE, "Retry one.\n");
    const twice = continuedBody(once, BASE, "Retry two.\n");
    assert.ok(twice.includes("Adds a greeting.") && twice.includes("Adds a farewell.") && twice.includes("A person's line."), twice);
    assert.ok(twice.includes("Retry two.") && !twice.includes("Retry one."), twice);
    assert.equal(twice.split(`<!-- ab-run:${BASE} -->`).length - 1, 1);
  });

  test("the pull request keeps its number and title and gains the description; a run that continues nothing replaces the body", async () => {
    const root = freshClone();
    commitFile(root, "src/a.ts", "a\n");
    runFiles(root, "Adds search.\n");
    const { deps, api, record, setRecord } = setup(root);
    assert.equal((await publish(deps, { mode: "pull-request", request: REQUEST, title: "feat(widgets): add search" })).status, "done");
    const title = api.pulls[0].title;
    runFiles(root, "Adds search, revised.\n");
    await publish(deps, { mode: "pull-request" });
    assert.equal(api.pulls[0].body, "Adds search, revised.\n", "a run that continues nothing replaces the body");
    const head = git(["rev-parse", "HEAD"], root);
    setRecord(restartRecord(record()!, head, "2026-10-29T04:00:00.000Z"));
    commitFile(root, "src/b.ts", "b\n");
    runFiles(root, "Adds filters.\n");
    const second = await publish(deps, { mode: "pull-request", request: "Add filters" });
    assert.equal(second.status, "done", JSON.stringify(second));
    assert.equal("pullRequest" in second && second.pullRequest.reused, true);
    assert.equal(api.pulls.length, 1);
    assert.equal(api.pulls[0].title, title);
    assert.ok(api.pulls[0].body.startsWith("Adds search, revised.\n"));
    assert.ok(api.pulls[0].body.includes(`<!-- ab-run:${head} -->\nAdds filters.`));
    const retry = await publish(deps, { mode: "pull-request" });
    assert.equal(retry.status, "done");
    assert.equal((api.pulls[0].body.match(/Adds filters\./g) ?? []).length, 1);
  });

  test("a restart clears the approval, and a commit the pull request has not had asks again even without the flag", async () => {
    const root = freshClone();
    commitFile(root, "src/a.ts", "a\n");
    runFiles(root);
    const { deps, record } = setup(root, { approvedBy: "telegram:1001" });
    assert.equal((await publish(deps, { mode: "pull-request", request: REQUEST })).status, "done");
    const head = git(["rev-parse", "HEAD"], root);
    const saved = record()!;
    assert.equal(saved.pullRequest?.sha, head);
    assert.equal(approvalHolds(saved, SESSION, head), true, "a retry on the same commit");
    assert.equal(approvalHolds(saved, SESSION, "f".repeat(40)), false, "a new commit");
    assert.equal(approvalHolds({ ...saved, pullRequest: { ...saved.pullRequest!, sha: undefined } }, SESSION, "f".repeat(40)), true, "a record from before the commit was kept");
    assert.equal(approvalHolds(restartRecord(saved, head, "2026-10-29T04:00:00.000Z"), SESSION, head), false);
  });

  test("the demo: a refused BACKLOG.md commit stays refused after a restart moves the base", async () => {
    const root = freshClone();
    const { deps, record, setRecord } = setup(root, { demo: true });
    commitFile(root, "BACKLOG.md", "- [ ] Add a --json flag\n", "docs: note a follow-up");
    const refused = await publish(deps, { mode: "stage", stage: "plan", request: REQUEST });
    assert.equal(refused.status, "refused");
    setRecord(restartRecord(record()!, git(["rev-parse", "HEAD"], root), "2026-10-29T04:00:00.000Z"));
    const again = await publish(deps, { mode: "stage", stage: "plan", request: REQUEST });
    assert.equal(again.status, "refused", JSON.stringify(again));
    assert.match(String("reason" in again ? again.reason : ""), /the demo leaves BACKLOG\.md out/);
    commitFile(root, "src/a.ts", "a\n");
    const ready = await publish(deps, { mode: "pull-request", request: REQUEST });
    assert.equal(ready.status, "refused", "the pull-request path reads the first base too");
    assert.match(String("reason" in ready ? ready.reason : ""), /the demo leaves BACKLOG\.md out/);
  });
});

describe("one approval per run (ruling 60)", () => {
  test("an approved pull-request call records who approved it; another session or branch does not match", async () => {
    const root = freshClone();
    commitFile(root, "src/a.ts", "a\n");
    runFiles(root);
    const { deps, record } = setup(root, { approvedBy: "telegram:1001" });
    const result = await publish(deps, { mode: "pull-request", request: REQUEST });
    assert.equal(result.status, "done", JSON.stringify(result));
    const saved = record();
    assert.ok(saved);
    assert.deepEqual(saved.approval, { sessionId: SESSION, branch: BRANCH, by: "telegram:1001", at: "2026-10-29T03:00:00.000Z" });
    assert.deepEqual(approvedEarlier(saved, SESSION), saved.approval);
    assert.equal(approvedEarlier(saved, "sess_another_session_1"), null, "a new session asks again");
    assert.equal(approvedEarlier({ ...saved, branch: "ab/other-feature-89abcdef" }, SESSION), null, "a different branch asks again");
    assert.equal(approvedEarlier(null, SESSION), null);
  });

  test("a later approved call in the run keeps the first approval", async () => {
    const root = freshClone();
    commitFile(root, "src/a.ts", "a\n");
    runFiles(root);
    const first = setup(root, { approvedBy: "telegram:1001" });
    assert.equal((await publish(first.deps, { mode: "pull-request", request: REQUEST })).status, "done");
    const again = await publish({ ...first.deps, approvedBy: "the person on this channel", now: () => "2026-10-29T04:00:00.000Z" }, { mode: "pull-request" });
    assert.equal(again.status, "done", JSON.stringify(again));
    assert.equal(first.record()?.approval?.by, "telegram:1001");
    assert.equal(first.record()?.approval?.at, "2026-10-29T03:00:00.000Z");
  });

  test("a call nobody approved (unattended or the demo) records no approval", async () => {
    const root = freshClone();
    commitFile(root, "src/a.ts", "a\n");
    runFiles(root);
    const { deps, record } = setup(root);
    assert.equal((await publish(deps, { mode: "pull-request", request: REQUEST })).status, "done");
    assert.equal(record()?.approval ?? null, null);
    assert.equal(approvedEarlier(record(), SESSION), null);
  });

  test("a stage or check call never records an approval, even with a responder", async () => {
    const root = freshClone();
    commitFile(root, "src/a.ts", "a\n");
    runFiles(root);
    const { deps, record } = setup(root, { approvedBy: "telegram:1001" });
    assert.equal((await publish(deps, { mode: "stage", stage: "plan", request: REQUEST })).status, "pushed");
    assert.equal(record()?.approval ?? null, null);
  });
});

// Ruling 59: the first live Telegram run asked the person three times for calls that could not
// succeed. Check mode runs the done rule and the straggler check with no approval, token or push,
// and the approval policy reads the same done rule (readiness) before it asks.
describe("check mode and the reading before the approval (ruling 59)", () => {
  test("no pull request body: check refuses with the reason, mints nothing, pushes nothing, writes no record", async () => {
    const root = freshClone();
    commitFile(root, "src/a.ts", "a\n");
    runFiles(root, "");
    const { deps, minted, record, api } = setup(root);
    const result = await publish(deps, { mode: "check", request: REQUEST });
    assert.equal(result.status, "refused", JSON.stringify(result));
    assert.match(String("reason" in result ? result.reason : ""), /\.agent-blueprint\/run\/pr-body\.md is missing or empty/);
    assert.equal("branch" in result && result.branch, BRANCH, "the branch the run will use");
    assert.equal(minted.length, 0);
    assert.equal(api.calls.length, 0);
    assert.equal(remoteTipOf(BRANCH), null);
    assert.equal(record(), null, "check writes no record, so the first pull-request call still names the branch");
    assert.match(String(await readiness(deps.sandbox, null, false)), /pr-body\.md is missing or empty/, "the approval policy would deny it unasked");
  });

  test("no commits or an uncommitted tracked change: refused, the same reasons as pull-request mode", async () => {
    const root = freshClone();
    runFiles(root);
    const { deps } = setup(root);
    const none = await publish(deps, { mode: "check", request: REQUEST });
    assert.match(String("reason" in none ? none.reason : ""), /no commits since the run's base/);
    commitFile(root, "src/a.ts", "a\n");
    writeFileSync(join(root, "src/a.ts"), "changed\n");
    const dirty = await publish(deps, { mode: "check", request: REQUEST });
    assert.match(String("reason" in dirty ? dirty.reason : ""), /tracked files still have uncommitted changes/);
    assert.match(String(await readiness(deps.sandbox, null, false)), /uncommitted changes/);
  });

  test("ready: check reports ready with the branch and the commit; readiness is null; nothing is published", async () => {
    const root = freshClone();
    commitFile(root, "src/a.ts", "a\n");
    runFiles(root);
    const { deps, minted, api } = setup(root);
    const result = await publish(deps, { mode: "check", request: REQUEST });
    assert.equal(result.status, "ready", JSON.stringify(result));
    assert.equal("sha" in result && result.sha, git(["rev-parse", "HEAD"], root));
    assert.equal("branch" in result && result.branch, BRANCH);
    assert.equal(await readiness(deps.sandbox, null, false), null);
    assert.equal(minted.length, 0);
    assert.equal(api.calls.length, 0);
    assert.equal(remoteTipOf(BRANCH), null);
    const opened = await publish(deps, { mode: "pull-request", request: REQUEST });
    assert.equal(opened.status, "done", JSON.stringify(opened));
  });

  test("a straggler: check stops it and reports ready; one that will not stop is needs-human, at most three named", async () => {
    const root = freshClone();
    commitFile(root, "src/a.ts", "a\n");
    runFiles(root);
    let running = [{ pid: 880, args: "python -m http.server 8000" }];
    const stoppable = setup(root, { listProcesses: async () => running, stopProcesses: async () => void (running = []) });
    assert.equal((await publish(stoppable.deps, { mode: "check", request: REQUEST })).status, "ready");
    const stubborn = [1, 2, 3, 4, 5].map((n) => ({ pid: 900 + n, args: `sleep ${n}00` }));
    const stuck = setup(root, { listProcesses: async () => stubborn });
    const result = await publish(stuck.deps, { mode: "check", request: REQUEST });
    assert.equal(result.status, "needs-human", JSON.stringify(result));
    const reason = String("reason" in result ? result.reason : "");
    assert.match(reason, /901 sleep 100; 902 sleep 200; 903 sleep 300; and 2 more/);
    assert.ok(!reason.includes("904"), reason);
    assert.equal(stuck.minted.length, 0);
  });

  test("the demo: its body is the fixed template, so a missing pr-body.md is not a refusal", async () => {
    const root = freshClone();
    commitFile(root, "src/a.ts", "a\n");
    runFiles(root, "");
    const { deps } = setup(root, { demo: true });
    assert.equal((await publish(deps, { mode: "check", request: REQUEST })).status, "ready");
  });
});

test("stageList names each stage once, in order, without continuation, and adds Ship when any ran", () => {
  assert.deepEqual(stageList(["plan", "", "continuation", "Execute", "Review", "review", "verify"]), ["Plan", "Execute", "Review", "Verify", "Ship"]);
  assert.deepEqual(stageList(["ship"]), [], "a lone ship stage is no stage run");
  assert.deepEqual(stageList(["![x](https://evil.example/a.png)"]), [], "only a stage's name");
  assert.deepEqual(stageList(["continuation", "", " "]), []);
  assert.deepEqual(stageList([]), []);
});
