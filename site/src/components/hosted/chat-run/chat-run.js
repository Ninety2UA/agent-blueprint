/* Chat run: the demo's web chat doing one example run, drawn live in HTML (Fig. 4 on the Hosted page).
   The engine derives from html-demo's vanilla engine (Meng To, scripts/step-window.js, MIT; see
   THIRD_PARTY_NOTICES.md): a fixed 1200 x 750 (720 x 1080 below 540 px of figure width) stage that
   one CSS scale fits to the frame, one clock, every frame a pure function of t, plays only on
   screen and in a shown tab, end frames under reduced motion. Changed for the site (KTD18): no
   title bar, tabs or window chrome; the frame and the steps come from the page's theme tokens;
   steps that continue one screen share a scene and do not fade between them; the curves are the
   brand's (MOTION.md). Ported into the site (KTD9): an ES module that ChatRun.astro imports as its
   figure approaches and calls mount(el) on; the demo page's scrub, pause and capture controls are
   gone; each scene's geometry is measured once when it is built and again when the stage changes
   size, so a clock tick only writes styles and never reads layout.
   The chat's words and sizes come from eve/apps/web; the agent's messages are an example run. */
const clamp01 = (x) => Math.min(1, Math.max(0, x));
// cubic-bezier(x1, y1, x2, y2) as a function of x, by bisection
const bez = (x1, y1, x2, y2) => {
  const f = (a, b, s) => 3 * a * s * (1 - s) * (1 - s) + 3 * b * s * s * (1 - s) + s * s * s;
  return (x) => {
    if (x <= 0 || x >= 1) return x <= 0 ? 0 : 1;
    let lo = 0, hi = 1, s = x;
    for (let i = 0; i < 18; i++) {
      s = (lo + hi) / 2;
      if (f(x1, x2, s) < x) lo = s;
      else hi = s;
    }
    return f(y1, y2, s);
  };
};
const OUT = bez(0.16, 1, 0.3, 1); // entrances and moves
/** How far t is through a to b on the brand's ease-out (0 to 1). */
const ease = (t, a, b) => OUT(clamp01((t - a) / (b - a)));
/** The first n characters of a stream, all of it by b. */
const count = (len, t, a, b) => Math.round(len * clamp01((t - a) / (b - a)));
/** Whether a click landing at `at` is still pressed. */
const held = (t, at, len = 0.16) => t >= at && t < at + len;
/** The pointer at t: travels to (x, y) between `from` and `to` for each [from, to, x, y]. */
function glide(t, path, clicks = []) {
  let [, , x, y] = path[0];
  for (let j = 1; j < path.length; j++) {
    const [a, b, nx, ny] = path[j];
    if (t <= a) break;
    const k = ease(t, a, b);
    x += (nx - x) * k;
    y += (ny - y) * k;
  }
  return { x, y, press: clicks.some((at) => held(t, at)) };
}

const ARROW =
  'M5.17 5.18Q5 5 5 5.25L5 15.9Q5 16.4 5.5 16.46L8.6 16.86Q8.9 16.9 9.01 17.18L9.64 18.76Q9.95 19.55 10.76 19.29L10.84 19.26Q11.65 19 11.38 18.19L10.05 14.23Q9.95 13.95 10.25 13.91L12.8 13.57Q13.3 13.5 12.95 13.14Z';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const lessMotion = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const REG = '<svg viewBox="0 0 13 13" aria-hidden="true"><path d="M6.5 0v13M0 6.5h13"/><circle cx="6.5" cy="6.5" r="3"/></svg>';

/** Plays `steps` inside `el`. A step is { id, name, dur, scene, html, measure($), draw(t, $, geo) };
    steps with the same scene share one stage. measure reads the stage's layout once per scene
    (and again when the stage changes size) and returns the geometry draw works from. */
function play(el, { steps, label, note }) {
  let still = lessMotion();
  let at = { i: 0, t: still ? steps[0].dur : 0 };
  let built = null;
  let geo = null;

  el.classList.add("crun");
  el.querySelector(".crun-alt")?.remove();
  const win = document.createElement("div");
  win.innerHTML = `<div class="crun-frame">${["tl", "tr", "bl", "br"].map((c) => REG.replace("<svg", `<svg class="crun-reg crun-${c}"`)).join("")}
    <div class="crun-view" role="img" aria-label="${esc(label)}: ${esc(steps.map((s) => s.name).join(", "))}"></div></div>
    <div class="crun-bar"><span class="crun-note">${esc(note)}</span><ol class="crun-steps" aria-label="${esc(note)}, step by step">${steps
      .map((s, i) => `<li><button type="button" data-i="${i}">${esc(s.name)}<i></i></button></li>`)
      .join("")}</ol></div>`;
  el.prepend(...win.children);
  const view = el.querySelector(".crun-view");
  const buttons = [...el.querySelectorAll(".crun-steps button")];
  const fills = buttons.map((b) => b.querySelector("i"));
  buttons.forEach((b) => b.addEventListener("click", () => jump(Number(b.dataset.i))));

  // The stage's size comes from the stylesheet: 1200 x 750, or 720 x 1080 below 540 px.
  let stage, cursor, size;
  const fit = () => view.style.setProperty("--k", view.clientWidth / stage.offsetWidth);
  const ro = new ResizeObserver(() => {
    if (!stage) return;
    fit();
    // a stage that changed shape lays its scene out again, so its geometry is measured afresh
    if (stage.offsetWidth !== size) {
      geo = null;
      render();
    }
  });
  ro.observe(view);
  const $ = (sel) => stage.querySelector(sel);
  $.all = (sel) => stage.querySelectorAll(sel);
  function render() {
    const step = steps[at.i];
    const scene = step.scene || step.id;
    if (built !== scene) {
      built = scene;
      geo = null;
      stage = document.createElement("div");
      stage.className = "crun-stage";
      stage.innerHTML = step.html;
      cursor = document.createElement("span");
      cursor.className = "crun-cursor";
      cursor.style.transitionDuration = "0s, 0.3s";
      cursor.setAttribute("aria-hidden", "true");
      cursor.innerHTML = `<svg width="32" height="32" viewBox="0 0 32 32"><path d="${ARROW}"/></svg>`;
      stage.append(cursor);
      view.replaceChildren(stage);
      fit();
    }
    if (!geo) {
      size = stage.offsetWidth;
      geo = step.measure($);
    }
    const c = step.draw(at.t, $, geo);
    cursor.hidden = !c;
    if (c) {
      cursor.style.transform = `translate(${c.x - 5}px, ${c.y - 5}px)`;
      cursor.classList.toggle("crun-press", !!c.press);
      cursor.classList.toggle("crun-away", !!c.hide);
    }
    buttons.forEach((b, i) => {
      b.classList.toggle("crun-on", i === at.i);
      if (i === at.i) b.setAttribute("aria-current", "step");
      else b.removeAttribute("aria-current");
      const p = i === at.i ? Math.min(1, at.t / steps[i].dur) : i < at.i ? 1 : 0;
      fills[i].style.setProperty("--p", p);
    });
  }

  // The clock: only on screen and in a shown tab, a quarter second at most per tick, looping.
  let shown = false;
  let last = performance.now();
  const io = new IntersectionObserver(
    ([e]) => {
      shown = e.isIntersecting;
      last = performance.now();
    },
    { threshold: 0.3 },
  );
  io.observe(el);
  setInterval(() => {
    const now = performance.now();
    const dt = Math.min(0.25, (now - last) / 1000);
    last = now;
    if (still || !shown || document.hidden) return;
    let { i, t } = at;
    t += dt;
    if (t >= steps[i].dur) {
      i = (i + 1) % steps.length;
      t = 0;
    }
    at = { i, t };
    render();
  }, 40);

  function jump(i) {
    at = { i, t: still ? steps[i].dur : 0 };
    render();
  }
  render();
}

/* ---------- The web chat (eve/apps/web), at 200 percent in a 1200 x 750 or 720 x 1080 window --- */

// The path-grid mark (components/brand/mark-geometry.ts): five path cells, the last in the accent.
const PATH = ["0,0", "1,0", "1,1", "2,1", "2,2"];
let cells = "";
for (let y = 0; y < 3; y++)
  for (let x = 0; x < 3; x++) {
    const s = PATH.indexOf(`${x},${y}`);
    cells +=
      s >= 0
        ? `<rect x="${x * 10}" y="${y * 10}" width="8" height="8" fill="var(--${s === 4 ? "accent" : "ink"})"/>`
        : `<rect x="${x * 10 + 0.5}" y="${y * 10 + 0.5}" width="7" height="7" fill="none" stroke="var(--mark-line)"/>`;
  }
// Eve's mark (public/eve.svg), for the credit line
const EVE = [
  "M49.2813 66.9377L75.0313 34.9622H68.1395L47.9098 60.1058L42.4238 66.9377H49.2813Z",
  "M0 34.9622H42.4048V40.0704H0V34.9622Z",
  "M27.6587 48.2844H0V53.3926H27.6587V48.2844Z",
  "M27.6588 61.816H0V66.9242H27.6588V61.816Z",
  "M69.6303 34.9622H101.9V40.0704H69.6303V34.9622Z",
  "M74.2412 48.2844H101.9V53.3926H74.2412V48.2844Z",
  "M74.2411 61.816H101.9V66.9242H74.2411V61.816Z",
];
const SUN =
  '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2m-7.07-17.07 1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>';
const TOP = `<div class="crun-top"><span class="crun-lock"><svg class="crun-mark" viewBox="0 0 28 28">${cells}</svg><span><span class="crun-name">Agent Blueprint</span><span class="crun-host">Hosted on Eve<svg class="crun-eve" viewBox="0 33 102 36">${EVE.map((d) => `<path d="${d}"/>`).join("")}</svg></span></span></span><span class="crun-acts"><span class="crun-qb crun-ico">${SUN}</span><span class="crun-qb">Sessions</span></span></div>`;

// components/chat/gate-notice.tsx, SUGGESTED_REQUESTS, verbatim
const REQUESTS = [
  "Add a --version flag to the command-line entry point that prints the version from the package, with a test.",
  "Add input validation to the main function so an empty argument gives a clear error message, with a test.",
  "Add a short usage section to the README that shows the two most common commands and their output.",
];
const ASK = REQUESTS[2];

const HOME = `<div class="crun-app">${TOP}<div class="crun-main"><div class="crun-scroll" data-k="scroll"><div class="crun-tb">
  <svg class="crun-cross" viewBox="0 0 26 26"><circle cx="13" cy="13" r="7"/><path d="M13 0v26M0 13h26"/></svg>
  <div class="crun-tbh"><div class="crun-cell"><span class="crun-lab">Sheet</span><span class="crun-h1">New session</span></div><div class="crun-cell"><span class="crun-lab">Repository</span><span class="crun-repo">Ninety2UA/agent-blueprint-sample</span></div><div class="crun-cell"><span class="crun-lab">Pull requests open as</span><span class="crun-bot">agent-blueprint-demo[bot]</span></div></div>
  <span class="crun-lede">The agent works on the sample repository, a small Python package with two commands and tests. Name a change, and each stage is pushed to a branch as it finishes.</span>
  <div class="crun-sug" data-k="sug"><span class="crun-sugh">Suggested requests</span><div class="crun-reqs">${REQUESTS.map(
    (r, i) => `<div class="crun-req" data-k="r${i}"><span>${i + 1}.</span><span>${esc(r)}</span><i class="crun-hov"></i></div>`,
  ).join("")}</div></div>
  <div class="crun-comp"><span class="crun-clab">Or write your own request</span><span class="crun-ta"></span><span class="crun-send">Send</span></div>
</div></div></div></div>`;

// The agent's messages in this example run: one per finished stage, then the pull request.
// [conversation time it starts, time it is all there, text, link text]
const MSGS = [
  [1.8, 2.9, "I cloned the sample repository into the sandbox and started the pipeline."],
  [3.6, 4.1, "I finished the plan stage and pushed the branch."],
  [7.0, 7.5, "I finished the execute stage and pushed the branch."],
  [8.5, 9.0, "I finished the review stage and pushed the branch."],
  [10.0, 10.5, "I finished the verify stage and pushed the branch."],
  [14.0, 14.5, "I finished the ship stage and pushed the branch."],
  [15.3, 16.2, "I opened the pull request as agent-blueprint-demo[bot]: ", "Add a short usage section to the README"],
];
const THINK = [0.35, 1.65];
const TURN_END = 16.5;
const ICON_STOP = '<svg viewBox="0 0 24 24"><rect width="18" height="18" x="3" y="3" rx="2"/></svg>';
const ICON_SEND = '<svg viewBox="0 0 24 24"><path d="m5 12 7-7 7 7M12 19V5"/></svg>';

const SESSION = `<div class="crun-app">${TOP}<div class="crun-main" style="display:flex;flex-direction:column"><div class="crun-convo" data-k="convo"><div class="crun-cc" data-k="cc">
  <div class="crun-user" data-k="user">${esc(ASK)}</div>
  <div class="crun-msg" data-k="msg"><div class="crun-think" data-k="think">Thinking...</div>${MSGS.map(() => '<div class="crun-p"></div>').join("")}</div>
</div></div><div class="crun-cmpw"><div class="crun-form"><span class="crun-ph">Ask anything...</span><span class="crun-foot"><span class="crun-btn" data-k="btn"></span></span></div></div></div></div>`;

/** One message as streamed so far: n characters in ink, the rest laid out but clear, so the
    lines wrap where they will end and nothing reflows while it streams. */
function stream(text, link, n, caret) {
  const all = text + (link || "");
  const cut = (s, a, b) => esc(s.slice(Math.max(0, a), Math.max(0, b)));
  const shown = cut(text, 0, n) + (link && n > text.length ? `<span class="crun-link">${cut(link, 0, n - text.length)}</span>` : "");
  const rest = cut(text, n, text.length) + (link ? `<span class="crun-link">${cut(link, n - text.length, link.length)}</span>` : "");
  return shown + (caret && n < all.length ? '<i class="crun-caret"></i>' : "") + `<span class="crun-rest">${rest}</span>`;
}

/** A point on an element's box, or on one of its text's line boxes (the last when line is -1),
    in stage pixels. The chat draws at 200 percent, so the stage is twice the app's own size. */
function spot(el, app, fx, fy, line) {
  const a = app.getBoundingClientRect();
  let r = el.getBoundingClientRect();
  if (line !== undefined) {
    const range = document.createRange();
    range.selectNodeContents(el);
    const rs = range.getClientRects();
    r = rs[line < 0 ? rs.length + line : line];
  }
  if (!a.width || !r) return null;
  const k = (app.offsetWidth * 2) / a.width;
  return { x: (r.left - a.left + r.width * fx) * k, y: (r.top - a.top + r.height * fy) * k };
}

// Where the pointer waits, out of the way, as a share of the stage
const at = ($, fx, fy) => {
  const app = $(".crun-app");
  return [app.offsetWidth * 2 * fx, app.offsetHeight * 2 * fy];
};

// 1. The new session's empty state; the page scrolls to the requests and the third is picked.
const SCROLL = [1.1, 2.2];
const PICK = 3.6;
const HOVER = 3.0;
const ONE = {
  id: "pick",
  name: "Pick a request",
  dur: 5.2,
  html: HOME,
  // measured with the page unscrolled: how far it scrolls, where the pointer rests and where it
  // ends, just past the end of the request's last line once the page has scrolled, and never past
  // the row's own edge
  measure($) {
    const sug = $('[data-k="sug"]');
    const box = $('[data-k="scroll"]');
    box.style.transform = "";
    let top = 0;
    for (let e = sug; e && e !== box; e = e.offsetParent) top += e.offsetTop;
    const s = Math.max(0, top + sug.offsetHeight - box.parentNode.clientHeight + 10);
    const rest = at($, 0.95, 0.95);
    const row = $('[data-k="r2"]');
    const aim = spot(row.children[1], $(".crun-app"), 1, 0.62, -1);
    const edge = spot(row, $(".crun-app"), 0.93, 0.5);
    return { s, rest, to: aim ? [Math.min(aim.x + 40, edge.x), aim.y - s * 2] : rest };
  },
  draw(t, $, g) {
    const now = g.s * ease(t, SCROLL[0], SCROLL[1]);
    $('[data-k="scroll"]').style.transform = `translateY(${-now}px)`;
    $('[data-k="r2"]').lastChild.style.opacity = ease(t, HOVER, HOVER + 0.18);
    return glide(t, [[0, 0, ...g.rest], [2.1, 3.0, ...g.to]], [PICK]);
  },
};

// 2 to 4. The session: the request sent, the agent at work, a message as each stage is pushed,
// then the pull request. One scene; each step draws conversation time from its offset. The
// conversation is laid out at its final size from the start: a message is revealed by opacity
// and the stick-to-bottom scroll is a transform, so nothing in the figure moves in layout.

/** The session's geometry, measured unscrolled: where the visitor's message and each of the
    agent's messages end, the conversation's height, the pointer's resting place, and the link
    in the pull request message laid out whole. */
function measureSession($) {
  const cc = $('[data-k="cc"]');
  cc.style.transform = "";
  const user = $('[data-k="user"]');
  const msg = $('[data-k="msg"]');
  const ps = [...$.all(".crun-p")];
  const pr = ps[ps.length - 1];
  const [, , text, link] = MSGS[MSGS.length - 1];
  pr.innerHTML = stream(text, link, text.length + link.length, false);
  pr.dataset.n = ""; // drawn again on the tick that follows
  return {
    user: user.offsetTop + user.offsetHeight,
    ends: ps.map((p) => msg.offsetTop + p.offsetTop + p.offsetHeight),
    view: $('[data-k="convo"]').clientHeight,
    wait: at($, 0.958, 0.627), // clear of the messages and the send control
    link: spot(pr.querySelector(".crun-link"), $(".crun-app"), 0.56, 0.84, 0),
  };
}

function session(off, pointer) {
  return (t, $, g) => {
    const c = off + t;
    $('[data-k="user"]').style.opacity = c < 0.5 ? 0.9 : 1;
    // "Thinking..." sits in the first message's place until the message streams in; the app's
    // shimmer-text takes it from opacity 1 to 0.45 and back, 1.6 s each way, ease-out
    const th = $('[data-k="think"]');
    const v = Math.min(ease(c, THINK[0], THINK[0] + 0.2), 1 - ease(c, THINK[1], THINK[1] + 0.2));
    const ph = Math.max(0, c - THINK[0]) / 1.6;
    const f = ph % 1;
    th.style.opacity = v * (1 - 0.55 * OUT(Math.floor(ph) % 2 ? 1 - f : f));
    th.style.transform = `translateY(${-4 * (1 - v)}px)`;
    let bottom = g.user;
    $.all(".crun-p").forEach((p, i) => {
      const [a, b, text, link] = MSGS[i];
      const n = count(text.length + (link ? link.length : 0), c, a, b);
      const caret = c >= a && c < b;
      const key = `${n}${caret}`;
      if (p.dataset.n !== key) {
        p.dataset.n = key;
        p.innerHTML = stream(text, link, n, caret);
      }
      const k = ease(c, a, a + 0.3);
      p.style.opacity = k;
      if (k) bottom += (g.ends[i] - bottom) * k;
    });
    const y = Math.min(0, g.view - bottom - 24);
    $('[data-k="cc"]').style.transform = `translateY(${y}px)`;
    const btn = $('[data-k="btn"]');
    const busy = c < TURN_END;
    if (btn.dataset.s !== String(busy)) {
      btn.dataset.s = String(busy);
      btn.className = `crun-btn crun-${busy ? "busy" : "idle"}`;
      btn.innerHTML = busy ? ICON_STOP : ICON_SEND;
    }
    return pointer ? pointer(t, $, g, y) : null;
  };
}

const TWO = { id: "plan", name: "Plan", dur: 6.2, scene: "session", html: SESSION, measure: measureSession, draw: session(0) };
const THREE = { id: "stages", name: "Stage by stage", dur: 6.4, scene: "session", html: SESSION, measure: measureSession, draw: session(6.2) };
const LINK_GO = [3.5, 4.3];
const FOUR = {
  id: "pr",
  name: "Pull request",
  dur: 7,
  scene: "session",
  html: SESSION,
  measure: measureSession,
  // y: the conversation's scroll this tick, which carries the link with it
  draw: session(12.6, (t, $, g, y) => {
    const link = $.all(".crun-p")[6].querySelector(".crun-link");
    const h = ease(t, LINK_GO[1], LINK_GO[1] + 0.18);
    if (link) link.style.textDecorationColor = h ? `color-mix(in oklch, var(--ink) ${h * 100}%, var(--hair))` : "";
    const aim = t > LINK_GO[0] && g.link ? [g.link.x, g.link.y + y * 2] : g.wait;
    return { ...glide(t, [[0, 0, ...g.wait], [LINK_GO[0], LINK_GO[1], ...aim]]), hide: t < 3.2 };
  }),
};

export const steps = [ONE, TWO, THREE, FOUR];
const LABEL = "Example run in the demo's web chat";
const NOTE = "Example run";
/** Draws the run into a figure that holds the place-holding sentence. */
export const mount = (el) => play(el, { steps, label: LABEL, note: NOTE });
