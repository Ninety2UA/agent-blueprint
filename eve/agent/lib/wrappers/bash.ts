// The bash wrapper's rules (KTD3, R10): the shell never publishes, and a commit message
// must pass the Conventional Commits check of hooks/handlers/validate-commit.js.

/** The one tool that pushes a branch and opens its pull request (KTD5). */
export const PUBLISH_TOOL = "publish_branch";

// `git [global options] push` and `gh [global options] pr create` anywhere in the command,
// so a push chained after `&&`, run in a subshell or with `git -C <dir>` is caught too.
const GIT_PUSH = /(?:^|[^\w./-])(?:[\w./-]*\/)?git(?:\s+(?:-[Cc]\s+\S+|--?[\w-]+(?:=\S+)?))*\s+push(?![\w-])/;
const GH_PR_CREATE = /(?:^|[^\w./-])(?:[\w./-]*\/)?gh(?:\s+(?:--?[\w-]+(?:[= ]\S+)?))*\s+pr\s+create(?![\w-])/;

/** The denial for a shell command that pushes or opens a pull request, or null. */
export function publishDenial(command: string): string | null {
  const what = GIT_PUSH.test(command) ? "git push" : GH_PR_CREATE.test(command) ? "gh pr create" : null;
  if (!what) return null;
  return (
    `${what} does not run from the shell here. Publish with the ${PUBLISH_TOOL} tool: ` +
    "it lists the outgoing commits, scans them for secrets, pushes the branch and opens the pull request."
  );
}

const VALID_TYPES = ["feat", "fix", "docs", "style", "refactor", "perf", "test", "build", "ci", "chore"];
const MAX_SUBJECT_LEN = 72;

// The handler's extraction: only a command that starts as a git commit, and only a message
// given with -m or in a heredoc; an interactive commit has nothing to check.
export function extractCommitSubject(command: string): string | null {
  if (!/^\s*(?:[A-Z_]+=\S+\s+)*git\s+commit\b/.test(command)) return null;
  const dashM = command.match(/-m\s+(?:(["'])((?:\\.|(?!\1).)*)\1)/);
  if (dashM) return dashM[2].split("\n")[0];
  const heredoc = command.match(/<<['"]?(\w+)['"]?\s*\n([\s\S]*?)\n\s*\1\b/);
  if (heredoc) return heredoc[2].split("\n").find((line) => line.trim().length > 0) ?? null;
  return null;
}

/** The handler's findings for a commit subject; empty when it passes. */
export function commitIssues(subject: string): string[] {
  const match = /^(?<type>[a-z]+)(?:\((?<scope>[^)]+)\))?(!)?:\s+(?<rest>.+)$/.exec(subject);
  if (!match?.groups) return ["subject does not match `type(scope): description`"];
  const issues: string[] = [];
  const { type, rest } = match.groups;
  if (!VALID_TYPES.includes(type)) issues.push(`unknown type "${type}" (expected: ${VALID_TYPES.join(", ")})`);
  if (subject.length > MAX_SUBJECT_LEN) issues.push(`subject is ${subject.length} chars (max ${MAX_SUBJECT_LEN})`);
  if (!rest || rest.length < 3) issues.push("subject body too short");
  return issues;
}

/** The denial for a commit whose message fails the check, with the handler's reason, or null. */
export function commitDenial(command: string): string | null {
  const subject = extractCommitSubject(command);
  if (subject === null) return null;
  const issues = commitIssues(subject);
  if (issues.length === 0) return null;
  return (
    `COMMIT MESSAGE CHECK: ${issues.join("; ")}. ` +
    "Format: type(scope): subject. " +
    `Valid types: ${VALID_TYPES.join(", ")}. Subject <= ${MAX_SUBJECT_LEN} chars. ` +
    "The commit did not run: fix the message and commit again."
  );
}

/** The bash wrapper's denial for a command, or null when it may run. */
export function bashDenial(command: string): string | null {
  return publishDenial(command) ?? commitDenial(command);
}
