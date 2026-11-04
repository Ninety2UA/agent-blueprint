import type { SandboxSession } from "eve/sandbox";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { quote } from "../lib/credentials";
import type { Role } from "../lib/roster";
import { addDecision, countIteration, type Decision, type RunRecord } from "../lib/run-state";
import { type Posture, type PublishDeps, type PublishResult, ensureRecord, originRepository, publish, runtimeDeps } from "./publish_branch";

// The ship loop (KTD3 as ruled on 2026-10-29, option b): one call is one iteration, and the root
// agent calls again. Every record write runs here, in an ordinary tool, because a workflow step
// holds no session state on Eve 0.86.0. Each call:
//   1. counts the iteration in the durable record before anything else, so an iteration that
//      crashes, the tool's own reads included, still counts once (KTD6)
//   2. reads .agent-blueprint/run/state.json from the sandbox and records the defaults the
//      skill took
//   3. stops on done (only with commits since the recorded base, as scripts/run.sh's done
//      check, counting only commits that change files, so an empty stage marker is not work),
//      blocked, needs-human or the ceiling; every stop but done pushes the branch through
//      publish_branch's stage mode and names the stage
//   4. otherwise returns the iteration brief for a fresh root copy, in the role its stage needs
// The brief and the done rule mirror ab-ship-pipeline's scripts/run.sh and references/run-state.md.

/** scripts/run.sh's default iteration ceiling (--max), and the skill's fixed ceiling above it. */
export const DEFAULT_CEILING = 10;
export const MAX_CEILING = 20;

const SKILL = "ab-ship-pipeline";
const RUN_DIR = ".agent-blueprint/run";
const STATE_FILE = `${RUN_DIR}/state.json`;
const PR_BODY = `${RUN_DIR}/pr-body.md`;

/** The stage in state.json decides the copy's role. */
export const STAGE_ROLES: Readonly<Record<string, Role>> = {
  continuation: "planner",
  plan: "planner",
  execute: "builder",
  review: "reviewer",
  verify: "tester",
  ship: "documenter",
};

export type Outcome = "iterate" | "done" | "blocked" | "needs-human" | "ceiling";

export interface ShipInput {
  /** The user's feature request. */
  readonly request: string;
  readonly ceiling?: number;
  /** The person's answer to the question a needs-human stop asked. */
  readonly answer?: string;
}

export interface ShipResult {
  readonly outcome: Outcome;
  readonly iteration: number;
  readonly ceiling: number;
  /** The stage the run is at, from state.json; null before the skill has written one. */
  readonly stage: string | null;
  /** The roster role the brief is for; null on a stop. */
  readonly role: Role | null;
  /** The brief for a fresh root copy, handed over unchanged; null on a stop. */
  readonly brief: string | null;
  readonly reason: string;
  readonly branch: string;
  readonly posture: Posture;
  /** Defaults the skill took since the last call, now in the run's decisions. */
  readonly defaults: readonly Decision[];
  /** The branch push a stop made, when it made one. */
  readonly push?: PublishResult | { status: "failed"; reason: string };
}

interface RunState {
  readonly status: "running" | "done" | "blocked" | "needs-human";
  readonly stage: string;
  readonly reason: string;
  readonly decisions: readonly Decision[];
}

const clean = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/[\x00-\x1f\x7f]/g, " ").slice(0, max) : "");

/** state.json read and checked as scripts/run.sh's load_state does; every field is untrusted. */
export function parseState(text: string, version: string): RunState | { error: string } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { error: `${STATE_FILE} is not valid JSON` };
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return { error: `${STATE_FILE} is not a JSON object` };
  const state = data as Record<string, unknown>;
  const status = clean(state.status, 64);
  if (!["running", "done", "blocked", "needs-human"].includes(status)) return { error: `status '${status}' is not running, done, blocked or needs-human` };
  const driver = clean(state.driver, 64);
  if (!["runner", "interactive"].includes(driver)) return { error: `driver '${driver}' is not runner or interactive` };
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(clean(state.session_id, 200))) return { error: "session_id does not match ^[A-Za-z0-9._:-]{1,128}$" };
  const provenance = state.provenance && typeof state.provenance === "object" ? (state.provenance as Record<string, unknown>) : null;
  if (!provenance || !clean(provenance.skill, 64)) return { error: `${STATE_FILE} carries no provenance marker` };
  if (provenance.skill !== SKILL || provenance.version !== version) {
    return { error: `provenance names ${clean(provenance.skill, 64)} ${clean(provenance.version, 64)}, not ${SKILL} ${version}` };
  }
  const stage = clean(state.stage, 64);
  if (!Object.hasOwn(STAGE_ROLES, stage)) return { error: `stage '${stage}' is not one of ${Object.keys(STAGE_ROLES).join(", ")}` };
  const decisions = (Array.isArray(state.decisions) ? state.decisions : [])
    .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === "object")
    .map((entry) => ({ stage: clean(entry.stage, 64), question: clean(entry.question, 300), choice: clean(entry.choice, 300), reason: clean(entry.reason, 300) }))
    .filter((decision) => decision.question && decision.choice);
  return { status: status as RunState["status"], stage, reason: clean(state.reason, 500), decisions };
}

async function sh(sandbox: SandboxSession, command: string) {
  return sandbox.run({ command, env: { GIT_TERMINAL_PROMPT: "0" } });
}

async function readState(sandbox: SandboxSession, version: string): Promise<RunState | { error: string } | null> {
  const read = await sh(sandbox, `test -L ${quote(STATE_FILE)} && exit 3; test -f ${quote(STATE_FILE)} || exit 4; cat ${quote(STATE_FILE)}`);
  if (read.exitCode === 4) return null;
  if (read.exitCode === 3) return { error: `${STATE_FILE} is a symlink` };
  if (read.exitCode !== 0) throw new Error(`reading ${STATE_FILE} failed: ${(read.stderr || read.stdout).trim()}`);
  return parseState(read.stdout, version);
}

/** scripts/run.sh's done_check: why the run is not done, or null when it is. A symlink ends the run as needs-human. */
async function notDone(sandbox: SandboxSession, base: string): Promise<{ why: string; link: boolean } | null> {
  for (const path of [".agent-blueprint", RUN_DIR, PR_BODY]) {
    if ((await sh(sandbox, `test -L ${quote(path)}`)).exitCode === 0) return { why: `${path} is a symlink; the pull request body must be a regular file at ${PR_BODY}`, link: true };
  }
  if ((await sh(sandbox, `git merge-base --is-ancestor ${quote(base)} HEAD`)).exitCode !== 0) {
    return { why: `the branch no longer contains the recorded base ${base.slice(0, 12)}`, link: false };
  }
  if ((await sh(sandbox, "git status --porcelain --untracked-files=no")).stdout.trim()) return { why: "tracked files still have uncommitted changes", link: false };
  // A commit is work when its tree differs from its first parent's. An empty stage marker is not;
  // a stage commit that swept uncommitted work in (stage mode runs git add -A) is.
  const log = await sh(sandbox, `git log --reverse --format="%H %T %P" ${quote(base)}..HEAD`);
  const commits = log.exitCode === 0
    ? log.stdout.split("\n").filter(Boolean).map((line) => {
        const [sha, tree, parent] = line.split(" ");
        return { sha, tree, parent };
      })
    : [];
  if (!commits.length) return { why: "no commits since the recorded base", link: false };
  const trees = new Map(commits.map((commit) => [commit.sha, commit.tree]));
  const outside = [...new Set(commits.map((commit) => commit.parent).filter((parent) => parent && !trees.has(parent)))];
  if (outside.length) {
    const parents = await sh(sandbox, `git rev-parse ${outside.map((parent) => quote(`${parent}^{tree}`)).join(" ")}`);
    const lines = parents.stdout.split("\n");
    if (parents.exitCode === 0) outside.forEach((parent, index) => trees.set(parent, lines[index]));
  }
  // A root commit, or a parent whose tree could not be read, counts as work.
  if (commits.every((commit) => commit.parent && trees.get(commit.parent) === commit.tree)) {
    return { why: `the commits since the recorded base change no files (${commits.map((commit) => commit.sha.slice(0, 12)).join(", ")}), with no commit of the work itself`, link: false };
  }
  if ((await sh(sandbox, `test -f ${quote(PR_BODY)}`)).exitCode !== 0) return { why: `${PR_BODY} is missing or not a regular file`, link: false };
  if ((await sh(sandbox, `test -s ${quote(PR_BODY)}`)).exitCode !== 0) return { why: `${PR_BODY} is empty`, link: false };
  return null;
}

/** The iteration brief: scripts/run.sh's prompt, for a root copy in the sandbox instead of a headless host. */
export function iterationBrief(fields: {
  request: string;
  iteration: number;
  ceiling: number;
  stage: string | null;
  role: Role;
  answer?: { question: string; text: string };
  notDone?: string;
  invalid?: string;
}): string {
  const at = fields.stage ? `the ${fields.stage} stage` : "Stage 0";
  return [
    `Use the ${SKILL} skill for this feature: ${fields.request.replace(/\s+/g, " ").trim()} --external`,
    "",
    `Ship loop iteration ${fields.iteration} of at most ${fields.ceiling}. You work as the ${fields.role} role, from ${at}. ` +
      `The run state file is ${STATE_FILE}: if it exists, read it first and continue from the stage it names; otherwise start at Stage 0. ` +
      "The --external flag stands for AGENT_BLUEPRINT_RUNNER=1, so set driver to runner; git is writable here (AGENT_BLUEPRINT_GIT_WRITABLE=1). " +
      "Take the default the skill documents for each question and record it in decisions; when a question has no documented default, or only a person can make the change, " +
      "set status needs-human with the question as the reason and stop. " +
      `Leave publishing to the root agent: never push or open a pull request. When the work is finished, set status done in ${STATE_FILE} with the commits and ${PR_BODY} in place, then stop. ` +
      `Never delete a file under ${RUN_DIR}.`,
    "When the stage you worked on is finished, end your reply with the line Stage finished: <the stage>.",
    ...(fields.answer ? [`The person answered the open question (${fields.answer.question}): ${fields.answer.text}. Record it in decisions and go on.`] : []),
    ...(fields.notDone ? [`The last iteration set status done, but ${fields.notDone}, so the run is not done yet.`] : []),
    ...(fields.invalid ? [`The last iteration left no valid state file (${fields.invalid}); write it whole as the skill says.`] : []),
  ].join("\n");
}

const sameDecision = (a: Decision, b: Decision) => a.stage === b.stage && a.question === b.question && a.choice === b.choice;

/** One iteration of the loop. */
export async function shipIteration(deps: PublishDeps, input: ShipInput): Promise<ShipResult> {
  const ceiling = Math.min(Math.max(Math.trunc(input.ceiling ?? DEFAULT_CEILING), 1), MAX_CEILING);
  const repository = await originRepository(deps.sandbox);
  let record: RunRecord = countIteration(await ensureRecord(deps, { request: input.request }, repository), deps.now());
  deps.store.set(record);
  const { iteration, branch } = record;

  const state = await readState(deps.sandbox, deps.versions.product);
  const valid = state && !("error" in state) ? state : null;
  const defaults = (valid?.decisions ?? []).filter((decision) => !record.decisions.some((known) => sameDecision(known, decision)));
  for (const decision of defaults) record = addDecision(record, decision, deps.now());
  if (defaults.length) deps.store.set(record);
  const stage = valid?.stage ?? null;
  const base = { iteration, ceiling, stage, branch, posture: deps.posture, defaults };

  const stop = async (outcome: Exclude<Outcome, "iterate" | "done">, reason: string): Promise<ShipResult> => {
    let push: ShipResult["push"];
    try {
      push = await publish(deps, { mode: "stage", stage: stage ?? record.stage ?? "continuation", request: input.request });
    } catch (error) {
      push = { status: "failed", reason: error instanceof Error ? error.message : String(error) };
    }
    const pushed = push.status === "pushed" ? ` ${branch} is pushed at ${push.sha.slice(0, 12)}.` : ` The branch push did not land: ${"reason" in push ? push.reason : push.status}.`;
    return { ...base, outcome, role: null, brief: null, reason: `${reason}${pushed}`, push };
  };

  let answer: { question: string; text: string } | undefined;
  let notDoneWhy: string | undefined;
  if (valid?.status === "done") {
    const check = await notDone(deps.sandbox, record.base);
    if (!check) {
      return { ...base, outcome: "done", role: null, brief: null, reason: "state.json says done and the done rule holds: call publish_branch with mode pull-request." };
    }
    if (check.link) return stop("needs-human", `state.json says done, but ${check.why}.`);
    notDoneWhy = check.why;
  } else if (valid?.status === "blocked") {
    return stop("blocked", `the ${stage} stage is blocked: ${valid.reason || "no reason given"}.`);
  } else if (valid?.status === "needs-human") {
    const text = input.answer?.trim();
    if (!text) return stop("needs-human", `the ${stage} stage needs a person: ${valid.reason || "no reason given"}.`);
    answer = { question: valid.reason || "the open question", text: text.slice(0, 2_000) };
    record = addDecision(record, { stage: stage ?? "", question: answer.question.slice(0, 300), choice: answer.text.slice(0, 300), reason: "answered by the person" }, deps.now());
    deps.store.set(record);
  }

  if (iteration > ceiling) {
    return stop("ceiling", `the run reached its ceiling of ${ceiling} iterations without finishing, at the ${stage ?? "first"} stage.`);
  }
  const role = STAGE_ROLES[stage ?? "continuation"];
  const brief = iterationBrief({
    request: input.request,
    iteration,
    ceiling,
    stage,
    role,
    answer,
    notDone: notDoneWhy,
    invalid: state && "error" in state ? state.error : undefined,
  });
  const reason = notDoneWhy
    ? `state.json says done, but ${notDoneWhy}; not done.`
    : state && "error" in state
      ? `the last iteration left no valid state file: ${state.error}.`
      : `iteration ${iteration} of at most ${ceiling}.`;
  return { ...base, outcome: "iterate", role, brief, reason };
}

export default defineTool({
  description:
    "Run the ship loop one iteration at a time: call it with the user's feature request; it counts the iteration, reads the run's state file and returns an outcome. " +
    "On iterate, hand the brief unchanged to the helper tool with the role it names; when the helper says its stage finished, call publish_branch with mode stage and that stage; then call this tool again. " +
    "Stop on any other outcome: done (call publish_branch with mode pull-request), blocked, needs-human or ceiling (the branch is pushed and the stage named). " +
    "After a needs-human stop on an interactive channel, ask the person and call again with their answer.",
  inputSchema: z.object({
    request: z.string().min(1).max(4_000).describe("The user's feature request."),
    ceiling: z.number().int().min(1).max(MAX_CEILING).optional().describe(`Iterations before the loop stops; default ${DEFAULT_CEILING}.`),
    answer: z.string().max(2_000).optional().describe("The person's answer after a needs-human stop."),
  }),
  availableInSubagents: false,
  async execute(input, ctx) {
    return shipIteration(runtimeDeps(await ctx.getSandbox(), ctx.session.id), input);
  },
});
