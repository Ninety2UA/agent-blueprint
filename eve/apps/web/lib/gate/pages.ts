import { eveMarkSvg, markSvg } from "../../components/brand/mark-geometry";
import { pageStyle } from "./page-style";
import { fill, type GateState, type GateValues } from "./states";

// The gate's own pages: plain HTML the proxy and the login route return before any chat code
// loads, so a denied request reaches no agent route. The form posts the code in the body; with
// JavaScript the page posts it with fetch and shows a wrong code in the state's line with the
// field kept, without JavaScript the login route answers with this page again, the field filled.
//
// The look is the approved gate A2 (ruling 58, 2026-10-31, ~/.cache/ab-demo-design/r3/gate-a2.html):
// one sheet centred on the sunk ground's column grid, framed by registration crosshairs, the gate
// as a panel at five twelfths beside the stage at seven (the lockup, the headline, the state's
// sentence, the form, the contact row, the footer line). The stage holds the Hosted page's Fig. 1,
// the example run from one request to its pull request, in the site's two cuts. Below 900 px the
// panel comes first and fills the first screen, the figure follows. Every state renders on this
// shape with its own sentence. Every file the page loads lives under /gate-assets/, the one folder
// the gate leaves open (isOpenPath in handlers.ts); test/look.test.ts holds the tokens equal to the
// site's.

export const LOGIN_PATH = "/api/password-auth/login";

/** The one folder of static files the gate page loads, open without the cookie. */
export const GATE_ASSETS = "/gate-assets";

export const CONTACT_EMAIL = "mailto:domi@dbenger.com";
export const CONTACT_LINKEDIN = "https://www.linkedin.com/in/dombenger/";

const SITE_URL = "https://agent-blueprint.dbenger.com/";
const SAMPLE_URL = "https://github.com/Ninety2UA/agent-blueprint-sample";

// The Hosted page's Fig. 1 (site/src/components/kit/kit-data.ts, loop-request-to-pr): its caption,
// the name its Play control carries and its text alternative, verbatim, and its two cuts with
// their posters as the site exports them (public/media, copied byte for byte).
const FIGURE = {
  caption: "An example run, from one request to its pull request",
  label: "the example run animation",
  alt:
    "Looping animation, no sound: an example request, Add a short usage section to the README, becomes a draft " +
    "pull request from your GitHub App as Plan, Execute, Review, Verify and Ship are checked in turn.",
  landscape: {
    video: `${GATE_ASSETS}/loop-request-to-pr.mp4`,
    poster: `${GATE_ASSETS}/loop-request-to-pr.jpg`,
    avif: `${GATE_ASSETS}/loop-request-to-pr-600.avif 600w, ${GATE_ASSETS}/loop-request-to-pr-1200.avif 1200w`,
    sizes: "(max-width: 899px) calc(100vw - 74px), 610px",
    width: 1200,
    height: 750,
  },
  portrait: {
    video: `${GATE_ASSETS}/loop-request-to-pr-portrait.mp4`,
    poster: `${GATE_ASSETS}/loop-request-to-pr-portrait.jpg`,
    avif: `${GATE_ASSETS}/loop-request-to-pr-portrait-720.avif 720w`,
    sizes: "(max-width: 899px) calc(100vw - 74px), 520px",
    width: 720,
    height: 900,
  },
};

export interface PageOptions {
  readonly demo: boolean;
  /** The code the visitor typed, kept in the field after a wrong code. */
  readonly typed?: string;
}

export function gatePage(state: GateState, values: GateValues, options: PageOptions): string {
  const { demo } = options;
  const message = !demo && state.deployerMessage ? state.deployerMessage : fill(state.message, values);
  const showForm = state.action.kind === "enter-code";
  const wrong = state.id === "wrong-code";
  const alert = wrong || state.id === "limited";
  const contact = demo && state.contact;
  const action =
    showForm || state.action.kind === "branch-link" || state.action.kind === "start-again"
      ? ""
      : `<p class="action" data-gate-action="${state.action.kind}" style="--d:3">${escape(fill(state.action.label, values))}</p>`;
  const typed = options.typed ? ` value="${escape(options.typed)}"` : "";
  const invalid = wrong ? ' aria-invalid="true" aria-describedby="state"' : "";
  // The demo's code shows as typed (one-time-code); a deployer's copy keeps a password field.
  const field = demo
    ? `type="text" autocomplete="one-time-code" spellcheck="false" autocapitalize="off"`
    : `type="password" autocomplete="current-password"`;
  const form = showForm
    ? `<form method="post" action="${LOGIN_PATH}" class="gate-form" data-gate-form style="--d:3">
        <label for="code">${demo ? "The code" : "Password"}</label>
        <input id="code" name="code" ${field} required${typed}${invalid}${state.inputDisabled ? " disabled" : ""}>
        <button class="btn btn-primary" type="submit" data-gate-submit>${escape(state.action.label)}</button>
      </form>`
    : "";
  const title = !demo ? "Agent Blueprint" : wrong ? "Agent Blueprint demo, wrong code" : "Agent Blueprint demo";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta name="theme-color" content="#fafafa" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0b0b0b" media="(prefers-color-scheme: dark)">
<title>${title}</title>
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<link rel="preload" href="${GATE_ASSETS}/fonts/archivo-latin-var.woff2" as="font" type="font/woff2" crossorigin>
<style>
${pageStyle(GATE_ASSETS)}
</style>
</head>
<body>
${showForm ? '<a class="skip" href="#gate">Skip to the code field</a>' : ""}
<main class="ground" id="main" data-gate-state="${state.id}">
  <div class="cgrid" aria-hidden="true">${"<span></span>".repeat(12)}</div>
  <div class="wrap">
    <div class="sheet">
      ${reg("tl")}${reg("tr")}${reg("bl")}${reg("br")}
      <section class="panel" id="gate" aria-labelledby="h1">
        ${lockup("lockup")}
        <div class="panel-body">
          <h1 id="h1" style="--d:0">One request in, one pull request out</h1>
          ${demo ? '<p class="sub" style="--d:1">Name a change on the sample repository and the agent works it through to a pull request.</p>' : ""}
          <p class="state" role="${alert ? "alert" : "status"}" id="state" data-gate-message style="--d:2">${escape(message)}</p>
          ${action}
          ${form}
          ${contact ? CONTACT_ROW : ""}
        </div>
        <p class="foot">Agent Blueprint is at <a href="${SITE_URL}">agent-blueprint.dbenger.com</a>.${demo ? ` The agent works on the <a href="${SAMPLE_URL}" rel="noreferrer">sample repository</a>, a small Python package.` : ""}</p>
      </section>
      <section class="stage" aria-labelledby="stage-h">
        <h2 class="sr-only" id="stage-h">What the agent does</h2>
        <figure class="vfig">
          <span id="fig-alt" hidden>${escape(FIGURE.alt)}</span>
          ${figureBox("vf-land", FIGURE.landscape)}
          ${figureBox("vf-port", FIGURE.portrait)}
          <figcaption class="vf-cap"><b>Fig. 1</b><span id="fig-cap">${escape(FIGURE.caption)}</span></figcaption>
        </figure>
      </section>
    </div>
  </div>
</main>
${showForm ? FORM_SCRIPT : ""}
${LOOP_SCRIPT}
</body>
</html>
`;
}

// The lockup: the mark, the name, and beneath it the credit to Eve (the Eve mark, named for a
// screen reader).
function lockup(className: string): string {
  return `<div class="${className}">${markSvg("brand-mark")}<span class="lk-text"><span class="brand-name">Agent Blueprint</span><span class="host">Hosted on ${eveMarkSvg("eve")}<span class="sr-only">Eve</span></span></span></div>`;
}

// A registration crosshair with a small ring, set outside a frame's corner.
function reg(corner: string): string {
  return `<svg class="reg ${corner}" viewBox="0 0 13 13" aria-hidden="true" focusable="false"><path d="M6.5 0v13M0 6.5h13"/><circle cx="6.5" cy="6.5" r="2.75"/></svg>`;
}

// One cut of the figure: its poster as a picture (AVIF first, then the JPG) under a video that
// loads nothing before it plays (preload="none", no poster of its own), and the Play control the
// script shows where the loop does not start by itself. The box keeps the cut's aspect ratio, so
// nothing shifts when the poster or the video arrives; the figure's width picks the cut (CSS).
function figureBox(cut: string, media: (typeof FIGURE)["landscape"]): string {
  return `<div class="vf-media ${cut}" style="aspect-ratio:${media.width} / ${media.height}">
            <picture><source type="image/avif" srcset="${media.avif}" sizes="${media.sizes}"><img class="vf-poster" src="${media.poster}" width="${media.width}" height="${media.height}" alt="" loading="lazy" decoding="async"></picture>
            <video data-gate-loop muted playsinline loop preload="none" width="${media.width}" height="${media.height}" aria-labelledby="fig-alt" aria-describedby="fig-cap">
              <source src="${media.video}" type="video/mp4">
            </video>
            <button class="vf-big" type="button" aria-label="Play ${FIGURE.label}" hidden>${ICON_PLAY}Play</button>
          </div>`;
}

const ICON_PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="currentColor"><path d="M7 4.5v15l12-7.5z"/></svg>';

// Two icon links in hairline circles, each named for a screen reader, and the line that says
// where a code comes from; the demo's no-cookie and wrong-code states only.
const CONTACT_ROW = `<div class="contact" data-gate-contact style="--d:4">
        <a class="ic" href="${CONTACT_EMAIL}" aria-label="Email Dominik" title="Email Dominik"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><rect x="3" y="5.5" width="18" height="13" rx="1"/><path d="M3.5 6.5 12 13l8.5-6.5"/></svg></a>
        <a class="ic" href="${CONTACT_LINKEDIN}" aria-label="Dominik on LinkedIn" title="Dominik on LinkedIn" rel="noreferrer" target="_blank"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="currentColor"><path d="M6.94 5a2 2 0 1 1-4-.002 2 2 0 0 1 4 .002zM7 8.48H3V21h4V8.48zm6.32 0H9.34V21h3.94v-6.57c0-3.66 4.77-4 4.77 0V21H22v-7.93c0-6.17-7.06-5.94-8.72-2.91l.04-1.68z"/></svg></a>
        <p>Ask Dominik for a code by mail or on LinkedIn.</p>
      </div>`;

// Posts the code with fetch, so a wrong code shows in the state's line with the field kept and
// the button reading the state's action, as the page without JavaScript does.
const FORM_SCRIPT = `<script>
(() => {
  const form = document.querySelector("[data-gate-form]");
  const message = document.querySelector("[data-gate-message]");
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const field = form.elements.namedItem("code");
    const response = await fetch(form.action, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ code: field.value }),
    }).catch(() => null);
    if (response?.ok) return window.location.assign("/");
    const body = await response?.json().catch(() => null);
    message.setAttribute("role", "alert");
    message.textContent = body?.message ?? "The check did not go through, so try again in a moment.";
    if (body?.state === "wrong-code") {
      field.setAttribute("aria-invalid", "true");
      field.setAttribute("aria-describedby", "state");
      form.querySelector("[data-gate-submit]").textContent = body.action;
    }
  });
})();
</script>`;

// Each cut plays, muted, while at least half of it is on screen; the cut the figure's width hides
// is display: none, so it never intersects and never loads. Nothing loads before a cut plays
// (preload="none"), and the poster is the frame without JavaScript. Under reduced motion, on a
// phone, or where play() is refused, it stays on the poster with a Play control.
const LOOP_SCRIPT = `<script>
(() => {
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches || matchMedia("(max-width: 899px)").matches || !("IntersectionObserver" in window);
  for (const video of document.querySelectorAll("[data-gate-loop]")) {
    const play = video.closest(".vf-media").querySelector(".vf-big");
    const showPlay = () => { play.hidden = false; };
    const tryPlay = () => video.play()?.catch(showPlay);
    video.addEventListener("playing", () => { play.hidden = true; });
    play.addEventListener("click", tryPlay);
    if (still) showPlay();
    else new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.intersectionRatio >= 0.5) tryPlay();
        else if (!video.paused) video.pause();
      }
    }, { threshold: [0, 0.5] }).observe(video);
  }
})();
</script>`;

function escape(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
