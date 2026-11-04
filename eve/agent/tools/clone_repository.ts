import { defineTool } from "eve/tools";
import type { SandboxSession } from "eve/sandbox";
import { z } from "zod";
import { READ_PERMISSIONS, gitHubAppFromEnv, mintInstallationToken, withGitHubToken, type GitRunner } from "../lib/credentials";
import { ensureGitIdentity, identityOwner, readIdentityOwner } from "../lib/git-identity";
import { allowedHosts, extendSandboxTimeout, provider } from "../sandbox/sandbox";

// Puts the named repository at the sandbox's workspace root (KTD7). The first call
// clones; a later call fetches. The branch then starts from the remote branch when it
// exists, from the local branch when only that exists, and from the default branch
// otherwise. github.com repositories only. A public one is fetched with no credential; when
// GitHub asks for one, the repository is private and the fetch goes through the credential
// layer with a read-only token for that repository, minted from the GitHub App.
const GITHUB_URL = /^https:\/\/github\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?\/?$/;

// What git prints when GitHub wants a credential and prompts are off.
const NEEDS_CREDENTIAL = /could not read Username|terminal prompts disabled|Authentication failed/;

function quote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

async function git(sandbox: SandboxSession, args: string[]): Promise<{ ok: boolean; out: string; err: string }> {
  const result = await sandbox.run({
    command: `git ${args.map(quote).join(" ")}`,
    // A private repository fails at once instead of waiting for a password.
    env: { GIT_TERMINAL_PROMPT: "0" },
  });
  return { ok: result.exitCode === 0, out: result.stdout.trim(), err: result.stderr.trim() };
}

async function must(sandbox: SandboxSession, args: string[], what: string): Promise<string> {
  const result = await git(sandbox, args);
  if (!result.ok) throw new Error(`${what} failed: ${result.err || result.out}`);
  return result.out;
}

function canonical(url: string): string {
  const match = GITHUB_URL.exec(url.trim());
  if (!match) throw new Error(`"${url}" is not a repository URL of the form https://github.com/<owner>/<repository>.`);
  return `https://github.com/${match[1]}/${match[2]}`.toLowerCase();
}

// The two commands that reach GitHub: fetch, and reading the default branch.
async function update(run: GitRunner, url: string): Promise<void> {
  const fetched = await run(["fetch", "--prune", "--quiet", "origin"]);
  if (fetched.exitCode !== 0) throw new Error(`fetching ${url} failed: ${fetched.stderr.trim() || fetched.stdout.trim()}`);
  const head = await run(["remote", "set-head", "origin", "--auto"]);
  if (head.exitCode !== 0) throw new Error(`reading the default branch failed: ${head.stderr.trim() || head.stdout.trim()}`);
}

async function updatePrivate(sandbox: SandboxSession, url: string): Promise<void> {
  const [owner, name] = url.replace("https://github.com/", "").split("/");
  const { token } = await mintInstallationToken(gitHubAppFromEnv(), { owner, name }, READ_PERMISSIONS);
  const route = provider === "vercel" ? "window" : "command";
  await withGitHubToken(sandbox, { route, token, hosts: allowedHosts() }, (run) => update(run, url));
}

export default defineTool({
  description: [
    "Clone the repository the user named into the workspace, or fetch it when it is already there,",
    "and check out the branch to work on. Call it at the start of a session, before reading or changing files.",
    "Give the branch when the work continues an existing branch or needs a new one; without it you get the default branch.",
  ].join(" "),
  inputSchema: z.object({
    repository: z.string().min(1).describe("The repository URL, such as https://github.com/owner/name."),
    branch: z.string().min(1).optional().describe("The branch to work on. A new branch starts from the default branch."),
  }),
  // A helper shares this sandbox; switching branches under the root is the root's call.
  availableInSubagents: false,
  async execute({ repository, branch }, ctx) {
    const url = canonical(repository);
    const sandbox = await ctx.getSandbox();
    await extendSandboxTimeout(sandbox);

    const existing = await git(sandbox, ["remote", "get-url", "origin"]);
    let action: "cloned" | "fetched" = "fetched";
    if (!existing.ok) {
      const inside = await git(sandbox, ["rev-parse", "--is-inside-work-tree"]);
      if (inside.ok) throw new Error("The workspace holds a git repository without an origin remote; nothing was changed.");
      await must(sandbox, ["init", "--quiet"], "git init");
      await must(sandbox, ["remote", "add", "origin", `${url}.git`], "git remote add");
      action = "cloned";
    } else if (canonical(existing.out) !== url) {
      throw new Error(`The workspace already holds ${existing.out}; a session works on one repository.`);
    }

    let access: "public" | "private" = "public";
    try {
      await update(async (args) => sandbox.run({ command: `git ${args.map(quote).join(" ")}`, env: { GIT_TERMINAL_PROMPT: "0" } }), url);
    } catch (error) {
      if (!(error instanceof Error && NEEDS_CREDENTIAL.test(error.message))) throw error;
      access = "private";
      await updatePrivate(sandbox, url);
    }
    const defaultBranch = (await must(sandbox, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], "reading the default branch")).replace(/^origin\//, "");

    // Eve stages attachments under .eve/ at the workspace root; keep them out of commits.
    const exclude = await sandbox.run({
      command: "mkdir -p .git/info && { grep -qxF '.eve/' .git/info/exclude 2>/dev/null || echo '.eve/' >> .git/info/exclude; }",
    });
    if (exclude.exitCode !== 0) throw new Error(`excluding .eve/ failed: ${exclude.stderr}`);
    // The sandbox has no git identity of its own; without one the model makes one up each run.
    // The session remembers who supplied it, so the bash tool pins the agent's (ruling 76).
    const owner = (await ensureGitIdentity(sandbox)) ? "agent" : await readIdentityOwner(sandbox);
    identityOwner.update(() => owner);

    const target = branch?.trim() || defaultBranch;
    if (target.startsWith("-")) throw new Error(`"${target}" is not a branch name.`);
    await must(sandbox, ["check-ref-format", "--branch", target], `"${target}" as a branch name`);
    const remote = (await git(sandbox, ["rev-parse", "--verify", "--quiet", `refs/remotes/origin/${target}`])).ok;
    const local = (await git(sandbox, ["rev-parse", "--verify", "--quiet", `refs/heads/${target}`])).ok;

    if (local) {
      await must(sandbox, ["checkout", "--quiet", target], `checking out ${target}`);
      if (remote) {
        const merge = await git(sandbox, ["merge", "--ff-only", "--quiet", `origin/${target}`]);
        if (!merge.ok) throw new Error(`${target} and origin/${target} have diverged; the local branch was left as it is.`);
      }
    } else if (remote) {
      await must(sandbox, ["checkout", "--quiet", "-b", target, "--track", `origin/${target}`], `checking out ${target}`);
    } else {
      await must(sandbox, ["checkout", "--quiet", "--no-track", "-b", target, `origin/${defaultBranch}`], `creating ${target}`);
    }

    const startedFrom =
      target === defaultBranch || (!remote && !local) ? "default branch" : remote ? "remote branch" : "local branch";
    return {
      repository: url,
      branch: target,
      head: await must(sandbox, ["rev-parse", "HEAD"], "reading HEAD"),
      defaultBranch,
      action,
      startedFrom,
      access,
    };
  },
});
