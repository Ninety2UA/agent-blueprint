import { ChevronRightIcon, ExternalLinkIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { RunStage, RunView } from "@/lib/chat/run";
import { branchUrl } from "@/lib/gate/states";
import { cn } from "@/lib/utils";
import { DEMO_BOT } from "./title-block";

// The standing run panel (the approved chat C3, ruling 58): the sheet's title, the sample
// repository, the branch, the stages and the bot the pull requests open as, beside the
// conversation from 861 px; below that the same cells fold into a one-line strip under the top
// bar that opens to show them. Every value comes from the chat's own messages (lib/chat/run.ts)
// or the shell; before the first push the branch shows its pattern. The repository and the bot
// are the demo's.

export interface RunPanelProps {
  readonly demo: boolean;
  readonly repository: string | null;
  readonly run: RunView;
  /** The sheet's title: the chat's title, or "New session". */
  readonly title: string;
}

export function RunPanel({ className, ...props }: RunPanelProps & { readonly className?: string }) {
  return (
    <aside aria-label="The run" className={cn("min-h-0 overflow-y-auto border-l border-border bg-muted", className)} data-run-panel>
      <RunCells {...props} />
    </aside>
  );
}

export function RunStrip({ className, ...props }: RunPanelProps & { readonly className?: string }) {
  const { run, title } = props;
  const current = run.current;
  return (
    <details className={cn("group/strip border-b border-border bg-muted", className)} data-run-strip>
      <summary className="flex cursor-pointer list-none items-center gap-2.5 px-4 py-2.5 text-sm focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--focus)] [&::-webkit-details-marker]:hidden">
        {run.direct ? null : (
          <span aria-hidden="true" className="flex shrink-0 gap-[3px]">
            {run.stages.map((stage, index) => (
              <i
                className={cn(
                  "block h-1 w-3.5",
                  stage.state === "todo" && "bg-hair-strong",
                  stage.state === "done" && (index === run.stages.length - 1 ? "bg-signal" : "bg-foreground"),
                  stage.state === "now" && "bg-signal",
                  stage.state === "stopped" && "bg-[var(--accent-wash)] outline outline-1 -outline-offset-1 outline-signal",
                )}
                key={stage.name}
              />
            ))}
          </span>
        )}
        <span className="min-w-0 flex-1 truncate">
          {run.direct ? (
            <b className="font-semibold">Straight to a pull request</b>
          ) : current ? (
            <>
              <b className="font-semibold">{current.label}</b>, {lowerFirst(current.status)}
            </>
          ) : (
            <b className="font-semibold">{title}</b>
          )}
        </span>
        <ChevronRightIcon aria-hidden="true" className="size-3 shrink-0 transition-transform duration-[160ms] group-open/strip:rotate-90 motion-reduce:transition-none" />
      </summary>
      <div aria-label="The run" role="region">
        <RunCells {...props} compact />
      </div>
    </details>
  );
}

function RunCells({ compact = false, demo, repository, run, title }: RunPanelProps & { readonly compact?: boolean }) {
  const branchHref = run.branch ? branchUrl(repository ?? run.repository, run.branch) : null;
  return (
    <>
      <Cell compact={compact} label="Sheet">
        <h2 className="m-0 text-base leading-[1.35] font-semibold tracking-normal [font-stretch:100%]">{title}</h2>
      </Cell>
      {demo && repository ? (
        <Cell compact={compact} label="Repository">
          <a
            className="font-mono text-[0.8125rem] font-medium [overflow-wrap:anywhere] underline decoration-hair-strong underline-offset-[0.2em] hover:decoration-current"
            href={`https://github.com/${repository}`}
          >
            {repository}
          </a>
        </Cell>
      ) : null}
      <Cell compact={compact} label="Branch">
        {run.branch ? (
          branchHref ? (
            <a className="block underline decoration-hair-strong underline-offset-[0.2em] hover:decoration-current" href={branchHref} rel="noreferrer" target="_blank">
              <code className="block text-xs leading-normal [overflow-wrap:anywhere] text-foreground">{run.branch}</code>
            </a>
          ) : (
            <code className="block text-xs leading-normal [overflow-wrap:anywhere]">{run.branch}</code>
          )
        ) : (
          <code className="text-[0.8125rem] text-muted-foreground">ab/&lt;feature&gt;-&lt;session&gt;</code>
        )}
      </Cell>
      <Cell compact={compact} label="Stages">
        {run.direct ? (
          <p className="m-0 mt-1 text-[0.9375rem] leading-[1.4] font-[560]" data-run-direct>
            Went straight to a pull request
            <span className="mt-0.5 block text-[0.8125rem] font-normal text-muted-foreground">This run recorded no stages.</span>
          </p>
        ) : (
          <ol className="relative m-0 mt-2 list-none p-0">
            {run.stages.map((stage, index) => (
              <StageRow key={stage.name} last={index === run.stages.length - 1} stage={stage} />
            ))}
          </ol>
        )}
      </Cell>
      {demo || run.pullRequest ? (
        <Cell compact={compact} label={demo ? "Pull requests open as" : "Pull request"}>
          {demo ? <span className="text-[0.9375rem] font-[560] [overflow-wrap:anywhere]">{DEMO_BOT}</span> : null}
          {run.pullRequest ? (
            <div className="flex flex-wrap gap-1.5">
              <a
                className="mt-2 inline-flex min-h-9 items-center gap-2 rounded-[var(--r)] bg-signal px-3 text-sm font-semibold text-on-signal no-underline transition-colors duration-[180ms] hover:bg-signal-press focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)] max-sheet:min-h-11"
                href={run.pullRequest.url}
                rel="noreferrer"
                target="_blank"
              >
                Pull request #{run.pullRequest.number}
                <ExternalLinkIcon aria-hidden="true" className="size-4 shrink-0" />
              </a>
              {branchHref ? (
                <a
                  className="mt-2 inline-flex min-h-9 items-center rounded-[var(--r)] border border-line-ui px-3 text-sm font-[560] text-foreground no-underline transition-colors duration-[180ms] hover:border-foreground hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)] max-sheet:min-h-11"
                  href={branchHref}
                  rel="noreferrer"
                  target="_blank"
                >
                  Open the branch
                </a>
              ) : null}
            </div>
          ) : null}
        </Cell>
      ) : null}
    </>
  );
}

function StageRow({ last, stage }: { readonly last: boolean; readonly stage: RunStage }) {
  const done = stage.state === "done";
  const now = stage.state === "now";
  const stopped = stage.state === "stopped";
  return (
    <li
      className={cn(
        "relative grid grid-cols-[20px_minmax(0,1fr)] gap-x-2.5 pb-3.5",
        !last && "before:absolute before:top-4 before:bottom-0 before:left-1.5 before:w-px before:content-['']",
        !last && (done ? "before:bg-foreground" : "before:bg-hair-strong"),
      )}
      data-stage={stage.name}
      data-stage-state={stage.state}
    >
      <span
        aria-hidden="true"
        className={cn(
          "relative mt-1 size-[13px] rounded-full border-[1.25px] border-hair-strong bg-muted",
          done && (last ? "border-signal bg-signal" : "border-foreground bg-foreground"),
          now && "border-signal after:absolute after:inset-0.5 after:rounded-full after:bg-signal after:content-[''] motion-safe:after:animate-[shimmer-text_1.4s_var(--ease-out)_infinite_alternate]",
          stopped && "rounded-[2px] border-signal bg-[var(--accent-wash)]",
        )}
      />
      <span
        className={cn(
          "text-[0.9375rem] leading-[1.4] font-semibold",
          stage.state === "todo" && "font-medium text-muted-foreground",
          now && "text-signal",
        )}
      >
        {stage.label}
        {stage.status ? <span className={cn("block text-[0.8125rem] font-normal", stopped ? "text-ink-2" : "text-muted-foreground")}>{stage.status}</span> : null}
      </span>
    </li>
  );
}

/**
 * The run-end notice after a helper's stop (ruling 139), off the demo: the demo's gate notice says
 * it there. The words are the ones Linear and Telegram post, with the branch to open.
 */
export function RunStopNotice({ repository, run }: { readonly repository: string | null; readonly run: RunView }) {
  if (!run.stopped) return null;
  const branchHref = run.branch ? branchUrl(repository ?? run.repository, run.branch) : null;
  return (
    <div className="border border-l-2 border-hair-strong border-l-signal bg-card px-4 py-3.5 text-[0.9375rem] leading-normal" data-run-stopped role="status">
      <p className="m-0 text-foreground">{run.stopped.notice}</p>
      {branchHref ? (
        <a
          className="mt-3 inline-flex min-h-9 items-center rounded-[var(--r)] border border-line-ui px-3 text-sm font-[560] text-foreground no-underline transition-colors duration-[180ms] hover:border-foreground hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)] max-sheet:min-h-11"
          href={branchHref}
          rel="noreferrer"
          target="_blank"
        >
          Open the branch
        </a>
      ) : null}
    </div>
  );
}

function Cell({ children, compact, label }: { readonly children: ReactNode; readonly compact: boolean; readonly label: string }) {
  return (
    <div className={cn("border-b border-border", compact ? "px-4 py-2.5" : "px-5 py-3.5")}>
      <span className="mb-[3px] block text-[0.8125rem] leading-[1.3] text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function lowerFirst(text: string | null): string {
  if (!text) return "";
  return text.charAt(0).toLowerCase() + text.slice(1).replace(/ to the branch$/, "");
}
