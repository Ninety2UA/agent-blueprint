import { VERSIONS } from "./versions";

// The durable record of a run (KTD6). The skills gitignore .agent-blueprint/run/, team/ and
// review-runs/, so a pushed branch carries no run state; the record holds it instead, in the
// session's Eve state, and is captured with every stage push:
//   before the push  a pending checkpoint: the commit the push sends and the run files' bytes
//   after the push   the checkpoint is final once the remote branch is seen at that commit
// A resume reconciles a pending checkpoint against the remote (final when the push landed,
// dropped when it did not), fetches the branch, adopts a tip only when its trailers name this
// session, writes the run files back and hands the stage to the skill. The record names the Eve
// and product versions that wrote it; when they changed and the resume fails, the session
// reports itself stranded, with its last pushed branch as the recovery point (R11).
// This module holds no Eve import, so the tests drive it with an in-memory store.

export const RECORD_SCHEMA = 1;

/** The run files the record carries: every regular file under these folders. */
export const RUN_FILE_ROOTS = [".agent-blueprint/run", ".agent-blueprint/team"] as const;

/** The trailers every stage commit carries. */
export const STAGE_TRAILER = "Agent-Blueprint-Stage";
export const SESSION_TRAILER = "Agent-Blueprint-Session";

/** Path to base64 bytes. */
export type RunFiles = Record<string, string>;

export interface Decision {
  readonly stage: string;
  readonly question: string;
  readonly choice: string;
  readonly reason: string;
}

export interface Checkpoint {
  readonly sha: string;
  readonly stage: string;
  readonly files: RunFiles;
  readonly at: string;
}

export interface PullRequest {
  readonly number: number;
  readonly url: string;
  readonly draft: boolean;
  /** The commit the last pull-request call published; absent on records written before it was kept. */
  readonly sha?: string;
}

/** A person's approval of a pull request in this run (ruling 60): later pull-request calls of the same run and branch ask nobody. */
export interface PullRequestApproval {
  readonly sessionId: string;
  readonly branch: string;
  /** The approver's principal id, as Eve reports it. */
  readonly by: string;
  readonly at: string;
}

export interface Versions {
  readonly eve: string;
  readonly product: string;
}

export interface RunRecord {
  readonly schema: typeof RECORD_SCHEMA;
  readonly versions: Versions;
  readonly sessionId: string;
  /** owner/name on github.com. */
  readonly repository: string;
  readonly branch: string;
  /** The commit the run started from; done needs commits after it. */
  readonly base: string;
  readonly lastPushedSha: string | null;
  readonly stage: string | null;
  /** Every stage this run pushed, oldest first; absent on records written before it was kept. */
  readonly stagesPushed?: readonly string[];
  readonly iteration: number;
  readonly decisions: readonly Decision[];
  /** The run files of the last final checkpoint. */
  readonly files: RunFiles;
  readonly pending: Checkpoint | null;
  readonly pullRequest: PullRequest | null;
  /** Set when a person approves a pull-request call; absent on records written before ruling 60. */
  readonly approval?: PullRequestApproval | null;
  /** This run continues an earlier run on the session's branch, so its description joins the pull request's. */
  readonly continued?: boolean;
  /** The session's first base, when a later run moved `base`: the demo's BACKLOG.md rule still reads from it. */
  readonly firstBase?: string;
  /** The run reached its ceiling or the cap hook stopped it, which state.json does not say. */
  readonly runEnded?: boolean;
  /** The turn of the latest iteration: a new request arrives as a new turn. */
  readonly lastTurn?: string;
  /** The request this run works on, as the ship loop compares it; absent on records written before it was kept. */
  readonly request?: string;
  readonly updatedAt: string;
}

/** Where the record lives: Eve state in the runtime, a variable in the tests. */
export interface RecordStore {
  get(): RunRecord | null;
  set(record: RunRecord | null): void;
}

/** The feature slug of the branch name: lowercase, hyphens, at most 40 characters, cut between words. */
export function featureSlug(request: string): string {
  const full = request
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  let slug = full;
  if (full.length > 40) {
    const word = full.slice(0, 41).lastIndexOf("-");
    slug = (word >= 20 ? full.slice(0, word) : full.slice(0, 40)).replace(/-+$/, "");
  }
  return slug || "feature";
}

/**
 * Text cut to at most `max` characters at the last space before the limit, with no trailing
 * punctuation left behind; a single word longer than half the limit is cut at the limit itself.
 * Text that fits is returned with its whitespace collapsed and nothing else changed.
 */
export function cutAtWord(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const space = flat.slice(0, max + 1).lastIndexOf(" ");
  const cut = space >= max / 2 ? flat.slice(0, space) : flat.slice(0, max);
  return cut.replace(/[\s,;:.!?&+/(\[{-]+$/, "");
}

/** The pull request title from a title, a request or a pull request body line: at most 72 characters. */
export function pullRequestTitle(text: string): string {
  return cutAtWord(text, 72);
}

// Headings a pull request body opens with that say nothing about the feature.
const GENERIC_HEADINGS = new Set(["summary", "description", "overview", "changes", "what", "why", "context", "background", "motivation", "details", "notes", "pull request", "pr"]);

/** A markdown line as plain text: no heading, quote or list marker, no emphasis, links as their text. */
function plainLine(line: string): string {
  return line
    .replace(/^\s*(?:#{1,6}\s+|>\s*|[-*+]\s+|\d+[.)]\s+)/, "")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/`|~~|\*+|(?<!\w)_+|_+(?!\w)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The feature a pull request body names: its first heading or first line as plain text, skipping a
 * generic heading such as "Summary", comments and rules. Null when the body names nothing.
 */
export function featureFromBody(body: string): string | null {
  for (const line of body.split("\n")) {
    if (!line.trim() || /^\s*(?:<!--.*-->|[-*_=]{3,})\s*$/.test(line)) continue;
    const text = plainLine(line);
    if (!text) continue;
    if (/^\s*#/.test(line) && GENERIC_HEADINGS.has(text.toLowerCase().replace(/[:.]$/, ""))) continue;
    return text;
  }
  return null;
}

/**
 * `ab/<feature>-<session>`: the slug of the request and the session id's last 8 letters and digits.
 * Eve's ids end in the random part of a ULID (`wrun_01M6...`), so the first 8 would be the same
 * for every session started within about 12 days.
 */
export function branchName(request: string, sessionId: string): string {
  const session = sessionId.replace(/[^A-Za-z0-9]/g, "").slice(-8).toLowerCase() || "session";
  return `ab/${featureSlug(request)}-${session}`;
}

export function newRecord(fields: {
  versions: Versions;
  sessionId: string;
  repository: string;
  branch: string;
  base: string;
  now: string;
}): RunRecord {
  return {
    schema: RECORD_SCHEMA,
    versions: fields.versions,
    sessionId: fields.sessionId,
    repository: fields.repository,
    branch: fields.branch,
    base: fields.base,
    lastPushedSha: null,
    stage: null,
    iteration: 0,
    decisions: [],
    files: {},
    pending: null,
    pullRequest: null,
    updatedAt: fields.now,
  };
}

/** The stage commit's message: subject, blank line, the two trailers. */
export function stageCommitMessage(subject: string, stage: string, sessionId: string): string {
  return `${subject}\n\n${STAGE_TRAILER}: ${stage}\n${SESSION_TRAILER}: ${sessionId}\n`;
}

/** The trailers of a commit message, last value of each key. */
export function parseTrailers(message: string): Record<string, string> {
  const trailers: Record<string, string> = {};
  const paragraphs = message.trimEnd().split(/\n\s*\n/);
  for (const line of (paragraphs.at(-1) ?? "").split("\n")) {
    const match = /^([A-Za-z][A-Za-z0-9-]*):\s*(.*)$/.exec(line.trim());
    if (match) trailers[match[1]] = match[2];
  }
  return trailers;
}

/** Step one of a stage push: the commit it sends and the run files, before anything leaves. */
export function beginCheckpoint(record: RunRecord, checkpoint: Omit<Checkpoint, "at">, now: string): RunRecord {
  return { ...record, pending: { ...checkpoint, at: now }, updatedAt: now };
}

/** Step three: the remote branch is at the pending commit, so the checkpoint is final. */
export function finaliseCheckpoint(record: RunRecord, remoteSha: string | null, now: string): RunRecord {
  const pending = record.pending;
  if (!pending) return record;
  if (remoteSha !== pending.sha) return { ...record, pending: null, updatedAt: now };
  return {
    ...record,
    lastPushedSha: pending.sha,
    stage: pending.stage,
    stagesPushed: [...(record.stagesPushed ?? []), pending.stage],
    files: pending.files,
    pending: null,
    updatedAt: now,
  };
}

export type Reconciled = "finalised" | "discarded" | "none";

/** A resume's first step: a pending checkpoint is final if the push landed, dropped if not. */
export function reconcile(record: RunRecord, remoteSha: string | null, now: string): { record: RunRecord; outcome: Reconciled } {
  if (!record.pending) return { record, outcome: "none" };
  const outcome = remoteSha === record.pending.sha ? "finalised" : "discarded";
  return { record: finaliseCheckpoint(record, remoteSha, now), outcome };
}

/** The commit the demo's BACKLOG.md rule reads from: the session's first base, whatever a later run moved. */
export const backlogBase = (record: RunRecord) => record.firstBase ?? record.base;

/**
 * A new request after a run ended, on the session's branch and open pull request (one branch per
 * chat, ruling 136): the base moves to HEAD, so done needs a commit after it, and everything else
 * this run owns starts empty. The kept approval goes, so a person is asked again, and the files go,
 * so a restore cannot bring back the finished run's status and body.
 */
export function restartRecord(record: RunRecord, head: string, now: string, request?: string): RunRecord {
  return {
    ...record,
    request,
    base: head,
    firstBase: backlogBase(record),
    stage: null,
    stagesPushed: [],
    iteration: 0,
    files: {},
    pending: null,
    approval: null,
    continued: true,
    runEnded: false,
    updatedAt: now,
  };
}

/**
 * The open pull request's body with a continued run's description added between its own markers.
 * A retry of the same run replaces only its section; what a person wrote around it stays.
 */
export function continuedBody(existing: string, base: string, body: string): string {
  const open = `<!-- ab-run:${base} -->`;
  const close = `<!-- /ab-run:${base} -->`;
  const section = `${open}\n${body.trimEnd()}\n${close}`;
  const from = existing.indexOf(open);
  const to = existing.indexOf(close);
  if (from >= 0 && to > from) return `${existing.slice(0, from)}${section}${existing.slice(to + close.length)}`;
  // A person who removed one marker made that section theirs: the other goes, so a retry never slices across it.
  const kept = existing.replace(open, "").replace(close, "");
  return kept.trim() ? `${kept.trimEnd()}\n\n${section}\n` : `${section}\n`;
}

/** One iteration starts: counted before the agent works, so a crashed iteration counts once. */
export function countIteration(record: RunRecord, now: string): RunRecord {
  return { ...record, iteration: record.iteration + 1, updatedAt: now };
}

export function addDecision(record: RunRecord, decision: Decision, now: string): RunRecord {
  return { ...record, decisions: [...record.decisions, decision], updatedAt: now };
}

/** The versions running now, as the emitter wrote them into versions.ts. */
export function currentVersions(): Versions {
  return VERSIONS;
}

export function sameVersions(a: Versions, b: Versions): boolean {
  return a.eve === b.eve && a.product === b.product;
}

/** The sandbox side of a resume: git in the clone and the run files on disk. */
export interface ResumeSandbox {
  /** The remote branch's tip, or null when the branch is not on the remote. */
  remoteTip(branch: string): Promise<string | null>;
  /** Fetches the branch and checks it out at `sha`. */
  checkout(branch: string, sha: string): Promise<void>;
  /** The full message of a commit the clone has. */
  commitMessage(sha: string): Promise<string>;
  /** Writes the run files, replacing what is under the run folders. */
  writeRunFiles(files: RunFiles): Promise<void>;
}

export type ResumeResult =
  | { status: "resumed"; stage: string | null; branch: string; head: string | null; checkpoint: Reconciled; files: string[] }
  | { status: "needs-human"; reason: string; branch: string }
  | { status: "stranded"; reason: string; branch: string; lastPushedSha: string | null; recordedVersions: Versions; runningVersions: Versions };

/**
 * Re-derives the run after the sandbox was replaced, in the KTD6 order: read the record,
 * reconcile a pending checkpoint, fetch the branch, adopt a tip only when its trailers name
 * this session, write the run files, return the stage. A failure under other versions than
 * the record's is reported as stranded, naming the last pushed branch.
 */
export async function rederive(store: RecordStore, sandbox: ResumeSandbox, running: Versions, now: string): Promise<ResumeResult | null> {
  const recorded = store.get();
  if (!recorded) return null;
  try {
    const tip = await sandbox.remoteTip(recorded.branch);
    const { record, outcome } = reconcile(recorded, tip, now);
    store.set(record);
    if (tip === null) {
      if (record.lastPushedSha !== null) {
        return { status: "needs-human", branch: record.branch, reason: `${record.branch} is gone from ${record.repository}; nothing was restored.` };
      }
    } else if (tip !== record.lastPushedSha) {
      await sandbox.checkout(record.branch, tip);
      const trailers = parseTrailers(await sandbox.commitMessage(tip));
      if (trailers[SESSION_TRAILER] !== record.sessionId) {
        return {
          status: "needs-human",
          branch: record.branch,
          reason: `the tip of ${record.branch} (${tip.slice(0, 12)}) was not pushed by this session; review it before the run continues.`,
        };
      }
    } else {
      await sandbox.checkout(record.branch, tip);
    }
    await sandbox.writeRunFiles(record.files);
    return {
      status: "resumed",
      stage: record.stage,
      branch: record.branch,
      head: tip,
      checkpoint: outcome,
      files: Object.keys(record.files).sort(),
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    if (sameVersions(recorded.versions, running)) throw error;
    return {
      status: "stranded",
      branch: recorded.branch,
      lastPushedSha: recorded.lastPushedSha,
      recordedVersions: recorded.versions,
      runningVersions: running,
      reason:
        `Stranded: this session's record was written by Eve ${recorded.versions.eve} and Agent Blueprint ${recorded.versions.product}, ` +
        `this runtime is Eve ${running.eve} and Agent Blueprint ${running.product}, and the resume failed (${reason}). ` +
        `The last pushed branch is ${recorded.branch}` +
        (recorded.lastPushedSha ? ` at ${recorded.lastPushedSha.slice(0, 12)}` : "") +
        "; continue from there in a new session.",
    };
  }
}
