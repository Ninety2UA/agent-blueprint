"use client";

import type { EveToolPart, EveMessage, EveMessagePart } from "eve/react";
import { ChevronDownIcon, ChevronRightIcon, CheckIcon, Loader2Icon, XIcon } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Mark } from "@/components/brand/mark";
import { ChatComposer } from "@/components/chat/composer";
import { Markdown } from "@/components/chat/markdown";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { stageSuffix, type RunView } from "@/lib/chat/run";
import { cn } from "@/lib/utils";

// A turn as the approved chat C3 sets it (ruling 58): a "You" line over the visitor's words, the
// agent's work under its own name and mark, the tool calls folded into one line per group, a
// rule where ship_pipeline begins a stage ("Plan, pushed"), and a checkpoint question as its own
// card whose reply box is the composer.

const STREAM_TEXT_TICK_MS = 60;
const STREAM_TEXT_CACHE_LIMIT = 40;
const streamingTextCache = new Map<string, string>();

export type AgentAnswer = {
  readonly optionId?: string;
  readonly interactionId: string;
  readonly text?: string;
};

export function AgentMessage({
  canRespond,
  message,
  onAnswers,
  run,
}: {
  readonly canRespond: boolean;
  readonly message: EveMessage;
  readonly onAnswers: (responses: readonly AgentAnswer[]) => void | Promise<void>;
  /** The run the conversation tells, for the stage rules' words. */
  readonly run?: RunView;
}) {
  const isUser = message.role === "user";

  return (
    <article
      className={cn("min-w-0 text-[0.9375rem] leading-[1.6] text-foreground", message.metadata?.optimistic ? "opacity-90" : undefined)}
    >
      {isUser ? <Who>You</Who> : null}
      <AgentMessageParts
        canRespond={canRespond}
        isUser={isUser}
        messageId={message.id}
        onAnswers={onAnswers}
        parts={message.parts}
        run={run}
      />
    </article>
  );
}

/** The author line: "You", or the agent's mark and name. */
function Who({ agent = false, children }: { readonly agent?: boolean; readonly children: ReactNode }) {
  return (
    <p className="m-0 flex items-center gap-2 text-[0.8125rem] leading-[1.5] font-semibold">
      {agent ? <Mark className="size-4 shrink-0" /> : null}
      {children}
    </p>
  );
}

/** The rule where a stage begins, with how it stands: "Plan, pushed". */
function StageRule({ label, suffix }: { readonly label: string; readonly suffix: string | null }) {
  return (
    <p className="mt-[22px] mb-2 flex items-center gap-2.5 text-[0.8125rem] text-muted-foreground before:h-px before:flex-[0_0_18px] before:bg-hair-strong before:content-[''] after:h-px after:flex-1 after:bg-hair-strong after:content-['']">
      <span>
        <b className="font-semibold text-ink-2">{label}</b>
        {suffix ? `, ${suffix}` : null}
      </span>
    </p>
  );
}

function AgentMessageParts({
  canRespond,
  isUser,
  messageId,
  onAnswers,
  parts,
  run,
}: {
  readonly canRespond: boolean;
  readonly isUser: boolean;
  readonly messageId: string;
  readonly onAnswers: (responses: readonly AgentAnswer[]) => void | Promise<void>;
  readonly parts: readonly EveMessagePart[];
  readonly run?: RunView;
}) {
  const elements: ReactNode[] = [];
  let pendingTools: EveToolPart[] = [];
  // The agent's name opens its message and each stage, before the first thing it shows there.
  let needsWho = !isUser;
  const push = (element: ReactNode, key: string) => {
    if (needsWho) {
      elements.push(<Who agent key={`who:${key}`}>Agent Blueprint</Who>);
      needsWho = false;
    }
    elements.push(element);
  };

  const flushTools = () => {
    if (pendingTools.length === 0) {
      return;
    }

    const partsForGroup = pendingTools;
    const key = `tools:${partsForGroup.map((part) => part.callId).join(":")}`;

    push(<ToolGroup canRespond={canRespond} key={key} onAnswers={onAnswers} parts={partsForGroup} />, key);
    pendingTools = [];
  };

  parts.forEach((part, index) => {
    if (part.type === "tool") {
      const stage = run?.stageStarts[part.callId];
      if (stage) {
        flushTools();
        const row = run?.stages.find((item) => item.name === stage);
        elements.push(
          <StageRule key={`stage:${part.callId}`} label={row?.label ?? stage} suffix={stageSuffix(row)} />,
        );
        needsWho = true;
      }
      if (part.interaction) {
        flushTools();
        push(
          <Checkpoint canRespond={canRespond} key={`ask:${part.callId}`} onAnswers={onAnswers} part={part} />,
          part.callId,
        );
        return;
      }
      pendingTools.push(part);
      return;
    }

    flushTools();
    const key = partKey(part, index);
    const element = <AgentMessagePart isUser={isUser} key={key} part={part} streamKey={`${messageId}:${key}`} />;

    if (part.type === "text" || part.type === "reasoning") {
      push(element, key);
    }
  });

  flushTools();

  return elements;
}

function AgentMessagePart({
  isUser,
  part,
  streamKey,
}: {
  readonly isUser: boolean;
  readonly part: EveMessagePart;
  readonly streamKey: string;
}) {
  switch (part.type) {
    case "text":
      return isUser ? (
        <UserTextPart text={part.text} />
      ) : (
        <AssistantTextPart
          showCaret={part.state === "streaming"}
          streamKey={streamKey}
          text={part.text}
        />
      );
    case "reasoning":
      return <ReasoningPart isStreaming={part.state === "streaming"} text={part.text} />;
    case "tool":
      return null;
  }
}

function UserTextPart({ text }: { readonly text: string }) {
  return <div className="mt-0.5 whitespace-pre-wrap break-words">{text}</div>;
}

function AssistantTextPart({
  showCaret,
  streamKey,
  text,
}: {
  readonly showCaret: boolean;
  readonly streamKey: string;
  readonly text: string;
}) {
  const smoothedText = useStreamingText(text, showCaret, streamKey);
  const isRevealActive = smoothedText.length > 0 && (showCaret || smoothedText !== text);
  const showVisibleCaret = showCaret && smoothedText.length > 0;

  return (
    <Markdown
      animated={isRevealActive ? { duration: 0, stagger: 0 } : undefined}
      caret={showVisibleCaret ? "block" : undefined}
      isAnimating={isRevealActive}
    >
      {smoothedText}
    </Markdown>
  );
}

function useStreamingText(text: string, isStreaming: boolean, streamKey: string) {
  const [visibleText, setVisibleText] = useState(() =>
    getInitialStreamingText(text, isStreaming, streamKey),
  );
  const visibleTextRef = useRef(visibleText);

  useEffect(() => {
    visibleTextRef.current = visibleText;
  }, [visibleText]);

  useEffect(() => {
    const current = visibleTextRef.current;

    if (!isStreaming && (current === text || !text.startsWith(current))) {
      if (current !== text) {
        visibleTextRef.current = text;
        rememberStreamingText(streamKey, text);
        setVisibleText(text);
      }

      return;
    }

    const catchUp = !isStreaming;
    let interval: number | undefined;

    const advance = () => {
      const next = nextStreamingText(visibleTextRef.current, text, catchUp);

      if (next !== visibleTextRef.current) {
        visibleTextRef.current = next;
        rememberStreamingText(streamKey, next);
        setVisibleText(next);
      }

      if (catchUp && next === text && interval !== undefined) {
        window.clearInterval(interval);
        interval = undefined;
      }
    };

    advance();

    if (catchUp && visibleTextRef.current === text) {
      return;
    }

    interval = window.setInterval(advance, STREAM_TEXT_TICK_MS);

    return () => {
      if (interval !== undefined) {
        window.clearInterval(interval);
      }
    };
  }, [isStreaming, streamKey, text]);

  useEffect(() => {
    if (!isStreaming && visibleText === text) {
      streamingTextCache.delete(streamKey);
    }
  }, [isStreaming, streamKey, text, visibleText]);

  return visibleText;
}

function getInitialStreamingText(text: string, isStreaming: boolean, streamKey: string) {
  const cachedText = streamingTextCache.get(streamKey);

  if (cachedText && text.startsWith(cachedText)) {
    return cachedText;
  }

  return isStreaming ? "" : text;
}

function rememberStreamingText(streamKey: string, text: string) {
  if (!text) {
    return;
  }

  streamingTextCache.delete(streamKey);
  streamingTextCache.set(streamKey, text);

  if (streamingTextCache.size <= STREAM_TEXT_CACHE_LIMIT) {
    return;
  }

  const oldestKey = streamingTextCache.keys().next().value;

  if (oldestKey) {
    streamingTextCache.delete(oldestKey);
  }
}

function nextStreamingText(current: string, target: string, catchUp = false) {
  if (current === target) {
    return current;
  }

  if (!target.startsWith(current)) {
    return target;
  }

  const remaining = target.length - current.length;
  const step = catchUp
    ? remaining > 160
      ? 18
      : remaining > 80
        ? 12
        : remaining > 32
          ? 7
          : remaining > 12
            ? 4
            : 2
    : remaining > 160
      ? 6
      : remaining > 80
        ? 5
        : remaining > 32
          ? 3
          : remaining > 12
            ? 2
            : 1;

  return target.slice(0, current.length + Math.min(remaining, step));
}

function ReasoningPart({
  isStreaming,
  text,
}: {
  readonly isStreaming: boolean;
  readonly text: string;
}) {
  const [open, setOpen] = useState(isStreaming);

  useEffect(() => {
    if (isStreaming) {
      setOpen(true);
    }
  }, [isStreaming]);

  return (
    <Collapsible className="my-3 w-full" onOpenChange={setOpen} open={open}>
      <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
        <span className={isStreaming ? "shimmer-text" : undefined}>
          {isStreaming ? "Thinking..." : "Reasoning"}
        </span>
        <ChevronDownIcon className={cn("size-4 transition-transform", open ? "rotate-180" : "")} />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-3 border-l border-border pl-4 text-muted-foreground">
        <Markdown>{text}</Markdown>
      </CollapsibleContent>
    </Collapsible>
  );
}

function ToolGroup({
  canRespond,
  onAnswers,
  parts,
}: {
  readonly canRespond: boolean;
  readonly onAnswers: (responses: readonly AgentAnswer[]) => void | Promise<void>;
  readonly parts: readonly EveToolPart[];
}) {
  const shouldOpen = parts.some(needsAnswer);
  const [open, setOpen] = useState(shouldOpen);
  const status = getToolGroupStatus(parts);
  const label = summarizeToolGroup(parts);
  const canExpand = parts.length > 1 ? parts.some(hasToolDetails) : hasToolDetails(parts[0]!);

  useEffect(() => {
    if (shouldOpen) {
      setOpen(true);
    }
  }, [shouldOpen]);

  return (
    <Collapsible
      className="my-1"
      onOpenChange={canExpand ? setOpen : undefined}
      open={canExpand ? open : false}
    >
      <CollapsibleTrigger
        className={cn(
          "group flex max-w-full items-center gap-2 text-left text-sm leading-[1.6] text-muted-foreground transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]",
          canExpand ? "cursor-pointer hover:text-foreground" : "cursor-default",
        )}
        disabled={!canExpand}
      >
        <ToolStatusIcon status={status} />
        <span className="truncate">{label}</span>
        <span className="sr-only">{toolStatusLabel(status)}</span>
        {canExpand ? (
          <ChevronRightIcon
            aria-hidden="true"
            className={cn("size-3 shrink-0 self-center opacity-60 transition-transform", open ? "rotate-90" : "")}
          />
        ) : null}
      </CollapsibleTrigger>
      {canExpand ? (
        <CollapsibleContent className="mt-1 ml-1.5 border-l border-border pl-3.5 pb-1">
          {parts.length === 1 ? (
            <ToolDetails canRespond={canRespond} onAnswers={onAnswers} part={parts[0]!} />
          ) : (
            parts.map((part) => (
              <ToolCallItem
                canRespond={canRespond}
                key={part.callId}
                onAnswers={onAnswers}
                part={part}
              />
            ))
          )}
        </CollapsibleContent>
      ) : null}
    </Collapsible>
  );
}

function ToolCallItem({
  canRespond,
  onAnswers,
  part,
}: {
  readonly canRespond: boolean;
  readonly onAnswers: (responses: readonly AgentAnswer[]) => void | Promise<void>;
  readonly part: EveToolPart;
}) {
  const shouldOpen = needsAnswer(part);
  const [open, setOpen] = useState(shouldOpen);
  const status = getToolStatus(part);
  const canExpand = hasToolDetails(part);

  useEffect(() => {
    if (shouldOpen) {
      setOpen(true);
    }
  }, [shouldOpen]);

  const button = (
    <button
      className={cn(
        "flex w-full items-center gap-2 py-0.5 text-left text-sm leading-6 text-muted-foreground transition-colors",
        canExpand ? "cursor-pointer hover:text-foreground" : "cursor-default",
      )}
      type="button"
    >
      <ToolStatusIcon status={status} />
      <ToolNameLabel part={part} />
      <span className="truncate text-foreground/80">{part.label}</span>
      {canExpand ? (
        <ChevronRightIcon
          className={cn(
            "ml-auto size-3 shrink-0 self-center transition-transform",
            open ? "rotate-90" : "",
          )}
        />
      ) : null}
    </button>
  );

  if (!canExpand) {
    return <div className="py-0.5">{button}</div>;
  }

  return (
    <Collapsible className="py-0.5" onOpenChange={setOpen} open={open}>
      <CollapsibleTrigger asChild>{button}</CollapsibleTrigger>
      <CollapsibleContent className="mt-1 ml-5">
        <ToolDetails canRespond={canRespond} onAnswers={onAnswers} part={part} />
      </CollapsibleContent>
    </Collapsible>
  );
}

function ToolDetails({
  canRespond,
  onAnswers,
  part,
}: {
  readonly canRespond: boolean;
  readonly onAnswers: (responses: readonly AgentAnswer[]) => void | Promise<void>;
  readonly part: EveToolPart;
}) {
  const failed =
    ["completed", "failed", "rejected", "cancelled"].includes(part.state) &&
    part.state !== "completed";

  return (
    <div className="space-y-1.5">
      <ToolPayload label="input" value={part.input} />
      {["completed", "failed", "rejected", "cancelled"].includes(part.state) ? (
        <ToolPayload
          label={failed ? "error" : "result"}
          tone={failed ? "destructive" : "default"}
          value={failed ? part.error?.message : part.output}
        />
      ) : null}
    </div>
  );
}

function ToolStatusIcon({ status }: { readonly status: ToolStatus }) {
  const className = "size-3 shrink-0";

  if (status === "running") {
    return (
      <span className="flex size-4 shrink-0 items-center justify-center self-center">
        <Loader2Icon className={cn(className, "animate-spin")} />
      </span>
    );
  }

  if (status === "error" || status === "denied") {
    return (
      <span className="flex size-4 shrink-0 items-center justify-center self-center">
        <XIcon className={cn(className, "text-destructive")} />
      </span>
    );
  }

  return (
    <span className="flex size-4 shrink-0 items-center justify-center self-center">
      <CheckIcon className={cn(className, "text-ink-2")} />
    </span>
  );
}

function ToolNameLabel({ part }: { readonly part: EveToolPart }) {
  return (
    <span className="shrink-0 rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
      {formatToolName(part.name)}
    </span>
  );
}

function ToolPayload({
  label,
  tone = "default",
  value,
}: {
  readonly label: string;
  readonly tone?: "default" | "destructive";
  readonly value: unknown;
}) {
  if (value === undefined) {
    return null;
  }

  return (
    <div className="space-y-1">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <pre
        className={cn(
          "max-h-56 overflow-auto rounded bg-muted/30 p-2 font-mono text-[11px] leading-5 text-muted-foreground",
          tone === "destructive" ? "bg-destructive/10 text-destructive" : undefined,
        )}
      >
        {formatPayload(value)}
      </pre>
    </div>
  );
}

// A checkpoint question as its own card: the prompt, one button per option, and, where the
// question takes free text, the composer as its reply box. Once answered it shrinks to the answer.
function Checkpoint({
  canRespond,
  onAnswers,
  part,
}: {
  readonly canRespond: boolean;
  readonly onAnswers: (responses: readonly AgentAnswer[]) => void | Promise<void>;
  readonly part: EveToolPart;
}) {
  const [freeformText, setFreeformText] = useState("");
  const interaction = part.interaction;

  if (!interaction) {
    return null;
  }

  const { request, answer } = interaction;
  const selectedOption = request.options?.find((option) => option.id === answer?.optionId);

  if (answer) {
    return (
      <p className="my-1 inline-block rounded-[var(--r)] border border-border bg-background px-3 py-1.5 text-sm">
        <span className="text-muted-foreground">Responded: </span>
        <b className="font-semibold">{selectedOption?.label ?? answer.text ?? answer.optionId}</b>
      </p>
    );
  }

  if (interaction.status !== "open") {
    return null;
  }

  return (
    <div aria-label="Checkpoint" className="mt-2.5 mb-1 border border-foreground bg-card px-4 py-3.5" role="group">
      <p className="m-0 text-[0.8125rem] leading-[1.3] font-[560] text-muted-foreground">Checkpoint</p>
      <p className="m-0 mt-1 text-base leading-normal text-foreground">{request.prompt}</p>
      {request.options?.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {request.options.map((option) => (
            <button
              className="inline-flex min-h-9 items-center rounded-[var(--r)] bg-foreground px-3 text-sm font-semibold text-background transition-colors duration-[180ms] hover:bg-ink-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)] disabled:cursor-not-allowed disabled:opacity-60 max-sheet:min-h-11"
              disabled={!canRespond}
              key={option.id}
              onClick={() => {
                void onAnswers([{ optionId: option.id, interactionId: interaction.interactionId }]);
              }}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
      {request.allowFreeform || request.display === "text" ? (
        <ChatComposer
          autoFocus={false}
          className="mt-2.5"
          disabled={!canRespond}
          multiline={false}
          onChange={setFreeformText}
          onSubmit={(text) => {
            setFreeformText("");
            return onAnswers([{ interactionId: interaction.interactionId, text }]);
          }}
          placeholder="Type a response"
          submitLabel="Reply"
          value={freeformText}
        />
      ) : null}
    </div>
  );
}

type ToolStatus = "completed" | "denied" | "error" | "running";

function needsAnswer(part: EveToolPart) {
  return part.interaction?.status === "open";
}

function hasToolDetails(part: EveToolPart) {
  const hasInput = part.input !== undefined && formatPayload(part.input).trim().length > 0;
  const hasOutput = part.output !== undefined && formatPayload(part.output).trim().length > 0;
  const hasError = (part.error?.message.trim().length ?? 0) > 0;

  return hasInput || hasOutput || hasError || part.interaction !== undefined;
}

function getToolStatus(part: EveToolPart): ToolStatus {
  switch (part.state) {
    case "completed":
      return "completed";
    case "rejected":
      return "denied";
    case "failed":
    case "cancelled":
      return "error";
    default:
      return "running";
  }
}

function getToolGroupStatus(parts: readonly EveToolPart[]): ToolStatus {
  const statuses = parts.map(getToolStatus);

  if (statuses.includes("error")) {
    return "error";
  }

  if (statuses.includes("denied")) {
    return "denied";
  }

  if (statuses.includes("running")) {
    return "running";
  }

  return "completed";
}

function toolStatusLabel(status: ToolStatus) {
  switch (status) {
    case "completed":
      return "Complete";
    case "denied":
      return "Denied";
    case "error":
      return "Error";
    case "running":
      return "Running";
  }
}

function summarizeToolGroup(parts: readonly EveToolPart[]) {
  if (parts.length === 1) {
    return parts[0]!.label;
  }

  const counts = new Map<string, number>();

  for (const part of parts) {
    const category = toolCategory(part.name);
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }

  const labels: string[] = [];
  const order: [string, string, string, string][] = [
    ["searched", "Searched", "thing", "things"],
    ["read", "Read", "item", "items"],
    ["wrote", "Wrote", "item", "items"],
    ["ran", "Ran", "action", "actions"],
  ];

  for (const [key, verb, singular, plural] of order) {
    const count = counts.get(key);

    if (count) {
      labels.push(`${verb} ${count} ${count === 1 ? singular : plural}`);
    }
  }

  return labels.join(", ") || `Used ${parts.length} tools`;
}

function toolCategory(name: string) {
  const normalized = normalizeToolName(name);

  if (normalized.includes("search") || normalized.includes("grep")) {
    return "searched";
  }

  if (normalized.includes("read") || normalized.includes("fetch")) {
    return "read";
  }

  if (normalized.includes("write") || normalized.includes("edit")) {
    return "wrote";
  }

  return "ran";
}

function formatToolName(name: string) {
  return normalizeToolName(name).replace(/\s+/g, " ").trim();
}

function normalizeToolName(name: string) {
  return name.replace(/__/g, " ").replace(/[_-]/g, " ").trim().toLowerCase();
}

function formatPayload(value: unknown): string {
  if (typeof value === "string") {
    return truncateText(value, 4000);
  }

  try {
    return truncateText(JSON.stringify(value, null, 2), 4000);
  } catch {
    return truncateText(String(value), 4000);
  }
}

function truncateText(text: string, maxLength: number) {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength)}\n...`;
}

function partKey(part: EveMessagePart, index: number): string {
  switch (part.type) {
    case "tool":
      return part.callId;
    case "text":
    case "reasoning":
      return part.id ?? `${part.type}:${index}`;
    default:
      return `${part.type}:${index}`;
  }
}
