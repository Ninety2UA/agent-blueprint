import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { createServer, type Server } from "node:http";
import { defineEval } from "eve/evals";
import { equals, includes } from "eve/evals/expect";
import { MAINTENANCE_MESSAGE, mcpTokens, OAUTH_METADATA_PATH, resolveOAuth } from "../agent/lib/channel-gate";
import { FEATURE, readyFor, SETUP } from "./fixture/ship-loop";

// The MCP channel at /eve/v1/mcp (U5: R3, R5, R6, R8, AE2, AE3). No MCP client ships with Eve, so the
// cells drive JSON-RPC by hand through t.target.fetch, reading a JSON body or the data: lines of an
// event stream. The channel's routes are fixed when the server starts, so each configuration is its
// own pass (KTD14), and each cell skips itself on the passes it does not belong to:
//   token pass         AB_MCP_TOKEN (two values, comma-separated, for the rotation cell), OAuth off
//   OAuth pass         the same plus AB_MCP_OAUTH_ISSUER=http://127.0.0.1:47824 and a listed subject
//                      in AB_MCP_OAUTH_SUBJECTS: this file stands up that issuer, discovery and a
//                      JWKS, and signs its test tokens with node:crypto
//   maintenance pass   the token pass with AB_MAINTENANCE=1
// The no-token and wrong-token refusals run on every pass.
const ROUTE = "/eve/v1/mcp";
const ISSUER_PORT = 47824;
const TOKENS = mcpTokens(process.env);
// As the local eve dev server resolves it: without AB_MCP_OAUTH_RESOURCE, the request's own origin.
const OAUTH = resolveOAuth({ ...process.env, EVE_DEV: "1" });
const MAINTENANCE = Boolean(process.env.AB_MAINTENANCE?.trim());
const WRONG = "a-wrong-token-that-is-long-enough-to-count-as-set";
const AGENT_TOOLS = ["agent_start", "agent_get", "agent_update", "agent_cancel"];

type Target = { fetch(path: string, init?: RequestInit): Promise<Response> };
type Invocation = {
  invocationId: string;
  status: "working" | "input_required" | "completed" | "failed" | "cancelled";
  pollAfterMs?: number;
  result?: unknown;
  interactions?: Record<string, { interactionId: string; call?: { name: string }; request: { kind: string; prompt: string; options?: { id: string; label: string }[] } }>;
};

let ids = 0;
const META = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientInfo": { name: "agent-blueprint-eval", version: "1.0.0" },
  "io.modelcontextprotocol/clientCapabilities": {},
};

/** One JSON-RPC request; the status, the headers and the reply with the request's id. */
async function rpc(target: Target, method: string, params: Record<string, unknown> = {}, bearer?: string) {
  const id = (ids += 1);
  const response = await target.fetch(ROUTE, {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      "mcp-protocol-version": "2026-07-28",
      // 2026-07-28 repeats the method, and a tool call's name, in headers that must match the body.
      "mcp-method": method,
      ...(method === "tools/call" ? { "mcp-name": String(params.name) } : {}),
      ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params: { ...params, _meta: META } }),
  });
  const text = await response.text();
  const messages = (response.headers.get("content-type") ?? "").includes("text/event-stream")
    ? text.split("\n").filter((line) => line.startsWith("data:")).map((line) => JSON.parse(line.slice(5)))
    : text
      ? [JSON.parse(text)]
      : [];
  const reply = messages.flat().find((message) => message?.id === id) as { result?: Record<string, unknown>; error?: unknown } | undefined;
  return { status: response.status, challenge: response.headers.get("www-authenticate") ?? "", reply, text };
}

async function callTool(target: Target, bearer: string, name: string, args: Record<string, unknown>) {
  const { status, reply, text } = await rpc(target, "tools/call", { name, arguments: args }, bearer);
  const result = reply?.result as { isError?: boolean; structuredContent?: Invocation; content?: { text: string }[] } | undefined;
  if (status !== 200 || !result) throw new Error(`${name} answered ${status}: ${text.slice(0, 400)}`);
  return result;
}

/** Polls agent_get until the invocation reaches one of the statuses. */
async function until(target: Target, bearer: string, invocationId: string, statuses: Invocation["status"][], timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const state = (await callTool(target, bearer, "agent_get", { invocationId })).structuredContent;
    if (!state) throw new Error("agent_get returned no invocation");
    if (statuses.includes(state.status) || Date.now() > deadline) return state;
    await new Promise((resolve) => setTimeout(resolve, Math.min(Math.max(state.pollAfterMs ?? 500, 250), 2_000)));
  }
}

async function start(target: Target, bearer: string, message: string) {
  const started = await callTool(target, bearer, "agent_start", { message });
  if (started.isError || !started.structuredContent?.invocationId) throw new Error(`agent_start was rejected: ${JSON.stringify(started)}`);
  return started.structuredContent.invocationId;
}

/** Cancels a parked invocation and waits for any terminal status, so the cell leaves nothing running. */
async function cancel(target: Target, bearer: string, invocationId: string) {
  await callTool(target, bearer, "agent_cancel", { invocationId });
  return until(target, bearer, invocationId, ["cancelled", "completed", "failed"], 60_000);
}

const cell = (description: string, test: Parameters<typeof defineEval>[0]["test"], timeoutMs = 300_000) =>
  defineEval({
    description,
    tags: ["mock"],
    timeoutMs,
    async test(t) {
      if (process.env.AB_EVAL_MOCK !== "1") throw new Error("mock-tagged evals need AB_EVAL_MOCK=1");
      if (process.env.AB_DEMO === "1") return t.skip("the MCP route admits nobody on the demo; this pass runs without AB_DEMO");
      if (TOKENS.length === 0 && !OAUTH.on) return t.skip("needs AB_MCP_TOKEN (32 characters or more) or a complete OAuth configuration");
      return test(t);
    },
  });

// AE2: no bearer is 401 with a Bearer challenge, a wrong one 401 invalid_token, under eve dev too; the
// right one lists the four agent tools and nothing else.
const gate = cell("MCP refuses a missing or wrong bearer with 401 and lists exactly the four agent tools to the token.", async (t) => {
  const missing = await rpc(t.target, "tools/list");
  t.check(missing.status, equals(401)).label("no bearer: 401");
  t.check(missing.challenge, includes(/^Bearer\b/)).label("no bearer: a Bearer challenge");
  const wrong = await rpc(t.target, "tools/list", {}, WRONG);
  t.check(wrong.status, equals(401)).label("a wrong bearer: 401");
  t.check(wrong.challenge, includes('error="invalid_token"')).label("a wrong bearer: invalid_token");
  if (TOKENS.length === 0) return;
  const listed = await rpc(t.target, "tools/list", {}, TOKENS[0]);
  t.check(listed.status, equals(200)).label("the token: 200");
  const names = ((listed.reply?.result?.tools ?? []) as { name: string }[]).map((tool) => tool.name).sort();
  t.check(names, equals([...AGENT_TOOLS].sort())).label("exactly the four agent tools");
  const start = ((listed.reply?.result?.tools ?? []) as { name: string; description?: string }[]).find((tool) => tool.name === "agent_start");
  t.check(start?.description ?? "", includes("ask your user")).label("agent_start carries the agent's description (KTD11)");
});

const rotation = cell("During a rotation both configured token values are admitted.", async (t) => {
  if (TOKENS.length < 2) return t.skip("needs two AB_MCP_TOKEN values separated by a comma");
  const second = await rpc(t.target, "tools/list", {}, TOKENS[1]);
  t.check(second.status, equals(200)).label("the second value: 200");
});

const tokenWalk = (description: string, test: Parameters<typeof defineEval>[0]["test"]) =>
  cell(description, async (t) => {
    if (MAINTENANCE) return t.skip("runs without AB_MAINTENANCE");
    if (OAUTH.on) return t.skip("runs on the token pass, OAuth off");
    if (TOKENS.length === 0) return t.skip("needs AB_MCP_TOKEN");
    return test(t);
  });

// R3, R8: start, read, answer and finish a run; the run is interactive.
const walk = tokenWalk("With the token: agent_start, agent_get to the question, agent_update answers it, agent_get to completed; the run is interactive.", async (t) => {
  const token = TOKENS[0];
  const invocationId = await start(t.target, token, [FEATURE, SETUP, "ship:", "ask: Plan first or build now? | Plan first | Build now"].join("\n"));
  t.check(invocationId, includes(/\S/)).label("an invocation id");
  const asked = await until(t.target, token, invocationId, ["input_required", "completed", "failed", "cancelled"]);
  t.check(asked.status, equals("input_required")).label("the question parks the run");
  const interaction = Object.values(asked.interactions ?? {})[0];
  t.check(interaction?.request.prompt ?? "", includes("Plan first or build now?")).label("the interaction is the question");
  const option = interaction?.request.options?.find((candidate) => candidate.label === "Build now");
  t.check(Boolean(option), equals(true)).label("the question carries its options");
  if (!interaction || !option) return;
  const answered = await callTool(t.target, token, "agent_update", { invocationId, responses: [{ interactionId: interaction.interactionId, optionId: option.id }] });
  t.check(answered.isError ?? false, equals(false)).label("agent_update accepts the answer");
  const done = await until(t.target, token, invocationId, ["completed", "failed", "cancelled"]);
  t.check(done.status, equals("completed")).label("the run completes");
  const result = JSON.stringify(done.result ?? "");
  t.check(result, includes("Build now")).label("the answer reached the run");
  // ship_pipeline reports the posture the cap-guard hook derived for this turn and wrote into the
  // run's decisions (posture.ts: interactive by channel for MCP).
  t.check(result, includes('\\"posture\\":\\"interactive\\"')).label("the run's posture is interactive");
});

// R8: a pull request waits on the person's approval, never a silent publish.
const approval = tokenWalk("With the token: publish: pull-request parks on the publish approval.", async (t) => {
  const token = TOKENS[0];
  const invocationId = await start(t.target, token, [...readyFor("mcp-approval"), "publish: pull-request"].join("\n"));
  const parked = await until(t.target, token, invocationId, ["input_required", "completed", "failed", "cancelled"]);
  t.check(parked.status, equals("input_required")).label("the publish waits");
  const interaction = Object.values(parked.interactions ?? {})[0];
  t.check(interaction?.call?.name ?? "", equals("publish_branch")).label("the interaction is the publish approval");
  const ended = await cancel(t.target, token, invocationId);
  t.check(["cancelled", "completed", "failed"].includes(ended.status), equals(true)).label("agent_cancel ends it");
});

// R6, KTD9: an admitted agent_start during maintenance is a 200 tool error with the maintenance
// message, so Claude Code reports the reason instead of a failed server; reads stay open.
const maintenance = cell("During maintenance agent_start answers with a tool error carrying the maintenance message; agent_get still answers.", async (t) => {
  if (!MAINTENANCE) return t.skip("runs with AB_MAINTENANCE=1");
  if (TOKENS.length === 0) return t.skip("needs AB_MCP_TOKEN");
  const token = TOKENS[0];
  const refused = await rpc(t.target, "tools/call", { name: "agent_start", arguments: { message: "bash: echo never-runs" } }, token);
  t.check(refused.status, equals(200)).label("agent_start: 200");
  const result = refused.reply?.result as { isError?: boolean; content?: { text: string }[] } | undefined;
  t.check(result?.isError ?? false, equals(true)).label("agent_start: isError");
  t.check(result?.content?.[0]?.text ?? "", equals(MAINTENANCE_MESSAGE)).label("agent_start: the maintenance message");
  const read = await callTool(t.target, token, "agent_get", { invocationId: `inv_${randomUUID()}` });
  t.check(JSON.stringify(read), includes("not_found")).label("agent_get reaches Eve: an unknown id is not_found");
});

// ---- the OAuth pass (KTD8, AE3) ----

const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const KID = "agent-blueprint-eval";
const b64 = (value: object | Buffer) => (Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value))).toString("base64url");

/** An RS256 access token from the stub issuer. */
function accessToken(issuer: string, subject: string, audience: string): string {
  const now = Math.floor(Date.now() / 1000);
  const head = `${b64({ alg: "RS256", typ: "JWT", kid: KID })}.${b64({ iss: issuer, sub: subject, aud: audience, iat: now, exp: now + 600 })}`;
  return `${head}.${b64(sign("RSA-SHA256", Buffer.from(head), keys.privateKey))}`;
}

/** The OIDC issuer stub on 47824: discovery and the JWKS, nothing else. */
async function issuerStub(issuer: string): Promise<Server> {
  const jwk = { ...keys.publicKey.export({ format: "jwk" }), kid: KID, alg: "RS256", use: "sig" };
  const server = createServer((request, response) => {
    response.setHeader("content-type", "application/json");
    if (request.url === "/.well-known/openid-configuration") {
      response.end(JSON.stringify({ issuer, jwks_uri: `${issuer}/jwks`, authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token` }));
    } else if (request.url === "/jwks") {
      response.end(JSON.stringify({ keys: [jwk] }));
    } else {
      response.statusCode = 404;
      response.end("{}");
    }
  });
  await new Promise<void>((resolve) => server.listen(ISSUER_PORT, "127.0.0.1", resolve));
  return server;
}

const oauth = cell(
  "OAuth: the 401 points to metadata under /eve/v1/; a listed subject is admitted and interactive, an unlisted one gets 403, another audience 401.",
  async (t) => {
    if (!OAUTH.on) return t.skip(`runs with OAuth on (${OAUTH.reason})`);
    if (MAINTENANCE) return t.skip("runs without AB_MAINTENANCE");
    const server = await issuerStub(OAUTH.issuer);
    try {
      const refused = await rpc(t.target, "tools/list");
      t.check(refused.status, equals(401)).label("no bearer: 401");
      const metadataUrl = /resource_metadata="([^"]+)"/.exec(refused.challenge)?.[1] ?? "";
      t.check(metadataUrl ? new URL(metadataUrl).pathname : "", equals(OAUTH_METADATA_PATH)).label("resource_metadata points under /eve/v1/");
      const metadata = (await (await t.target.fetch(OAUTH_METADATA_PATH)).json()) as { resource?: string; authorization_servers?: string[] };
      t.check(metadata.authorization_servers?.[0], equals(OAUTH.issuer)).label("the metadata names the issuer exactly");
      t.check(metadata.resource ?? "", includes(/\/eve\/v1\/mcp$/)).label("the metadata names the MCP address as the resource");
      if (OAUTH.resource) t.check(metadata.resource, equals(OAUTH.resource)).label("the resource is the typed address");
      const resource = metadata.resource ?? "";

      const listed = OAUTH.subjects.find((subject) => subject !== "*") ?? "eval-user-listed";
      const user = accessToken(OAUTH.issuer, listed, resource);
      const tools = await rpc(t.target, "tools/list", {}, user);
      t.check(tools.status, equals(200)).label("a listed subject: 200");
      const invocationId = await start(t.target, user, [...readyFor("mcp-oauth"), "publish: pull-request"].join("\n"));
      const parked = await until(t.target, user, invocationId, ["input_required", "completed", "failed", "cancelled"]);
      t.check(parked.status, equals("input_required")).label("a listed subject's run is interactive: the publish waits");
      await cancel(t.target, user, invocationId);

      if (!OAUTH.subjects.includes("*")) {
        const stranger = await rpc(t.target, "tools/list", {}, accessToken(OAUTH.issuer, "eval-user-not-listed", resource));
        t.check(stranger.status, equals(403)).label("an unlisted subject: 403");
      }
      const elsewhere = await rpc(t.target, "tools/list", {}, accessToken(OAUTH.issuer, listed, "https://another.example/eve/v1/mcp"));
      t.check(elsewhere.status, equals(401)).label("a token for another resource: 401");
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  },
);

export default [gate, rotation, walk, approval, maintenance, oauth];
