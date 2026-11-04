// Releases this server's running workflow jobs when a redeploy stops it (ruling 91, fix A). Railway stops a
// container with one SIGTERM, and eve's start command passes it to the server once and SIGKILLs the server
// 20 s later. graphile-worker 0.16.6, which world-postgres runs here with its own signal handlers, waits for
// a running job on that first signal and unlocks it for retry only on its forceful path, which it arms 5 s
// later and which needs another termination signal. None comes, so the job stays locked by a dead worker,
// and the next container waits out the step's 860 s ownership lease before it runs the step again.
//
// The handler sends that signal itself just after graphile's switch. graphile then fails the jobs its own
// workers hold (by locked_by, so another instance's jobs are never touched) and signals the process again,
// and the handler exits on that signal. It has to: srvx's SIGTERM listener stays attached, so graphile's
// self-signal alone does not end the process, and the half-done step would run on while the next container
// runs it again. A job that finishes before the switch ends graphile's graceful shutdown with the same
// self-signal. The exit at 15 s stays below eve's SIGKILL, and the 860 s lease still recovers a crash.
// eve's sandboxShutdownPlugin calls process.exit(143) on the same SIGTERM once its sandbox stops settle,
// which can be at once, before graphile's switch. Its exit comes after an await, so the handler, which
// runs on that same signal, holds every process.exit call from then on until graphile's release signal
// or the 15 s exit, and then exits 0.
// WORKFLOW_POSTGRES_APPLICATION_MANAGED_SHUTDOWN=1 would take graphile's handlers away instead, but
// world-postgres keeps its graphile runner private and its close() shuts graphile down gracefully, which
// waits for the job and unlocks nothing. graphile's own forceful path is the one that releases the jobs.

/** Just past graphile's 5 s switch to its forceful handler. */
export const FORCE_AFTER_MS = 5_500;
/** The latest exit, below eve's 20 s SIGKILL. */
export const EXIT_BY_MS = 15_000;

/** The parts of the process the handler uses. */
export interface SignalledProcess {
  readonly pid: number;
  on(event: "SIGTERM", listener: () => void): unknown;
  kill(pid: number, signal: "SIGTERM"): unknown;
  exit(code: number): void;
}

// Marks a process the handler is already installed on, shared across bundled copies of this module: a second
// install would keep its own counter and take the first one's signal for graphile's, exiting too early.
const INSTALLED = Symbol.for("agent-blueprint.sigterm-release");

interface Timers {
  setTimeout(callback: () => void, ms: number): unknown;
}

/** Installs the SIGTERM handler. The Postgres world's factory calls it; no other build loads this module. */
export function releaseJobsOnSigterm(proc: SignalledProcess = process, timers: Timers = globalThis): void {
  const marked = proc as SignalledProcess & { [INSTALLED]?: true };
  if (marked[INSTALLED]) return;
  marked[INSTALLED] = true;
  let stopping = false;
  // Signals this handler sent that have not come back to it yet; each reaches every listener, itself too.
  let ownInFlight = 0;
  // The real process.exit, taken on the first SIGTERM before it is held.
  let exit: (code: number) => void = () => {};
  const unref = (timer: unknown) => (timer as { unref?(): void }).unref?.();
  proc.on("SIGTERM", () => {
    if (!stopping) {
      stopping = true;
      exit = proc.exit.bind(proc);
      proc.exit = () => {};
      unref(timers.setTimeout(() => {
        ownInFlight++;
        proc.kill(proc.pid, "SIGTERM");
      }, FORCE_AFTER_MS));
      unref(timers.setTimeout(() => exit(0), EXIT_BY_MS));
      return;
    }
    if (ownInFlight > 0) {
      ownInFlight--;
      return;
    }
    // graphile's signal after it released the jobs, or after the job finished.
    exit(0);
  });
}
