import { defineTool, type ToolContext } from "eve/tools";
import { bash, type BashToolOutput } from "eve/tools/bash";
import { identityEnv, identityOwner, withEnv, type OwnerStore } from "../lib/git-identity";
import { bashDenial } from "../lib/wrappers/bash";

// Eve's bash with two denials (KTD3, R4, R10): git push and gh pr create, which only the
// publish tool runs, and a git commit whose message fails the Conventional Commits check
// of validate-commit.js. Denial is the approval policy's, with the reason the model reads.
// When the agent supplied the git identity, every command carries git's identity variables
// (ruling 76), so a commit is the agent's whatever the model writes into the config.
const sessionOwner: OwnerStore = { get: () => identityOwner.get(), set: (owner) => identityOwner.update(() => owner) };

/** The context Eve's bash runs with: the same, with a sandbox that adds the identity variables when they apply. */
export async function withIdentity(ctx: ToolContext, store: OwnerStore): Promise<ToolContext> {
  const sandbox = await ctx.getSandbox();
  const env = await identityEnv(sandbox, store);
  if (!Object.keys(env).length) return ctx;
  const wrapped = withEnv(sandbox, env);
  return Object.assign(Object.create(ctx) as ToolContext, { getSandbox: async () => wrapped });
}

export default defineTool({
  ...bash,
  approval: ({ toolInput }) => {
    const reason = bashDenial(String(toolInput?.command ?? ""));
    return reason ? { type: "denied", reason } : "not-applicable";
  },
  // Eve's bash resolves to one output; it never streams.
  async execute(input, ctx) {
    return (await bash.execute(input, await withIdentity(ctx, sessionOwner))) as BashToolOutput;
  },
});
