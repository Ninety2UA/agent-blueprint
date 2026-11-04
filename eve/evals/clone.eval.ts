import { execFileSync } from "node:child_process";
import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";
import { GIT_IDENTITY } from "../agent/lib/git-identity";

// The product's own public repository. The tips are read from GitHub when the eval starts,
// so the checks follow the repository rather than a recorded sha.
const REPOSITORY = "https://github.com/Ninety2UA/agent-blueprint";
const BRANCH = "docs/status-4.1.0";
const NEW_BRANCH = "ab/clone-eval-new-branch";

function lsRemote(ref: string): string {
  return execFileSync("git", ["ls-remote", REPOSITORY, ref], { encoding: "utf8" }).trim();
}

function remoteTip(ref: string): string {
  const sha = lsRemote(ref).split(/\s/)[0];
  if (!/^[0-9a-f]{40}$/.test(sha ?? "")) throw new Error(`no tip for ${ref} on ${REPOSITORY}`);
  return sha;
}

const MAIN_TIP = remoteTip("refs/heads/main");
const BRANCH_TIP = remoteTip(`refs/heads/${BRANCH}`);
if (lsRemote(`refs/heads/${NEW_BRANCH}`)) throw new Error(`${NEW_BRANCH} must not exist on ${REPOSITORY}`);

export default defineEval({
  description: "The clone tool puts a public repository at the workspace root and starts a remote branch from its tip.",
  tags: ["mock"],
  async test(t) {
    if (process.env.AB_EVAL_MOCK !== "1") throw new Error("mock-tagged evals need AB_EVAL_MOCK=1");
    const first = await t.send(
      [
        `clone: ${REPOSITORY}`,
        'bash: test "$(git rev-parse --show-toplevel)" = "$(pwd)" && echo "root $(pwd)"',
        "bash: mkdir -p .agent-blueprint && echo probe > .agent-blueprint/probe && cat .agent-blueprint/probe",
        "bash: mkdir -p .eve/eval-probe && touch .eve/eval-probe/file && git status --porcelain",
      ].join("\n"),
    );
    first.calledTool("clone_repository", {
      output: { action: "cloned", branch: "main", head: MAIN_TIP, defaultBranch: "main", startedFrom: "default branch" },
    });
    first.calledTool("bash", { input: { command: /show-toplevel/ }, output: /root \/workspace/ });
    first.calledTool("bash", { input: { command: /probe/ }, output: /probe/ });
    // Eve's own staging folder at the workspace root stays out of the repository's status.
    first.calledTool("bash", { input: { command: /git status/ }, output: (value) => !/\.eve\//.test(JSON.stringify(value)) });

    const second = await first.session.send(
      [`clone: ${REPOSITORY} ${BRANCH}`, "bash: git rev-parse HEAD && git rev-parse --abbrev-ref @{u}"].join("\n"),
    );
    second.calledTool("clone_repository", {
      output: { action: "fetched", branch: BRANCH, head: BRANCH_TIP, startedFrom: "remote branch" },
    });
    second.calledTool("bash", { output: new RegExp(`${BRANCH_TIP}[\\s\\S]*origin/${BRANCH}`) });

    const third = await first.session.send(
      [`clone: ${REPOSITORY} ${NEW_BRANCH}`, `clone: ${REPOSITORY} ${NEW_BRANCH}`].join("\n"),
    );
    third.calledTool("clone_repository", {
      output: { action: "fetched", branch: NEW_BRANCH, head: MAIN_TIP, startedFrom: "default branch" },
      count: 1,
    });
    third.calledTool("clone_repository", {
      output: { action: "fetched", branch: NEW_BRANCH, head: MAIN_TIP, startedFrom: "local branch" },
      count: 1,
    });
    t.check(third.reply, includes(MAIN_TIP));

    // Ruling 76: the clone supplied the identity, so a commit is the agent's whatever the model
    // writes into git's config, from the root and from a helper, which starts with fresh state.
    const ours = `${GIT_IDENTITY.name} <${GIT_IDENTITY.email}>`;
    const pinned = await first.session.send(
      [
        `bash: git -c user.name=Other -c user.email=other@example.com commit -q --allow-empty -m 'chore: identity probe' && git log -1 --format='%an <%ae>|%cn <%ce>'`,
        `bash: git config user.email agent@agent-blueprint.dev && git commit -q --allow-empty -m 'chore: identity probe two' && git log -1 --format='%an <%ae>|%cn <%ce>'`,
        `helper: reviewer bash: git config user.email helper@example.com && git commit -q --allow-empty -m 'chore: helper identity probe' && git log -1 --format='helper %an <%ae>|%cn <%ce>'`,
      ].join("\n"),
    );
    pinned.calledTool("bash", { input: { command: /-c user\.email=other/ }, output: (value) => JSON.stringify(value).includes(`${ours}|${ours}`) });
    pinned.calledTool("bash", { input: { command: /agent@agent-blueprint\.dev/ }, output: (value) => JSON.stringify(value).includes(`${ours}|${ours}`) });
    pinned.calledTool("helper", { output: { status: "completed" } });
    t.check(pinned.reply ?? "", includes(`helper ${ours}|${ours}`)).label("a helper's commit is the agent's too");
    t.succeeded();
  },
});
