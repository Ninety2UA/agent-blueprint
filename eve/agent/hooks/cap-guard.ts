import { defineState, type SessionAuthContext } from "eve/context";
import { call, usage } from "eve/events";
import { defineHook, type HookContext } from "eve/hooks";
import type { SandboxSession } from "eve/sandbox";
import { capReached, classifyFailure, newInputTokens } from "../lib/caps";
import { gitHubAppFromEnv, mintInstallationToken } from "../lib/credentials";
import { evalRemote, evalRemoteUrl } from "../lib/eval-remote";
import { postureFor, withPostureDecision } from "../lib/posture";
import { type Caller, defaultRegistry, helperStop, owesPush, type Registry, type SessionOutcome } from "../lib/registry";
import { byCapGuard, helperResult, helperStoppedIn, type PushReport, runEnd, runEndKey } from "../lib/run-end";
import { currentVersions } from "../lib/run-state";
import { listStragglers } from "../lib/sandbox-processes";
import { allowedHosts, provider } from "../sandbox/sandbox";
import { skillPackage as shipPipeline } from "../skills/ab-ship-pipeline";
import { type PublishResult, posture, publish, runRecord, visitorRequest, visitorText } from "../tools/publish_branch";

// The root hook for the run states this unit owns (R11, R16, KTD13):
//   every copy   the posture from the calling channel at each turn, copied into the run's
//                decisions once the run has a record; a 429 from the model provider or a sandbox
//                that could not be created ends the run blocked, the branch pushed, the stage named;
//                a helper's stop reaches its root when the helper's call settles, and the root stops
//   the demo     (AB_DEMO=1) the registry admits each turn: resting after the day's 402, busy
//                past one running session per cookie or two per address, a session already ended
//                stays ended; the token cap cancels the turn as the usage that reaches it is
//                recorded, and any later turn before its model call, so Eve never opens its
//                continue prompt; the branch is pushed through publish_branch's stage mode as
//                soon as the cancelled turn has settled; the session's first message is recorded
//                as the visitor's request, which the demo pull request quotes; a helper counts as
//                its root session, never as another visitor's session (countedSession)
// A turn this hook cancels settles "cancelled" with cause { hook: "cap-guard" }; the web chat
// reads the registry for which state it was and shows that state's message from the gate table.
// Linear and Telegram post their run-end notice once this hook's turn.settled push has finished:
// it settles lib/run-end.ts with the push result (or null when it owed none) for every turn.

const demo = () => process.env.AB_DEMO === "1";
/** A run state whose branch push waits for the turn to settle. */
const pendingPush = defineState<SessionOutcome | null>("agent-blueprint.cap-guard.pending-push", () => null);
let shared: Registry | undefined;
const registry = () => (shared ??= defaultRegistry());

/**
 * The session a turn counts under in the registry. A helper is its own Eve session under the
 * visitor's cookie, but it is part of that visitor's run, so it counts as its root session: it is
 * never a second session for the busy limits, and the root's owner, end and resting state rule it.
 */
const countedSession = (ctx: HookContext) => ctx.session.parent?.rootSessionId ?? ctx.session.id;

/**
 * The visitor behind a turn: the chat cookie's id and address, which agent/channels/eve.ts puts on
 * the principal. Only visitors are counted; Dominik's own OIDC calls and the local developer have
 * no cookie, so the registry never admits or refuses them (the token cap still applies).
 */
function callerOf(ctx: HookContext): Caller | null {
  const auth = ctx.session.auth.current ?? ctx.session.auth.initiator;
  const attribute = (name: string) => {
    const value = auth?.attributes[name];
    return typeof value === "string" && value ? value : null;
  };
  const cookieId = attribute("cookieId");
  if (!cookieId) return null;
  return { sessionId: countedSession(ctx), cookieId, address: attribute("address") ?? "unknown", ...(ctx.session.parent ? { helperId: ctx.session.id } : {}) };
}

function principalOf(ctx: HookContext): SessionAuthContext | null {
  return ctx.session.auth.initiator ?? ctx.session.auth.current ?? null;
}

/** Writes the posture for this turn and, when the run has a record, into its decisions. */
function syncPosture(ctx: HookContext) {
  const { posture: next, reason } = postureFor({ channel: ctx.channel.kind, principal: principalOf(ctx) });
  if (posture.get() !== next) posture.update(() => next);
  const record = runRecord.get();
  if (record) {
    const updated = withPostureDecision(record, next, reason, ctx.now.toISOString());
    if (updated !== record) runRecord.update(() => updated);
  }
}

/** Pushes the run's branch through publish_branch's stage mode, naming the last stage it finished. */
async function pushBranch(
  ctx: HookContext,
): Promise<{ branch: string | null; stage: string | null; repository: string | null; pushed: boolean; pushedSha?: string | null; reason?: string }> {
  const before = runRecord.get();
  const stage = before?.stage ?? null;
  let result: PublishResult | undefined;
  let failure = "";
  // Eve stops a local sandbox when the turn ends, which can land while this push runs (a provider
  // failure ends the turn at once); a command resumes it, a file write does not, so a push that
  // met a stopped sandbox is tried again on a fresh handle.
  for (let attempt = 0; attempt < 3 && !result; attempt += 1) {
    let sandbox: SandboxSession | undefined;
    try {
      sandbox = await ctx.getSandbox();
      await sandbox.run({ command: "true" });
      result = await publish(publishDeps(ctx, throughCommands(sandbox)), { mode: "stage", stage: stage ?? "partial" });
    } catch (error) {
      failure = (error as Error).message;
      if (!/not running|no such container|is stopped/i.test(failure)) break;
      // Stopping the stale handle makes Eve forget its connection, so the next one opens afresh.
      await (sandbox as { stop?: () => Promise<void> } | undefined)?.stop?.().catch(() => {});
    }
  }
  if (!result) {
    const after = runRecord.get();
    return { branch: after?.branch ?? null, stage, repository: after?.repository ?? null, pushed: false, reason: failure };
  }
  const after = runRecord.get();
  return {
    branch: after?.branch ?? null,
    stage,
    repository: after?.repository ?? null,
    pushed: result.status === "pushed",
    pushedSha: after?.lastPushedSha ?? null,
    ...("reason" in result ? { reason: result.reason } : {}),
  };
}

/**
 * Ends the run in a run state: the registry told at once (on the demo), the turn cancelled, and
 * the branch pushed once the turn has settled. The push waits for turn.settled because Eve closes
 * a step's sandbox connection when the step ends, which stops a local sandbox under a push still
 * running beside it; between turns nothing else holds the sandbox.
 */
async function stop(ctx: HookContext, outcome: SessionOutcome, push: boolean) {
  if (demo()) await registry().end(countedSession(ctx), outcome, push);
  // A helper leaves the branch to the root session, which holds the run's record: a push from here
  // would open a second branch named after the helper.
  if (push && !ctx.session.parent && !pendingPush.get()) pendingPush.update(() => outcome);
  console.info("[cap-guard] cancelled", { sessionId: ctx.session.id, outcome });
  ctx.cancel(`cap-guard: ${outcome}`);
}

const attempted = new Set<string>();

interface Settled {
  readonly turnId: string;
  readonly outcome: string;
  readonly cause?: unknown;
}

/** Whether this hook cancelled the root turn that just settled. */
function stoppedHere(ctx: HookContext, settled: Settled): boolean {
  if (ctx.session.parent || settled.outcome !== "cancelled") return false;
  return byCapGuard(settled.cause) || helperStoppedIn(ctx.view, settled.turnId);
}

/**
 * The push a stop asked for, made when its turn has settled. A cancelled step's state writes do
 * not survive the cancel, so a stop's push is also read from what outlives it: on the demo the
 * registry says which ended sessions still owe one, the only record when the stop was a helper's;
 * off the demo only a failure cancels a turn here, so a turn this hook cancelled is a blocked run.
 */
async function pushPending(ctx: HookContext, settled: Settled): Promise<PushReport | null> {
  let outcome = pendingPush.get();
  if (!outcome && demo() && !attempted.has(ctx.session.id)) {
    const entry = (await registry().snapshot()).sessions[ctx.session.id];
    if (entry && owesPush(entry)) outcome = entry.outcome;
  }
  if (!outcome && !demo() && stoppedHere(ctx, settled)) outcome = "blocked";
  if (!outcome) return null;
  attempted.add(ctx.session.id);
  if (pendingPush.get()) pendingPush.update(() => null);
  const pushed = await pushBranch(ctx);
  console.info("[cap-guard] branch", { sessionId: ctx.session.id, outcome, pushed: pushed.pushed, branch: pushed.branch, stage: pushed.stage, reason: pushed.reason });
  if (demo()) await registry().recordProgress(ctx.session.id, { ...pushed, pushLanded: pushed.pushed });
  return { pushed: pushed.pushed, branch: pushed.branch, stage: pushed.stage };
}

const stopped = new Set<string>();
/** One stop per session and turn: the cancel ends the turn, and later events in it need nothing more. */
async function stopOnce(ctx: HookContext, outcome: SessionOutcome, push: boolean) {
  const key = `${ctx.session.id}:${ctx.turn?.id ?? "-"}`;
  if (stopped.has(key)) return ctx.cancel(`cap-guard: ${outcome}`);
  stopped.add(key);
  await stop(ctx, outcome, push);
}

async function checkTokens(ctx: HookContext) {
  if (!demo()) return;
  const tokens = newInputTokens(usage(ctx.view).total);
  await registry().recordTokens(countedSession(ctx), tokens);
  if (capReached(tokens)) await stopOnce(ctx, "token-cap", true);
}

async function checkFailure(ctx: HookContext, error: { code?: string; message?: string } | undefined) {
  const failure = classifyFailure(error);
  if (failure === "rate-limited") return stopOnce(ctx, "blocked", true);
  if (failure === "sandbox") return stopOnce(ctx, "blocked", false);
  if (failure === "daily-budget" && demo()) {
    await registry().markResting();
    return stopOnce(ctx, "resting", true);
  }
}

/** A root's helper call has returned: a helper's stop, or its failure, becomes the root's. */
async function checkHelper(ctx: HookContext, output: unknown) {
  const result = helperResult(output);
  const document = demo() ? await registry().snapshot() : null;
  const stopFor = helperStop(result, document?.sessions[ctx.session.id], document?.restingSince ?? null);
  if (stopFor) return stopOnce(ctx, stopFor.outcome, stopFor.push);
  if (result.status === "failed") await checkFailure(ctx, { message: result.message });
}

export default defineHook({
  events: {
    // Eve records what the person sent as delivery.consumed's parts, before the model reads it.
    "delivery.consumed"(event) {
      if (!demo() || visitorRequest.get() !== null) return;
      const text = visitorText(event.data.parts);
      if (text) visitorRequest.update(() => text);
    },
    async "turn.started"(_event, ctx) {
      syncPosture(ctx);
      if (!demo()) return;
      const caller = callerOf(ctx);
      if (!caller) {
        if (capReached(newInputTokens(usage(ctx.view).total))) ctx.cancel("cap-guard: token-cap");
        return;
      }
      const admission = await registry().admit(caller);
      switch (admission.kind) {
        case "admitted":
          if (capReached(admission.entry.tokens)) await stopOnce(ctx, "token-cap", true);
          return;
        case "ended":
          ctx.cancel(`cap-guard: ${admission.entry.outcome ?? "ended"}`);
          return;
        default:
          console.info("[cap-guard] refused", { sessionId: ctx.session.id, kind: admission.kind });
          ctx.cancel(`cap-guard: ${admission.kind}`);
      }
    },
    async "model.requested"(_event, ctx) {
      await checkTokens(ctx);
    },
    async "usage.recorded"(_event, ctx) {
      await checkTokens(ctx);
    },
    async "model.retried"(event, ctx) {
      await checkFailure(ctx, event.data.error);
    },
    async "model.settled"(event, ctx) {
      if (event.data.outcome === "failed") await checkFailure(ctx, event.data.error);
    },
    async "call.settled"(event, ctx) {
      const observed = call(ctx.view, event.data.callId);
      if (observed?.name === "publish_branch") {
        syncPosture(ctx);
        const record = runRecord.get();
        if (demo() && record) {
          await registry().recordProgress(ctx.session.id, { repository: record.repository, branch: record.branch, stage: record.stage, pushedSha: record.lastPushedSha });
        }
        if (demo() && record?.pullRequest) await registry().end(ctx.session.id, "done");
      }
      if (observed?.name === "helper" && event.data.outcome === "completed") await checkHelper(ctx, event.data.output ?? observed.output);
      if (event.data.outcome === "failed") await checkFailure(ctx, event.data.error);
    },
    async "turn.settled"(event, ctx) {
      // Linear's and Telegram's run-end notice waits on this push (lib/run-end.ts): it is settled
      // even when the push throws, so a notice never waits forever.
      let report: PushReport | null = null;
      try {
        report = await pushPending(ctx, event.data);
        // state.json still says running after this stop, so the next request's newWork reads this.
        const record = runRecord.get();
        if (record && stoppedHere(ctx, event.data)) runRecord.update(() => ({ ...record, runEnded: true }));
      } finally {
        await runEnd.settle(runEndKey(ctx.session.id, event.data.turnId), report);
      }
    },
    async "session.ended"(event, ctx) {
      if (demo()) await registry().end(ctx.session.id, event.data.outcome === "failed" ? "failed" : "completed");
    },
  },
});

/**
 * The hook's sandbox with file writes and removals made by commands. In a hook, Eve's local
 * Docker sandbox starts for a command and is stopped again after it, so a file write or a spawned
 * process meets a stopped container; a command carrying the bytes in its environment does not.
 * The git token file of the Docker and Daytona route is the one secret publish writes, and it
 * never goes into an environment: that write is refused, so a push from this hook on those
 * providers ends unpushed with the reason named (the branch stays at the last stage the agent
 * pushed). The evals' placeholder token (lib/eval-remote.ts) is not a secret and passes.
 */
const TOKEN_FILE = /\/ab-git-[^/]+\/token$/;

function throughCommands(sandbox: SandboxSession): SandboxSession {
  const quoted = (path: string) => `'${path.replaceAll("'", `'\\''`)}'`;
  return Object.assign(Object.create(sandbox) as SandboxSession, {
    run: sandbox.run.bind(sandbox),
    async writeFiles(options: { files: readonly { path: string; content: Uint8Array }[] }) {
      for (const file of options.files) {
        if (TOKEN_FILE.test(file.path) && evalRemote() === null) {
          throw new Error("a push from the cap hook cannot hand a GitHub token to git on this sandbox provider");
        }
        const target = quoted(file.path);
        const written = await sandbox.run({
          command: `mkdir -p "$(dirname ${target})" && printf '%s' "$AB_FILE_BASE64" | base64 -d > ${target}`,
          env: { AB_FILE_BASE64: Buffer.from(file.content).toString("base64") },
        });
        if (written.exitCode !== 0) throw new Error(`writing ${file.path} in the sandbox failed: ${written.stderr.trim()}`);
      }
    },
    async removePath(options: { path: string; recursive?: boolean; force?: boolean }) {
      const flags = `${options.recursive ? "r" : ""}${options.force ? "f" : ""}`;
      const removed = await sandbox.run({ command: `rm ${flags ? `-${flags} ` : ""}-- ${quoted(options.path)}` });
      if (removed.exitCode !== 0 && !options.force) throw new Error(`removing ${options.path} in the sandbox failed: ${removed.stderr}`);
    },
  });
}

// publish_branch's own dependencies, built here for a push the hook makes: the same scripts,
// token route, hosts and versions as the tool. Under AB_EVAL_MOCK=1 or AB_EVAL_REMOTE=sandbox
// (lib/eval-remote.ts) the push goes to a bare repository inside the sandbox instead of
// github.com, so the eval can see it land.
function publishDeps(ctx: HookContext, sandbox: SandboxSession): Parameters<typeof publish>[0] {
  const mock = evalRemote() !== null;
  const script = (name: string) => {
    const text = shipPipeline.files?.[`scripts/${name}`];
    if (typeof text !== "string") throw new Error(`the packaged ab-ship-pipeline has no scripts/${name}`);
    return text;
  };
  const run = (command: string) => sandbox.run({ command, env: { GIT_TERMINAL_PROMPT: "0" } });
  return {
    sandbox,
    store: { get: () => runRecord.get(), set: (record) => runRecord.update(() => record) },
    sessionId: ctx.session.id,
    posture: posture.get(),
    demo: demo(),
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
    api: { fetch, url: "https://api.github.com" },
    remoteUrl: (repository) => (mock ? evalRemoteUrl(repository) : `https://github.com/${repository}.git`),
    // The straggler listing is publish_branch's (lib/sandbox-processes.ts): it never counts itself.
    listProcesses: () => listStragglers(run, "cap-guard"),
    stopProcesses: async (pids) => {
      const list = pids.join(" ");
      await run(`kill -TERM ${list} 2>/dev/null; sleep 1; kill -KILL ${list} 2>/dev/null; true`);
    },
    now: () => new Date().toISOString(),
  };
}
