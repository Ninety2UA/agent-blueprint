import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { EVE_MARK_PATHS, MARK_CELLS, MARK_LAST_STEP } from "./mark-geometry";

// The product's path-grid mark in the site's tokens, so it follows the light and dark themes.
// `sw` is the outline width of the skipped cells in grid units (1 = 1 px at 28 px); `draw` fills
// the path cells in path order once on load (globals.css, .mark-draw).
export function Mark({
  className,
  draw = false,
  sw = 1,
}: {
  readonly className?: string;
  readonly draw?: boolean;
  readonly sw?: number;
}) {
  const h = sw / 2;

  return (
    <svg
      aria-hidden="true"
      className={draw ? cn("mark-draw", className) : className}
      focusable="false"
      viewBox="0 0 28 28"
    >
      {MARK_CELLS.map(({ x, y, step }) =>
        step >= 0 ? (
          <rect
            className="mk-on"
            fill={step === MARK_LAST_STEP ? "var(--accent)" : "var(--ink)"}
            height="8"
            key={`${x},${y}`}
            style={{ "--i": step } as CSSProperties}
            width="8"
            x={x}
            y={y}
          />
        ) : (
          <rect
            fill="none"
            height={8 - sw}
            key={`${x},${y}`}
            stroke="var(--mark-line)"
            strokeWidth={sw}
            width={8 - sw}
            x={x + h}
            y={y + h}
          />
        ),
      )}
    </svg>
  );
}

export function EveMark({ className }: { readonly className?: string }) {
  return (
    <svg aria-hidden="true" className={className} focusable="false" viewBox="0 33 102 36">
      {EVE_MARK_PATHS.map((d) => (
        <path d={d} fill="currentColor" key={d} />
      ))}
    </svg>
  );
}
