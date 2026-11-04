import type { ReactNode } from "react";
import { SUGGESTED_REQUESTS } from "./gate-notice";

/** The GitHub App the demo's pull requests open as. */
export const DEMO_BOT = "agent-blueprint-demo[bot]";

// The new session's start (the approved chat C3, ruling 58): the sheet's title, one line on the
// sample repository, and the three suggested requests as an ordered list, centred in the
// conversation column; the composer docks below it and the run panel stands beside it. A gate
// state (resting, busy) takes the requests' place. The line and the requests are the demo's; a
// deployer's copy shows the title.
export function SessionStart({
  demo,
  notice,
  onPick,
}: {
  readonly demo: boolean;
  /** A gate state shown in place of the requests (resting, busy). */
  readonly notice?: ReactNode;
  /** Sends a suggested request; the list shows only on the demo and only with this. */
  readonly onPick?: (request: string) => void;
}) {
  return (
    <section aria-labelledby="sheet-title" data-session-start>
      <h1
        className="m-0 text-[clamp(1.5rem,1.2rem+1vw,1.875rem)] leading-[1.1] font-[650] tracking-[-0.015em] [font-stretch:112%]"
        id="sheet-title"
      >
        New session
      </h1>
      {demo ? (
        <p className="m-0 mt-2.5 max-w-[60ch] text-base leading-[1.55] text-ink-2">
          The agent works on the sample repository, a small Python package with two commands and
          tests. Name a change, and each stage is pushed to a branch as it finishes.
        </p>
      ) : null}
      {notice ? <div className="mt-[22px]">{notice}</div> : null}
      {demo && onPick && !notice ? <SuggestedRequests onPick={onPick} /> : null}
    </section>
  );
}

// The three requests as a real ordered list; each row is a control that sends its request.
export function SuggestedRequests({ onPick }: { readonly onPick: (request: string) => void }) {
  return (
    <div className="mt-[22px]" data-gate-suggestions>
      <h2 className="m-0 mb-1 text-[0.8125rem] leading-[1.15] font-[560] tracking-normal text-muted-foreground [font-stretch:100%]">
        Suggested requests
      </h2>
      <ol className="m-0 list-none p-0 [&>li]:border-t [&>li:last-child]:border-b">
        {SUGGESTED_REQUESTS.map((request, index) => (
          <li key={request}>
            <button
              className="grid w-full grid-cols-[24px_minmax(0,1fr)] gap-x-2.5 border-0 bg-transparent px-1 py-[11px] text-left text-[0.9375rem] leading-[1.45] text-foreground transition-colors duration-[180ms] hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--focus)]"
              onClick={() => onPick(request)}
              type="button"
            >
              <span aria-hidden="true" className="text-muted-foreground tabular-nums">
                {index + 1}.
              </span>
              <span>{request}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
