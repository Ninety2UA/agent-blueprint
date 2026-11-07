// The ship loop (one iteration per call) against a sandbox that runs real git on this machine and
// a bare repository standing in for GitHub. The token is a placeholder: a file:// remote asks for
// none, and the publish tool's own credential and scan paths are tests/publish.test.ts's.
import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync, existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
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
const { shipIteration, DEFAULT_CEILING } = await import("../agent/tools/ship_pipeline.ts");
const { publish } = await import("../agent/tools/publish_branch.ts");
type ShipDeps = Parameters<typeof shipIteration>[0];
type RunRecord = NonNullable<ReturnType<ShipDeps["store"]["get"]>>;

const SESSION = "sess_ship0123456789";
const VERSIONS = { eve: "0.86.0", product: "4.2.1" };
const SCRIPTS = join(import.meta.dirname, "..", "..", "skills", "ab-ship-pipeline", "scripts");
const REQUEST = "Add a greeting command to the widgets tool";

let work = "";
let bare = "";

function git(args: string[], cwd: string): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.com", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.com" },
  }).trim();
}

before(() => {
  work = mkdtempSync(join(tmpdir(), "ab-ship-test-"));
  bare = join(work, "widgets.git");
  git(["init", "-q", "--bare", "-b", "main", bare], work);
  const seed = join(work, "seed");
  mkdirSync(seed);
  git(["init", "-q", "-b", "main"], seed);
  writeFileSync(join(seed, "README.md"), "widgets\n");
  git(["add", "README.md"], seed);
  git(["commit", "-q", "-m", "seed"], seed);
  git(["push", "-q", bare, "main"], seed);
});

after(async () => {
  await rm(work, { recursive: true, force: true });
});

// Every test runs as the same session, so a branch an earlier test pushed would look foreign.
beforeEach(() => {
  for (const ref of git(["for-each-ref", "--format=%(refname)", "refs/heads/ab/"], bare).split("\n").filter(Boolean)) {
    git(["update-ref", "-d", ref], bare);
  }
});

// A fresh clone, as clone_repository leaves one: origin names github.com, origin/HEAD is set.
let clones = 0;
function freshClone(): string {
  const root = join(work, `clone-${(clones += 1)}`);
  execFileSync("git", ["clone", "-q", bare, root]);
  git(["remote", "set-url", "origin", "https://github.com/acme/widgets"], root);
  git(["checkout", "-q", "-b", "work"], root);
  git(["config", "user.name", "t"], root);
  git(["config", "user.email", "t@example.com"], root);
  mkdirSync(join(root, ".agent-blueprint"), { recursive: true });
  writeFileSync(join(root, ".agent-blueprint", ".gitignore"), "run/\nteam/\nreview-runs/\ncache/\n.gitignore\n");
  return root;
}

function writeState(root: string, fields: Record<string, unknown>): void {
  mkdirSync(join(root, ".agent-blueprint", "run"), { recursive: true });
  const state = {
    status: "running",
    stage: "plan",
    iteration: 1,
    host: "eve",
    driver: "runner",
    session_id: "ab-greeting-sess",
    decisions: [],
    provenance: { skill: "ab-ship-pipeline", version: VERSIONS.product },
    reason: "",
    updated_at: "2026-10-29T10:00:00Z",
    ...fields,
  };
  writeFileSync(join(root, ".agent-blueprint", "run", "state.json"), JSON.stringify(state));
}

function localSandbox(root: string, failOn: RegExp[] = []): SandboxSession {
  const parts: Pick<SandboxSession, "run" | "writeFiles" | "removePath" | "resolvePath"> = {
    run: ({ command, env = {} }) => {
      const fail = failOn.findIndex((pattern) => pattern.test(command));
      if (fail >= 0) {
        failOn.splice(fail, 1);
        return Promise.reject(new Error("the sandbox went away"));
      }
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

function setup(root: string, options: Partial<ShipDeps> & { failOn?: RegExp[] } = {}) {
  const { failOn, ...overrides } = options;
  let record: RunRecord | null = null;
  const deps: ShipDeps = {
    sandbox: localSandbox(root, failOn),
    store: { get: () => record, set: (value) => (record = value) },
    sessionId: SESSION,
    posture: "unattended",
    demo: false,
    route: "command",
    hosts: [],
    versions: VERSIONS,
    scripts: { outgoing: readFileSync(join(SCRIPTS, "outgoing-commits.sh"), "utf8"), scan: readFileSync(join(SCRIPTS, "scan-secrets.sh"), "utf8") },
    mint: async () => "placeholder-token",
    api: { fetch: (async () => new Response("{}", { status: 500 })) as typeof fetch, url: "https://api.test" },
    remoteUrl: () => `file://${bare}`,
    listProcesses: async () => [],
    stopProcesses: async () => {},
    now: () => "2026-10-29T10:00:00.000Z",
    ...overrides,
  };
  return { deps, record: () => record };
}

function remoteTip(branch: string): string | null {
  return git(["for-each-ref", "--format=%(objectname)", `refs/heads/${branch}`], bare) || null;
}

/** setup with the turn each call runs in: the same turn until a test names a later one. */
function turns(root: string) {
  const { deps, record } = setup(root);
  return {
    deps: (turnId = "turn-1") => ({ ...deps, turnId }),
    record,
    set: (value: RunRecord) => deps.store.set(value),
  };
}

describe("one iteration per call", () => {
  test("the first call counts iteration 1, makes the record and briefs a planner copy from Stage 0", async () => {
    const root = freshClone();
    const { deps, record } = setup(root);
    const result = await shipIteration(deps, { request: REQUEST });
    assert.equal(result.outcome, "iterate");
    assert.deepEqual([result.iteration, result.ceiling, result.stage, result.role], [1, DEFAULT_CEILING, null, "planner"]);
    assert.equal(DEFAULT_CEILING, 10, "run.sh's default --max");
    assert.match(result.brief ?? "", /^Use the ab-ship-pipeline skill for this feature, whatever its size: Add a greeting command to the widgets tool --external\n/);
    assert.match(result.brief ?? "", /run the skill on this request and never hand over to another skill such as ab-quick-fix or ab-build-pipeline/);
    assert.match(result.brief ?? "", /Ship loop iteration 1 of at most 10\. You work as the planner role, from Stage 0\./);
    assert.match(result.brief ?? "", /never push or open a pull request/);
    assert.match(result.brief ?? "", /Stage finished: <the stage>/);
    assert.equal(record()?.iteration, 1);
    assert.equal(record()?.base, git(["rev-parse", "origin/main"], root));
    assert.equal(record()?.branch, "ab/add-a-greeting-command-to-the-widgets-23456789");
    assert.equal(remoteTip(record()!.branch), null, "an iteration pushes nothing");
  });

  test("the tool reads state.json: its stage picks the role and the brief", async () => {
    const root = freshClone();
    const { deps } = setup(root);
    const roles: string[] = [];
    for (const stage of ["continuation", "plan", "execute", "review", "verify", "ship"]) {
      writeState(root, { stage });
      const result = await shipIteration(deps, { request: REQUEST });
      assert.equal(result.stage, stage);
      assert.match(result.brief ?? "", new RegExp(`from the ${stage} stage`));
      roles.push(`${stage}=${result.role}`);
    }
    assert.deepEqual(roles, ["continuation=planner", "plan=planner", "execute=builder", "review=reviewer", "verify=tester", "ship=documenter"]);
  });

  test("a state file that fails the checks is not trusted: the next brief says so", async () => {
    const root = freshClone();
    const { deps } = setup(root);
    writeState(root, { status: "done", provenance: { skill: "ab-ship-pipeline", version: "4.1.0" } });
    const result = await shipIteration(deps, { request: REQUEST });
    assert.equal(result.outcome, "iterate");
    assert.match(result.reason, /provenance names ab-ship-pipeline 4\.1\.0, not ab-ship-pipeline 4\.2\.1/);
    assert.match(result.brief ?? "", /left no valid state file/);
  });
});

describe("the done rule", () => {
  test("status done with no commits since the recorded base is not done", async () => {
    const root = freshClone();
    const { deps } = setup(root);
    writeState(root, { status: "done", stage: "ship" });
    writeFileSync(join(root, ".agent-blueprint", "run", "pr-body.md"), "Adds a greeting.\n");
    const result = await shipIteration(deps, { request: REQUEST });
    assert.equal(result.outcome, "iterate");
    assert.match(result.reason, /state\.json says done, but no commits since the recorded base; not done/);
    assert.match(result.brief ?? "", /set status done, but no commits since the recorded base/);
  });

  test("status done with commits since the base and the pull request body: done, nothing pushed by the loop", async () => {
    const root = freshClone();
    const { deps, record } = setup(root);
    writeFileSync(join(root, "greet.sh"), "echo hello\n");
    git(["add", "greet.sh"], root);
    git(["commit", "-q", "-m", "feat: greet"], root);
    writeState(root, { status: "done", stage: "ship" });
    writeFileSync(join(root, ".agent-blueprint", "run", "pr-body.md"), "Adds a greeting.\n");
    const result = await shipIteration(deps, { request: REQUEST });
    assert.equal(result.outcome, "done");
    assert.match(result.reason, /publish_branch with mode pull-request/);
    assert.equal(result.brief, null);
    assert.equal(remoteTip(record()!.branch), null);
  });

  test("a new request after a finished run starts again: newWork clears the state and the count, and the brief carries the new request", async () => {
    const root = freshClone();
    const { deps, record } = setup(root);
    writeFileSync(join(root, "greet.sh"), "echo hello\n");
    git(["add", "greet.sh"], root);
    git(["commit", "-q", "-m", "feat: greet"], root);
    writeState(root, { status: "done", stage: "ship" });
    writeFileSync(join(root, ".agent-blueprint", "run", "pr-body.md"), "Adds a greeting.\n");
    assert.equal((await shipIteration({ ...deps, turnId: "turn-1" }, { request: REQUEST })).outcome, "done");
    const again = await shipIteration({ ...deps, turnId: "turn-2" }, { request: "Add a farewell command", newWork: true });
    assert.equal(again.outcome, "iterate");
    assert.equal(again.iteration, 1);
    assert.equal(again.stage, null);
    assert.equal(again.restarted, true);
    assert.match(again.brief ?? "", /Add a farewell command/);
    assert.ok(!existsSync(join(root, ".agent-blueprint", "run", "pr-body.md")), "the finished run's body is gone");
    assert.equal(record()!.iteration, 1);
    assert.equal((await shipIteration(deps, { request: "Add a farewell command" })).iteration, 2, "without the flag it continues");
  });

  test("a new request keeps the session's branch and pull request and starts everything else again", async () => {
    const root = freshClone();
    const { deps, record, set } = turns(root);
    await publish(deps(), { mode: "stage", stage: "plan", request: REQUEST });
    writeFileSync(join(root, "greet.sh"), "echo hello\n");
    git(["add", "greet.sh"], root);
    git(["commit", "-q", "-m", "feat: greet"], root);
    writeState(root, { status: "done", stage: "ship" });
    writeFileSync(join(root, ".agent-blueprint", "run", "pr-body.md"), "Adds a greeting.\n");
    assert.equal((await shipIteration(deps(), { request: REQUEST })).outcome, "done");
    const pullRequest = { number: 7, url: "https://github.com/acme/widgets/pull/7", draft: true, sha: git(["rev-parse", "HEAD"], root) };
    set({ ...record()!, pullRequest, approval: { sessionId: SESSION, branch: record()!.branch, by: "someone", at: "now" } });
    const before = record()!;
    const head = git(["rev-parse", "HEAD"], root);
    const again = await shipIteration(deps("turn-2"), { request: "Add a farewell command", newWork: true });
    assert.equal(again.branch, before.branch);
    const after = record()!;
    assert.deepEqual([after.branch, after.repository, after.lastPushedSha], [before.branch, before.repository, before.lastPushedSha]);
    assert.deepEqual(after.pullRequest, pullRequest);
    assert.equal(after.base, head, "done needs a commit after the restart");
    assert.equal(after.firstBase, before.base);
    assert.equal(after.continued, true);
    assert.deepEqual([after.stage, after.approval, after.pending], [null, null, null]);
    assert.deepEqual(after.stagesPushed, []);
    assert.deepEqual(after.files, {});
    assert.equal(after.iteration, 1);
    // Status done with no commit since the restart is not done.
    writeState(root, { status: "done", stage: "ship" });
    writeFileSync(join(root, ".agent-blueprint", "run", "pr-body.md"), "Adds a farewell.\n");
    const notYet = await shipIteration(deps("turn-2"), { request: "Add a farewell command" });
    assert.equal(notYet.outcome, "iterate");
    assert.match(notYet.reason, /no commits since the recorded base/);
    // With a commit after the restart the done rule holds on the moved base.
    writeFileSync(join(root, "bye.sh"), "echo bye\n");
    git(["add", "bye.sh"], root);
    git(["commit", "-q", "-m", "feat: farewell"], root);
    assert.equal((await shipIteration(deps("turn-2"), { request: "Add a farewell command" })).outcome, "done");
  });

  test("a new request while a run is going, or one that answers its question, carries the run on: the state stays and the count goes on", async () => {
    for (const status of ["running"]) {
      const root = freshClone();
      const { deps, record } = turns(root);
      await shipIteration(deps(), { request: REQUEST });
      writeState(root, { status, stage: "review", reason: "Which one?" });
      writeFileSync(join(root, ".agent-blueprint", "run", "pr-body.md"), "A body.\n");
      const result = await shipIteration(deps("turn-2"), { request: "Something else", newWork: true });
      assert.equal(result.iteration, 2, status);
      assert.equal(result.restarted, undefined);
      assert.match(result.reason, /did not start a new request/);
      assert.equal(result.stage, "review");
      assert.ok(existsSync(join(root, ".agent-blueprint", "run", "state.json")));
      assert.ok(existsSync(join(root, ".agent-blueprint", "run", "pr-body.md")));
      assert.equal(record()!.iteration, 2);
    }
  });

  test("the flag on every call in one turn never resets the count, whatever ceiling it asks for", async () => {
    for (const ceiling of [undefined, 1]) {
      const root = freshClone();
      const { deps } = turns(root);
      let reached = false;
      for (let call = 1; call <= 26; call += 1) {
        const result = await shipIteration(deps(), { request: REQUEST, newWork: true, ...(ceiling ? { ceiling } : {}) });
        assert.equal(result.iteration, call, `call ${call}`);
        assert.equal(result.restarted, undefined);
        if (result.outcome === "ceiling") reached = true;
        else assert.equal(reached, false, "once at the ceiling it stays there");
      }
      assert.equal(reached, true);
    }
  });

  test("after a blocked stop the flag starts the new request from a later turn; without it the old stop comes back", async () => {
    const root = freshClone();
    const { deps } = turns(root);
    await shipIteration(deps(), { request: REQUEST });
    writeState(root, { status: "blocked", stage: "execute", reason: "the tests need a database" });
    assert.equal((await shipIteration(deps(), { request: REQUEST })).outcome, "blocked");
    assert.equal((await shipIteration(deps("turn-2"), { request: REQUEST })).outcome, "blocked", "the run's own request, the same stop");
    const refused = await shipIteration(deps("turn-2"), { request: "Something else", newWork: true });
    assert.equal(refused.outcome, "blocked", "the turn that already ran the loop");
    const again = await shipIteration(deps("turn-3"), { request: "Something else", newWork: true });
    assert.deepEqual([again.outcome, again.iteration, again.stage, again.restarted], ["iterate", 1, null, true]);
  });

  test("a request in other words starts a new run once the earlier one ended, without the flag; the run's own request carries it on", async () => {
    const root = freshClone();
    const { deps, record } = turns(root);
    await shipIteration(deps(), { request: REQUEST });
    writeState(root, { status: "blocked", stage: "execute", reason: "the tests need a database" });
    const sameTurn = await shipIteration(deps(), { request: "Add a farewell command" });
    assert.equal(sameTurn.outcome, "blocked", "a loop inside one turn never starts anew");
    assert.match(sameTurn.reason, /did not start a new request/);
    const again = await shipIteration(deps("turn-2"), { request: "  add a GREETING command to the widgets tool!  " });
    assert.deepEqual([again.outcome, again.restarted], ["blocked", undefined], "the run's own words, spaced and cased otherwise, carry it on");
    const fresh = await shipIteration(deps("turn-3"), { request: "Add a --json flag to the list command" });
    assert.deepEqual([fresh.outcome, fresh.iteration, fresh.stage, fresh.restarted], ["iterate", 1, null, true]);
    assert.equal(record()!.request, "add a json flag to the list command");
  });

  test("a new request instead of an answer drops the open question and starts the new work; an answer, or the same request, keeps the question", async () => {
    const root = freshClone();
    const { deps, record } = turns(root);
    await shipIteration(deps(), { request: REQUEST });
    writeState(root, { status: "needs-human", stage: "review", reason: "Keep the old flag?" });
    assert.equal((await shipIteration(deps("turn-2"), { request: REQUEST })).outcome, "needs-human", "the same request asks again");
    assert.equal((await shipIteration(deps("turn-3"), { request: "Something else", answer: "Keep it" })).restarted, undefined, "an answer is an answer");
    writeState(root, { status: "needs-human", stage: "review", reason: "Keep the old flag?" });
    const taken = await shipIteration(deps("turn-4"), { request: "Add a --json flag to the list command" });
    assert.deepEqual([taken.outcome, taken.iteration, taken.stage, taken.restarted], ["iterate", 1, null, true]);
    assert.ok(record()!.decisions.some((decision) => decision.question === "Keep the old flag?" && decision.choice === "dropped by the person: a new request took over" && decision.stage === "review"));
    assert.ok(!existsSync(join(root, ".agent-blueprint", "run", "state.json")));
  });

  test("a record from before the request was kept starts anew only with the flag, and an unrun request never becomes its own", async () => {
    const root = freshClone();
    const { deps, record, set } = turns(root);
    await shipIteration(deps(), { request: REQUEST });
    const { request: _request, ...legacy } = record()!;
    set(legacy as RunRecord);
    writeState(root, { status: "done", stage: "ship" });
    const carried = await shipIteration(deps("turn-2"), { request: "Something else" });
    assert.equal(carried.restarted, undefined);
    assert.match(carried.reason, /predates request matching, so it carries on; a new request here needs newWork/);
    assert.equal(record()!.request, undefined, "the unrun request is not kept");
    const fresh = await shipIteration(deps("turn-3"), { request: "Something else", newWork: true });
    assert.equal(fresh.restarted, true);
    assert.equal(record()!.request, "something else", "a run that starts keeps its request");
  });

  test("an answer carries the run on, whatever its wording, even after the ceiling or with the flag", async () => {
    const root = freshClone();
    const { deps, record, set } = turns(root);
    await shipIteration(deps(), { request: REQUEST });
    writeState(root, { status: "needs-human", stage: "review", reason: "Keep the old flag?" });
    set({ ...record()!, runEnded: true });
    const answered = await shipIteration(deps("turn-2"), { request: "Please carry on with the greeting", answer: "Keep it", newWork: true });
    assert.equal(answered.restarted, undefined);
    assert.equal(answered.iteration, 2);
    assert.match(answered.brief ?? "", /The person answered the open question \(Keep the old flag\?\): Keep it/);
    assert.ok(existsSync(join(root, ".agent-blueprint", "run", "state.json")));
  });

  test("after a ceiling stop the flag starts again from a later turn, and the mark goes with it", async () => {
    const root = freshClone();
    const { deps, record } = turns(root);
    for (let call = 0; call < 2; call += 1) await shipIteration(deps(), { request: REQUEST, ceiling: 1 });
    assert.equal(record()!.runEnded, true);
    const again = await shipIteration(deps("turn-2"), { request: "Something else", newWork: true, ceiling: 1 });
    assert.deepEqual([again.outcome, again.iteration, again.restarted], ["iterate", 1, true]);
    assert.equal(record()!.runEnded, false);
  });

  test("after the cap hook's stop state.json still says running: the mark admits the flag, and a call that continues the run clears it", async () => {
    const root = freshClone();
    const { deps, record, set } = turns(root);
    await shipIteration(deps(), { request: REQUEST });
    writeState(root, { status: "running", stage: "execute" });
    set({ ...record()!, runEnded: true });
    const again = await shipIteration(deps("turn-2"), { request: "Something else", newWork: true });
    assert.deepEqual([again.outcome, again.iteration, again.restarted], ["iterate", 1, true]);

    const other = freshClone();
    const second = turns(other);
    await shipIteration(second.deps(), { request: REQUEST });
    writeState(other, { status: "running", stage: "execute" });
    second.set({ ...second.record()!, runEnded: true });
    const carried = await shipIteration(second.deps("turn-2"), { request: REQUEST });
    assert.match(carried.reason, /The earlier run had ended, and this call carries it on/);
    assert.equal(second.record()!.runEnded, false);
    const refused = await shipIteration(second.deps("turn-3"), { request: "Something else", newWork: true });
    assert.equal(refused.restarted, undefined);
  });

  test("status done with only empty stage commits since the base is not done, and the reason names them", async () => {
    const root = freshClone();
    const { deps } = setup(root);
    const markers: string[] = [];
    for (const stage of ["plan", "execute"]) {
      const pushed = await publish(deps, { mode: "stage", stage, request: REQUEST });
      assert.equal(pushed.status, "pushed");
      markers.push(git(["rev-parse", "--short=12", "HEAD"], root));
    }
    writeState(root, { status: "done", stage: "ship" });
    writeFileSync(join(root, ".agent-blueprint", "run", "pr-body.md"), "Adds a greeting.\n");
    const result = await shipIteration(deps, { request: REQUEST });
    assert.equal(result.outcome, "iterate");
    assert.match(result.reason, /state\.json says done, but the commits since the recorded base change no files/);
    assert.ok(result.reason.includes(`(${markers.join(", ")}), with no commit of the work itself`), result.reason);
    assert.match(result.brief ?? "", /set status done, but the commits since the recorded base change no files/);
  });

  test("status done with one commit of work among the stage commits: done", async () => {
    const root = freshClone();
    const { deps } = setup(root);
    assert.equal((await publish(deps, { mode: "stage", stage: "plan", request: REQUEST })).status, "pushed");
    writeFileSync(join(root, "greet.sh"), "echo hello\n");
    git(["add", "greet.sh"], root);
    git(["commit", "-q", "-m", "feat: greet"], root);
    assert.equal((await publish(deps, { mode: "stage", stage: "execute", request: REQUEST })).status, "pushed");
    writeState(root, { status: "done", stage: "ship" });
    writeFileSync(join(root, ".agent-blueprint", "run", "pr-body.md"), "Adds a greeting.\n");
    const result = await shipIteration(deps, { request: REQUEST });
    assert.equal(result.outcome, "done");
  });

  test("status done after a stage push swept uncommitted work into its stage commit: done", async () => {
    const root = freshClone();
    const { deps } = setup(root);
    assert.equal((await publish(deps, { mode: "stage", stage: "plan", request: REQUEST })).status, "pushed");
    writeFileSync(join(root, "greet.sh"), "echo hello\n");
    assert.equal((await publish(deps, { mode: "stage", stage: "execute", request: REQUEST })).status, "pushed");
    assert.match(git(["log", "-1", "--format=%B", "HEAD"], root), /Agent-Blueprint-Stage: execute/);
    assert.equal(git(["show", "--format=", "--name-only", "HEAD"], root), "greet.sh");
    writeState(root, { status: "done", stage: "ship" });
    writeFileSync(join(root, ".agent-blueprint", "run", "pr-body.md"), "Adds a greeting.\n");
    const result = await shipIteration(deps, { request: REQUEST });
    assert.equal(result.outcome, "done");
  });

  test("a symlinked pull request body ends the run as needs-human", async () => {
    const root = freshClone();
    const { deps } = setup(root);
    writeFileSync(join(root, "greet.sh"), "echo hello\n");
    git(["add", "greet.sh"], root);
    git(["commit", "-q", "-m", "feat: greet"], root);
    writeState(root, { status: "done", stage: "ship" });
    symlinkSync("/etc/hosts", join(root, ".agent-blueprint", "run", "pr-body.md"));
    const result = await shipIteration(deps, { request: REQUEST });
    assert.equal(result.outcome, "needs-human");
    assert.match(result.reason, /pr-body\.md is a symlink/);
  });
});

describe("stops push the branch and name the stage", () => {
  test("the ceiling: the call after the last allowed iteration stops, the branch pushed, the stage named", async () => {
    const root = freshClone();
    const { deps, record } = setup(root);
    const outcomes: string[] = [];
    for (let call = 1; call <= 3; call += 1) {
      writeState(root, { stage: "execute", iteration: call });
      const result = await shipIteration(deps, { request: REQUEST, ceiling: 2 });
      outcomes.push(`${result.iteration}:${result.outcome}`);
      if (result.outcome === "ceiling") {
        assert.equal(result.stage, "execute");
        assert.match(result.reason, /reached its ceiling of 2 iterations without finishing, at the execute stage/);
        assert.equal(result.push?.status, "pushed");
        assert.match(result.reason, new RegExp(`${record()!.branch} is pushed at`));
        assert.equal(result.brief, null);
      }
    }
    assert.deepEqual(outcomes, ["1:iterate", "2:iterate", "3:ceiling"]);
    assert.equal(remoteTip(record()!.branch), git(["rev-parse", "HEAD"], root), "the remote branch is at the stop's commit");
    assert.match(git(["log", "-1", "--format=%B", "HEAD"], root), /Agent-Blueprint-Stage: execute/);
    assert.equal(record()?.stage, "execute");
    assert.equal(record()?.lastPushedSha, git(["rev-parse", "HEAD"], root));
  });

  test("N crashes mid-iteration count N iterations toward the ceiling", async () => {
    const root = freshClone();
    // Each crash: the sandbox goes away while the tool reads state.json, after the count.
    const crashes = [/state\.json/, /state\.json/, /state\.json/];
    const { deps, record } = setup(root, { failOn: crashes });
    for (let crash = 1; crash <= 3; crash += 1) {
      await assert.rejects(shipIteration(deps, { request: REQUEST, ceiling: 3 }), /the sandbox went away/);
      assert.equal(record()?.iteration, crash, `crash ${crash} counted once`);
    }
    const result = await shipIteration(deps, { request: REQUEST, ceiling: 3 });
    assert.equal(result.outcome, "ceiling");
    assert.equal(result.iteration, 4);
  });

  test("blocked: the branch pushed, the stage and the skill's reason named", async () => {
    const root = freshClone();
    const { deps, record } = setup(root);
    writeState(root, { status: "blocked", stage: "review", reason: "Review found unresolved critical issues after 3 iterations." });
    const result = await shipIteration(deps, { request: REQUEST });
    assert.equal(result.outcome, "blocked");
    assert.match(result.reason, /the review stage is blocked: Review found unresolved critical issues/);
    assert.equal(result.push?.status, "pushed");
    assert.equal(remoteTip(record()!.branch), git(["rev-parse", "HEAD"], root));
  });
});

describe("questions (F3, R11)", () => {
  test("unattended: a default the skill documents is taken, recorded in the run's decisions once and returned", async () => {
    const root = freshClone();
    const { deps, record } = setup(root);
    const taken = { stage: "plan", question: "Split the migration into two pull requests?", choice: "one pull request", reason: "headless default" };
    writeState(root, { stage: "execute", decisions: [taken] });
    const first = await shipIteration(deps, { request: REQUEST });
    assert.equal(first.outcome, "iterate");
    assert.deepEqual(first.defaults, [taken]);
    assert.deepEqual(record()?.decisions, [taken]);
    const second = await shipIteration(deps, { request: REQUEST });
    assert.deepEqual(second.defaults, []);
    assert.equal(record()?.decisions.length, 1, "recorded once");
  });

  test("a question with no documented default, or a human-only change: needs-human with the branch pushed", async () => {
    const root = freshClone();
    const { deps, record } = setup(root);
    writeState(root, { status: "needs-human", stage: "plan", reason: "Which database should the greeting log use? The skill documents no default." });
    const result = await shipIteration(deps, { request: REQUEST });
    assert.equal(result.outcome, "needs-human");
    assert.equal(result.posture, "unattended");
    assert.match(result.reason, /the plan stage needs a person: Which database/);
    assert.equal(result.push?.status, "pushed");
    assert.equal(remoteTip(record()!.branch), git(["rev-parse", "HEAD"], root));
  });

  test("interactive: the person's answer goes into the next brief and the run's decisions", async () => {
    const root = freshClone();
    const { deps, record } = setup(root, { posture: "interactive" });
    writeState(root, { status: "needs-human", stage: "plan", reason: "Which database should the greeting log use?" });
    const stopped = await shipIteration(deps, { request: REQUEST });
    assert.equal(stopped.outcome, "needs-human");
    assert.equal(stopped.posture, "interactive");
    const resumed = await shipIteration(deps, { request: REQUEST, answer: "SQLite" });
    assert.equal(resumed.outcome, "iterate");
    assert.match(resumed.brief ?? "", /The person answered the open question \(Which database should the greeting log use\?\): SQLite\./);
    assert.deepEqual(record()?.decisions.at(-1), { stage: "plan", question: "Which database should the greeting log use?", choice: "SQLite", reason: "answered by the person" });
  });
});
