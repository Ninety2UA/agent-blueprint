// The demo's one repository (KTD13): AB_DEMO_REPOSITORY as owner/name, the sample when unset. The
// agent is told every request is about it (instructions/demo.ts), the web chat names it in a new
// session's title block (apps/web/app/(chat)/layout.tsx) and the cleanup works on it
// (demo-cleanup.ts). Off the demo, none.

export const DEFAULT_DEMO_REPOSITORY = "Ninety2UA/agent-blueprint-sample";

type Env = Record<string, string | undefined>;

/** The demo's repository as owner/name; null off the demo or when the variable is not owner/name. */
export function demoRepository(env: Env = process.env): string | null {
  if (env.AB_DEMO !== "1") return null;
  const repository = env.AB_DEMO_REPOSITORY?.trim() || DEFAULT_DEMO_REPOSITORY;
  return /^[\w.-]+\/[\w.-]+$/.test(repository) ? repository : null;
}

/** The URL the demo's instruction names, in backticks; the scripted mock reads it back. */
export const DEMO_REPOSITORY_URL = /works on one repository, `(https:\/\/github\.com\/[^`]+)`/;

/**
 * The demo's standing rule, added to the root's system instructions on the demo only: every request
 * is about the demo's repository, cloned first and never asked about. The clone tool accepts any
 * github.com repository, but the demo's GitHub App publishes only where it is installed, so a
 * visitor who names another repository is told so and the work stays on the demo's. BACKLOG.md
 * stays out of a visitor's pull request and the follow-ups go into its body (ruling 78); the
 * publish tool also refuses any demo push that changes it.
 */
export function demoInstructions(env: Env = process.env): string | null {
  const repository = demoRepository(env);
  if (!repository) return null;
  return [
    "## The demo",
    "",
    `This is Agent Blueprint's public demo, and it works on one repository, \`https://github.com/${repository}\`. Every request a visitor sends is about that repository, whether or not they name it. Call \`clone_repository\` with that URL before anything else, and never ask which repository to work on. When a visitor names another repository, say in one line that this demo works on ${repository} only, then do the request there.`,
    "",
    "Leave `BACKLOG.md` out of a visitor's pull request: on this demo, never create or change it, even where a skill says to. Pass each follow-up you would have written there, and each one a helper returns, to `publish_branch` as `followUps` in the pull-request call, and the pull request body lists them.",
  ].join("\n");
}

/**
 * The demo text for one session (review #6). A helper (a session with a parent) never clones, so it
 * gets only the BACKLOG.md rule, worded for a helper: the skills that write BACKLOG.md
 * (ab-review-swarm's Defer, ab-executing-plans, ab-scope-cutting) mostly run in helpers. The root
 * gets demoInstructions. Off the demo, none.
 */
export function demoInstructionsFor(session: { readonly parent?: unknown }, env: Env = process.env): string | null {
  if (!session.parent) return demoInstructions(env);
  if (!demoRepository(env)) return null;
  return [
    "## The demo",
    "",
    "On Agent Blueprint's public demo, a visitor's pull request leaves `BACKLOG.md` out, so never create or change `BACKLOG.md`, even where a skill says to. Return each follow-up you would have written there in your reply, and the lead passes it to `publish_branch` as `followUps`.",
  ].join("\n");
}
