"use client";

import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import { memo, type ComponentProps } from "react";
import { Streamdown } from "streamdown";
import { DIAGRAM_OPTIONS } from "@/components/chat/diagram-theme";
import { useDocumentTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";
// KaTeX's stylesheet, as the math plugin documents it: without it each formula shows twice, the
// drawn one and its MathML copy as plain text.
import "katex/dist/katex.min.css";

// Inline maths stays on $$...$$, the plugin's default: with single dollars on, "costs $5 and $10"
// turns into a formula, and replies quote prices often.
// Streamdown re-renders only when a prop its memo compares changes; plugins is one and the mermaid
// options are not, so each theme has its own plugins object around the same plugins, and a theme
// switch redraws the diagrams.
const streamdownPlugins = {
  light: { cjk, code, math, mermaid },
  dark: { cjk, code, math, mermaid },
} as const;

export type MarkdownProps = ComponentProps<typeof Streamdown>;

const markdownComponents: MarkdownProps["components"] = {
  h1: ({ className, ...props }) => (
    <h1
      className={cn("mt-7 mb-4 text-xl leading-7 font-medium tracking-normal", className)}
      {...props}
    />
  ),
  h2: ({ className, ...props }) => (
    <h2
      className={cn("mt-6 mb-3 text-base leading-6 font-medium tracking-normal", className)}
      {...props}
    />
  ),
  h3: ({ className, ...props }) => (
    <h3
      className={cn("mt-5 mb-2 text-sm leading-6 font-medium tracking-normal", className)}
      {...props}
    />
  ),
  h4: ({ className, ...props }) => (
    <h4
      className={cn("mt-4 mb-2 text-sm leading-6 font-medium tracking-normal", className)}
      {...props}
    />
  ),
  h5: ({ className, ...props }) => (
    <h5
      className={cn("mt-4 mb-2 text-xs leading-5 font-medium tracking-normal", className)}
      {...props}
    />
  ),
  h6: ({ className, ...props }) => (
    <h6
      className={cn(
        "mt-4 mb-2 text-xs leading-5 font-medium tracking-normal text-muted-foreground",
        className,
      )}
      {...props}
    />
  ),
  p: ({ className, ...props }) => (
    <p className={cn("my-1 text-[15px] leading-[1.6] text-foreground", className)} {...props} />
  ),
  ul: ({ className, ...props }) => (
    <ul
      className={cn(
        "flex list-disc flex-col gap-1.5 pl-5 text-[15px] leading-6 text-foreground",
        className,
      )}
      {...props}
    />
  ),
  ol: ({ className, ...props }) => (
    <ol
      className={cn(
        "flex list-decimal flex-col gap-1.5 pl-5 text-[15px] leading-6 text-foreground",
        className,
      )}
      {...props}
    />
  ),
  li: ({ className, ...props }) => (
    <li className={cn("pl-1 text-[15px] leading-6 text-foreground", className)} {...props} />
  ),
  blockquote: ({ className, ...props }) => (
    <blockquote
      className={cn(
        "border-l-2 border-border pl-3 text-[15px] leading-6 text-muted-foreground",
        className,
      )}
      {...props}
    />
  ),
  hr: ({ className, ...props }) => (
    <hr className={cn("my-4 border-border/70", className)} {...props} />
  ),
  strong: ({ className, ...props }) => (
    <strong className={cn("font-medium text-foreground", className)} {...props} />
  ),
  a: ({ className, ...props }) => (
    <a
      className={cn(
        "font-medium text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground",
        className,
      )}
      rel="noreferrer"
      target="_blank"
      {...props}
    />
  ),
  inlineCode: ({ className, ...props }) => (
    <code
      className={cn(
        "font-mono text-[0.86em] [overflow-wrap:anywhere] text-foreground",
        className,
      )}
      {...props}
    />
  ),
};

// A diagram takes the page theme's colours (diagram-theme.ts).
export const Markdown = memo(function Markdown({ className, ...props }: MarkdownProps) {
  const theme = useDocumentTheme();
  return (
    <Streamdown
      className={cn(
        "min-w-0 text-[15px] leading-6 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        className,
      )}
      components={markdownComponents}
      mermaid={DIAGRAM_OPTIONS[theme]}
      plugins={streamdownPlugins[theme]}
      {...props}
    />
  );
});
