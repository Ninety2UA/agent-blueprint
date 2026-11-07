import { createHmac } from "node:crypto";
import { readFileSync, rmSync } from "node:fs";
import { createServer, type IncomingMessage } from "node:http";
import { join } from "node:path";
import { defineEval } from "eve/evals";
import { equals, includes } from "eve/evals/expect";
import { configuredSecret, COOKIE_NAME, issueCookie } from "../apps/web/lib/gate/code";
import type { RegistryDocument } from "../agent/lib/registry";
import { BODY_LINE, COMMIT_LINE, FEATURE, outputs, readyFor, remoteFor, setupFor, stateLine } from "./fixture/ship-loop";

// The channels, caps, registry and posture (U8: R11, R12, R16, AE6). Two passes:
//   AB_DEMO=1 AB_TRUST_PROXY=1 EVE_CHAT_PASSWORD=<code>   the demo's cells: the token cap, busy per
//        cookie and per address, a 429 and the day's 402, memory scoped per session, and a session
//        refused to any cookie but the one that started it (ruling 52)
//   AB_DEMO unset                                          a deployer's cells: posture from the caller,
//        and Slack when SLACK_SIGNING_SECRET and SLACK_BOT_TOKEN are set (any test values)
// Each cell skips itself on the other pass. eve eval runs from the app root, so the registry the
// hook writes is the file under .workflow-data/ that this process reads.
const DEMO = process.env.AB_DEMO === "1";
const REGISTRY = join(process.cwd(), ".workflow-data", "agent-blueprint", "registry.json");
const REPO = "https://github.com/Ninety2UA/agent-blueprint";
const GIT_ENV = "GIT_AUTHOR_NAME=eval GIT_AUTHOR_EMAIL=eval@example.com GIT_COMMITTER_NAME=eval GIT_COMMITTER_EMAIL=eval@example.com";
// The bare remote the cap hook pushes to under AB_EVAL_MOCK=1, named from the clone's origin and
// seeded with the clone's HEAD, so only the run's own commits are outgoing.
const BARE_REMOTE =
  "bash: R=$(git remote get-url origin | sed -E 's#^https://github.com/##; s#\\.git$##; s#/#--#'); git init -q --bare /tmp/ab-eval-remote/$R.git && git -C /tmp/ab-eval-remote/$R.git fetch -q \"$PWD\" HEAD:refs/heads/main && echo bare-ready";

/** The registry once a session has ended in it: the hook may still be writing when the turn settles. */
async function endedEntry(cookieId: string, pushed = false, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const entry = Object.values(registry().sessions).find((candidate) => candidate.cookieId === cookieId);
    if ((entry?.status === "ended" && entry.outcome && (!pushed || entry.pushedSha)) || Date.now() > deadline) return entry;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

/** The entry once a stop's push has landed, for a session that had pushed before its stop. */
async function pushLanded(cookieId: string, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const entry = Object.values(registry().sessions).find((candidate) => candidate.cookieId === cookieId);
    if ((entry?.status === "ended" && entry.owesPush === false) || Date.now() > deadline) return entry;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

function registry(): RegistryDocument {
  try {
    return (JSON.parse(readFileSync(REGISTRY, "utf8")) as { document: RegistryDocument }).document;
  } catch {
    return { schema: 1, day: "", restingSince: null, sessions: {} };
  }
}

let visitors = 0;
/** A visitor: a fresh signed-in cookie and, unless given, an address of its own. */
function visitor(address = `198.51.100.${(visitors += 1)}`) {
  const { value, session } = issueCookie(configuredSecret());
  return { cookieId: session.cookieId, headers: { cookie: `${COOKIE_NAME}=${value}`, "x-forwarded-for": address } };
}

const demoCell = (description: string, test: Parameters<typeof defineEval>[0]["test"]) =>
  defineEval({
    description,
    tags: ["mock"],
    async test(t) {
      if (process.env.AB_EVAL_MOCK !== "1") throw new Error("mock-tagged evals need AB_EVAL_MOCK=1");
      if (!DEMO) return t.skip("runs with AB_DEMO=1");
      if (!configuredSecret()) throw new Error("the demo cells need EVE_CHAT_PASSWORD");
      return test(t);
    },
  });

const deployerCell = (description: string, test: Parameters<typeof defineEval>[0]["test"]) =>
  defineEval({
    description,
    tags: ["mock"],
    async test(t) {
      if (process.env.AB_EVAL_MOCK !== "1") throw new Error("mock-tagged evals need AB_EVAL_MOCK=1");
      if (DEMO) return t.skip("runs without AB_DEMO");
      return test(t);
    },
  });

// One demo case runs every registry cell in order, because the cells share the one registry file
// and the day's 402 mark would rest every cell after it.
const demo = demoCell("The demo's caps: token cap, busy per cookie and address, 429 blocked, the day's 402, memory per session, a session answers only its own cookie.", async (t) => {
  rmSync(REGISTRY, { force: true });

  // AE6: a session at its token cap has its next model call cancelled, the branch pushed and the
  // stage named, with no continue option.
  const capped = visitor();
  const capSession = await t.session({ headers: capped.headers });
  const capTurn = await capSession.send(
    [`clone: ${REPO}`, BARE_REMOTE, `bash: ${GIT_ENV} git commit -q --allow-empty -m 'feat(demo): first step' && echo committed`, "spend: 40000001 echo after-the-cap", "bash: echo never-runs"].join("\n"),
    { headers: capped.headers },
  );
  capTurn.event("turn.settled", { count: 1, data: { outcome: "cancelled" } });
  capTurn.event("interaction.opened", { count: 0 });
  t.check(capTurn.toolCalls.some((call) => JSON.stringify(call).includes("echo never-runs")), equals(false));
  const capEntry = await endedEntry(capped.cookieId, true);
  t.check(capEntry?.outcome, equals("token-cap"));
  t.check(capEntry?.status, equals("ended"));
  t.check(capEntry?.branch ?? "", includes(/^ab\/.+/));
  t.check(capEntry?.stage, equals(null));
  t.check(capEntry?.pushedSha ?? "", includes(/^[0-9a-f]{40}$/));
  t.check((capEntry?.tokens ?? 0) >= 40_000_001, equals(true));
  // The next message on that session never reaches the model.
  const after = await capSession.send("bash: echo still-capped", { headers: capped.headers });
  after.event("turn.settled", { count: 1, data: { outcome: "cancelled" } });
  after.event("model.requested", { count: 0 });

  // A second session under the same cookie is refused while the first is running; a third from
  // one address is refused while two are running.
  const holder = visitor("203.0.113.50");
  const first = await t.session({ headers: holder.headers });
  (await first.send("bash: echo first-running", { headers: holder.headers })).expectOk();
  const second = await (await t.session({ headers: holder.headers })).send("bash: echo second", { headers: holder.headers });
  second.event("turn.settled", { count: 1, data: { outcome: "cancelled" } });
  second.event("model.requested", { count: 0 });
  const neighbour = visitor("203.0.113.50");
  (await (await t.session({ headers: neighbour.headers })).send("bash: echo neighbour-running", { headers: neighbour.headers })).expectOk();
  const third = visitor("203.0.113.50");
  const refused = await (await t.session({ headers: third.headers })).send("bash: echo third", { headers: third.headers });
  refused.event("turn.settled", { count: 1, data: { outcome: "cancelled" } });
  refused.event("model.requested", { count: 0 });
  const running = Object.values(registry().sessions).filter((entry) => entry.address === "203.0.113.50" && entry.status === "running");
  t.check(running.length, equals(2));

  // A helper is part of its visitor's run, not a second visitor: it runs, the registry counts one
  // session, and that visitor's second chat is still refused.
  const lead = visitor();
  const leadSession = await t.session({ headers: lead.headers });
  const helped = await leadSession.send("helper: reviewer bash: echo reviewed-by-helper", { headers: lead.headers });
  helped.expectOk();
  helped.calledTool("helper", { input: { role: "reviewer" }, output: { status: "completed" } });
  t.check(helped.reply ?? "", includes("reviewed-by-helper")).label("a visitor's helper runs");
  t.check(Object.values(registry().sessions).filter((entry) => entry.cookieId === lead.cookieId).length, equals(1)).label("a helper is not counted as a session");
  const secondTab = await (await t.session({ headers: lead.headers })).send("bash: echo second-tab", { headers: lead.headers });
  secondTab.event("turn.settled", { count: 1, data: { outcome: "cancelled" } });
  secondTab.event("model.requested", { count: 0 });

  // A visitor's whole ship loop: every helper runs under the cookie, each stage is pushed, and the
  // run reaches its pull request as one session.
  const looper = visitor();
  const loopTurn = await (await t.session({ headers: looper.headers })).send(
    [
      FEATURE,
      setupFor("visitor-loop"),
      "ship:",
      `brief: ${stateLine({ status: "running", stage: "execute" })}`,
      "publish: stage plan",
      "ship:",
      `brief: ${COMMIT_LINE};;${BODY_LINE};;${stateLine({ status: "done", stage: "ship" })}`,
      "publish: stage Execute",
      "ship:",
      "publish: pull-request",
      "helper: reviewer bash: echo after-the-pull-request",
      "bash: echo never-runs",
    ].join("\n"),
    { headers: looper.headers },
  );
  // A helper started after the run ended is refused as its root's session, and the root stops with it.
  loopTurn.event("turn.settled", { count: 1, data: { outcome: "cancelled" } });
  t.check(loopTurn.toolCalls.some((call) => JSON.stringify(call).includes("echo never-runs")), equals(false)).label("the root stops after a helper refused as ended");
  t.check(outputs(loopTurn, "helper").map((helper) => helper.status), equals(["completed", "completed", "cancelled"])).label("every helper of the loop ran, and the late one was refused");
  loopTurn.calledTool("publish_branch", { input: { mode: "stage", stage: "plan" }, output: { status: "pushed" } });
  loopTurn.calledTool("publish_branch", { input: { mode: "stage", stage: "Execute" }, output: { status: "pushed" } });
  loopTurn.calledTool("ship_pipeline", { output: { outcome: "done" } });
  loopTurn.calledTool("publish_branch", { input: { mode: "pull-request" }, output: { status: "done" } });
  const loopEntry = await endedEntry(looper.cookieId);
  t.check(loopEntry?.outcome, equals("done"));
  t.check(loopEntry?.branch ?? "", includes(/^ab\/add-a-greeting-script/));
  t.check(loopEntry?.pushedSha ?? "", includes(outputs(loopTurn, "publish_branch").at(-1)?.sha as string)).label("nothing was pushed after the pull request");
  t.check(Object.values(registry().sessions).filter((entry) => entry.cookieId === looper.cookieId).length, equals(1)).label("one session for the whole run");

  // A helper's use counts toward its visitor's token cap once the helper finishes: the run ends
  // there, the root runs nothing further, and the branch is pushed.
  const heavy = visitor();
  const heavySession = await t.session({ headers: heavy.headers });
  const heavyTurn = await heavySession.send(
    [`clone: ${REPO}`, BARE_REMOTE, `bash: ${GIT_ENV} git commit -q --allow-empty -m 'feat(demo): before the helper' && echo committed`, "helper: reviewer spend: 40000001 echo after-the-cap", "bash: echo never-runs"].join("\n"),
    { headers: heavy.headers },
  );
  heavyTurn.event("turn.settled", { count: 1, data: { outcome: "cancelled" } });
  t.check(heavyTurn.toolCalls.some((call) => JSON.stringify(call).includes("echo never-runs")), equals(false)).label("the root runs nothing after a capped helper");
  const heavyEntry = await endedEntry(heavy.cookieId, true);
  t.check(heavyEntry?.outcome, equals("token-cap"));
  t.check((heavyEntry?.tokens ?? 0) >= 40_000_001, equals(true)).label("the helper's use is on its visitor's session");
  t.check(heavyEntry?.pushedSha ?? "", includes(/^[0-9a-f]{40}$/));
  const afterHeavy = await heavySession.send("bash: echo still-capped", { headers: heavy.headers });
  afterHeavy.event("turn.settled", { count: 1, data: { outcome: "cancelled" } });
  afterHeavy.event("model.requested", { count: 0 });

  // A 429 on a helper's model call ends its visitor's run blocked too: the root makes no further
  // call, and the root session, which holds the run's record, pushes as it settles.
  const refusedHelper = visitor();
  const refusedSession = await t.session({ headers: refusedHelper.headers });
  const refusedTurn = await refusedSession.send(
    [FEATURE, setupFor("refused-helper"), COMMIT_LINE, "helper: reviewer fail: 429", "bash: echo never-runs"].join("\n"),
    { headers: refusedHelper.headers },
  );
  refusedTurn.event("turn.settled", { count: 1, data: { outcome: "cancelled" } });
  t.check(refusedTurn.toolCalls.some((call) => JSON.stringify(call).includes("echo never-runs")), equals(false)).label("the root stops when its helper is refused");
  const refusedEntry = await endedEntry(refusedHelper.cookieId, true);
  t.check(refusedEntry?.outcome, equals("blocked"));
  t.check(refusedEntry?.branch ?? "", includes(/^ab\/.+/));
  t.check(refusedEntry?.pushedSha ?? "", includes(/^[0-9a-f]{40}$/));
  const refusedAfter = await refusedSession.send("bash: echo still-blocked", { headers: refusedHelper.headers });
  refusedAfter.event("model.requested", { count: 0 });

  // The same stop after a stage push: the commits made since it still reach the branch.
  const staged = visitor();
  const stagedTurn = await (await t.session({ headers: staged.headers })).send(
    [
      FEATURE,
      setupFor("stage-then-429"),
      "ship:",
      `brief: ${stateLine({ status: "running", stage: "execute" })}`,
      "publish: stage plan",
      COMMIT_LINE,
      "helper: reviewer fail: 429",
    ].join("\n"),
    { headers: staged.headers },
  );
  const stagePush = outputs(stagedTurn, "publish_branch")[0]?.sha as string;
  t.check(stagePush ?? "", includes(/^[0-9a-f]{40}$/));
  const stagedEntry = await pushLanded(staged.cookieId);
  t.check(stagedEntry?.outcome, equals("blocked"));
  t.check(stagedEntry?.owesPush, equals(false)).label("the stop's push landed");
  t.check(stagedEntry?.pushedSha === stagePush, equals(false)).label("the stop pushes past the stage push");

  // A mocked 429 on a model call ends the run blocked with the branch pushed.
  const limited = visitor();
  const limitedTurn = await (await t.session({ headers: limited.headers })).send(
    [`clone: ${REPO}`, BARE_REMOTE, `bash: ${GIT_ENV} git commit -q --allow-empty -m 'feat(demo): before the limit' && echo committed`, "fail: 429"].join("\n"),
    { headers: limited.headers },
  );
  // The provider's refusal fails the turn at once; the hook's push and its registry write follow.
  limitedTurn.event("turn.settled", { count: 1 });
  const limitedEntry = await endedEntry(limited.cookieId, true);
  t.check(limitedEntry?.outcome, equals("blocked"));
  t.check(limitedEntry?.pushedSha ?? "", includes(/^[0-9a-f]{40}$/));

  // A fresh session recalls nothing of another session's run; its own next turn does.
  const owner = visitor();
  const ownerSession = await t.session({ headers: owner.headers });
  (await ownerSession.send("remember: Last run opened https://github.com/dbenger/ab-demo-sample/pull/7", { headers: owner.headers })).expectOk();
  const ownRecall = await ownerSession.send("recall:", { headers: owner.headers });
  t.check(ownRecall.reply, includes("pull/7"));
  const stranger = visitor();
  const strangerRecall = await (await t.session({ headers: stranger.headers })).send("recall:", { headers: stranger.headers });
  t.check((strangerRecall.reply ?? "").includes("pull/7"), equals(false));
  // Ruling 52: the stranger holding the owner's session id is refused at the route with 403, so
  // the owner's session neither takes the message nor recalls its note for them.
  const taken = await ownerSession.send("recall:", { headers: stranger.headers }).then(
    () => null,
    (error: { status?: number; code?: string }) => error,
  );
  t.check(taken?.status, equals(403));
  t.check(taken?.code, equals("not-owner"));
  const ownerAgain = await ownerSession.send("recall:", { headers: owner.headers });
  t.check(ownerAgain.reply, includes("pull/7"));

  // After the day's 402 is recorded, a new session gets the resting state before any model call.
  const spender = visitor();
  await (await t.session({ headers: spender.headers })).send("fail: 402", { headers: spender.headers });
  t.check((await endedEntry(spender.cookieId))?.outcome, equals("resting"));
  t.check(registry().restingSince ?? "", includes(/^\d{4}-\d\d-\d\dT/));
  const late = visitor();
  const resting = await (await t.session({ headers: late.headers })).send("bash: echo too-late", { headers: late.headers });
  resting.event("turn.settled", { count: 1, data: { outcome: "cancelled" } });
  resting.event("model.requested", { count: 0 });

  rmSync(REGISTRY, { force: true });
});

// An HTTP-triggered run with a service bearer is unattended: publish_branch asks no approval and
// the turn never parks. The same call from a person (local dev here), on a run ready for a pull
// request, waits on the approval.
const posture = deployerCell("Posture from the caller: a service bearer runs unattended and never parks; a person is asked.", async (t) => {
  const trigger = { authorization: "Bearer eval-trigger" };
  const unattended = await (await t.session({ headers: trigger })).send("publish: pull-request", { headers: trigger });
  unattended.event("interaction.opened", { count: 0 });
  unattended.event("turn.paused", { count: 0 });
  unattended.event("turn.settled", { count: 1, data: { outcome: "completed" } });
  // The call itself fails here (no clone to publish); what matters is that it ran without asking.
  t.check(unattended.toolCalls.some((call) => JSON.stringify(call).includes('"mode":"pull-request"')), equals(true));

  const person = await t.session();
  const interactive = await person.send([...readyFor("posture-gate"), "publish: pull-request"].join("\n"));
  interactive.event("interaction.opened", { count: 1 });
  person.requireInteraction({ toolName: "publish_branch" });
});

// A deployer's copy has no registry: a helper's 429 reaches the root through the helper's result.
// The turn ends there, the branch is pushed from the root's record, and it is the only branch.
const helperLimit = deployerCell("A helper's 429 on a deployer's copy ends the run blocked with the root's branch pushed.", async (t) => {
  const session = await t.session();
  const turn = await session.send([FEATURE, setupFor("deployer-429"), COMMIT_LINE, "helper: reviewer fail: 429", "bash: echo never-runs"].join("\n"));
  turn.event("turn.settled", { count: 1, data: { outcome: "cancelled" } });
  t.check(turn.toolCalls.some((call) => JSON.stringify(call).includes("echo never-runs")), equals(false)).label("the root stops when its helper is refused");
  // The push follows the settled turn, so the count waits for it.
  const count = `git -C ${remoteFor("deployer-429")} for-each-ref refs/heads/ab | wc -l | tr -d ' '`;
  const branches = await session.send(`bash: for i in $(seq 40); do [ "$(${count})" != 0 ] && break; sleep 0.5; done; echo branches=$(${count})`);
  t.check(branches.reply ?? "", includes("branches=1")).label("the root's branch is pushed, and no helper's");
  // state.json never heard of this stop, but the record did: the next request starts a new run.
  const next = await session.send("ship: new");
  next.calledTool("ship_pipeline", { output: { outcome: "iterate", iteration: 1, restarted: true } });
});

// Slack: a signed app_mention reaches the root agent, and its checkpoint renders as a Slack card
// with the options as Slack controls. The channel's Web API points at this stub under AB_EVAL_MOCK=1.
const SLACK_STUB_PORT = 47821;
const slack = deployerCell("A Slack mention starts a run on the root agent and a checkpoint renders as a Slack card.", async (t) => {
  const signingKey = process.env.SLACK_SIGNING_SECRET;
  if (!signingKey || !process.env.SLACK_BOT_TOKEN) return t.skip("needs SLACK_SIGNING_SECRET and SLACK_BOT_TOKEN, any test values");
  const calls: { method: string; body: string }[] = [];
  const read = (request: IncomingMessage) =>
    new Promise<string>((resolve) => {
      let body = "";
      request.on("data", (chunk) => (body += chunk));
      request.on("end", () => resolve(body));
    });
  const server = createServer(async (request, response) => {
    const method = (request.url ?? "").replace(/^\/api\//, "").split("?")[0];
    calls.push({ method, body: decodeURIComponent((await read(request)).replaceAll("+", " ")) });
    const ts = `${Date.now() / 1000}`;
    const answers: Record<string, unknown> = {
      "auth.test": { ok: true, user_id: "U0BOT", bot_id: "B0BOT", team_id: "T0TEAM", user: "agent-blueprint" },
      "chat.postMessage": { ok: true, ts, channel: "C0CHAN", message: { ts } },
      "conversations.replies": { ok: true, messages: [], has_more: false },
      "users.info": { ok: true, user: { id: "U0USER", name: "visitor", profile: { display_name: "visitor" } } },
    };
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify(answers[method] ?? { ok: true, ts }));
  });
  await new Promise<void>((resolve) => server.listen(SLACK_STUB_PORT, "127.0.0.1", resolve));
  try {
    const ts = `${Math.floor(Date.now() / 1000)}.000100`;
    const event = {
      type: "event_callback",
      team_id: "T0TEAM",
      api_app_id: "A0APP",
      event_id: `Ev${Date.now()}`,
      event_time: Math.floor(Date.now() / 1000),
      authorizations: [{ team_id: "T0TEAM", user_id: "U0BOT", is_bot: true }],
      event: {
        type: "app_mention",
        user: "U0USER",
        channel: "C0CHAN",
        ts,
        event_ts: ts,
        text: "<@U0BOT>\nask: Plan first or build now? | Plan first | Build now",
      },
    };
    const body = JSON.stringify(event);
    const stamp = `${Math.floor(Date.now() / 1000)}`;
    const signature = `v0=${createHmac("sha256", signingKey).update(`v0:${stamp}:${body}`).digest("hex")}`;
    const accepted = await t.target.fetch("/eve/v1/slack", {
      method: "POST",
      headers: { "content-type": "application/json", "x-slack-request-timestamp": stamp, "x-slack-signature": signature },
      body,
    });
    t.check(accepted.status, equals(200));
    const unsigned = await t.target.fetch("/eve/v1/slack", { method: "POST", headers: { "content-type": "application/json" }, body });
    t.check(unsigned.status >= 400, equals(true));
    const deadline = Date.now() + 60_000;
    let card: { method: string; body: string } | undefined;
    while (Date.now() < deadline && !card) {
      card = calls.find((call) => call.method.startsWith("chat.") && call.body.includes("Plan first or build now?") && call.body.includes("Build now"));
      if (!card) await new Promise((resolve) => setTimeout(resolve, 500));
    }
    t.log(`slack calls: ${calls.map((call) => call.method).join(", ")}`);
    t.check(Boolean(card), equals(true));
    // The options render as Slack controls in an actions block, one per option.
    t.check(card?.body ?? "", includes('"type":"actions"'));
    t.check(card?.body ?? "", includes("Plan first"));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

export default [demo, posture, helperLimit, slack];
