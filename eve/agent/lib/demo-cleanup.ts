import { gitHubAppFromEnv, mintInstallationToken, type TokenPermissions } from "./credentials";
import { DEFAULT_DEMO_REPOSITORY } from "./demo-repository";
import { defaultRegistry, type Registry, type SessionEntry } from "./registry";

// The demo's cleanup (KTD13, R17), run hourly by schedules/demo-cleanup.ts under the GitHub App's
// token, with no approval and no model call. On the sample repository it:
//   closes   open pull requests older than 24 hours whose head is an ab/ branch of the repository
//   deletes  ab/ branches whose tip is older than 7 days and whose session the registry marks ended
// It never touches main or a branch outside ab/: it lists only refs under heads/ab/ and only pull
// requests whose head is one. A branch whose session is running (live, or parked inside the idle
// timeout) stays, and so does a branch the registry does not know. The registry is settled as the
// gate reads it, so a session past the idle timeout counts as ended.
// It does nothing on a copy without AB_DEMO=1, and nothing while AB_MAINTENANCE is set.
// AB_CLEANUP_DRY_RUN logs what a run would close and delete and changes nothing: set it before a
// hand trigger to see the selection first.

export const PULL_MAX_AGE_MS = 24 * 60 * 60 * 1_000;
export const BRANCH_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1_000;
export const BRANCH_PREFIX = "ab/";
export { DEFAULT_DEMO_REPOSITORY };
/** Delete refs and close pull requests on the one repository; nothing else. */
export const CLEANUP_PERMISSIONS: TokenPermissions = { contents: "write", pull_requests: "write", metadata: "read" };

export interface CleanupReport {
  readonly status: "done" | "dry-run" | "skipped";
  readonly reason?: string;
  readonly repository?: string;
  /** Pull request numbers closed, or that a dry run would close. */
  readonly closed: number[];
  /** Branches deleted, or that a dry run would delete. */
  readonly deleted: string[];
  /** What was looked at and left, with the reason: `#<number>` for a pull request, the name for a branch. */
  readonly kept: { readonly name: string; readonly reason: string }[];
}

export interface CleanupOverrides {
  /** The GitHub API: fetch and base URL. Tests replace both. */
  readonly fetch?: typeof fetch;
  readonly apiUrl?: string;
  readonly registry?: Pick<Registry, "snapshot">;
  readonly now?: () => Date;
  readonly log?: (line: string) => void;
}

interface PullRequest {
  readonly number: number;
  readonly created_at: string;
  readonly head: { readonly ref: string; readonly repo: { readonly full_name: string } | null };
}

interface Ref {
  readonly ref: string;
  readonly object: { readonly sha: string };
}

const skipped = (reason: string): CleanupReport => ({ status: "skipped", reason, closed: [], deleted: [], kept: [] });

/** The schedule's entry: reads the deploy variables, mints the App's token and runs one cleanup. */
export async function scheduledCleanup(
  env: Record<string, string | undefined> = process.env,
  overrides: CleanupOverrides = {},
): Promise<CleanupReport> {
  const log = overrides.log ?? ((line: string) => console.log(line));
  if (env.AB_DEMO !== "1") return skipped("not the demo (AB_DEMO is not 1)");
  if (env.AB_MAINTENANCE?.trim()) {
    log("[demo-cleanup] skipped: AB_MAINTENANCE is set");
    return skipped("AB_MAINTENANCE is set");
  }
  const repository = env.AB_DEMO_REPOSITORY?.trim() || DEFAULT_DEMO_REPOSITORY;
  const [owner, name] = repository.split("/");
  if (!owner || !name) throw new Error(`AB_DEMO_REPOSITORY is ${repository}, not owner/name.`);
  const dryRun = Boolean(env.AB_CLEANUP_DRY_RUN?.trim());
  const call = overrides.fetch ?? fetch;
  const api = overrides.apiUrl ?? "https://api.github.com";
  const app = { ...gitHubAppFromEnv(env), fetch: call, apiUrl: api };
  const { token } = await mintInstallationToken(app, { owner, name }, CLEANUP_PERMISSIONS);
  const registry = overrides.registry ?? defaultRegistry(env as NodeJS.ProcessEnv);
  return cleanup({ repository, token, dryRun, fetch: call, apiUrl: api, registry, now: overrides.now ?? (() => new Date()), log });
}

export interface CleanupDeps {
  readonly repository: string;
  readonly token: string;
  readonly dryRun: boolean;
  readonly fetch: typeof fetch;
  readonly apiUrl: string;
  readonly registry: Pick<Registry, "snapshot">;
  readonly now: () => Date;
  readonly log: (line: string) => void;
}

/** One pass over the repository: close, then delete, each by the rules above. */
export async function cleanup(deps: CleanupDeps): Promise<CleanupReport> {
  const { repository, dryRun, log } = deps;
  const now = deps.now().getTime();
  const github = async (path: string, init: RequestInit = {}) => {
    const response = await deps.fetch(`${deps.apiUrl}/repos/${repository}${path}`, {
      ...init,
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${deps.token}`,
        "x-github-api-version": "2022-11-28",
        ...(init.body ? { "content-type": "application/json" } : {}),
      },
    });
    if (!response.ok) throw new Error(`GitHub ${init.method ?? "GET"} ${path} on ${repository} failed: HTTP ${response.status}.`);
    return response.status === 204 ? null : response.json();
  };

  // Which session owns each branch, as the gate sees the registry now.
  const document = await deps.registry.snapshot();
  const owners = new Map<string, SessionEntry>();
  for (const entry of Object.values(document.sessions)) {
    if (!entry.branch) continue;
    const known = owners.get(entry.branch);
    if (!known || entry.status === "running") owners.set(entry.branch, entry);
  }
  const running = (branch: string) => owners.get(branch)?.status === "running";

  const report = { closed: [] as number[], deleted: [] as string[], kept: [] as { name: string; reason: string }[] };
  const keep = (name: string, reason: string) => report.kept.push({ name, reason });
  const verb = (done: string, would: string) => (dryRun ? would : done);

  // Pull requests: the open ones, a page of 100 at a time.
  const pulls: PullRequest[] = [];
  for (let page = 1; ; page += 1) {
    const batch = (await github(`/pulls?state=open&per_page=100&page=${page}`)) as PullRequest[];
    pulls.push(...batch);
    if (batch.length < 100) break;
  }
  for (const pull of pulls) {
    const name = `#${pull.number}`;
    const head = pull.head.ref;
    if (pull.head.repo?.full_name !== repository || !head.startsWith(BRANCH_PREFIX)) {
      keep(name, `its head ${pull.head.repo?.full_name ?? "unknown"}:${head} is not an ${BRANCH_PREFIX} branch of ${repository}`);
      continue;
    }
    if (running(head)) {
      keep(name, `its branch ${head} belongs to a running session`);
      continue;
    }
    if (now - Date.parse(pull.created_at) <= PULL_MAX_AGE_MS) {
      keep(name, "younger than 24 hours");
      continue;
    }
    if (!dryRun) await github(`/pulls/${pull.number}`, { method: "PATCH", body: JSON.stringify({ state: "closed" }) });
    report.closed.push(pull.number);
    log(`[demo-cleanup] ${verb("closed", "would close")} ${name} (${head}, opened ${pull.created_at})`);
  }

  // Branches: only refs under heads/ab/, so main and every other branch are never listed.
  const refs = (await github(`/git/matching-refs/heads/${BRANCH_PREFIX}`)) as Ref[];
  for (const ref of refs) {
    const branch = ref.ref.replace(/^refs\/heads\//, "");
    if (!branch.startsWith(BRANCH_PREFIX)) continue;
    const owner = owners.get(branch);
    if (!owner) {
      keep(branch, "no session in the registry names it");
      continue;
    }
    if (owner.status === "running") {
      keep(branch, `its session ${owner.sessionId} is running`);
      continue;
    }
    const tip = (await github(`/commits/${ref.object.sha}`)) as { commit: { committer: { date: string } } };
    const committed = tip.commit.committer.date;
    if (now - Date.parse(committed) <= BRANCH_MAX_AGE_MS) {
      keep(branch, "its tip is younger than 7 days");
      continue;
    }
    const path = branch.split("/").map(encodeURIComponent).join("/");
    if (!dryRun) await github(`/git/refs/heads/${path}`, { method: "DELETE" });
    report.deleted.push(branch);
    log(`[demo-cleanup] ${verb("deleted", "would delete")} ${branch} (session ${owner.sessionId} ${owner.outcome ?? "ended"}, tip ${committed})`);
  }

  log(
    `[demo-cleanup] ${repository}${dryRun ? " (dry run)" : ""}: ${report.closed.length} pull requests ${verb("closed", "to close")}, ` +
      `${report.deleted.length} branches ${verb("deleted", "to delete")}, ${report.kept.length} left`,
  );
  return { status: dryRun ? "dry-run" : "done", repository, ...report };
}
