import { createHmac } from "node:crypto";
import { readFileSync, rmSync } from "node:fs";
import { createServer, type IncomingMessage } from "node:http";
import { join } from "node:path";
import { defineEval } from "eve/evals";
import { equals, includes } from "eve/evals/expect";
import { configuredSecret, COOKIE_NAME, issueCookie } from "../apps/web/lib/gate/code";
import type { RegistryDocument } from "../agent/lib/registry";
import { readyFor } from "./fixture/ship-loop";

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

export default [demo, posture, slack];
