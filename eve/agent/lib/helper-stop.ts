import { classifyFailure } from "./failure";

// Whether a helper's result ended its root's run off the demo: the rule cap-guard's call.settled
// applies when the helper's call settles, read again after the turn by the hook's push, the
// channels' run-end notices and the web chat. It imports only the failure rule, so the web chat
// can use it.

/** The helper tool's result as the stop rules read it. */
export function helperResult(output: unknown): { readonly status?: unknown; readonly interrupted?: unknown; readonly message: string } {
  const result = (output ?? {}) as { status?: unknown; error?: unknown; interrupted?: unknown };
  return { status: result.status, interrupted: result.interrupted, message: typeof result.error === "string" ? result.error : "" };
}

/** A helper cancelled by the cap hook, not by a person's message, or failed on a rate limit or a sandbox. */
export function helperStopsRun(output: unknown): boolean {
  const result = helperResult(output);
  if (result.status === "cancelled") return !result.interrupted;
  if (result.status !== "failed") return false;
  const failure = classifyFailure({ message: result.message });
  return failure === "rate-limited" || failure === "sandbox";
}
