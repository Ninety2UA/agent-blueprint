import { defineEval } from "eve/evals";
import { equals, includes } from "eve/evals/expect";
import { COOKIE_NAME } from "../apps/web/lib/gate/code";
import { answerCheckpoints, skipLive } from "./fixture/smoke-cell";

// Live checks against the demo's production deployment (U11: R15, R16, R17, AE5, F4). They run
// only with --url, never on the scripted mock, and the run cells spend real tokens and sandbox
// time, so each run needs Dominik's approval. The gate is checked with plain requests that carry
// no Vercel credential, as a logged-out browser sends them. The shared code comes from
// AB_DEMO_CODE in the caller's shell and is never written anywhere. RUNBOOK.md, "Demo instance",
// holds the result rows.
const CODE = process.env.AB_DEMO_CODE?.trim() ?? "";
const REQUEST = process.env.AB_DEMO_REQUEST?.trim() ?? "";
const REPOSITORY = process.env.AB_DEMO_REPOSITORY?.trim() || "Ninety2UA/agent-blueprint-sample";
const COMMAND = "AB_DEMO_CODE=<the code> AB_DEMO_REQUEST=<a suggested request> npx eve@0.86.0 eval demo-live --url https://try.agent-blueprint.dbenger.com";
const PULL_URL = /https:\/\/github\.com\/([^/\s]+\/[^/\s]+)\/pull\/(\d+)/;

type Check = { skip(reason: string): void; target: { kind: "local" | "remote"; url: string } };

/** A request as a logged-out browser on another machine sends it: no Vercel credential, no redirect. */
function outside(t: Check, path: string, init: RequestInit = {}) {
  return fetch(new URL(path, t.target.url), { ...init, redirect: "manual" });
}

/** Posts the code as the gate page does and returns the session cookie, or null when refused. */
async function login(t: Check, code: string) {
  const origin = new URL(t.target.url).origin;
  const response = await outside(t, "/api/password-auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ code }),
  });
  const cookies = response.headers.getSetCookie();
  const session = cookies.find((cookie) => cookie.startsWith(`${COOKIE_NAME}=`)) ?? null;
  return { response, session, cookie: session ? session.split(";")[0] : null };
}

function needsCode(t: Check): boolean {
  if (skipLive(t, "remote", COMMAND)) return true;
  if (!CODE) {
    t.skip(`AB_DEMO_CODE holds the demo's shared code: ${COMMAND}`);
    return true;
  }
  return false;
}

const gate = defineEval({
  description: "The demo's gate from outside: health, the denied paths, the code, the cookie, logout (AE5).",
  tags: ["live"],
  async test(t) {
    if (needsCode(t)) return;
    const health = await outside(t, "/eve/v1/health");
    t.check(health.status, equals(200)).label("health answers 200");

    const page = await outside(t, "/", { headers: { accept: "text/html" } });
    const html = await page.text();
    t.check(page.status, equals(401)).label("the chat without a cookie is the 401 gate page");
    t.check(html, includes('data-gate-state="no-cookie"'));
    t.check(html, includes("data-gate-contact"));
    const agent = await outside(t, "/eve/v1/session", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    t.check(agent.status, equals(401)).label("no agent route answers without a cookie");
    // The channel routes (channels plan U7): without a Slack signature, a Linear signature, the
    // Telegram secret header or an MCP bearer, each refuses with 401.
    for (const route of ["/eve/v1/slack", "/eve/v1/linear", "/eve/v1/telegram", "/eve/v1/mcp"]) {
      const channel = await outside(t, route, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      t.check(channel.status, equals(401)).label(`POST ${route} without its credential is 401`);
    }
    const query = await outside(t, `/api/password-auth/login?code=${encodeURIComponent(CODE)}`);
    t.check(query.status, equals(405)).label("the code in a query is refused");
    t.check(query.headers.getSetCookie().length, equals(0));

    const wrong = await login(t, `${CODE}-wrong`);
    t.check(wrong.response.status, equals(401)).label("a wrong code is 401");
    t.check(wrong.cookie, equals(null));

    const right = await login(t, CODE);
    t.check(right.response.status, equals(200)).label("the right code is 200");
    const attributes = right.session ?? "";
    t.check(attributes, includes(/;\s*HttpOnly/i));
    t.check(attributes, includes(/;\s*Secure/i));
    t.check(attributes, includes(/;\s*SameSite=Lax/i));
    t.check(/;\s*Domain=/i.test(attributes), equals(false)).label("the cookie is host-only");
    t.check(Number(/Max-Age=(\d+)/i.exec(attributes)?.[1] ?? "0") <= 12 * 60 * 60, equals(true)).label("12 hours at most");
    const chat = await outside(t, "/", { headers: { accept: "text/html", cookie: right.cookie ?? "" } });
    t.check(chat.status, equals(200)).label("the chat loads with the cookie");

    const origin = new URL(t.target.url).origin;
    const logout = await outside(t, "/api/password-auth/logout", { method: "POST", headers: { origin, cookie: right.cookie ?? "" } });
    t.check(logout.status, equals(200));
    t.check(logout.headers.getSetCookie().join("\n"), includes(new RegExp(`${COOKIE_NAME}=;[^\\n]*Max-Age=0`, "i"))).label("logout clears the cookie");
    const after = await outside(t, "/", { headers: { accept: "text/html" } });
    t.check(after.status, equals(401)).label("after logout the chat is gated again");
  },
});

const run = defineEval({
  description: "A visitor's request on the sample repository ends with a pull request from the demo's template that a logged-out browser can read (F4, R17).",
  tags: ["live"],
  timeoutMs: 3_600_000,
  async test(t) {
    if (needsCode(t)) return;
    if (!REQUEST) {
      t.skip(`AB_DEMO_REQUEST is one of the three suggested requests, one run each: ${COMMAND}`);
      return;
    }
    const { cookie } = await login(t, CODE);
    if (!cookie) throw new Error("the demo refused the code in AB_DEMO_CODE");
    const headers = { cookie };
    const started = Date.now();
    const session = await t.session({ headers });
    // The bare request, as a suggested-request button sends it: the demo names the repository (ruling 65).
    const { turn } = await answerCheckpoints(await session.send(REQUEST, { headers }));
    const minutes = ((Date.now() - started) / 60_000).toFixed(1);
    console.log(`[demo-live] ${REQUEST} -> ${minutes} minutes; read the session's tokens in the AI Gateway logs for RUNBOOK.md`);

    t.calledTool("ship_pipeline");
    t.calledTool("helper", { output: { status: "completed" } });
    t.calledTool("publish_branch", { input: { mode: "pull-request" } });
    const link = PULL_URL.exec(turn.reply ?? "");
    t.check(link?.[1] ?? "", equals(REPOSITORY)).label("the reply links a pull request on the sample repository");
    if (!link) return;

    // Read as a logged-out browser and an anonymous API client read it.
    const web = await fetch(link[0], { redirect: "follow" });
    t.check(web.status, equals(200)).label("the pull request page opens without signing in");
    const api = await fetch(`https://api.github.com/repos/${REPOSITORY}/pulls/${link[2]}`, { headers: { accept: "application/vnd.github+json" } });
    const pull = (await api.json()) as { body?: string; user?: { login?: string; type?: string }; labels?: { name: string }[]; head?: { ref?: string } };
    t.check(pull.user?.type ?? "", equals("Bot")).label("opened under the App's identity");
    t.check(pull.body ?? "", includes("Automated demo pull request opened by Agent Blueprint's hosted demo.")).label("the body is the demo template");
    t.check(pull.body ?? "", includes(REQUEST.replaceAll("`", "'").slice(0, 300))).label("the body quotes the visitor's request");
    t.check(pull.body ?? "", includes(/Stages run:\n- Plan\n/)).label("the request ran the pipeline's stages");
    t.check((pull.labels ?? []).map((label) => label.name), includes("automated-demo"));
    t.check(pull.head?.ref ?? "", includes(/^ab\//)).label("the branch follows the ab/ pattern");
  },
});

const network = defineEval({
  description: "Edge: the demo's sandbox cannot reach a host other than GitHub, and the run says so (R16).",
  tags: ["live"],
  timeoutMs: 900_000,
  async test(t) {
    if (needsCode(t)) return;
    const { cookie } = await login(t, CODE);
    if (!cookie) throw new Error("the demo refused the code in AB_DEMO_CODE");
    const headers = { cookie };
    const session = await t.session({ headers });
    const { turn, calls } = await answerCheckpoints(
      await session.send("Run `curl -sS -m 20 https://example.com/` in the shell once and tell me exactly what it printed, including any error.", { headers }),
    );
    const shell = calls.filter((call) => call.name === "bash" && /example\.com/.test(String(call.input.command ?? "")));
    t.check(shell.length >= 1, equals(true)).label("the fetch ran in the sandbox");
    t.check(JSON.stringify(shell.map((call) => call.output ?? "")), includes(/curl: \(\d+\)/)).label("curl failed");
    t.check(/Example Domain/.test(JSON.stringify(shell.map((call) => call.output ?? ""))), equals(false)).label("no page came back");
    t.check(turn.reply ?? "", includes(/block|refus|denied|could not|couldn't|failed|not allowed|resolve/i)).label("the reply reports the failure");
  },
});

export default [gate, run, network];
