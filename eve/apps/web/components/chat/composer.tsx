"use client";

import { Loader2Icon } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getChatMessageLength, MAX_CHAT_MESSAGE_CHARS } from "@/lib/chat/limits";
import { cn } from "@/lib/utils";

// One composer (ruling 57, the approved composer variant A, ~/.cache/ab-demo-design/r3/
// composer.html): one bordered field holds the text and its send action. The action sits beside
// the text while it is one line and stays on the field's bottom edge as the text grows; it is
// grey and disabled while the field is empty and the signal red once it holds text. The visible
// label stays above the field. The checkpoint's reply box is the same component on one line
// ("Type a response", "Reply"). Focus shows on the whole field; on a phone the action is 44 px.

/** The field's border, ground and focus ring; the text and the action sit inside it. */
const FIELD =
  "relative flex min-w-0 cursor-text items-end gap-2 rounded-[var(--r)] border border-line-ui bg-card p-[5px] transition-colors duration-[180ms] hover:border-ink-2 " +
  "has-[textarea:focus-visible]:border-signal has-[textarea:focus-visible]:outline-2 has-[textarea:focus-visible]:outline-offset-1 has-[textarea:focus-visible]:outline-signal " +
  "has-[input:focus-visible]:border-signal has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-1 has-[input:focus-visible]:outline-signal " +
  "has-[textarea:disabled]:cursor-not-allowed has-[textarea:disabled]:border-border has-[textarea:disabled]:bg-muted " +
  "has-[input:disabled]:cursor-not-allowed has-[input:disabled]:border-border has-[input:disabled]:bg-muted";

/** The text itself: no border of its own, the field's ground, one line at rest. */
const TEXT =
  "m-0 min-w-0 flex-1 self-stretch rounded-none border-0 bg-transparent py-1.5 pr-0 pl-2 text-base leading-normal text-foreground outline-none placeholder:text-faint disabled:cursor-not-allowed max-sheet:py-2.5";

/** The send action: the primary button at the field's inner height, 44 px on a phone. */
const SEND =
  "inline-flex min-h-9 shrink-0 items-center justify-center gap-2 rounded-[var(--r)] border border-transparent bg-signal px-4 text-[0.9375rem] font-semibold whitespace-nowrap text-on-signal [font-stretch:104%] transition-colors duration-[180ms] hover:bg-signal-press focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)] disabled:border-border disabled:bg-muted disabled:text-faint disabled:hover:bg-muted max-sheet:min-h-11";

export function ChatComposer({
  autoFocus = true,
  className,
  disabled = false,
  disabledReason,
  footerStart,
  id,
  isBusy = false,
  isPreparing = false,
  label,
  maxLength = MAX_CHAT_MESSAGE_CHARS,
  multiline = true,
  onChange,
  onSubmit,
  placeholder,
  submitLabel = "Send",
  value,
}: {
  readonly autoFocus?: boolean;
  readonly className?: string;
  readonly disabled?: boolean;
  readonly disabledReason?: string;
  readonly footerStart?: ReactNode;
  /** The field's id, the target of the shell's skip link; a generated one otherwise. */
  readonly id?: string;
  /** A turn is running: the field and its action wait. */
  readonly isBusy?: boolean;
  readonly isPreparing?: boolean;
  /** The visible label above the field; without one, the placeholder names it for a screen reader. */
  readonly label?: string;
  readonly maxLength?: number;
  /** A textarea that grows to eight lines; false is one line (the checkpoint's reply). */
  readonly multiline?: boolean;
  readonly onChange: (value: string) => void;
  readonly onStop?: () => void;
  readonly onSubmit: (value: string) => void | Promise<void>;
  readonly placeholder?: string;
  readonly submitLabel?: string;
  readonly value: string;
}) {
  const generatedId = useId();
  const composerId = id ?? generatedId;
  const textRef = useRef<HTMLTextAreaElement & HTMLInputElement>(null);
  const textDisabled = disabled || isBusy || isPreparing;
  const trimmedValue = value.trim();
  const isOverMaxLength = getChatMessageLength(trimmedValue) > maxLength;

  useEffect(() => {
    if (!autoFocus || textDisabled) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      textRef.current?.focus({ preventScroll: true });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [autoFocus, textDisabled]);

  // field-sizing: content grows the textarea where the browser supports it; elsewhere its height
  // follows the text here, up to the same eight lines.
  useLayoutEffect(() => {
    const text = textRef.current;
    if (!multiline || !text || CSS.supports("field-sizing", "content")) return;
    text.style.height = "auto";
    text.style.height = `${text.scrollHeight}px`;
  }, [multiline, value]);

  const submitValue = useCallback(() => {
    const text = value.trim();
    if (!text || disabled || isBusy || isPreparing || getChatMessageLength(text) > maxLength) {
      return;
    }

    void onSubmit(text);
  }, [disabled, isBusy, isPreparing, maxLength, onSubmit, value]);

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      submitValue();
    },
    [submitValue],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
      if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
        event.preventDefault();
        submitValue();
      }
    },
    [submitValue],
  );

  // A press on the field's padding puts the caret in the text, as a single input would.
  const focusText = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      event.preventDefault();
      textRef.current?.focus();
    }
  }, []);

  const textProps = {
    "aria-label": label ? undefined : placeholder,
    className: multiline
      ? cn(TEXT, "max-h-[calc(8*1.5em+12px)] min-h-9 resize-none overflow-y-auto field-sizing-content max-sheet:min-h-11")
      : cn(TEXT, "h-9 max-sheet:h-11"),
    "data-chat-composer-input": true,
    disabled: textDisabled,
    id: composerId,
    maxLength,
    onChange: (event: { target: { value: string } }) => onChange(event.target.value),
    onKeyDown: handleKeyDown,
    placeholder,
    ref: textRef,
    value,
  };

  const form = (
    <form className={cn("grid min-w-0 gap-1.5", className)} data-chat-composer onSubmit={handleSubmit}>
      {label ? (
        <label className="text-sm font-[560] text-foreground" htmlFor={composerId}>
          {label}
        </label>
      ) : null}
      <div className={FIELD} data-composer-field onPointerDown={focusText}>
        {multiline ? <textarea rows={1} {...textProps} /> : <input type="text" {...textProps} />}
        <button
          aria-busy={isPreparing || undefined}
          className={SEND}
          disabled={textDisabled || trimmedValue.length === 0 || isOverMaxLength}
          type="submit"
        >
          {isPreparing ? <Loader2Icon aria-hidden="true" className="size-4 animate-spin" /> : null}
          {submitLabel}
        </button>
      </div>
      {footerStart ? <div className="-ml-2 min-w-0">{footerStart}</div> : null}
    </form>
  );

  if (!disabledReason || !textDisabled) {
    return form;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div aria-label={disabledReason} className="min-w-0" tabIndex={0}>
          {form}
        </div>
      </TooltipTrigger>
      <TooltipContent side="top">{disabledReason}</TooltipContent>
    </Tooltip>
  );
}
