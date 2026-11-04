import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { EveEvalToolCall } from "eve/evals";

// Shared by the mocked ship loop evals (ship-loop.eval.ts, resume.eval.ts). The repository is made
// inside the sandbox with origin naming github.com, and the bare repository publish_branch pushes to
// under AB_EVAL_MOCK=1 sits beside it in /tmp, seeded with the base, so no network and no token are used.

/** The feature request: the first line of the first message, which names the run's branch. */
export const FEATURE = "Add a greeting script to the widgets repository.";
export const BRANCH = /^ab\/add-a-greeting-script-to-the-widgets-[a-z0-9]{1,8}$/;

/** The product version the runtime reads, which state.json's provenance must name. */
export const VERSION = (JSON.parse(readFileSync(join(process.cwd(), "..", "package.json"), "utf8")) as { version: string }).version;

const GIT_ENV = "GIT_AUTHOR_NAME=eval GIT_AUTHOR_EMAIL=eval@example.com GIT_COMMITTER_NAME=eval GIT_COMMITTER_EMAIL=eval@example.com";

export const SETUP = [
  "bash: git init -q -b main",
  "git config user.name eval && git config user.email eval@example.com",
  "mkdir -p .git/info && echo '.eve/' >> .git/info/exclude",
  "echo widgets > README.md && git add README.md",
  `${GIT_ENV} git commit -q -m seed`,
  "git remote add origin https://github.com/acme/widgets",
  "git update-ref refs/remotes/origin/main HEAD && git symbolic-ref refs/remotes/origin/HEAD refs/remotes/origin/main",
  "git checkout -q -b work",
  "mkdir -p .agent-blueprint && printf 'run/\\nteam/\\nreview-runs/\\ncache/\\n.gitignore\\n' > .agent-blueprint/.gitignore",
  "git init -q --bare /tmp/ab-eval-remote/acme--widgets.git && git -C /tmp/ab-eval-remote/acme--widgets.git fetch -q \"$PWD\" main:refs/heads/main",
  "echo repository-ready",
].join(" && ");

/** The bare repository publish_branch and the cap hook push acme/<name> to under AB_EVAL_MOCK=1. */
export const remoteFor = (name: string) => `/tmp/ab-eval-remote/acme--${name}.git`;

/** SETUP for a repository of its own, acme/<name>, so cells in other sessions never share a remote. */
export const setupFor = (name: string) => SETUP.replaceAll("acme/widgets", `acme/${name}`).replaceAll("acme--widgets", `acme--${name}`);

/** A copy's bash line that writes a file whole, base64 in the command so no quoting gets in the way. */
export function writeLine(path: string, text: string, marker: string): string {
  const bytes = Buffer.from(text).toString("base64");
  return `bash: mkdir -p "$(dirname ${path})" && echo ${bytes} | base64 -d > ${path} && echo ${marker}`;
}

/** A copy's bash line that writes state.json as the skill does, with every field the runner checks. */
export function stateLine(fields: { status: string; stage: string; reason?: string; decisions?: object[] }): string {
  const state = {
    status: fields.status,
    stage: fields.stage,
    iteration: 1,
    host: "eve",
    driver: "runner",
    session_id: "ab-greeting-eval",
    decisions: fields.decisions ?? [],
    provenance: { skill: "ab-ship-pipeline", version: VERSION },
    reason: fields.reason ?? "",
    updated_at: "2026-10-29T10:00:00Z",
  };
  return writeLine(".agent-blueprint/run/state.json", JSON.stringify(state), `state-${fields.stage}-${fields.status}`);
}

export const COMMIT_LINE = `bash: echo 'echo hello' > greet.sh && git add greet.sh && ${GIT_ENV} git commit -q -m 'feat(greet): add the greeting script' && echo committed`;

/** The pull request body the tool reads, written as the skill writes it. */
export const BODY_LINE = writeLine(".agent-blueprint/run/pr-body.md", "Adds a greeting script.\n", "body-written");

/**
 * Script lines that leave acme/<name> ready for a pull request: the repository, one commit and the
 * body. publish_branch's approval policy asks a person only then (ruling 59), so a cell that wants
 * the approval to open runs these before `publish: pull-request`.
 */
export const readyFor = (name: string): string[] => [setupFor(name), COMMIT_LINE, BODY_LINE];

/** The outputs of a tool's calls in a turn, in call order. */
export function outputs(turn: { toolCalls: readonly EveEvalToolCall[] }, name: string): Record<string, unknown>[] {
  return turn.toolCalls.filter((call) => call.name === name).map((call) => (call.output ?? {}) as Record<string, unknown>);
}
