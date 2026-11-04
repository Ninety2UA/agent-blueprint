// The gate page's stylesheet, inlined by pages.ts: the approved gate A2 (ruling 58,
// ~/.cache/ab-demo-design/r3/gate-a2.html) on the product site's tokens: one sheet centred on the
// sunk ground. The page follows the system theme: the dark tokens apply under
// prefers-color-scheme: dark, with the figure shown in negative as on the site. The site's colour tokens keep the site's values
// (test/look.test.ts holds them equal); the mock's builder tokens (--line-ui for control borders,
// --construct-stage for the stage's grid, which the site's dark --construct leaves near invisible
// on the sunk stage) sit beside them. Every file it loads is under /gate-assets/.

/** The stylesheet, with its font files under `assets` (the gate's one open folder). */
export function pageStyle(assets: string): string {
  return `@font-face { font-family: "Archivo"; src: url("${assets}/fonts/archivo-latin-var.woff2") format("woff2"); font-weight: 100 900; font-stretch: 62% 125%; font-style: normal; font-display: swap; }
@font-face { font-family: "Azeret Mono"; src: url("${assets}/fonts/azeret-mono-latin-var.woff2") format("woff2"); font-weight: 100 900; font-style: normal; font-display: swap; }
@font-face { font-family: "Archivo Fallback"; src: local("Arial"), local("Helvetica"); font-weight: 400 700; font-stretch: 100% 102%; size-adjust: 100.8%; ascent-override: 87.1%; descent-override: 20.83%; line-gap-override: 0%; }
@font-face { font-family: "Archivo Fallback"; src: local("Arial"), local("Helvetica"); font-weight: 400 700; font-stretch: 103% 120%; size-adjust: 116.3%; ascent-override: 75.49%; descent-override: 18.06%; line-gap-override: 0%; }
:root {
  color-scheme: light;
  --bg: oklch(0.985 0 0);
  --bg-sunk: oklch(0.958 0 0);
  --bg-raise: oklch(1 0 0);
  --ink: oklch(0.17 0 0);
  --ink-2: oklch(0.34 0 0);
  --muted: oklch(0.45 0 0);
  --faint: oklch(0.55 0 0);
  --hair: oklch(0.87 0 0);
  --hair-strong: oklch(0.76 0 0);
  --construct: oklch(0.935 0 0);
  --accent: oklch(0.63 0.21 33);
  --accent-strong: oklch(0.56 0.2 33);
  --accent-press: oklch(0.51 0.19 33);
  --accent-wash: oklch(0.63 0.21 33 / 0.09);
  --on-accent: oklch(1 0 0);
  --scrim: oklch(0.17 0 0 / 0.32);
  --focus: oklch(0.17 0 0);
  --mark-line: oklch(0.66 0 0);
  --line-ui: oklch(0.62 0 0);
  --construct-stage: oklch(0.935 0 0);
  --neg: 0.93;
  --font-sans: "Archivo", "Archivo Fallback", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  --font-mono: "Azeret Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  --w-head: 112%;
  --r: 2px;
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
}
@media (prefers-color-scheme: dark) {
  :root {
    color-scheme: dark;
    --bg: oklch(0.15 0 0);
    --bg-sunk: oklch(0.19 0 0);
    --bg-raise: oklch(0.175 0 0);
    --ink: oklch(0.96 0 0);
    --ink-2: oklch(0.85 0 0);
    --muted: oklch(0.74 0 0);
    --faint: oklch(0.66 0 0);
    --hair: oklch(0.31 0 0);
    --hair-strong: oklch(0.44 0 0);
    --construct: oklch(0.205 0 0);
    --accent: oklch(0.68 0.19 35);
    --accent-strong: oklch(0.68 0.19 35);
    --accent-press: oklch(0.62 0.19 35);
    --accent-wash: oklch(0.68 0.19 35 / 0.13);
    --on-accent: oklch(0.15 0 0);
    --scrim: oklch(0 0 0 / 0.6);
    --focus: oklch(0.96 0 0);
    --mark-line: oklch(0.52 0 0);
    --line-ui: oklch(0.58 0 0);
    --construct-stage: oklch(0.225 0 0);
  }
  body { line-height: 1.66; letter-spacing: 0.006em; }
  /* the figure is a light drawing; in the dark it is shown in negative, as on the site */
  .vf-media video, .vf-media .vf-poster { filter: invert(var(--neg)) hue-rotate(180deg); }
}
*, *::before, *::after { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
body {
  margin: 0; background: var(--bg); color: var(--ink);
  font-family: var(--font-sans); font-size: 1.0625rem; line-height: 1.6; font-stretch: 100%;
  font-kerning: normal; font-variant-ligatures: none; font-optical-sizing: auto;
  -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility;
}
img, svg, video { display: block; max-width: 100%; }
a { color: inherit; text-decoration-thickness: 1px; text-underline-offset: 0.2em; }
button, input { font: inherit; color: inherit; }
[hidden] { display: none !important; }
h1, h2 { margin: 0; text-wrap: balance; font-weight: 650; }
p { margin: 0; text-wrap: pretty; }
ol { margin: 0; padding: 0; }
code { font-family: var(--font-mono); font-size: 0.86em; }
::selection { background: var(--accent); color: var(--on-accent); }
:focus-visible { outline: 2px solid var(--focus); outline-offset: 3px; border-radius: var(--r); }
input { caret-color: var(--accent); }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.skip { position: absolute; left: 24px; top: -100px; z-index: 50; background: var(--ink); color: var(--bg); padding: 10px 14px; border-radius: var(--r); text-decoration: none; }
.skip:focus { top: 12px; }

/* the lockup: the mark, the name, and beneath it the credit to Eve */
.lockup { display: inline-flex; align-items: center; gap: 10px; color: inherit; }
.brand-mark { width: 28px; height: 28px; flex: none; }
.brand-mark .mk-on { animation: mk-fill 460ms var(--ease-out) calc(160ms + var(--i) * 110ms) backwards; transform-box: fill-box; transform-origin: center; }
@keyframes mk-fill { from { opacity: 0; transform: scale(0.4); } to { opacity: 1; transform: none; } }
.lk-text { display: grid; line-height: 1.15; }
.brand-name { font-stretch: 116%; font-weight: 680; font-size: 1.0625rem; letter-spacing: -0.012em; white-space: nowrap; }
.host { display: inline-flex; align-items: center; gap: 5px; font-size: 0.8125rem; color: var(--muted); white-space: nowrap; }
.eve { height: 9px; width: 26px; color: var(--ink); margin-top: 1px; }

/* the button */
.btn { display: inline-flex; align-items: center; justify-content: center; gap: 10px; min-height: 46px; padding: 0 18px;
  border-radius: var(--r); border: 1px solid transparent; font-size: 0.9375rem; font-weight: 600; font-stretch: 104%; letter-spacing: 0.005em;
  white-space: nowrap; cursor: pointer; transition: background-color 180ms, border-color 180ms, color 180ms, transform 120ms var(--ease-out); }
.btn:active { transform: translateY(1px); }
.btn-primary { background: var(--accent-strong); color: var(--on-accent); }
.btn-primary:hover { background: var(--accent-press); }

/* registration mark: a crosshair with a small ring, set in the margin outside a frame's corners */
.reg { position: absolute; z-index: 2; width: 13px; height: 13px; pointer-events: none; fill: none; stroke: var(--ink); stroke-width: 1; }
.reg.tl { left: -15px; top: -15px; } .reg.tr { right: -15px; top: -15px; } .reg.bl { left: -15px; bottom: -15px; } .reg.br { right: -15px; bottom: -15px; }

/* the ground: the sunk page with the site's twelve-column construction grid and its centre line */
.ground { position: relative; min-height: 100svh; background: var(--bg-sunk); overflow: clip; }
.cgrid { position: absolute; inset: 0; display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); pointer-events: none; }
.cgrid span { border-left: 1px solid var(--construct-stage); }
.cgrid span:first-child { border-left: 0; }
.cgrid::after { content: ""; position: absolute; left: 0; right: 0; top: 50%; border-top: 1px solid var(--construct-stage); }

/* the sheet: the gate's panel at five twelfths beside the stage at seven, centred in the viewport */
.wrap { position: relative; min-height: inherit; display: grid; place-items: center; padding: 48px 40px; }
.sheet { position: relative; width: min(1180px, 100%); display: grid; grid-template-columns: 7fr 5fr; background: var(--bg); border: 1px solid var(--hair-strong); }
.stage { grid-column: 1; grid-row: 1; background: var(--bg-sunk); padding: 40px; display: grid; align-content: center; border-right: 1px solid var(--hair); min-width: 0; }
.panel { grid-column: 2; grid-row: 1; padding: 36px 44px 32px; display: flex; flex-direction: column; gap: 32px; min-width: 0; }
.panel-body { margin: auto 0; }
.panel-body > * { animation: rise 640ms var(--ease-out) calc(120ms + var(--d, 0) * 70ms) backwards; }
@keyframes rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
.panel h1 { font-size: clamp(1.875rem, 1.2rem + 2vw, 2.5rem); font-stretch: var(--w-head); font-weight: 660; line-height: 1.08; letter-spacing: -0.022em; max-width: 12em; }
.sub { margin-top: 16px; font-size: 1.0625rem; line-height: 1.5; color: var(--ink-2); max-width: 46ch; }
.state { margin-top: 28px; padding-top: 22px; border-top: 1px solid var(--hair); font-size: 1rem; line-height: 1.5; color: var(--ink); max-width: 46ch; }
.state[role="alert"] { border-top-color: var(--accent-strong); }
.action { margin-top: 12px; font-size: 0.9375rem; line-height: 1.5; font-weight: 560; color: var(--ink-2); }
.gate-form { margin-top: 20px; display: grid; gap: 10px; }
.gate-form label { font-size: 0.875rem; font-weight: 560; color: var(--ink); }
.gate-form input { height: 48px; min-width: 0; padding: 0 14px; border: 1px solid var(--line-ui); border-radius: var(--r); background: var(--bg-raise); color: var(--ink);
  font-size: 1.0625rem; letter-spacing: 0.06em; font-variant-numeric: tabular-nums; transition: border-color 160ms; }
.gate-form input:hover { border-color: var(--ink); }
.gate-form input:focus-visible { outline: 2px solid var(--accent-strong); outline-offset: 2px; border-color: var(--accent-strong); }
.gate-form input[aria-invalid="true"] { border-color: var(--accent-strong); }
.gate-form input:disabled { opacity: 0.6; cursor: not-allowed; }
.gate-form .btn { width: 100%; }
.contact { margin-top: 24px; display: flex; align-items: center; gap: 12px; }
.contact .ic { display: inline-grid; place-items: center; width: 40px; height: 40px; flex: none; border: 1px solid var(--line-ui); border-radius: 50%; color: var(--ink); text-decoration: none; transition: border-color 160ms, background-color 160ms, color 160ms; }
.contact .ic:focus-visible { border-radius: 50%; }
.contact .ic svg { width: 18px; height: 18px; }
.contact .ic:hover { background: var(--ink); border-color: var(--ink); color: var(--bg); }
.contact p { margin-left: 4px; font-size: 0.9375rem; line-height: 1.45; color: var(--ink-2); }
.foot { font-size: 0.875rem; line-height: 1.55; color: var(--muted); max-width: 54ch; }
.foot a { color: var(--ink-2); text-decoration-color: var(--hair-strong); }
.foot a:hover { color: var(--ink); text-decoration-color: currentColor; }

/* the figure: the Hosted page's Fig. 1, its two cuts switched by the figure's width as the site's
   VideoFigure does (the portrait cut below 540 px), each box holding its cut's aspect ratio */
.vfig { margin: 0; min-width: 0; container-type: inline-size; }
.vf-media { position: relative; background: var(--bg); border: 1px solid var(--hair); }
.vf-port { display: none; }
@container (width < 540px) { .vf-land { display: none; } .vf-port { display: block; } }
.vf-media picture, .vf-media .vf-poster, .vf-media video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }
.vf-big { position: absolute; z-index: 1; left: 50%; top: 50%; transform: translate(-50%, -50%); display: inline-flex; align-items: center; gap: 10px; height: 44px; padding: 0 16px 0 12px;
  border: 1px solid var(--ink); border-radius: var(--r); background: var(--bg); color: var(--ink); font-size: 0.875rem; font-weight: 560; cursor: pointer; transition: background-color 160ms, color 160ms; }
.vf-big svg { width: 18px; height: 18px; }
.vf-big:hover { background: var(--ink); color: var(--bg); }
.vf-cap { display: flex; gap: 14px; margin-top: 14px; max-width: 72ch; font-size: 0.875rem; line-height: 1.5; color: var(--muted); }
.vf-cap b { flex: none; font-weight: 640; color: var(--ink); }

@media (prefers-reduced-motion: reduce) {
  .brand-mark .mk-on, .panel-body > * { animation: none; }
  .btn, .vf-big, .contact .ic, .gate-form input { transition: none; }
}
@media (max-height: 760px) and (min-width: 900px) { .wrap { padding-block: 24px; } .stage { padding: 28px 40px; } .panel { padding-block: 24px; } }
@media (max-width: 899px) {
  .wrap { padding: 32px 16px; align-content: center; }
  .sheet { grid-template-columns: minmax(0, 1fr); width: min(560px, 100%); }
  /* the gate fills the first screen with its content on the optical centre; the figure follows below */
  .panel { grid-column: 1; grid-row: 1; padding: 24px 20px; gap: 24px; min-height: calc(100svh - 66px); justify-content: center; }
  .panel-body { margin: 0; }
  .panel h1 { max-width: none; }
  .stage { grid-column: 1; grid-row: 2; padding: 24px 20px 20px; border-right: 0; border-top: 1px solid var(--hair); }
}
@media (max-width: 899px) and (min-height: 980px) { .sheet { width: min(620px, 100%); } }
}`;
}
