import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import type { EveEvalSession, EveEvalTurn } from "eve/evals";
import { evalRemote, evalRemoteUrl } from "../../agent/lib/eval-remote";

// The live smoke cells (KTD15): the product's smoke fixture and each cell's prompt, seed and
// check.sh, read in place from tests/smoke/, so a cell on Eve is judged exactly as on a CLI.
// eve eval runs from the app root, so the product root is one folder up from cwd.
export const SMOKE = join(process.cwd(), "..", "tests", "smoke");
const GIT_ENV = {
  GIT_AUTHOR_NAME: "Agent Blueprint Smoke",
  GIT_AUTHOR_EMAIL: "smoke@example.invalid",
  GIT_COMMITTER_NAME: "Agent Blueprint Smoke",
  GIT_COMMITTER_EMAIL: "smoke@example.invalid",
};

type Skippable = { skip(reason: string): void; target: { kind: "local" | "remote" } };

/**
 * Skips a live cell where it cannot run and returns true. Live cells spend real tokens, so
 * they never run on the scripted mock; canary, build and review run on local Docker, and
 * ship runs only with --url against the demo's production deployment.
 */
export function skipLive(t: Skippable, where: "docker" | "remote", command: string): boolean {
  if (process.env.AB_EVAL_MOCK === "1") {
    t.skip(`live cell: the scripted mock follows its script, not the skill; waits for Gateway credits: ${command}`);
    return true;
  }
  if (where === "docker" && t.target.kind !== "local") {
    t.skip("live cell on local Docker: run it without --url");
    return true;
  }
  if (where === "remote" && t.target.kind === "local") {
    t.skip(`live cell against the demo's production deployment: ${command}`);
    return true;
  }
  return false;
}

/** The cell's skill, or null for a cell that names none (canary). */
export function cellSkill(cell: string): string | null {
  const path = join(SMOKE, "scenarios", cell, "skill");
  return existsSync(path) ? readFileSync(path, "utf8").split("\n")[0].trim() : null;
}

/** The cell's prompt with the skill named as the CLIs without a slash form name it. */
export function cellPrompt(cell: string): string {
  const text = readFileSync(join(SMOKE, "scenarios", cell, "prompt.txt"), "utf8").trim();
  const skill = cellSkill(cell);
  return skill ? text.replaceAll("{{SKILL_REF}}", `Use the ${skill} skill.`) : text;
}

function git(work: string, args: string[]): string {
  return execFileSync("git", ["-C", work, ...args], { encoding: "utf8", env: { ...process.env, ...GIT_ENV } }).trim();
}

function docker(args: string[], input?: Buffer): string {
  return execFileSync("docker", args, { encoding: "utf8", input, maxBuffer: 256 * 1024 * 1024 }).trim();
}

// eve labels each session's Docker sandbox with the session id. The container exists once
// the session is created and stops between steps, so it is started before every use.
async function container(sessionId: string): Promise<string> {
  for (let tries = 0; tries < 60; tries += 1) {
    const name = docker(["ps", "-a", "--filter", `label=eve.sandbox.tag.sessionId=${sessionId}`, "--format", "{{.Names}}"]).split("\n")[0];
    if (name) {
      docker(["start", name]);
      return name;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`no Docker sandbox for session ${sessionId} after 60 seconds`);
}

export interface SeededCell {
  cell: string;
  /** The seed commit, which check.sh compares the work against. */
  base: string;
}

/**
 * The stand-in remote (ruling 50(b)): with AB_EVAL_REMOTE=sandbox, publish_branch pushes to a bare
 * repository inside the sandbox instead of github.com (agent/lib/eval-remote.ts). The fixture's
 * origin names this github.com-shaped repository, which publish_branch requires, and the bare
 * repository at the matching path holds the fixture's main.
 */
export const STAND_IN_REPOSITORY = "ab-eval/smoke-fixture";
const STAND_IN_BARE = evalRemoteUrl(STAND_IN_REPOSITORY).replace("file://", "");

/**
 * Seeds the session's sandbox as run-smoke.sh seeds a work copy: the fixture committed on
 * main, the branch smoke/<cell>, the cell's apply.sh and its commit. `extra` adds lines to
 * fixture files before the first commit (path relative to the fixture, text appended).
 * `standIn` (by default on when AB_EVAL_REMOTE=sandbox) adds the stand-in remote: origin
 * https://github.com/ab-eval/smoke-fixture.git with origin/main and origin/HEAD at main, as a
 * clone has them, and the bare repository with main in the sandbox's /tmp/ab-eval-remote/.
 */
export async function seedCell(
  session: EveEvalSession,
  cell: string,
  extra: Record<string, string> = {},
  standIn: boolean = evalRemote() === "sandbox",
): Promise<SeededCell> {
  const work = mkdtempSync(join(tmpdir(), `ab-eve-smoke-${cell}-`));
  const remotes = mkdtempSync(join(tmpdir(), `ab-eve-remote-${cell}-`));
  try {
    cpSync(join(SMOKE, "fixture"), work, { recursive: true });
    for (const [path, text] of Object.entries(extra)) {
      writeFileSync(join(work, path), `${readFileSync(join(work, path), "utf8").trimEnd()}\n\n${text.trim()}\n`);
    }
    git(work, ["init", "-q", "-b", "main"]);
    git(work, ["add", "-A"]);
    git(work, ["commit", "-q", "-m", "chore(smoke): fixture"]);
    if (standIn) {
      git(work, ["remote", "add", "origin", `https://github.com/${STAND_IN_REPOSITORY}.git`]);
      git(work, ["update-ref", "refs/remotes/origin/main", "main"]);
      git(work, ["symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main"]);
      const bare = join(remotes, basename(STAND_IN_BARE));
      git(remotes, ["init", "-q", "--bare", "-b", "main", bare]);
      git(bare, ["fetch", "-q", work, "main:refs/heads/main"]);
    }
    git(work, ["checkout", "-q", "-b", `smoke/${cell}`]);
    const apply = join(SMOKE, "scenarios", cell, "apply.sh");
    if (existsSync(apply)) {
      execFileSync("bash", [apply, work]);
      if (git(work, ["status", "--porcelain", "--untracked-files=all"])) {
        const message = join(SMOKE, "scenarios", cell, "commit-message");
        git(work, ["add", "-A"]);
        git(work, ["commit", "-q", "-m", existsSync(message) ? readFileSync(message, "utf8").split("\n")[0] : `chore(smoke): seed ${cell}`]);
      }
    }
    const base = git(work, ["rev-parse", "HEAD"]);
    // COPYFILE_DISABLE keeps macOS tar from adding ._ metadata files.
    const archive = execFileSync("tar", ["-C", work, "-cf", "-", "."], {
      maxBuffer: 256 * 1024 * 1024,
      env: { ...process.env, COPYFILE_DISABLE: "1" },
    });
    const name = await container(session.id);
    docker(["exec", "-i", name, "tar", "-xf", "-", "-C", "/workspace"], archive);
    if (standIn) {
      const bares = execFileSync("tar", ["-C", remotes, "-cf", "-", "."], {
        maxBuffer: 64 * 1024 * 1024,
        env: { ...process.env, COPYFILE_DISABLE: "1" },
      });
      docker(["exec", name, "mkdir", "-p", dirname(STAND_IN_BARE)]);
      docker(["exec", "-i", name, "tar", "-xf", "-", "-C", dirname(STAND_IN_BARE)], bares);
    }
    return { cell, base };
  } finally {
    rmSync(work, { recursive: true, force: true });
    rmSync(remotes, { recursive: true, force: true });
  }
}

export interface StandInPush {
  /** The branches under refs/heads/ab/ in the stand-in's bare repository. */
  branches: string[];
  /** The publish_branch calls in mode stage that settled pushed. */
  stagePushes: number;
}

type CallFact = { type: string; data?: object };

/** What reached the stand-in remote: its ab/ branches and the session's pushed stage calls. */
export async function standInPush(session: EveEvalSession): Promise<StandInPush> {
  const name = await container(session.id);
  const listed = spawnSync(
    "docker",
    ["exec", name, "git", "-c", "safe.directory=*", "-C", STAND_IN_BARE, "for-each-ref", "--format=%(refname)", "refs/heads/ab/"],
    { encoding: "utf8" },
  );
  const branches = listed.status === 0 ? listed.stdout.split("\n").filter(Boolean) : [];
  const stages = new Set<string>();
  let stagePushes = 0;
  for (const event of session.events as readonly CallFact[]) {
    const data = (event.data ?? {}) as { callId?: string; capability?: { name?: string }; input?: { mode?: string }; output?: { status?: string } };
    if (event.type === "call.requested" && data.capability?.name === "publish_branch" && data.input?.mode === "stage" && data.callId) stages.add(data.callId);
    if (event.type === "call.settled" && data.callId && stages.has(data.callId) && data.output?.status === "pushed") stagePushes += 1;
  }
  return { branches, stagePushes };
}

/**
 * Answers every checkpoint until the run stops asking: approvals with approve, questions
 * with their first option (the skill's recommended default), as a headless CLI run would.
 * Returns the last turn and the tool calls of every turn.
 */
export async function answerCheckpoints(
  turn: EveEvalTurn,
  limit = 40,
): Promise<{ turn: EveEvalTurn; calls: EveEvalTurn["toolCalls"][number][] }> {
  let current = turn;
  const calls = [...turn.toolCalls];
  for (let answered = 0; answered < limit; answered += 1) {
    const pending = current.session.pendingInteractions;
    if (pending.length === 0) break;
    current = await current.session.respond(
      pending.map((interaction) => {
        const request = interaction.request as { kind?: string; options?: readonly { id: string }[] };
        const optionId = request.kind === "approval" ? "approve" : (request.options?.[0]?.id ?? "approve");
        return { interactionId: interaction.interactionId, optionId };
      }),
    );
    calls.push(...current.toolCalls);
  }
  return { turn: current, calls };
}

export interface CellCheck {
  ok: boolean;
  reason: string;
  /** Whether .agent-blueprint/run/provenance/<skill>.json exists in the work copy. */
  provenance: boolean;
}

/**
 * Copies the sandbox's /workspace out and runs the cell's check.sh on it with the final
 * message, the same arguments run-smoke.sh passes (WORK BASE FINAL LOG REMOTE).
 */
export async function runCheck(session: EveEvalSession, seeded: SeededCell, final: string): Promise<CellCheck> {
  const scratch = mkdtempSync(join(tmpdir(), `ab-eve-check-${seeded.cell}-`));
  try {
    const name = await container(session.id);
    docker(["cp", `${name}:/workspace`, join(scratch, "work")]);
    const work = join(scratch, "work");
    writeFileSync(join(scratch, "final.txt"), final);
    writeFileSync(join(scratch, "log.txt"), session.transcript);
    const result = spawnSync(
      "bash",
      [join(SMOKE, "scenarios", seeded.cell, "check.sh"), work, seeded.base, join(scratch, "final.txt"), join(scratch, "log.txt"), ""],
      { encoding: "utf8", env: { ...process.env, ...GIT_ENV }, timeout: 600_000 },
    );
    const skill = cellSkill(seeded.cell);
    return {
      ok: result.status === 0,
      reason: (result.stdout || result.stderr || `check.sh exited ${result.status}`).trim(),
      provenance: skill ? existsSync(join(work, ".agent-blueprint", "run", "provenance", `${skill}.json`)) : false,
    };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
