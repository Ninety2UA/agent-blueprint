import { createHmac } from "node:crypto";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { defineEval, type EveEvalContext } from "eve/evals";
import { equals, includes } from "eve/evals/expect";
import { LINEAR_STOPPED, MAINTENANCE_MESSAGE } from "../agent/lib/channel-gate";
import { LINEAR_SCOPE, LINEAR_STUB_PORT } from "../agent/lib/linear-token";
import { COMMIT_LINE, FEATURE, readyFor, remoteFor, SETUP, setupFor } from "./fixture/ship-loop";

/** The branch a run-end notice names, from "on the branch <name>." (KTD12). */
const BRANCH_IN_NOTICE = /on the branch (ab\/[a-z0-9-]+)\./;

// The Linear channel (U4: R1, R5, R6, R7, R8, R10, KTD2, KTD5, KTD6, KTD13, AE7). Under AB_EVAL_MOCK=1
// the token endpoint and the GraphQL endpoint point at this stub, and every webhook goes through
// t.target.fetch signed with LINEAR_WEBHOOK_SECRET, as Linear would send it. Each configuration is
// its own pass, because the server reads its environment when it starts; each cell skips itself on
// the passes it does not belong to:
//   main pass            LINEAR_CLIENT_ID, LINEAR_CLIENT_SECRET and LINEAR_WEBHOOK_SECRET set, any
//                        test values: the walk, the Stop proof, uploads, the run-end notices (U6:
//                        R9, KTD12, AE6), the repeated deliveries (ruling 53) and the install
//                        callback at /eve/v1/linear/install (ruling 74)
//   maintenance pass     the same with AB_MAINTENANCE=1
//   unconfigured pass    LINEAR_WEBHOOK_SECRET set and LINEAR_CLIENT_SECRET unset
// The main pass is one case, because its cells share the stub's port and one Linear session.
const ROUTE = "/eve/v1/linear";
const INSTALL_ROUTE = "/eve/v1/linear/install";
const SECRET = process.env.LINEAR_WEBHOOK_SECRET?.trim() ?? "";
const CONFIGURED = Boolean(process.env.LINEAR_CLIENT_ID?.trim() && process.env.LINEAR_CLIENT_SECRET?.trim() && SECRET);
const MAINTENANCE = Boolean(process.env.AB_MAINTENANCE?.trim());

interface Call {
  readonly path: string;
  readonly queryName: string;
  readonly input: Record<string, unknown>;
  readonly authorization: string;
  readonly form: Record<string, string>;
}
interface StreamEvent {
  readonly type: string;
  readonly data?: Record<string, unknown>;
}

const read = (request: IncomingMessage) =>
  new Promise<string>((resolve) => {
    let body = "";
    request.on("data", (chunk) => (body += chunk));
    request.on("end", () => resolve(body));
  });
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The Linear stub on 47822: token mints and GraphQL calls, each recorded. */
async function linearStub(calls: Call[]): Promise<Server> {
  let tokens = 0;
  let activities = 0;
  const server = createServer(async (request, response) => {
    const path = (request.url ?? "").split("?")[0];
    const raw = await read(request);
    response.setHeader("content-type", "application/json");
    if (path === "/oauth/token") {
      tokens += 1;
      calls.push({ path, queryName: "", input: {}, authorization: "", form: Object.fromEntries(new URLSearchParams(raw)) });
      response.end(JSON.stringify({ access_token: `eval-linear-token-${tokens}`, token_type: "Bearer", expires_in: 2_591_999, scope: LINEAR_SCOPE }));
      return;
    }
    const body = (raw ? JSON.parse(raw) : {}) as { query?: string; variables?: { input?: Record<string, unknown> } };
    const queryName = /(?:mutation|query)\s+(\w+)/.exec(body.query ?? "")?.[1] ?? "";
    calls.push({ path, queryName, input: body.variables?.input ?? {}, authorization: String(request.headers.authorization ?? ""), form: {} });
    const answers: Record<string, unknown> = {
      AgentActivityCreate: { agentActivityCreate: { success: true, agentActivity: { id: `activity-${(activities += 1)}` } } },
      AgentSessionUpdate: { agentSessionUpdate: { success: true } },
      AgentSessionActivities: { agentSession: { activities: { nodes: [] } } },
    };
    response.end(JSON.stringify({ data: answers[queryName] ?? {} }));
  });
  await new Promise<void>((resolve) => server.listen(LINEAR_STUB_PORT, "127.0.0.1", resolve));
  return server;
}

let delivery = 0;
/** An AgentSessionEvent as Linear sends it (the top-level keys the A1 premise check recorded, plus webhookTimestamp). */
function sessionEvent(session: string, options: { action?: string; prompt?: string; body?: string; signal?: string; ageMs?: number } = {}) {
  const action = options.action ?? "created";
  return {
    type: "AgentSessionEvent",
    action,
    createdAt: new Date().toISOString(),
    organizationId: "org-eval",
    oauthClientId: "client-eval",
    appUserId: "app-user-eval",
    webhookId: "webhook-eval",
    webhookTimestamp: Date.now() - (options.ageMs ?? 0),
    guidance: null,
    previousComments: [],
    promptContext: options.prompt ?? "",
    agentSession: {
      id: session,
      status: "active",
      issue: { id: `issue-${session}`, identifier: "AB-5", title: "Add a greeting script", url: "https://linear.app/eval/issue/AB-5" },
      creator: { id: "user-eval", name: "Eval Person" },
      creatorId: "user-eval",
    },
    agentActivity:
      action === "prompted"
        ? { id: `prompt-${(delivery += 1)}`, content: { type: "prompt", body: options.body ?? "" }, signal: options.signal ?? null, userId: "user-eval" }
        : null,
  };
}

const sign = (body: string) => createHmac("sha256", SECRET).update(body).digest("hex");

function poster(t: EveEvalContext) {
  return (event: object, options: { signed?: boolean; raw?: string } = {}) => {
    const body = options.raw ?? JSON.stringify(event);
    return t.target.fetch(ROUTE, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "linear-event": "AgentSessionEvent",
        "linear-delivery": `delivery-${(delivery += 1)}`,
        ...(options.signed === false ? {} : { "linear-signature": sign(body) }),
      },
      body,
    });
  };
}

const activitiesOf = (calls: Call[], session: string) =>
  calls.filter((call) => call.queryName === "AgentActivityCreate" && call.input.agentSessionId === session);
const contentOf = (call: Call | undefined) => (call?.input.content ?? {}) as { type?: string; body?: string };

async function waitFor<T>(t: EveEvalContext, what: string, find: () => T | undefined, timeoutMs = 60_000): Promise<T | undefined> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const found = find();
    if (found !== undefined || Date.now() > deadline) {
      if (found === undefined) t.log(`no ${what}`);
      return found;
    }
    await pause(250);
  }
}

/** Reads the attached session from its cursor until a turn settles cancelled, or gives up. */
async function untilCancelled(session: ReturnType<EveEvalContext["target"]["attach"]>, timeoutMs = 90_000): Promise<readonly StreamEvent[] | null> {
  const turn = session.nextTurn({ until: (event) => event.type === "turn.settled" && (event as unknown as StreamEvent).data?.outcome === "cancelled" });
  const timeout = pause(timeoutMs).then(() => null);
  const settled = await Promise.race([turn.then((result) => result.events as unknown as readonly StreamEvent[]), timeout]);
  return settled;
}

const main = defineEval({
  description: "Linear: a signed delegation runs the agent with Agent Activities, a Stop cancels a working or parked turn, uploads never get the token, the install callback completes an install.",
  tags: ["mock"],
  async test(t) {
    if (process.env.AB_EVAL_MOCK !== "1") throw new Error("mock-tagged evals need AB_EVAL_MOCK=1");
    if (process.env.AB_DEMO === "1") return t.skip("runs without AB_DEMO");
    if (MAINTENANCE) return t.skip("runs without AB_MAINTENANCE");
    if (!CONFIGURED) return t.skip("needs LINEAR_CLIENT_ID, LINEAR_CLIENT_SECRET and LINEAR_WEBHOOK_SECRET, any test values");

    const calls: Call[] = [];
    const server = await linearStub(calls);
    const post = poster(t);
    const session = `eval-session-${Date.now()}`;
    try {
      // R5: an unsigned body and a signed body two minutes old both get 401 and reach nothing.
      const unsigned = await post(sessionEvent(session, { prompt: "bash: echo never-runs" }), { signed: false });
      t.check(unsigned.status, equals(401)).label("an unsigned body gets 401");
      const stale = await post(sessionEvent(session, { prompt: "bash: echo never-runs", ageMs: 120_000 }));
      t.check(stale.status, equals(401)).label("a body whose webhookTimestamp is two minutes old gets 401");
      await pause(2_000);
      t.check(calls.length, equals(0)).label("a refused webhook reaches no Linear call");

      // R1, R8: a signed delegation reaches the root agent; the stub sees one mint with the fixed
      // scope, a "working" thought and the question as an elicitation with its options.
      const script = [FEATURE, SETUP, "ask: Plan first or build now? | Plan first | Build now", "ship:", "publish: stage plan", "bash: git log -1 --format=%B"].join("\n");
      t.check((await post(sessionEvent(session, { prompt: script }))).status, equals(200)).label("a signed delegation is accepted");
      const question = await waitFor(t, "question elicitation", () =>
        activitiesOf(calls, session).find((call) => contentOf(call).type === "elicitation" && String(contentOf(call).body).includes("Plan first or build now?")),
      );
      const mints = calls.filter((call) => call.path === "/oauth/token");
      t.check(mints.length, equals(1)).label("one token mint");
      t.check(mints[0]?.form, equals({ grant_type: "client_credentials", client_id: process.env.LINEAR_CLIENT_ID?.trim(), client_secret: process.env.LINEAR_CLIENT_SECRET?.trim(), scope: LINEAR_SCOPE })).label("the mint uses client credentials and the fixed scope");
      t.check(activitiesOf(calls, session).some((call) => contentOf(call).type === "thought"), equals(true)).label("a working thought");
      const options = ((question?.input.signalMetadata as { options?: { label: string }[] } | undefined)?.options ?? []).map((option) => option.label);
      t.check(options, equals(["Plan first", "Build now"])).label("the elicitation carries both options");
      t.check(question?.authorization ?? "", equals("Bearer eval-linear-token-1")).label("activities use the minted token");

      // A prompted answer resolves the question and the run continues to its reply, which carries
      // ship_pipeline's posture and, through the stage commit's trailer, the Eve session id.
      t.check((await post(sessionEvent(session, { action: "prompted", body: "Build now" }))).status, equals(200));
      const reply = await waitFor(t, "reply after the answer", () =>
        activitiesOf(calls, session).find((call) => contentOf(call).type === "response" && String(contentOf(call).body).includes("Agent-Blueprint-Session")),
      120_000);
      const replyText = String(contentOf(reply).body ?? "");
      t.check(replyText, includes("Build now")).label("the answer reached the run");
      t.check(replyText, includes(/posture\\*"\s*:\s*\\*"interactive/)).label("the run's decisions record posture interactive");
      const eveSession = /Agent-Blueprint-Session: ([A-Za-z0-9_-]+)/.exec(replyText)?.[1];
      t.check(Boolean(eveSession), equals(true)).label("the stage commit names the Eve session");
      if (!eveSession) return;
      const attached = t.target.attach(eveSession);
      await attached.nextTurn(); // the cursor moves past the first turn

      // AE7, working: an unsigned Stop gets 401 and cancels nothing; a signed Stop cancels the turn,
      // posts one final response and dispatches nothing.
      const before = activitiesOf(calls, session).length;
      t.check((await post(sessionEvent(session, { action: "prompted", body: "bash: sleep 20 && echo late-output" }))).status, equals(200));
      await waitFor(t, "the working turn's first activity", () => (activitiesOf(calls, session).length > before ? true : undefined));
      const unsignedStop = await post(sessionEvent(session, { action: "prompted", body: "", signal: "stop" }), { signed: false });
      t.check(unsignedStop.status, equals(401)).label("an unsigned Stop gets 401");
      await pause(1_500);
      t.check(activitiesOf(calls, session).some((call) => contentOf(call).body === LINEAR_STOPPED), equals(false)).label("the unsigned Stop cancels nothing");
      t.check((await post(sessionEvent(session, { action: "prompted", body: "", signal: "stop" }))).status, equals(200)).label("a signed Stop is accepted");
      const workingEvents = await untilCancelled(attached);
      t.check(workingEvents !== null, equals(true)).label("Stop while working: the turn settles cancelled");
      const stopped = await waitFor(t, "stop response", () => activitiesOf(calls, session).find((call) => contentOf(call).body === LINEAR_STOPPED));
      t.check(contentOf(stopped).type, equals("response")).label("Stop while working: one final response");
      await pause(25_000);
      const afterWorking = activitiesOf(calls, session);
      t.check(afterWorking.filter((call) => contentOf(call).body === LINEAR_STOPPED).length, equals(1)).label("Stop while working: exactly one final response");
      t.check(afterWorking.some((call) => String(contentOf(call).body).includes("late-output")), equals(false)).label("Stop while working: the cancelled step never replies");
      const workingThoughts = afterWorking.filter((call) => contentOf(call).body === "Working on this.").length;

      // AE7, parked on the publish approval: the Stop cancels, the approval never resolves, no new
      // work starts.
      t.check((await post(sessionEvent(session, { action: "prompted", body: [...readyFor("linear-approval"), "publish: pull-request"].join("\n") }))).status, equals(200));
      const approval = await waitFor(t, "publish approval", () =>
        activitiesOf(calls, session).find((call, index) => index >= afterWorking.length && contentOf(call).type === "elicitation"),
      );
      t.check(Boolean(approval), equals(true)).label("the publish approval opens as an elicitation");
      t.log(`publish approval: ${String(contentOf(approval).body ?? "").slice(0, 200)}`);
      await pause(1_000);
      const parkedAt = activitiesOf(calls, session).length;
      t.check((await post(sessionEvent(session, { action: "prompted", body: "", signal: "stop" }))).status, equals(200));
      const parkedEvents = await untilCancelled(attached, 60_000);
      t.check(parkedEvents !== null, equals(true)).label("Stop while parked: the turn settles cancelled");
      await pause(8_000);
      const afterParked = activitiesOf(calls, session).slice(parkedAt);
      t.log(`after the parked Stop: ${afterParked.map((call) => `${contentOf(call).type}:${String(contentOf(call).body ?? "").slice(0, 60)}`).join(" | ")}`);
      t.check(afterParked.filter((call) => contentOf(call).body === LINEAR_STOPPED).length, equals(1)).label("Stop while parked: exactly one final response");
      t.check(afterParked.some((call) => contentOf(call).body === "Working on this."), equals(false)).label("Stop while parked: no new work starts");
      const settledInteractions = (parkedEvents ?? []).filter((event) => event.type === "interaction.settled").map((event) => String(event.data?.outcome));
      t.log(`interaction.settled outcomes up to the cancel: ${settledInteractions.join(", ") || "none"}`);
      const published = (parkedEvents ?? []).some((event) => event.type === "call.settled" && JSON.stringify(event.data ?? {}).includes("publish_branch") && JSON.stringify(event.data ?? {}).includes('"completed"'));
      t.check(published, equals(false)).label("Stop while parked: the approval never resolves into a publish");
      t.check(settledInteractions.includes("accepted"), equals(false)).label("Stop while parked: the approval is not accepted");
      t.log(`working thoughts before the parked run: ${workingThoughts}`);

      // KTD13: an upload link reaches the agent as its label, and the token never leaves for it.
      const uploads = `${session}-upload`;
      t.check((await post(sessionEvent(uploads, { prompt: "bash: echo 'label:![screen shot](https://uploads.linear.app/org-eval/shot.png)'" }))).status, equals(200));
      const labelled = await waitFor(t, "upload reply", () => activitiesOf(calls, uploads).find((call) => contentOf(call).type === "response"));
      t.check(String(contentOf(labelled).body ?? ""), includes("label:screen shot")).label("the upload reaches the agent as its label");
      t.check(String(contentOf(labelled).body ?? "").includes("uploads.linear.app"), equals(false)).label("the link itself does not reach the agent");
      t.check(calls.some((call) => call.path.includes("upload")), equals(false)).label("no upload request reaches Linear");

      // R9: the main session's turns completed or were stopped by a person, so none got a run-end notice.
      t.check(activitiesOf(calls, session).filter((call) => contentOf(call).type === "error").map((call) => contentOf(call).body), equals([])).label("completed and stopped turns post no run-end notice");

      // AE6, KTD12: a run that commits and then meets a 429 ends blocked. Once cap-guard's push has
      // finished, the session gets the web chat's Blocked sentence as an error activity, naming the
      // ab/ branch, and that branch is on the bare remote; the next turn completes with no notice.
      const blocked = `${session}-blocked`;
      t.check((await post(sessionEvent(blocked, { prompt: [FEATURE, setupFor("notices-linear"), COMMIT_LINE, "fail: 429"].join("\n") }))).status, equals(200));
      const notice = await waitFor(t, "blocked notice", () => activitiesOf(calls, blocked).find((call) => contentOf(call).type === "error"), 120_000);
      const noticeText = String(contentOf(notice).body ?? "");
      t.log(`blocked notice: ${noticeText}`);
      const branch = BRANCH_IN_NOTICE.exec(noticeText)?.[1] ?? "";
      t.check(noticeText, includes("because a service it needs is busy")).label("AE6: the notice is the web chat's Blocked sentence");
      t.check(branch, includes(/^ab\/[a-z0-9-]+$/)).label("AE6: the notice names the ab/ branch");
      t.check(noticeText, includes(`continue on branch ${branch}`)).label("AE6: the notice says how to continue");
      const noticesBefore = activitiesOf(calls, blocked).filter((call) => contentOf(call).type === "error").length;
      t.check((await post(sessionEvent(blocked, { action: "prompted", body: `bash: git ls-remote --heads ${remoteFor("notices-linear")}` }))).status, equals(200));
      const listed = await waitFor(t, "remote listing", () => activitiesOf(calls, blocked).find((call) => contentOf(call).type === "response" && String(contentOf(call).body).includes("refs/heads/")), 60_000);
      t.check(String(contentOf(listed).body ?? ""), includes(`refs/heads/${branch}`)).label("AE6: the branch is on the bare remote");
      await pause(3_000);
      t.check(activitiesOf(calls, blocked).filter((call) => contentOf(call).type === "error").length, equals(noticesBefore)).label("a turn that completes posts no notice");

      // KTD12: a blocked run whose push is refused (its remote is gone) says no branch was saved.
      const refusedPush = `${session}-refused`;
      const gone = `bash: rm -rf ${remoteFor("notices-refused")} && echo remote-gone`;
      t.check((await post(sessionEvent(refusedPush, { prompt: [FEATURE, setupFor("notices-refused"), COMMIT_LINE, gone, "fail: 429"].join("\n") }))).status, equals(200));
      const refusedNotice = await waitFor(t, "refused-push notice", () => activitiesOf(calls, refusedPush).find((call) => contentOf(call).type === "error"), 120_000);
      const refusedText = String(contentOf(refusedNotice).body ?? "");
      t.log(`refused-push notice: ${refusedText}`);
      t.check(refusedText, includes("No branch was saved.")).label("a refused push: the notice says no branch was saved");
      t.check(refusedText.includes("ab/"), equals(false)).label("a refused push: the notice names no branch");

      // Ruling 53: Linear retries a webhook it got no answer to. The same created event posted twice
      // (each post with its own Linear-Delivery header, as a retry may carry) starts one run and
      // asks its question once, because Eve drops the repeated session-plus-action key; the same
      // prompted answer posted twice answers once and the run replies once.
      const twice = `${session}-twice`;
      const created = JSON.stringify(sessionEvent(twice, { prompt: "ask: Delivered twice? | Once | Twice" }));
      t.check((await post({}, { raw: created })).status, equals(200));
      t.check((await post({}, { raw: created })).status, equals(200)).label("a repeated created event is acknowledged");
      const elicitations = () => activitiesOf(calls, twice).filter((call) => contentOf(call).type === "elicitation");
      await waitFor(t, "repeated-event elicitation", () => elicitations()[0]);
      await pause(8_000);
      t.check(elicitations().length, equals(1)).label("a repeated created event asks its question once");
      t.check(activitiesOf(calls, twice).filter((call) => contentOf(call).body === "Working on this.").length, equals(1)).label("a repeated created event starts one run");
      const responses = () => activitiesOf(calls, twice).filter((call) => contentOf(call).type === "response");
      // Without the key the repeat reaches the parked session and answers the question with its own prompt.
      t.check(responses().length, equals(0)).label("a repeated created event leaves its question open");
      const answer = JSON.stringify(sessionEvent(twice, { action: "prompted", body: "Once" }));
      t.check((await post({}, { raw: answer })).status, equals(200));
      t.check((await post({}, { raw: answer })).status, equals(200)).label("a repeated prompted event is acknowledged");
      await waitFor(t, "reply after the repeated answer", () => responses()[0]);
      await pause(8_000);
      t.check(responses().length, equals(1)).label("a repeated prompted event answers once and the run replies once");
      t.check(String(contentOf(responses()[0]).body ?? ""), includes("Once")).label("the answer reached the run");
      t.log(`repeated events: ${activitiesOf(calls, twice).map((call) => `${contentOf(call).type}:${String(contentOf(call).body ?? "").slice(0, 40)}`).join(" | ")}`);

      // Ruling 74: the agent's own install callback answers the admin's browser without a Linear
      // signature. A cancelled consent exchanges nothing; a code is exchanged at the stub with the
      // agent's own callback as redirect_uri, and the page carries no token.
      const exchanges = () => calls.filter((call) => call.path === "/oauth/token" && call.form.grant_type === "authorization_code");
      const cancelled = await t.target.fetch(`${INSTALL_ROUTE}?error=access_denied&error_description=The+user+denied+access&state=install`);
      t.check(cancelled.status, equals(400)).label("install callback: a cancelled consent gets its page");
      t.check(await cancelled.text(), includes("Nothing was installed, because the consent on Linear was cancelled. To install")).label("install callback: the cancel page names Linear's description");
      t.check(exchanges().length, equals(0)).label("install callback: a cancelled consent exchanges nothing");
      const installed = await t.target.fetch(`${INSTALL_ROUTE}?code=eval-install-code&state=install`);
      t.check(installed.status, equals(200)).label("install callback: an accepted code gets the installed page");
      const installedPage = await installed.text();
      t.check(installedPage, includes("Agent Blueprint is installed in your Linear workspace.")).label("install callback: the installed page");
      t.check(/eval-linear-token-\d/.test(installedPage), equals(false)).label("install callback: the page carries no token");
      const exchange = exchanges()[0]?.form ?? {};
      t.check(exchange.code, equals("eval-install-code")).label("install callback: the code is exchanged");
      t.check(/^https:\/\/[^/]+\/eve\/v1\/linear\/install$/.test(exchange.redirect_uri ?? ""), equals(true)).label("install callback: redirect_uri is the agent's own callback");
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  },
});

// R6, KTD6: during maintenance a delegation posts an error activity with the maintenance message and
// starts nothing, and a Stop still takes the cancel path (no turn can run here, so it answers with
// the final response rather than the maintenance error; the cancel itself is proven on the main pass).
const maintenance = defineEval({
  description: "Linear during maintenance: a delegation gets the maintenance message as an error activity; a Stop still takes the cancel path.",
  tags: ["mock"],
  async test(t) {
    if (process.env.AB_EVAL_MOCK !== "1") throw new Error("mock-tagged evals need AB_EVAL_MOCK=1");
    if (process.env.AB_DEMO === "1") return t.skip("runs without AB_DEMO");
    if (!MAINTENANCE) return t.skip("runs with AB_MAINTENANCE=1");
    if (!CONFIGURED) return t.skip("needs LINEAR_CLIENT_ID, LINEAR_CLIENT_SECRET and LINEAR_WEBHOOK_SECRET, any test values");
    const calls: Call[] = [];
    const server = await linearStub(calls);
    const post = poster(t);
    const session = `eval-maintenance-${Date.now()}`;
    try {
      t.check((await post(sessionEvent(session, { prompt: "bash: echo never-runs" }))).status, equals(200));
      const refused = await waitFor(t, "maintenance activity", () => activitiesOf(calls, session).find((call) => contentOf(call).type === "error"));
      t.check(contentOf(refused).body, equals(MAINTENANCE_MESSAGE)).label("the maintenance message as an error activity");
      t.check((await post(sessionEvent(session, { action: "prompted", body: "", signal: "stop" }))).status, equals(200));
      const stopped = await waitFor(t, "stop response", () => activitiesOf(calls, session).find((call) => contentOf(call).body === LINEAR_STOPPED));
      t.check(contentOf(stopped).type, equals("response")).label("a Stop during maintenance takes the cancel path");
      await pause(3_000);
      t.check(activitiesOf(calls, session).some((call) => contentOf(call).type === "thought"), equals(false)).label("nothing starts");
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  },
});

// R5, KTD2: with LINEAR_CLIENT_SECRET unset a signed event starts nothing (the server logs the name).
const unconfigured = defineEval({
  description: "Linear with LINEAR_CLIENT_SECRET unset: a signed event starts nothing.",
  tags: ["mock"],
  async test(t) {
    if (process.env.AB_EVAL_MOCK !== "1") throw new Error("mock-tagged evals need AB_EVAL_MOCK=1");
    if (process.env.AB_DEMO === "1") return t.skip("runs without AB_DEMO");
    if (!SECRET || process.env.LINEAR_CLIENT_SECRET?.trim()) return t.skip("runs with LINEAR_WEBHOOK_SECRET set and LINEAR_CLIENT_SECRET unset");
    const calls: Call[] = [];
    const server = await linearStub(calls);
    try {
      const accepted = await poster(t)(sessionEvent(`eval-unconfigured-${Date.now()}`, { prompt: "bash: echo never-runs" }));
      t.check(accepted.status, equals(200)).label("the signed event is acknowledged");
      await pause(5_000);
      t.check(calls.length, equals(0)).label("no mint, no activity, no run");
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  },
});

export default [main, maintenance, unconfigured];
