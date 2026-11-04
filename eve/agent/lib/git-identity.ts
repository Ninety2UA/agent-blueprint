import { defineState } from "eve/context";
import type { SandboxSession } from "eve/sandbox";

// The one git identity the agent commits under when the sandbox has none. The clone tool writes it
// into the clone's local config, so the model never makes one up, and the publish tool's stage
// commit falls back to it. A configured identity, local or global, is left as it is.
export const GIT_IDENTITY = { name: "Agent Blueprint", email: "agent-blueprint@users.noreply.github.com" } as const;

// Ruling 76: config alone did not hold (a live pull request carried an identity the model wrote
// over it), so whenever the agent supplied the identity, every shell command the agent runs carries
// git's identity variables, which outrank user.* config and `git -c user.*`. A deployer's own
// identity is never overridden. The clone's local config also keeps a mark that the agent wrote the
// identity, so a helper, which shares the sandbox but starts with fresh session state, finds it too.
export const IDENTITY_MARK = "agent-blueprint.identity";

/** git's identity variables for GIT_IDENTITY, author and committer both. */
export const GIT_IDENTITY_ENV: Readonly<Record<string, string>> = {
  GIT_AUTHOR_NAME: GIT_IDENTITY.name,
  GIT_AUTHOR_EMAIL: GIT_IDENTITY.email,
  GIT_COMMITTER_NAME: GIT_IDENTITY.name,
  GIT_COMMITTER_EMAIL: GIT_IDENTITY.email,
};

/** Who supplied the repository's identity: the agent, a deployer, or nobody yet (no clone, no identity). */
export type IdentityOwner = "agent" | "deployer" | null;

/** The session's answer, set by the clone tool and cached by the bash tool once the sandbox says "agent". */
export const identityOwner = defineState<IdentityOwner>("agent-blueprint.git-identity", () => null);

export interface OwnerStore {
  get(): IdentityOwner;
  set(owner: IdentityOwner): void;
}

/** Writes GIT_IDENTITY and the mark into the repository's local config when git has no user.email; true when it did. */
export async function ensureGitIdentity(sandbox: Pick<SandboxSession, "run">): Promise<boolean> {
  const email = await sandbox.run({ command: "git config user.email" });
  if (email.stdout.trim()) return false;
  const set = await sandbox.run({
    command: `git config --local user.name '${GIT_IDENTITY.name}' && git config --local user.email '${GIT_IDENTITY.email}' && git config --local ${IDENTITY_MARK} supplied`,
  });
  if (set.exitCode !== 0) throw new Error(`setting the git identity failed: ${(set.stderr || set.stdout).trim()}`);
  return true;
}

/**
 * Reads the owner from the sandbox: "agent" when the mark is there or the identity in effect is
 * GIT_IDENTITY, "deployer" for any other configured identity, null when git has none.
 */
export async function readIdentityOwner(sandbox: Pick<SandboxSession, "run">): Promise<IdentityOwner> {
  const read = await sandbox.run({ command: `printf '%s\\n%s\\n' "$(git config --get ${IDENTITY_MARK})" "$(git config user.email)"` });
  const [mark = "", email = ""] = read.stdout.split("\n").map((line) => line.trim());
  if (mark === "supplied" || email === GIT_IDENTITY.email) return "agent";
  return email ? "deployer" : null;
}

/**
 * The identity variables a shell command carries: GIT_IDENTITY_ENV when the agent supplied the
 * identity, else none. The session's answer is used when it has one; otherwise the sandbox is read,
 * and an "agent" answer is kept for the session's later commands.
 */
export async function identityEnv(sandbox: Pick<SandboxSession, "run">, store: OwnerStore): Promise<Record<string, string>> {
  let owner = store.get();
  if (owner === null) {
    owner = await readIdentityOwner(sandbox);
    if (owner === "agent") store.set(owner);
  }
  return owner === "agent" ? { ...GIT_IDENTITY_ENV } : {};
}

/** The sandbox with these variables added to every command it runs or spawns; they win over the command's own. */
export function withEnv<S extends Pick<SandboxSession, "run" | "spawn">>(sandbox: S, env: Readonly<Record<string, string>>): S {
  return Object.assign(Object.create(sandbox) as S, {
    run: (options: Parameters<SandboxSession["run"]>[0]) => sandbox.run({ ...options, env: { ...options.env, ...env } }),
    spawn: (options: Parameters<SandboxSession["spawn"]>[0]) => sandbox.spawn({ ...options, env: { ...options.env, ...env } }),
  });
}
