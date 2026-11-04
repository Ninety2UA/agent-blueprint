"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { noticeMessage } from "@/lib/gate/running-chat";
import type { GateStatus } from "@/lib/gate/status";

// The in-chat gate states (the README's "Demo gate" table): token cap, resting, busy, blocked and
// the idle timeout. The chat asks /api/gate when it opens and whenever a turn ends; a state with
// a message disables the composer. The token cap and blocked states offer the pushed branch and
// nothing that continues the run. Busy under this cookie names the real time left and, when this
// browser lists the running chat, offers it (ruling 58), on the new session page and in a refused
// chat alike (ruling 76).

export function useGateStatus(sessionId: string | undefined, settled: unknown): GateStatus | null {
  const [status, setStatus] = useState<GateStatus | null>(null);
  useEffect(() => {
    let live = true;
    readGateStatus(sessionId)
      .then((next) => {
        if (live) setStatus(next);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [sessionId, settled]);
  return status;
}

/** The gate state for this session, or for a new one without a session id; null when none holds. */
export async function readGateStatus(sessionId?: string): Promise<GateStatus | null> {
  const query = sessionId ? `?session=${encodeURIComponent(sessionId)}` : "";
  const response = await fetch(`/api/gate${query}`, { cache: "no-store" });
  const next = response.ok ? ((await response.json()) as GateStatus) : null;
  return next?.state ? next : null;
}

export function GateNotice({
  runningChatHref,
  status,
}: {
  /**
   * Busy under this cookie: the address of the running chat when this browser lists it; the
   * notice then offers it, and otherwise says the browser does not list it.
   */
  readonly runningChatHref?: string | null;
  readonly status: GateStatus;
}) {
  const linkClass = "font-medium text-foreground underline decoration-hair-strong underline-offset-4 hover:decoration-current";
  const action =
    status.actionKind === "branch-link" && status.branchUrl ? (
      <a className={linkClass} href={status.branchUrl} rel="noreferrer" target="_blank">
        {status.action}
      </a>
    ) : status.actionKind === "start-again" ? (
      <a className={linkClass} href="/">
        {status.action}
      </a>
    ) : (
      status.action
    );
  const message = noticeMessage(status, runningChatHref);
  return (
    <div
      className="border border-l-2 border-hair-strong border-l-foreground bg-card px-4 py-3.5 text-[0.9375rem] leading-normal"
      data-gate-state={status.state}
      role="status"
    >
      <p className="m-0 text-foreground">{message}</p>
      {status.why ? <p className="m-0 mt-2 text-sm leading-[1.45] text-muted-foreground">{status.why}</p> : null}
      {runningChatHref ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-3.5 gap-y-2">
          <Link
            className="inline-flex min-h-9 items-center rounded-[var(--r)] bg-signal px-3 text-sm font-semibold text-on-signal no-underline transition-colors duration-[180ms] hover:bg-signal-press focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)] max-sheet:min-h-11"
            href={runningChatHref}
          >
            Open that chat
          </Link>
          <span className="text-sm font-[560] text-ink-2">{action}</span>
        </div>
      ) : (
        <p className="m-0 mt-2 text-sm font-[560] text-ink-2">{action}</p>
      )}
    </div>
  );
}

// The demo opens with three requests sized to reach a pull request within one session's cap on
// the sample repository; free text stays allowed.
export const SUGGESTED_REQUESTS: readonly string[] = [
  "Add a --version flag to the command-line entry point that prints the version from the package, with a test.",
  "Add input validation to the main function so an empty argument gives a clear error message, with a test.",
  "Add a short usage section to the README that shows the two most common commands and their output.",
];
