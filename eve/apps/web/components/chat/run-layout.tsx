"use client";

import type { ReactNode } from "react";
import { useChatShell } from "@/app/_components/chat-shell-context";
import type { RunView } from "@/lib/chat/run";
import { RunPanel, RunStrip } from "./run-panel";

// The chat's canvas (the approved chat C3, ruling 58): the conversation column, its scrolling
// thread over the docked composer, beside the standing run panel from 861 px; below that the run
// folds into the strip above the conversation.
export function RunLayout({
  children,
  dock,
  run,
  title,
}: {
  /** The conversation's scrolling area. */
  readonly children: ReactNode;
  /** The composer, docked under the conversation. */
  readonly dock: ReactNode;
  readonly run: RunView;
  readonly title: string;
}) {
  const { demoRepository, setupStatus } = useChatShell();
  const panel = { demo: setupStatus.demo, repository: demoRepository, run, title };
  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[auto_minmax(0,1fr)] sheet:grid-cols-[minmax(0,1fr)_340px] sheet:grid-rows-1">
      <RunStrip {...panel} className="sheet:hidden" />
      <div className="flex min-h-0 min-w-0 flex-col">
        {children}
        <div className="shrink-0 px-[clamp(16px,3vw,40px)] pt-3 pb-[clamp(12px,2vh,20px)] max-sheet:px-4">
          <div className="mx-auto w-full max-w-[660px]">{dock}</div>
        </div>
      </div>
      <RunPanel {...panel} className="hidden sheet:block" />
    </div>
  );
}

/** The conversation column's measure: 660 px, inside the column's gutters. */
export const THREAD = "mx-auto w-[min(660px,calc(100%-2*clamp(16px,3vw,40px)))] max-sheet:w-[calc(100%-32px)]";
