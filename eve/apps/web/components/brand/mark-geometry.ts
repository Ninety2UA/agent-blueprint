// The path-grid mark, ported from the product site's Mark.astro: a five-cell path through a 3 by 3
// grid on a 28 unit grid (8 unit cells, 2 unit gaps). Path cells are ink, the last one (the
// finished pull request) is the accent, the four skipped cells are hairline outlines. Plain data
// and a string renderer, so the React mark and the gate's plain HTML page draw the same cells.

const PATH = ["0,0", "1,0", "1,1", "2,1", "2,2"];

export interface MarkCell {
  readonly x: number;
  readonly y: number;
  /** The cell's place on the path, or -1 for a skipped cell. */
  readonly step: number;
}

export const MARK_CELLS: readonly MarkCell[] = [0, 1, 2].flatMap((row) =>
  [0, 1, 2].map((col) => ({ x: col * 10, y: row * 10, step: PATH.indexOf(`${col},${row}`) })),
);

export const MARK_LAST_STEP = PATH.length - 1;

/**
 * The mark as an SVG string in the site's tokens; `sw` is the outline width in grid units. Path
 * cells carry the class `mk-on` and their step as `--i`, so a page can fill them in path order.
 */
export function markSvg(className: string, sw = 1): string {
  const h = sw / 2;
  const cells = MARK_CELLS.map(({ x, y, step }) =>
    step >= 0
      ? `<rect class="mk-on" style="--i:${step}" x="${x}" y="${y}" width="8" height="8" fill="${step === MARK_LAST_STEP ? "var(--accent)" : "var(--ink)"}"/>`
      : `<rect x="${x + h}" y="${y + h}" width="${8 - sw}" height="${8 - sw}" fill="none" stroke="var(--mark-line)" stroke-width="${sw}"/>`,
  ).join("");
  return `<svg class="${className}" viewBox="0 0 28 28" aria-hidden="true" focusable="false">${cells}</svg>`;
}

// Eve's mark, the paths of public/eve.svg, drawn in the current text colour for the credit line.
export const EVE_MARK_PATHS: readonly string[] = [
  "M49.2813 66.9377L75.0313 34.9622H68.1395L47.9098 60.1058L42.4238 66.9377H49.2813Z",
  "M0 34.9622H42.4048V40.0704H0V34.9622Z",
  "M27.6587 48.2844H0V53.3926H27.6587V48.2844Z",
  "M27.6588 61.816H0V66.9242H27.6588V61.816Z",
  "M69.6303 34.9622H101.9V40.0704H69.6303V34.9622Z",
  "M74.2412 48.2844H101.9V53.3926H74.2412V48.2844Z",
  "M74.2411 61.816H101.9V66.9242H74.2411V61.816Z",
];

export function eveMarkSvg(className: string): string {
  const paths = EVE_MARK_PATHS.map((d) => `<path d="${d}" fill="currentColor"/>`).join("");
  return `<svg class="${className}" viewBox="0 33 102 36" aria-hidden="true" focusable="false">${paths}</svg>`;
}
