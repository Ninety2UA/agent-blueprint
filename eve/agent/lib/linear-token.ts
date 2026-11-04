// The Linear channel's token (KTD5, KTD13): the agent mints a client-credentials token from the
// Linear app's LINEAR_CLIENT_ID and LINEAR_CLIENT_SECRET, keeps it in module memory until a day
// before it expires (Linear gives 30 days), and mints again then. Concurrent callers share one mint.
// The scope string is fixed: minting with a different scope set revokes every app token Linear
// holds for the app. Eve's Linear client never retries a refused token, so the channel passes fetch()
// below as api.fetch: a GraphQL call Linear refuses for its token (a 401, or an AUTHENTICATION_ERROR
// in the body at any status, ruling 72) drops the cached token, mints once and retries once. Every
// failed call and mint logs a warning naming the operation and Linear's error, never a token. Eve downloads
// every uploads.linear.app link in a prompt with the app token; fetch() answers those itself with
// a 403 and never sends the token, so Eve keeps the link's label with a could-not-be-retrieved note.
// Nothing here reads the environment until the first call, and nothing throws at load, because
// check-skill-count.mjs runs eve info before every build. Under AB_EVAL_MOCK=1 both endpoints point
// at the stub evals/linear.eval.ts runs on port 47822.

type Env = Readonly<Record<string, string | undefined>>;
type Fetch = typeof fetch;

/** The one scope set every mint asks for (KTD5). */
export const LINEAR_SCOPE = "read,write,app:assignable,app:mentionable";

/** The port the mocked eval's Linear stub listens on. */
export const LINEAR_STUB_PORT = 47822;

const DAY_MS = 24 * 60 * 60 * 1_000;
const DEFAULT_LIFETIME_S = 30 * 24 * 60 * 60;
const UPLOADS_ORIGIN = "https://uploads.linear.app";

const mocked = (env: Env) => env.AB_EVAL_MOCK === "1";

/** Where tokens are minted. */
export function linearTokenUrl(env: Env = process.env): string {
  return mocked(env) ? `http://127.0.0.1:${LINEAR_STUB_PORT}/oauth/token` : "https://api.linear.app/oauth/token";
}

/** Linear's GraphQL endpoint, which the channel passes to Eve as api.apiBaseUrl. */
export function linearGraphqlUrl(env: Env = process.env): string {
  return mocked(env) ? `http://127.0.0.1:${LINEAR_STUB_PORT}/graphql` : "https://api.linear.app/graphql";
}

function urlOf(input: Parameters<Fetch>[0]): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export interface LinearTokenOptions {
  readonly env?: Env;
  readonly fetch?: Fetch;
  readonly now?: () => number;
}

export interface LinearToken {
  /** The cached token, or a fresh one; concurrent callers share one mint. Eve's credentials.accessToken. */
  get(): Promise<string>;
  /** Forgets the cached token if it is still this one, so the next get() mints. */
  drop(token: string): void;
  /** Eve's api.fetch: re-mints and retries once when Linear refuses the token, and refuses upload links. */
  fetch: Fetch;
}

export function createLinearToken({ env = process.env, fetch: send = (input, init) => globalThis.fetch(input, init), now = Date.now }: LinearTokenOptions = {}): LinearToken {
  let cached: { token: string; renewAt: number } | null = null;
  let pending: Promise<string> | null = null;

  async function mint(): Promise<string> {
    const clientId = env.LINEAR_CLIENT_ID?.trim();
    const clientSecret = env.LINEAR_CLIENT_SECRET?.trim();
    if (!clientId || !clientSecret) throw new Error("Linear: LINEAR_CLIENT_ID and LINEAR_CLIENT_SECRET must both be set to mint a token");
    const response = await send(linearTokenUrl(env), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret, scope: LINEAR_SCOPE }).toString(),
    });
    const body = (await response.json().catch(() => null)) as { access_token?: unknown; expires_in?: unknown; error?: unknown; error_description?: unknown } | null;
    if (!response.ok || typeof body?.access_token !== "string" || !body.access_token) {
      console.warn("[linear] minting a token failed", { status: response.status, error: body?.error, description: body?.error_description });
      throw new Error(`Linear: minting a token failed with HTTP ${response.status}`);
    }
    const lifetime = typeof body.expires_in === "number" && body.expires_in > 0 ? body.expires_in : DEFAULT_LIFETIME_S;
    cached = { token: body.access_token, renewAt: now() + lifetime * 1_000 - DAY_MS };
    return body.access_token;
  }

  function get(): Promise<string> {
    if (cached && now() < cached.renewAt) return Promise.resolve(cached.token);
    pending ??= mint().finally(() => {
      pending = null;
    });
    return pending;
  }

  function drop(token: string): void {
    if (cached?.token === token) cached = null;
  }

  const wrapped: Fetch = async (input, init) => {
    const url = urlOf(input);
    if (originOf(url) === UPLOADS_ORIGIN) return new Response(null, { status: 403 });
    const response = await send(input, init);
    if (url !== linearGraphqlUrl(env)) return response;
    const first = await outcome(init, response);
    if (!first.tokenRefused) {
      if (first.failure) console.warn("[linear] GraphQL call failed", first.failure);
      return response;
    }
    console.warn("[linear] Linear refused the token; minting a new one", first.failure);
    const headers = new Headers(init?.headers);
    const used = headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    drop(used);
    headers.set("authorization", `Bearer ${await get()}`);
    const retried = await send(input, { ...init, headers });
    const second = await outcome(init, retried);
    if (second.failure) console.warn("[linear] GraphQL call failed after a new token", second.failure);
    return retried;
  };

  return { get, drop, fetch: wrapped };
}

/** The GraphQL operation a request body names, for the warnings: its operationName or its first field. */
function operationOf(init: Parameters<Fetch>[1]): string {
  try {
    const parsed = JSON.parse(String(init?.body ?? "{}")) as { operationName?: string; query?: string };
    return parsed.operationName ?? /(?:query|mutation)\s*\w*[^{]*\{\s*(\w+)/.exec(parsed.query ?? "")?.[1] ?? "?";
  } catch {
    return "?";
  }
}

/**
 * Whether Linear refused the call's token, and what failed: a 401 or an AUTHENTICATION_ERROR in the
 * errors at any status counts as refused; any other error status or errors entry is a plain failure.
 */
async function outcome(init: Parameters<Fetch>[1], response: Response): Promise<{ tokenRefused: boolean; failure: Record<string, unknown> | null }> {
  const text = await response.clone().text().catch(() => "");
  let errors: { message?: string; extensions?: { code?: string; type?: string } }[] = [];
  try {
    const parsed = JSON.parse(text) as { errors?: typeof errors };
    errors = Array.isArray(parsed.errors) ? parsed.errors : [];
  } catch {
    // a body that is not JSON carries no errors list
  }
  const codes = errors.map((error) => error.extensions?.code ?? error.extensions?.type ?? "?");
  const tokenRefused = response.status === 401 || errors.some((error) => error.extensions?.code === "AUTHENTICATION_ERROR" || error.extensions?.type === "authentication error");
  const failed = !response.ok || errors.length > 0;
  return {
    tokenRefused,
    failure: failed ? { operation: operationOf(init), status: response.status, codes, message: errors[0]?.message?.slice(0, 200) ?? null } : null,
  };
}

/** The deployment's one token, shared by every Linear request this instance serves. */
export const linearToken = createLinearToken();
