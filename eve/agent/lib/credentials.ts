import { createSign, randomUUID } from "node:crypto";
import type { SandboxCommandResult, SandboxNetworkPolicy, SandboxSession } from "eve/sandbox";

// The GitHub credential layer (KTD5). The runtime mints a GitHub App installation token
// for the one repository and hands it to git in the sandbox by the provider's route:
//   window   Vercel Sandbox: the token rides a header transform on github.com, set only
//            while the caller's git commands run, then the transform-free policy is back.
//   command  Docker and Daytona: each git command reads the token from an ephemeral
//            credential helper file, removed when the command ends.
// The token never enters the session environment or a remote URL. On Docker and Daytona a
// process in the sandbox can read the helper file while its command runs, so those
// providers are unguarded. The clone tool and the publish tool both call this layer.

/** The hosts every sandbox policy allows: git over HTTPS and the REST API. */
export const GITHUB_HOSTS = ["github.com", "api.github.com"] as const;

/** Reads AB_ALLOWED_HOSTS: unset means the default list; an empty value means no host. */
export function parseAllowedHosts(value: string | undefined, fallback: string): string[] {
  return (value ?? fallback)
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean);
}

/** The transform-free policy the sandbox opens with and returns to after every window. */
export function basePolicy(provider: "vercel" | "docker" | "daytona", hosts: readonly string[]): SandboxNetworkPolicy {
  // Docker can only allow or deny everything: any allowed host opens it, none closes it.
  if (provider === "docker") return hosts.length ? "allow-all" : "deny-all";
  return { allow: [...new Set([...GITHUB_HOSTS, ...hosts])] };
}

/** The Vercel policy inside a window: the same hosts, with the token as a header on github.com. */
export function windowPolicy(hosts: readonly string[], token: string): SandboxNetworkPolicy {
  const basic = Buffer.from(`x-access-token:${token}`).toString("base64");
  const allow: Record<string, { transform: { headers: Record<string, string> }[] }[]> = {};
  for (const host of new Set([...GITHUB_HOSTS, ...hosts])) allow[host] = [];
  allow["github.com"] = [{ transform: [{ headers: { authorization: `Basic ${basic}` } }] }];
  return { allow };
}

export interface Repository {
  readonly owner: string;
  readonly name: string;
}

export interface GitHubApp {
  readonly appId: string;
  readonly privateKey: string;
  /** Replaced in tests; the GitHub API otherwise. */
  readonly fetch?: typeof fetch;
  readonly apiUrl?: string;
  readonly now?: () => number;
}

/** The App's id and key from the deploy variables, each missing one named. */
export function gitHubAppFromEnv(env: Record<string, string | undefined> = process.env): GitHubApp {
  const appId = env.AB_GITHUB_APP_ID?.trim();
  const privateKey = env.AB_GITHUB_APP_PRIVATE_KEY?.trim();
  if (!appId) throw new Error("AB_GITHUB_APP_ID is not set; a private repository needs the GitHub App.");
  if (!privateKey) throw new Error("AB_GITHUB_APP_PRIVATE_KEY is not set; a private repository needs the GitHub App.");
  return { appId, privateKey };
}

function base64url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

/** The App's own JWT (RS256, ten minutes at most), which only resolves installations and mints tokens. */
export function appJwt(app: GitHubApp): string {
  const now = Math.floor((app.now?.() ?? Date.now()) / 1_000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  // Back-dated a minute for clock drift, as GitHub's documentation advises.
  const payload = base64url(JSON.stringify({ iat: now - 60, exp: now + 540, iss: app.appId }));
  const signature = createSign("RSA-SHA256").update(`${header}.${payload}`).sign(app.privateKey);
  return `${header}.${payload}.${base64url(signature)}`;
}

export type TokenPermissions = Readonly<Record<string, "read" | "write">>;

/** Clone and fetch need no more than this; a token minted with it cannot push. */
export const READ_PERMISSIONS: TokenPermissions = { contents: "read", metadata: "read" };

export interface InstallationToken {
  readonly token: string;
  readonly expiresAt: string;
}

/**
 * Mints a one-hour installation token for exactly `repository`. Resolves the App's
 * installation for that repository first and refuses, naming it, when there is none.
 */
export async function mintInstallationToken(
  app: GitHubApp,
  repository: Repository,
  permissions: TokenPermissions,
): Promise<InstallationToken> {
  const call = app.fetch ?? fetch;
  const api = app.apiUrl ?? "https://api.github.com";
  const headers = {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${appJwt(app)}`,
    "x-github-api-version": "2022-11-28",
  };
  const slug = `${repository.owner}/${repository.name}`;
  const found = await call(`${api}/repos/${slug}/installation`, { headers });
  if (found.status === 404) {
    throw new Error(`The GitHub App ${app.appId} is not installed on ${slug}. Install it there, or name a repository it is installed on.`);
  }
  if (!found.ok) throw new Error(`Looking up the GitHub App's installation on ${slug} failed: HTTP ${found.status}.`);
  const { id } = (await found.json()) as { id: number };

  const minted = await call(`${api}/app/installations/${id}/access_tokens`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({ repositories: [repository.name], permissions }),
  });
  if (!minted.ok) throw new Error(`Minting a token for ${slug} failed: HTTP ${minted.status}.`);
  const body = (await minted.json()) as { token: string; expires_at: string };
  return { token: body.token, expiresAt: body.expires_at };
}

export type TokenRoute = "window" | "command";

export type GitRunner = (args: readonly string[]) => Promise<SandboxCommandResult>;

export interface TokenHandOff {
  readonly route: TokenRoute;
  readonly token: string;
  /** The allowed hosts besides GitHub, needed to restore the Vercel policy. */
  readonly hosts: readonly string[];
  /** The only host the helper answers for. Tests point it at a local server. */
  readonly host?: string;
  readonly protocol?: "https" | "http";
}

type WindowSession = SandboxSession & { setNetworkPolicy(policy: SandboxNetworkPolicy): Promise<void> };

export function quote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

// Every credentialed git command: no system or global configuration, no hooks, no
// fsmonitor, no prompt, and an empty credential.helper first, which drops every helper
// configured before it, the repository's own included.
const SAFE_ENV = { GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_TERMINAL_PROMPT: "0" };
const SAFE_CONFIG = ["-c", "core.hooksPath=/dev/null", "-c", "core.fsmonitor=false", "-c", "credential.helper="];

// Answers `get` only for the one host and protocol, so a URL rewrite in the repository's
// configuration cannot send the token anywhere else; ignores `store` and `erase`.
function helper(tokenFile: string, host: string, protocol: string): string {
  return [
    "!f() {",
    'test "$1" = get || exit 0;',
    "h=; p=;",
    'while IFS= read -r line && test -n "$line"; do',
    'case "$line" in host=*) h="${line#host=}";; protocol=*) p="${line#protocol=}";; esac;',
    "done;",
    `test "$h" = ${quote(host)} && test "$p" = ${quote(protocol)} || exit 0;`,
    `printf 'username=x-access-token\\npassword=%s\\n' "$(cat ${quote(tokenFile)})";`,
    "}; f",
  ].join(" ");
}

async function runGit(sandbox: SandboxSession, args: readonly string[]): Promise<SandboxCommandResult> {
  return sandbox.run({ command: ["git", ...args].map(quote).join(" "), env: SAFE_ENV });
}

const USERINFO = /^(https?:\/\/)[^/@]*@/;

/** Rewrites any remote URL that carries credentials to its bare form. Returns the keys it changed. */
export async function bareRemotes(sandbox: SandboxSession): Promise<string[]> {
  const listed = await runGit(sandbox, ["config", "--local", "--get-regexp", "^remote\\..*\\.(url|pushurl)$"]);
  const changed: string[] = [];
  for (const line of listed.stdout.split("\n")) {
    const [key, url] = line.trim().split(/\s+/, 2);
    if (!key || !url || !USERINFO.test(url)) continue;
    const result = await runGit(sandbox, ["config", "--local", key, url.replace(USERINFO, "$1")]);
    if (result.exitCode !== 0) throw new Error(`rewriting ${key} without its credential failed: ${result.stderr}`);
    changed.push(key);
  }
  return changed;
}

/**
 * Runs `work` with a git runner that reaches the repository with `handOff.token`, by the
 * provider's route, and leaves no credential behind: the Vercel policy returns to its
 * transform-free form and the helper file is removed on every exit path, a throw included,
 * and remote URLs are bare afterwards.
 */
export async function withGitHubToken<T>(
  sandbox: SandboxSession,
  handOff: TokenHandOff,
  work: (git: GitRunner) => Promise<T>,
): Promise<T> {
  // git sends a URL's own userinfo instead of asking the helper, so strip it first too.
  await bareRemotes(sandbox);
  try {
    if (handOff.route === "window") return await inWindow(sandbox, handOff, work);
    return await perCommand(sandbox, handOff, work);
  } finally {
    await bareRemotes(sandbox);
  }
}

async function inWindow<T>(sandbox: SandboxSession, handOff: TokenHandOff, work: (git: GitRunner) => Promise<T>): Promise<T> {
  const session = sandbox as Partial<WindowSession>;
  if (typeof session.setNetworkPolicy !== "function") throw new Error("This sandbox cannot set a network policy, so it has no credential window.");
  const setPolicy = session.setNetworkPolicy.bind(sandbox);
  await setPolicy(windowPolicy(handOff.hosts, handOff.token));
  try {
    return await work((args) => runGit(sandbox, [...SAFE_CONFIG, ...args]));
  } finally {
    await setPolicy(basePolicy("vercel", handOff.hosts));
  }
}

async function perCommand<T>(sandbox: SandboxSession, handOff: TokenHandOff, work: (git: GitRunner) => Promise<T>): Promise<T> {
  const host = handOff.host ?? "github.com";
  const protocol = handOff.protocol ?? "https";
  return work(async (args) => {
    // A fresh path per command, outside the workspace so no commit can pick it up.
    const directory = `/tmp/ab-git-${randomUUID()}`;
    const tokenFile = `${directory}/token`;
    await sandbox.writeFiles({ files: [{ path: tokenFile, content: new TextEncoder().encode(handOff.token) }] });
    try {
      return await runGit(sandbox, [...SAFE_CONFIG, "-c", `credential.helper=${helper(tokenFile, host, protocol)}`, ...args]);
    } finally {
      await sandbox.removePath({ path: directory, recursive: true, force: true });
    }
  });
}
