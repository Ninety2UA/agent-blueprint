import { randomUUID } from "node:crypto";
import { defineState } from "eve/context";
import type { SandboxSession } from "eve/sandbox";
import { defineTool } from "eve/tools";
import { once } from "eve/tools/approval";
import { z } from "zod";
import {
  type GitRunner,
  type TokenPermissions,
  type TokenRoute,
  gitHubAppFromEnv,
  mintInstallationToken,
  quote,
  withGitHubToken,
} from "../lib/credentials";
import {
  addDecision,
  backlogBase,
  beginCheckpoint,
  branchName,
  continuedBody,
  currentVersions,
  featureFromBody,
  finaliseCheckpoint,
  newRecord,
  parseTrailers,
  type PullRequestApproval,
  pullRequestTitle,
  type RecordStore,
  rederive,
  type ResumeResult,
  RUN_FILE_ROOTS,
  type RunFiles,
  type RunRecord,
  SESSION_TRAILER,
  stageCommitMessage,
  type Versions,
} from "../lib/run-state";
import { evalGitHubApi, evalRemote, evalRemoteUrl } from "../lib/eval-remote";
import { GIT_IDENTITY_ENV, readIdentityOwner } from "../lib/git-identity";
import { type ProcessInfo, describeProcesses, listStragglers } from "../lib/sandbox-processes";
import { allowedHosts, provider } from "../sandbox/sandbox";
import { skillPackage as shipPipeline } from "../skills/ab-ship-pipeline";

// The one tool that publishes (KTD5, R10, R25). Three steps, each on a scanned commit:
//   1. list the commits the push would send (outgoing-commits.sh), refuse workflow-file
//      changes, scan the commits and the pull request body (scan-secrets.sh); both scripts
//      come from the runtime's packaged copy of ab-ship-pipeline, written to a fresh path at
//      each publish, never from the sandbox's own skills tree
//   2. push that commit to the fixed remote and branch ab/<feature>-<session>: no force, no
//      lease, a foreign commit on the branch or a rejected push is needs-human
//   3. in pull-request mode, open the pull request by REST from this runtime, as a draft,
//      after listing the open ones by head, behind an approval on interactive channels
// Stage mode makes the stage commit (with the two trailers) and runs steps 1 and 2 with no
// approval; on the demo it first refuses a run that changed BACKLOG.md, as pull-request mode does.
// Restore mode re-derives the run after the sandbox was replaced (KTD6). Check mode runs
// the done rule and the straggler check only: no approval, no token, no push (ruling 59). The
// approval policy runs the same done rule before it asks, so a person is asked only for a pull
// request that can open; a call that would be refused is denied with the reason instead.
// The token reaches git through U7's credential layer only: the Vercel window or a
// per-command helper. The shell's own push is denied by the bash wrapper on every provider.

export type Posture = "interactive" | "unattended";
export type Mode = "stage" | "pull-request" | "restore" | "check";

/** Interactive or unattended, per session. U8 derives it from the channel; until then tools and evals set it. */
export const posture = defineState<Posture>("agent-blueprint.posture", () => "interactive");
export const runRecord = defineState<RunRecord | null>("agent-blueprint.run-record", () => null);
/** On the demo, the visitor's first message as the session received it; the cap hook records it. */
export const visitorRequest = defineState<string | null>("agent-blueprint.visitor-request", () => null);

const WORKFLOW_PATHS = [".github/workflows", ".github/actions"];
const PR_BODY = ".agent-blueprint/run/pr-body.md";
const DEMO_REQUEST_CAP = 300;
// The demo's follow-ups (review #7): the schema takes 5 of 120 characters each, and the body's
// last-defence cap is what those 5 take as "- item" lines, so every item the schema allows lands whole.
const FOLLOW_UPS_MAX = 5;
const FOLLOW_UP_CHARS = 120;
const DEMO_FOLLOW_UPS_CAP = FOLLOW_UPS_MAX * (FOLLOW_UP_CHARS + 3) - 1;
const BACKLOG = "BACKLOG.md";
const DRAFTS_UNAVAILABLE = "opened ready: drafts unavailable on this plan";
const PUSH_PERMISSIONS: TokenPermissions = { contents: "write", metadata: "read" };
const PULL_PERMISSIONS: TokenPermissions = { pull_requests: "write", metadata: "read" };
const READ_PERMISSIONS: TokenPermissions = { contents: "read", metadata: "read" };

export interface PublishInput {
  readonly mode: Mode;
  /** The user's request; names the branch at the first publish, and fills the demo template when no visitor's words were recorded. */
  readonly request?: string;
  /** The stage that just finished, in stage mode. */
  readonly stage?: string;
  /** The pull request title. */
  readonly title?: string;
  /** On the demo, the follow-ups the run would have written to BACKLOG.md; the demo body lists them (ruling 78). */
  readonly followUps?: readonly string[];
}

export type { ProcessInfo };

export interface PublishDeps {
  readonly sandbox: SandboxSession;
  readonly store: RecordStore;
  readonly sessionId: string;
  readonly posture: Posture;
  readonly demo: boolean;
  /** The demo visitor's own words, which the demo body quotes in place of the model's request. */
  readonly visitorRequest?: string | null;
  readonly route: TokenRoute;
  readonly hosts: readonly string[];
  readonly versions: Versions;
  readonly scripts: { readonly outgoing: string; readonly scan: string };
  /** The turn this call runs in; the ship loop reads it, and a hook's push has none. */
  readonly turnId?: string;
  /** Mints a token for the repository with these permissions; throws when the App is not there. */
  mint(repository: string, permissions: TokenPermissions): Promise<string>;
  /** The GitHub REST API: fetch and base URL. Tests replace both. */
  readonly api: { readonly fetch: typeof fetch; readonly url: string };
  /** The fixed remote for a repository; github.com in the runtime, a local server in tests. */
  remoteUrl(repository: string): string;
  /** Where the credential helper answers, for tests against a local server. */
  readonly tokenHost?: { readonly host: string; readonly protocol: "http" | "https" };
  /**
   * Who approved this pull-request call: Eve's responder, or a stand-in name when Eve names nobody.
   * Null when the call needed no approval. The run's first approval is recorded; later ones keep it.
   */
  readonly approvedBy?: string | null;
  /** Processes the model left running; the window opens only when none is left. */
  listProcesses(): Promise<ProcessInfo[]>;
  stopProcesses(pids: readonly number[]): Promise<void>;
  now(): string;
}

export type PublishResult =
  | { status: "pushed"; branch: string; sha: string; stage: string | null }
  | { status: "ready"; branch: string; sha: string; reason: string }
  | { status: "done"; branch: string; sha: string; pullRequest: { number: number; url: string; draft: boolean; reused: boolean } }
  | { status: "needs-human"; reason: string; files?: string[]; branch: string | null; pushed: false }
  | { status: "refused"; reason: string; files?: string[]; branch: string | null; pushed: false }
  | { status: "blocked"; reason: string; branch: string | null }
  | ResumeResult
  | { status: "nothing-to-restore" };

const GITHUB_URL = /^https:\/\/github\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?\/?$/;

async function sh(sandbox: SandboxSession, command: string, env: Readonly<Record<string, string>> = {}) {
  return sandbox.run({ command, env: { GIT_TERMINAL_PROMPT: "0", ...env } });
}

export async function must(sandbox: SandboxSession, command: string, what: string, env: Readonly<Record<string, string>> = {}): Promise<string> {
  const result = await sh(sandbox, command, env);
  if (result.exitCode !== 0) throw new Error(`${what} failed: ${(result.stderr || result.stdout).trim()}`);
  return result.stdout.trim();
}

export async function originRepository(sandbox: SandboxSession): Promise<string> {
  const url = await must(sandbox, "git remote get-url origin", "reading the clone's origin");
  const match = GITHUB_URL.exec(url);
  if (!match) throw new Error(`The clone's origin is ${url}, not a github.com repository; call clone_repository first.`);
  return `${match[1]}/${match[2]}`.toLowerCase();
}

/** Every regular file under the run folders, as base64. */
async function readRunFiles(sandbox: SandboxSession): Promise<RunFiles> {
  const roots = RUN_FILE_ROOTS.map(quote).join(" ");
  const listed = await must(
    sandbox,
    `for f in $(find ${roots} -type f 2>/dev/null | LC_ALL=C sort); do printf '%s\\t' "$f"; base64 < "$f" | tr -d '\\n'; echo; done`,
    "reading the run files",
  );
  const files: RunFiles = {};
  for (const line of listed.split("\n")) {
    const tab = line.indexOf("\t");
    if (tab > 0) files[line.slice(0, tab)] = line.slice(tab + 1);
  }
  return files;
}

async function writeRunFiles(sandbox: SandboxSession, files: RunFiles): Promise<void> {
  await must(sandbox, `rm -rf ${RUN_FILE_ROOTS.map(quote).join(" ")}`, "clearing the run folders");
  for (const [path, bytes] of Object.entries(files)) {
    if (!RUN_FILE_ROOTS.some((root) => path.startsWith(`${root}/`)) || path.includes("..")) continue;
    await must(sandbox, `mkdir -p "$(dirname ${quote(path)})" && printf %s ${quote(bytes)} | base64 -d > ${quote(path)}`, `restoring ${path}`);
  }
}

/**
 * The fixed demo body: a label line, the visitor's request in a capped fence, the stage list, and
 * the run's follow-ups in a second capped fence when it has any (ruling 78: on the demo they go
 * here, not into BACKLOG.md).
 */
export function demoBody(request: string, stages: readonly string[], followUps: readonly string[] = []): string {
  const capped = request.replaceAll("`", "'").slice(0, DEMO_REQUEST_CAP);
  const listed = followUps
    .map((item) => item.replaceAll("`", "'").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map((item) => `- ${item}`)
    .join("\n")
    .slice(0, DEMO_FOLLOW_UPS_CAP);
  return [
    "Automated demo pull request opened by Agent Blueprint's hosted demo.",
    "",
    "Visitor's request:",
    "",
    "```text",
    capped,
    "```",
    "",
    "Stages run:",
    ...(stages.length ? stages.map((stage) => `- ${stage}`) : ["- none recorded"]),
    "",
    ...(listed ? ["Follow-ups for later:", "", "```text", listed, "```", ""] : []),
  ].join("\n");
}

/**
 * The demo body's stage list, from the stage pushes this tool recorded, oldest first: each name
 * once, capitalised, without the pipeline's internal `continuation` or anything that does not read
 * as a stage's name, and Ship last when any stage ran, since the list is only written as the pull
 * request opens. The record, not the branch's commit messages, which the model can write.
 */
const STAGE_NAME = /^[A-Za-z][A-Za-z -]{0,31}$/;

export function stageList(stages: readonly string[]): string[] {
  const named = new Map<string, string>();
  for (const stage of stages) {
    const name = stage.trim();
    const key = name.toLowerCase();
    if (!STAGE_NAME.test(name) || key === "continuation" || key === "ship" || named.has(key)) continue;
    named.set(key, name.charAt(0).toUpperCase() + name.slice(1));
  }
  return named.size ? [...named.values(), "Ship"] : [];
}

/** The text of a delivery's parts, as the person typed it; files are left out. */
export function visitorText(parts: readonly { kind: string; text?: string }[]): string {
  return parts
    .filter((part) => part.kind === "text")
    .map((part) => part.text ?? "")
    .join("\n")
    .trim();
}

async function idle(deps: PublishDeps): Promise<string | null> {
  const stragglers = await deps.listProcesses();
  if (!stragglers.length) return null;
  await deps.stopProcesses(stragglers.map((process) => process.pid));
  const left = await deps.listProcesses();
  if (!left.length) return null;
  return `processes the run started are still running in the sandbox (${describeProcesses(left)}), so the credential window stays shut; nothing was pushed.`;
}

/** The run's base on the default branch, as the record takes it at the first call. */
async function runBase(sandbox: SandboxSession): Promise<string> {
  const head = await must(sandbox, "git rev-parse HEAD", "reading HEAD");
  return must(sandbox, "git merge-base HEAD refs/remotes/origin/HEAD", "finding the run's base on the default branch").catch(() => head);
}

/**
 * On the demo, why HEAD may not be pushed: the run changed BACKLOG.md since its base (ruling 78).
 * Every push runs it, including a stage push onto an open pull request's branch (review #8). Null
 * when BACKLOG.md is as it was at the base.
 */
async function demoBacklogChanged(sandbox: SandboxSession, base: string): Promise<string | null> {
  if (!(await sh(sandbox, `git diff --name-only ${quote(base)} HEAD -- ${BACKLOG}`)).stdout.trim()) return null;
  return `the demo leaves ${BACKLOG} out of a visitor's pull request, and this run changed it. Put it back as it was at the run's base (git checkout ${base} -- ${BACKLOG}, or git rm ${BACKLOG} when the run created it), commit, and pass the follow-ups it held to publish_branch as followUps in the pull-request call.`;
}

/**
 * The done rule for a pull request, read-only: commits since the run's base, no uncommitted change
 * to a tracked file, on the demo no change to BACKLOG.md (ruling 78), and (outside the demo, whose
 * body is a fixed template) a pull request body. Returns the refusal reason, or null when the pull
 * request can go ahead.
 */
export async function notDone(sandbox: SandboxSession, base: string, demo: boolean, backlogBase: string = base): Promise<string | null> {
  const count = Number(await must(sandbox, `git rev-list --count ${quote(base)}..HEAD`, "counting the run's commits"));
  if (!count) return "not done: there are no commits since the run's base.";
  if ((await sh(sandbox, "git status --porcelain --untracked-files=no")).stdout.trim()) {
    return "not done: tracked files still have uncommitted changes.";
  }
  const backlog = demo ? await demoBacklogChanged(sandbox, backlogBase) : null;
  if (backlog) return `not done: ${backlog}`;
  if (!demo && !((await sh(sandbox, `cat ${quote(PR_BODY)}`)).stdout ?? "").trim()) return `not done: ${PR_BODY} is missing or empty.`;
  return null;
}

/** What the approval policy reads before it asks: null when the pull request can open, else why not. */
export async function readiness(sandbox: SandboxSession, record: RunRecord | null, demo: boolean): Promise<string | null> {
  const repository = await originRepository(sandbox);
  if (record && record.repository !== repository) return `This session's run is on ${record.repository}; the clone is ${repository}.`;
  return notDone(sandbox, record?.base ?? (await runBase(sandbox)), demo, record ? backlogBase(record) : undefined);
}

/**
 * The feature the run is about, read the same way by every mode (ruling 60): the request, else the
 * title, else the pull request body's first heading or line, else the subject of the newest commit
 * since the base that is not a stage commit. "feature" only when none of them says anything.
 */
export async function featureText(sandbox: SandboxSession, input: Pick<PublishInput, "request" | "title">, base: string): Promise<string> {
  const given = input.request?.trim() || input.title?.trim();
  if (given) return given;
  const fromBody = featureFromBody((await sh(sandbox, `cat ${quote(PR_BODY)}`)).stdout ?? "");
  if (fromBody) return fromBody;
  const subjects = (await sh(sandbox, `git log --format=%s ${quote(base)}..HEAD`)).stdout ?? "";
  const subject = subjects.split("\n").find((line) => line.trim() && !/^chore\(ship\): .* stage$/.test(line.trim()));
  return subject?.trim() || "feature";
}

/** The session's record, made at the first call: the branch from the feature text, the base on the default branch. */
export async function ensureRecord(deps: PublishDeps, input: Pick<PublishInput, "request" | "title">, repository: string): Promise<RunRecord> {
  const existing = deps.store.get();
  if (existing) {
    if (existing.repository !== repository) {
      throw new Error(`This session's run is on ${existing.repository}; the clone is ${repository}.`);
    }
    return existing;
  }
  const base = await runBase(deps.sandbox);
  const record = newRecord({
    versions: deps.versions,
    sessionId: deps.sessionId,
    repository,
    branch: branchName(await featureText(deps.sandbox, input, base), deps.sessionId),
    base,
    now: deps.now(),
  });
  deps.store.set(record);
  return record;
}

const notPushed = (status: "needs-human" | "refused", reason: string, branch: string, files?: string[]): PublishResult =>
  files ? { status, reason, files, branch, pushed: false } : { status, reason, branch, pushed: false };

/** Steps one and two, and three in pull-request mode. */
export async function publish(deps: PublishDeps, input: PublishInput): Promise<PublishResult> {
  const { sandbox } = deps;
  const repository = await originRepository(sandbox);
  if (input.mode === "restore") return restore(deps, repository);
  if (input.mode === "check") return check(deps, input, repository);
  let record = await ensureRecord(deps, input, repository);
  const branch = record.branch;
  if (input.mode === "pull-request" && deps.approvedBy && !approvedEarlier(record, deps.sessionId)) {
    record = { ...record, approval: { sessionId: deps.sessionId, branch, by: deps.approvedBy, at: deps.now() }, updatedAt: deps.now() };
    deps.store.set(record);
  }
  const url = deps.remoteUrl(repository);

  if (input.mode === "stage") {
    const stage = input.stage?.trim();
    if (!stage) throw new Error("Stage mode needs the stage that finished.");
    // The agent's identity, pinned as the bash tool pins it, unless a deployer configured one (ruling 76).
    const identity = (await readIdentityOwner(sandbox)) === "deployer" ? {} : GIT_IDENTITY_ENV;
    await must(sandbox, "git add -A", "staging the stage's changes");
    await must(
      sandbox,
      `git -c core.hooksPath=/dev/null commit -q --allow-empty -m ${quote(stageCommitMessage(`chore(ship): ${stage} stage`, stage, deps.sessionId))}`,
      "making the stage commit",
      identity,
    );
    const backlog = deps.demo ? await demoBacklogChanged(sandbox, backlogBase(record)) : null;
    if (backlog) return notPushed("refused", `${backlog} Nothing was pushed.`, branch);
  } else {
    const reason = await notDone(sandbox, record.base, deps.demo, backlogBase(record));
    if (reason) return notPushed("refused", reason, branch);
  }
  const sha = await must(sandbox, "git rev-parse HEAD", "reading HEAD");
  const body = deps.demo
    ? demoBody(
        deps.visitorRequest?.trim() || input.request || "",
        stageList(record.stagesPushed ?? []),
        input.followUps ?? [],
      )
    : input.mode === "pull-request"
      ? ((await sh(sandbox, `cat ${quote(PR_BODY)}`)).stdout ?? "")
      : "";
  if (input.mode === "pull-request" && !body.trim()) return notPushed("refused", `not done: ${PR_BODY} is missing or empty.`, branch);

  const blocker = await idle(deps);
  if (blocker) return notPushed("needs-human", blocker, branch);

  // The runtime's own copies of the two scripts, at a fresh path outside the workspace.
  const dir = `/tmp/ab-publish-${randomUUID()}`;
  const encode = (text: string) => new TextEncoder().encode(text);
  await sandbox.writeFiles({
    files: [
      { path: `${dir}/outgoing-commits.sh`, content: encode(deps.scripts.outgoing) },
      { path: `${dir}/scan-secrets.sh`, content: encode(deps.scripts.scan) },
      { path: `${dir}/pr-body.md`, content: encode(body) },
    ],
  });
  try {
    const token = await deps.mint(repository, PUSH_PERMISSIONS);
    const handOff = { route: deps.route, token, hosts: deps.hosts, ...(deps.tokenHost ?? {}) };
    const outcome = await withGitHubToken(sandbox, handOff, async (git) => {
      const tip = await remoteTip(git, url, branch);
      if (tip !== null && tip !== record.lastPushedSha) {
        // Ours only when a pending checkpoint names it (a crash after the push) or its trailers name this session.
        const fetched = await git(["fetch", "-q", "--no-tags", "--no-write-fetch-head", url, tip]);
        const message = fetched.exitCode === 0 ? (await sh(sandbox, `git log -1 --format=%B ${quote(tip)}`)).stdout : "";
        const ours = record.pending?.sha === tip || parseTrailers(message)[SESSION_TRAILER] === deps.sessionId;
        const contained = (await sh(sandbox, `git merge-base --is-ancestor ${quote(tip)} ${quote(sha)}`)).exitCode === 0;
        if (!ours || !contained) {
          return notPushed("needs-human", `${branch} on ${repository} has a commit this session did not push (${tip.slice(0, 12)}); nothing was pushed. Review it, then continue.`, branch);
        }
      }

      const listed = await git(["-c", `alias.ab-outgoing=!bash ${dir}/outgoing-commits.sh`, "ab-outgoing", url, record.base, sha]);
      if (listed.exitCode !== 0) {
        return notPushed("needs-human", `could not list the commits the push would publish (${listed.stderr.trim().split("\n").at(-1) ?? `exit ${listed.exitCode}`}); nothing was pushed.`, branch);
      }
      await sandbox.writeFiles({ files: [{ path: `${dir}/outgoing`, content: encode(listed.stdout) }] });
      const ciFiles = listed.stdout.trim()
        ? (
            await must(
              sandbox,
              `git log --no-walk=unsorted --stdin --format= --name-only --no-renames --cc --root -- ${WORKFLOW_PATHS.join(" ")} < ${dir}/outgoing | sed '/^$/d' | LC_ALL=C sort -u`,
              "listing the files the commits change",
            )
          )
            .split("\n")
            .filter(Boolean)
        : [];
      if (ciFiles.length) {
        const where = `the commits to publish change CI configuration: ${ciFiles.join(", ")}`;
        if (deps.posture === "interactive" && !deps.demo) {
          return notPushed("needs-human", `${where}. A person reviews and pushes workflow changes; nothing was pushed.`, branch, ciFiles);
        }
        return notPushed("refused", `${where}. This ${deps.demo ? "demo" : "unattended run"} never publishes workflow changes; nothing was pushed.`, branch, ciFiles);
      }

      const scan = await sh(sandbox, `GIT_NO_REPLACE_OBJECTS=1 bash ${dir}/scan-secrets.sh --commits ${dir}/outgoing --file ${dir}/pr-body.md 2>&1`);
      if (scan.exitCode !== 0) {
        const hits = scan.stdout.split("\n").filter((line) => /^\S+:\d*:? /.test(line) || /: \.env file$/.test(line));
        const files = [...new Set(hits.map((line) => line.split(":").slice(0, 2).join(":").replace(`${dir}/pr-body.md`, PR_BODY)))];
        return notPushed("needs-human", `the secret scan found key-shaped values (values masked): ${hits.join(" | ").replaceAll(`${dir}/pr-body.md`, PR_BODY).slice(0, 600)}; nothing was pushed.`, branch, files);
      }

      record = beginCheckpoint(record, { sha, stage: input.stage ?? record.stage ?? "ship", files: await readRunFiles(sandbox) }, deps.now());
      deps.store.set(record);
      const pushed = await git(["push", "--no-follow-tags", "--no-recurse-submodules", url, `${sha}:refs/heads/${branch}`]);
      if (pushed.exitCode !== 0) {
        const why = /non-fast-forward|fetch first|\[rejected\]/.test(pushed.stderr)
          ? `the remote refused a non-fast-forward push to ${branch}; it was not retried with force`
          : `git push failed: ${pushed.stderr.trim().split("\n").slice(-2).join(" ")}`;
        return notPushed("needs-human", `${why}. Nothing was pushed.`, branch);
      }
      record = finaliseCheckpoint(record, await remoteTip(git, url, branch), deps.now());
      deps.store.set(record);
      if (record.lastPushedSha !== sha) return { status: "blocked", reason: `the push reported success but ${branch} is not at ${sha.slice(0, 12)}.`, branch } as const;
      return null;
    });
    if (outcome) return outcome;
  } finally {
    await sandbox.removePath({ path: dir, recursive: true, force: true });
  }

  if (input.mode === "stage") return { status: "pushed", branch, sha, stage: record.stage };
  const title = pullRequestTitle(input.title?.trim() || (await featureText(sandbox, input, record.base)));
  return openPullRequest(deps, record, repository, sha, title, body);
}

/**
 * The approval a person gave a pull request earlier in this run, when it belongs to this session and
 * the record's branch (ruling 60); null otherwise, and the person is asked.
 */
export function approvedEarlier(record: RunRecord | null, sessionId: string): PullRequestApproval | null {
  const approval = record?.approval;
  return approval && approval.sessionId === sessionId && approval.sessionId === record.sessionId && approval.branch === record.branch ? approval : null;
}

/** Whether a pull-request call at this commit goes ahead on that approval: a commit the pull request has not had asks again. */
export function approvalHolds(record: RunRecord | null, sessionId: string, head: string): boolean {
  if (!approvedEarlier(record, sessionId)) return false;
  const published = record?.pullRequest?.sha;
  return !published || published === head;
}

/** Check mode: the done rule and the straggler check, with no record written, no token and no push. */
async function check(deps: PublishDeps, input: PublishInput, repository: string): Promise<PublishResult> {
  const record = deps.store.get();
  if (record && record.repository !== repository) {
    throw new Error(`This session's run is on ${record.repository}; the clone is ${repository}.`);
  }
  const base = record?.base ?? (await runBase(deps.sandbox));
  const branch = record?.branch ?? branchName(await featureText(deps.sandbox, input, base), deps.sessionId);
  const reason = await notDone(deps.sandbox, base, deps.demo, record ? backlogBase(record) : base);
  if (reason) return notPushed("refused", reason, branch);
  const blocker = await idle(deps);
  if (blocker) return notPushed("needs-human", blocker, branch);
  const sha = await must(deps.sandbox, "git rev-parse HEAD", "reading HEAD");
  return { status: "ready", branch, sha, reason: "the done rule holds and no process the run started is still running: call publish_branch with mode pull-request." };
}

async function remoteTip(git: GitRunner, url: string, branch: string): Promise<string | null> {
  const listed = await git(["ls-remote", "--heads", url, `refs/heads/${branch}`]);
  if (listed.exitCode !== 0) throw new Error(`reading ${branch} on the remote failed: ${listed.stderr.trim()}`);
  return listed.stdout.split(/\s/)[0] || null;
}

async function openPullRequest(deps: PublishDeps, start: RunRecord, repository: string, sha: string, title: string, body: string): Promise<PublishResult> {
  let record = start;
  const token = await deps.mint(repository, PULL_PERMISSIONS);
  const owner = repository.split("/")[0];
  const call = (path: string, init: RequestInit = {}) =>
    deps.api.fetch(`${deps.api.url}/repos/${repository}${path}`, {
      ...init,
      headers: { accept: "application/vnd.github+json", authorization: `Bearer ${token}`, "x-github-api-version": "2022-11-28", "content-type": "application/json" },
    });
  const done = (number: number, url: string, draft: boolean, reused: boolean): PublishResult => {
    record = { ...record, pullRequest: { number, url, draft, sha }, updatedAt: deps.now() };
    deps.store.set(record);
    return { status: "done", branch: record.branch, sha, pullRequest: { number, url, draft, reused } };
  };

  const listed = await call(`/pulls?state=open&head=${encodeURIComponent(`${owner}:${record.branch}`)}`);
  if (!listed.ok) return { status: "blocked", reason: `listing the open pull requests failed: HTTP ${listed.status}.`, branch: record.branch };
  const open = (await listed.json()) as { number: number; html_url: string; draft?: boolean; body?: string | null }[];
  if (open.length) {
    const text = record.continued ? continuedBody(open[0].body ?? "", record.base, body) : body;
    const patched = await call(`/pulls/${open[0].number}`, { method: "PATCH", body: JSON.stringify({ body: text }) });
    if (!patched.ok) return { status: "blocked", reason: `updating pull request #${open[0].number} failed: HTTP ${patched.status}.`, branch: record.branch };
    return done(open[0].number, open[0].html_url, open[0].draft ?? false, true);
  }
  if (deps.demo && record.pullRequest) {
    return notPushed("refused", `this demo session already opened pull request #${record.pullRequest.number}; one pull request per session.`, record.branch);
  }

  const repo = await call("");
  if (!repo.ok) return { status: "blocked", reason: `reading ${repository} failed: HTTP ${repo.status}.`, branch: record.branch };
  const base = ((await repo.json()) as { default_branch?: string }).default_branch ?? "main";
  const post = (draft: boolean, text: string) =>
    call("/pulls", { method: "POST", body: JSON.stringify({ title, head: record.branch, base, body: text, draft }) });
  let created = await post(true, body);
  let draft = true;
  if (created.status === 422) {
    const message = JSON.stringify(await created.json().catch(() => ({})));
    if (/draft/i.test(message)) {
      record = addDecision(record, { stage: "ship", question: "Open the pull request as a draft?", choice: "ready", reason: DRAFTS_UNAVAILABLE }, deps.now());
      deps.store.set(record);
      created = await post(false, `${body.trimEnd()}\n\nNote: ${DRAFTS_UNAVAILABLE}.\n`);
      draft = false;
    } else {
      return { status: "blocked", reason: `GitHub refused the pull request: ${message.slice(0, 300)}`, branch: record.branch };
    }
  }
  if (!created.ok) return { status: "blocked", reason: `opening the pull request failed: HTTP ${created.status}.`, branch: record.branch };
  const pull = (await created.json()) as { number: number; html_url: string };
  if (deps.demo) await call(`/issues/${pull.number}/labels`, { method: "POST", body: JSON.stringify({ labels: ["automated-demo"] }) });
  return done(pull.number, pull.html_url, draft, false);
}

async function restore(deps: PublishDeps, repository: string): Promise<PublishResult> {
  const { sandbox } = deps;
  const record = deps.store.get();
  if (!record) return { status: "nothing-to-restore" };
  const url = deps.remoteUrl(repository);
  const withGit = async <T>(work: (git: GitRunner) => Promise<T>): Promise<T> => {
    const token = await deps.mint(repository, READ_PERMISSIONS);
    return withGitHubToken(sandbox, { route: deps.route, token, hosts: deps.hosts, ...(deps.tokenHost ?? {}) }, work);
  };
  const result = await rederive(
    deps.store,
    {
      remoteTip: (branch) => withGit((git) => remoteTip(git, url, branch)),
      checkout: async (branch, sha) => {
        const fetched = await withGit((git) => git(["fetch", "-q", "--no-tags", url, `+refs/heads/${branch}:refs/remotes/origin/${branch}`]));
        if (fetched.exitCode !== 0) throw new Error(`fetching ${branch} failed: ${fetched.stderr.trim()}`);
        await must(sandbox, `git checkout -q -B ${quote(branch)} ${quote(sha)}`, `checking out ${branch}`);
      },
      commitMessage: (sha) => must(sandbox, `git log -1 --format=%B ${quote(sha)}`, "reading the tip's message"),
      writeRunFiles: (files) => writeRunFiles(sandbox, files),
    },
    deps.versions,
    deps.now(),
  );
  return result ?? { status: "nothing-to-restore" };
}

/**
 * The tool's dependencies in the runtime; ship_pipeline pushes with the same ones. Under
 * AB_EVAL_MOCK=1, or AB_EVAL_REMOTE=sandbox in a live-model local eval (lib/eval-remote.ts, which
 * throws on the demo, on Vercel and outside eve eval), the token is a placeholder and the push goes
 * to a bare repository inside the sandbox instead of github.com, as in the cap hook, so the eval can
 * see it land.
 */
export function runtimeDeps(sandbox: SandboxSession, sessionId: string, approvedBy: string | null = null, turnId?: string): PublishDeps {
  const mock = evalRemote() !== null;
  const script = (name: string) => {
    const text = shipPipeline.files?.[`scripts/${name}`];
    if (typeof text !== "string") throw new Error(`the packaged ab-ship-pipeline has no scripts/${name}`);
    return text;
  };
  return {
    sandbox,
    store: { get: () => runRecord.get(), set: (record) => runRecord.update(() => record) },
    sessionId,
    turnId,
    posture: posture.get(),
    demo: process.env.AB_DEMO === "1",
    visitorRequest: visitorRequest.get(),
    route: mock ? "command" : provider === "vercel" ? "window" : "command",
    hosts: allowedHosts(),
    versions: currentVersions(),
    scripts: { outgoing: script("outgoing-commits.sh"), scan: script("scan-secrets.sh") },
    mint: async (repository, permissions) => {
      if (mock) return "eval-mock-token";
      const [owner, name] = repository.split("/");
      return (await mintInstallationToken(gitHubAppFromEnv(), { owner, name }, permissions)).token;
    },
    api: mock ? { fetch: evalGitHubApi(), url: "https://api.github.test" } : { fetch, url: "https://api.github.com" },
    approvedBy,
    remoteUrl: (repository) => (mock ? evalRemoteUrl(repository) : `https://github.com/${repository}.git`),
    listProcesses: () => listStragglers((command) => sh(sandbox, command), "publish_branch"),
    stopProcesses: async (pids) => {
      const list = pids.join(" ");
      await sh(sandbox, `kill -TERM ${list} 2>/dev/null; sleep 1; kill -KILL ${list} 2>/dev/null; true`);
    },
    now: () => new Date().toISOString(),
  };
}

const askOnce = once<Record<string, unknown>>();
const UNNAMED_APPROVER = "the person on this channel";

export default defineTool({
  description:
    "Publish the run's branch: the only way to push or open a pull request here. mode stage after each finished stage (commits the work with the stage trailers and pushes, no approval); mode check before pull-request (runs the done rule and the straggler check, no approval, no push: ready, or refused or needs-human with the reason); mode pull-request when the run is done and check says ready (scans, pushes, opens a draft pull request after approval on interactive channels); mode restore when the sandbox was replaced (fetches the pushed branch and writes the run files back from the session's record). Before check and pull-request, commit the work and write the pull request body to .agent-blueprint/run/pr-body.md. Pass request, the user's feature request, on the first call.",
  inputSchema: z.object({
    mode: z.enum(["stage", "check", "pull-request", "restore"]),
    request: z.string().max(4_000).optional(),
    stage: z.string().max(64).optional(),
    title: z.string().max(200).optional(),
    followUps: z
      .array(z.string().max(FOLLOW_UP_CHARS))
      .max(FOLLOW_UPS_MAX)
      .optional()
      .describe(`The demo only: up to ${FOLLOW_UPS_MAX} follow-ups of ${FOLLOW_UP_CHARS} characters each, listed in the demo pull request's body.`),
  }),
  availableInSubagents: false,
  // Eve 0.86.0 awaits this policy with the session context (getSandbox included) before it asks,
  // and again when the person has approved ("recheck"). It reads the done rule first, so a pull
  // request that would be refused is denied with the reason and nobody is asked (ruling 59).
  // It never returns not-applicable for an interactive pull request, so nothing publishes unasked.
  // Ruling 60: one approval per run. A person's decision is kept by Eve's once() memory, which only
  // a person's own answer writes and a denial overwrites; a later pull-request call goes ahead
  // without asking only when that memory says approved and the run record names the same session
  // and branch as an approval the tool recorded. A new session asks again.
  approval: async (ctx) => {
    if (ctx.toolInput?.mode !== "pull-request" || posture.get() !== "interactive" || process.env.AB_DEMO === "1") return "not-applicable";
    let reason: string | null;
    let head = "";
    try {
      reason = await readiness(await ctx.getSandbox(), runRecord.get(), false);
      head = await must(await ctx.getSandbox(), "git rev-parse HEAD", "reading HEAD");
    } catch (error) {
      reason = `could not read the run before asking: ${error instanceof Error ? error.message : String(error)}`;
    }
    if (!reason) {
      const remembered = await askOnce(ctx);
      if (remembered !== "approved") return remembered;
      const earlier = approvedEarlier(runRecord.get(), ctx.session.id);
      if (!earlier) return "user-approval";
      return approvalHolds(runRecord.get(), ctx.session.id, head) ? { type: "approved", reason: `approved earlier in this run by ${earlier.by} for ${earlier.branch}` } : "user-approval";
    }
    return { type: "denied", reason: `refused by the tool before publishing, not by the person: ${reason} Nothing was pushed. Fix it, call publish_branch with mode check, then pull-request.` };
  },
  async execute(input, ctx) {
    // An interactive pull-request call runs only after the policy above let it through, and the
    // policy only lets one through on a person's approval in this run, so the call records one.
    // Eve passes the responder when the approver was signed in; otherwise the name is a stand-in.
    const approved = input.mode === "pull-request" && posture.get() === "interactive" && process.env.AB_DEMO !== "1";
    const approvedBy = approved ? (ctx.approval?.responder.principalId ?? UNNAMED_APPROVER) : null;
    return publish(runtimeDeps(await ctx.getSandbox(), ctx.session.id, approvedBy), input);
  },
});
