import { randomUUID } from "node:crypto";

// The straggler check's process listing, shared by publish_branch and the cap hook: every process
// in the sandbox but PID 1, the listing's own, Docker's keep-alive and Daytona's idle session plumbing
// is something the run started.
//
// The listing runs as `bash -c ': <mark>; ps ...; exit $?'`. The mark lets the parser drop the
// listing's bash and its children. The trailing `exit $?` keeps bash from exec'ing `ps` in place:
// bash replaces itself with the last command of a `-c` string, so on Vercel Sandbox the old
// `bash -c ': <mark>; ps ...'` showed up as a bare `ps -eo pid=,ppid=,args=` row with no mark and
// counted as a straggler on every call (ruling 59). Docker kept the bash parent, which is why the
// local cells passed. As a second guard, a row whose command line is exactly the listing command
// and that has no children is dropped too; any other `ps` the run started still counts.

export interface ProcessInfo {
  readonly pid: number;
  readonly args: string;
}

export interface ProcessRow extends ProcessInfo {
  readonly ppid: number;
}

/** The listing command, exactly as ps prints its own command line. */
export const LISTING = "ps -eo pid=,ppid=,args=";

/** Eve's Docker sandbox keeps its container alive with this command as PID 1's child or PID 1. */
const DOCKER_KEEP_ALIVE = "sleep 2147483647";

/** The shell line that lists the sandbox's processes with this mark on the listing's own shell. */
export function listingCommand(mark: string): string {
  return `bash -c ': ${mark}; ${LISTING}; exit $?'`;
}

export function newMark(): string {
  return `ab-idle-${randomUUID()}`;
}

export function parseRows(stdout: string): ProcessRow[] {
  return stdout
    .split("\n")
    .map((line) => /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line))
    .filter((match) => match !== null)
    .map((match) => ({ pid: Number(match[1]), ppid: Number(match[2]), args: match[3].trimEnd() }));
}

/** The processes the run left running, from the listing's output. */
export function stragglers(stdout: string, mark: string): ProcessInfo[] {
  const rows = parseRows(stdout);
  const own = new Set(rows.filter((row) => row.args.includes(mark)).map((row) => row.pid));
  // Every descendant of the listing's shell, whatever order ps printed them in.
  for (let grew = true; grew; ) {
    grew = false;
    for (const row of rows) {
      if (own.has(row.ppid) && !own.has(row.pid)) {
        own.add(row.pid);
        grew = true;
      }
    }
  }
  const parents = new Set(rows.map((row) => row.ppid));
  const provider = daytonaSessions(rows, own);
  return rows
    .filter(
      (row) =>
        row.pid !== 1 &&
        !own.has(row.pid) &&
        !provider.has(row.pid) &&
        !(row.args === LISTING && !parents.has(row.pid)) &&
        !(row.ppid === 1 && row.args === DOCKER_KEEP_ALIVE),
    )
    .map(({ pid, args }) => ({ pid, args }));
}

/** A Daytona session is a bash under PID 1 kept open by bash children and tail -f /dev/null. */
const DAYTONA_SESSION_SHELL = "/usr/bin/bash";
const DAYTONA_SESSION_PLUMBING = new Set([DAYTONA_SESSION_SHELL, "tail -f /dev/null"]);
/** Daytona's code-run worker, started by the provider under PID 1. */
const DAYTONA_WORKER = "python3 /tmp/daytona_repl_worker.py";

/**
 * Daytona runs every command inside a session (live on Railway, 2026-11-03): the session's shell and
 * its plumbing are the provider's, not the run's. A session counts as the provider's when everything
 * under it is plumbing, apart from the listing's own shell; a session holding anything else (a
 * server the run left behind) counts whole, so stopping it still frees the credential window.
 */
function daytonaSessions(rows: readonly ProcessRow[], own: ReadonlySet<number>): Set<number> {
  const children = new Map<number, ProcessRow[]>();
  for (const row of rows) children.set(row.ppid, [...(children.get(row.ppid) ?? []), row]);
  const provider = new Set<number>();
  for (const row of rows) {
    if (row.ppid === 1 && row.args === DAYTONA_WORKER) provider.add(row.pid);
    if (row.ppid !== 1 || row.args !== DAYTONA_SESSION_SHELL) continue;
    const tree: ProcessRow[] = [];
    const queue = [...(children.get(row.pid) ?? [])];
    while (queue.length) {
      const next = queue.shift()!;
      if (own.has(next.pid)) continue;
      tree.push(next);
      queue.push(...(children.get(next.pid) ?? []));
    }
    if (tree.every((member) => DAYTONA_SESSION_PLUMBING.has(member.args))) {
      provider.add(row.pid);
      for (const member of tree) provider.add(member.pid);
    }
  }
  return provider;
}

/** Masks key-shaped values in a command line before it reaches a log or a reason. */
export function maskArgs(args: string): string {
  return args
    .replace(/\b(gh[pousr]_|github_pat_|xox[abposr]-|sk-|AKIA)[A-Za-z0-9_-]{6,}/g, "$1***")
    .replace(/((?:token|password|passwd|secret|authorization|api[-_]?key)\s*[=:]\s*)("[^"]*"|'[^']*'|\S+)/gi, "$1***")
    .replace(/(bearer\s+)\S+/gi, "$1***")
    .replace(/(https?:\/\/)[^/\s:@]+:[^/\s@]+@/g, "$1***@");
}

/** At most `limit` processes for a reason the person reads; the rest are counted. */
export function describeProcesses(processes: readonly ProcessInfo[], limit = 3): string {
  const shown = processes.slice(0, limit).map((process) => `${process.pid} ${maskArgs(process.args)}`.slice(0, 80));
  const more = processes.length - shown.length;
  return more > 0 ? `${shown.join("; ")}; and ${more} more` : shown.join("; ");
}

/**
 * Lists the sandbox's processes and returns the stragglers. When any is found, the whole listing
 * goes to the log (masked, capped), so a live run shows what else the provider runs in its sandbox.
 */
export async function listStragglers(
  run: (command: string) => PromiseLike<{ stdout: string }>,
  where: string,
): Promise<ProcessInfo[]> {
  const mark = newMark();
  const listed = await run(listingCommand(mark));
  const found = stragglers(listed.stdout, mark);
  if (found.length) {
    const listing = parseRows(listed.stdout)
      .slice(0, 100)
      .map((row) => `${row.pid} ${row.ppid} ${maskArgs(row.args).replaceAll(mark, "<mark>").slice(0, 200)}`);
    console.info(`[${where}] stragglers`, { stragglers: found.map((process) => process.pid), listing });
  }
  return found;
}
