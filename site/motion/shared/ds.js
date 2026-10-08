// Drawing helpers shared by every composition: SVG builders for the
// Drafting Table language (stations, registration marks, dimension lines,
// file glyphs, the 3x3 logo) and seek-safe GSAP reveal helpers.
const DS = (() => {
  const NS = "http://www.w3.org/2000/svg";
  const C = {
    bg: "oklch(0.985 0 0)",
    ink: "oklch(0.17 0 0)",
    ink2: "oklch(0.34 0 0)",
    muted: "oklch(0.45 0 0)",
    hair: "oklch(0.87 0 0)",
    hairS: "oklch(0.76 0 0)",
    accent: "oklch(0.63 0.21 33)",
    accentInk: "oklch(0.54 0.2 33)",
  };
  function S(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    if (attrs) for (const k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function svg(parent, w, h, cls) {
    return S("svg", { width: w, height: h, viewBox: `0 0 ${w} ${h}`, class: cls || null }, parent);
  }
  function G(parent, x, y, cls) {
    return S("g", { transform: x || y ? `translate(${x} ${y})` : null, class: cls || null }, parent);
  }
  function T(parent, x, y, str, cls, size, anchor) {
    const e = S("text", { x, y, class: cls, "text-anchor": anchor || null, "font-size": size || null }, parent);
    e.textContent = str;
    return e;
  }
  // dashed classes keep their real dash lengths, so they get no pathLength
  const DASHED = /\bdash(-h)?\b/;
  function L(parent, x1, y1, x2, y2, cls) {
    return S("line", { x1, y1, x2, y2, class: cls, pathLength: DASHED.test(cls || "") ? null : 1 }, parent);
  }
  function P(parent, d, cls) {
    return S("path", { d, class: cls, pathLength: DASHED.test(cls || "") ? null : 1 }, parent);
  }
  function R(parent, x, y, w, h, cls) {
    return S("rect", { x, y, width: w, height: h, class: cls }, parent);
  }
  // a station: crosshair arms and a ring; animate .inner (scale) and .ring (fill)
  function station(parent, x, y, r, arm) {
    r = r || 7; arm = arm || 14;
    const g = G(parent, x, y);
    const inner = S("g", { class: "st-in" }, g);
    const a1 = L(inner, -arm, 0, arm, 0, "st-x");
    const a2 = L(inner, 0, -arm, 0, arm, "st-x");
    const ring = S("circle", { r, class: "st-ring" }, inner);
    return { g, inner, ring, arms: [a1, a2] };
  }
  function reg(parent, x, y, s) {
    s = s || 8;
    const g = G(parent, x, y, "reg");
    L(g, -s, 0, s, 0, "");
    L(g, 0, -s, 0, s, "");
    S("circle", { r: s * 0.42 }, g);
    return g;
  }
  // arrowhead with its tip at (x, y), pointing along angle (degrees)
  function head(parent, x, y, angle, size, cls) {
    size = size || 10;
    const w = size * 0.38;
    const a = (angle * Math.PI) / 180;
    const bx = x - Math.cos(a) * size, by = y - Math.sin(a) * size;
    const px = -Math.sin(a) * w, py = Math.cos(a) * w;
    const d = `M${x} ${y} L${bx + px} ${by + py} L${bx - px} ${by - py} Z`;
    return S("path", { d, class: cls || "ah" }, parent);
  }
  // horizontal dimension line with extension lines and arrowheads both ends
  function dimH(parent, x1, x2, y, extFrom, cls) {
    const out = { exts: [], line: null, heads: [] };
    if (extFrom != null) {
      out.exts.push(L(parent, x1, extFrom, x1, y + (y > extFrom ? 8 : -8), "ext"));
      out.exts.push(L(parent, x2, extFrom, x2, y + (y > extFrom ? 8 : -8), "ext"));
    }
    out.line = L(parent, x1 + 2, y, x2 - 2, y, cls || "dim");
    out.heads.push(head(parent, x1, y, 180, 10, cls === "ln" ? "ahi" : "ah"));
    out.heads.push(head(parent, x2, y, 0, 10, cls === "ln" ? "ahi" : "ah"));
    return out;
  }
  // a file glyph: sheet with a folded corner and a path label under it
  function fileGlyph(parent, x, y, w, h) {
    const f = 14;
    const g = G(parent, x, y);
    const body = P(g, `M0 0 H${w - f} L${w} ${f} V${h} H0 Z`, "ln");
    const fold = P(g, `M${w - f} 0 V${f} H${w}`, "ln");
    return { g, body, fold };
  }
  // the 3x3 logo: path cells (r1c1, r1c2, r2c2, r2c3, r3c3) filled, last in accent
  const LOGO_PATH = [[0, 0], [0, 1], [1, 1], [1, 2], [2, 2]];
  function logo(parent, x, y, cell, gap, strokeW) {
    const g = G(parent, x, y, "logo");
    const cells = {};
    const outlines = [];
    const fills = [];
    const sw = strokeW || 1.5;
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      const onPath = LOGO_PATH.some(([pr, pc]) => pr === r && pc === c);
      const px = c * (cell + gap), py = r * (cell + gap);
      if (!onPath) {
        const o = S("rect", { x: px + sw / 2, y: py + sw / 2, width: cell - sw, height: cell - sw, rx: 1.5, fill: "none", stroke: C.hairS, "stroke-width": sw, pathLength: 1, class: "draw" }, g);
        outlines.push(o);
      }
      cells[`${r}${c}`] = { px, py };
    }
    LOGO_PATH.forEach(([r, c], i) => {
      const { px, py } = cells[`${r}${c}`];
      const last = i === LOGO_PATH.length - 1;
      const f = S("rect", { x: px, y: py, width: cell, height: cell, rx: 1.5, fill: last ? C.accent : C.ink }, g);
      fills.push(f);
    });
    return { g, outlines, fills, size: cell * 3 + gap * 2 };
  }

  // ---- seek-safe reveal helpers ----
  const EASE = "expo.out";
  function draw(tl, els, t, dur, opts) {
    opts = opts || {};
    // a long line without pathLength draws in real units (pathLength dashes fail on very long strokes)
    const one = !Array.isArray(els) && els.getAttribute && !els.hasAttribute("pathLength") && els.getTotalLength;
    if (one) {
      const len = Math.ceil(els.getTotalLength()) + 2;
      return tl.fromTo(els, { strokeDasharray: `${len} ${len}`, strokeDashoffset: len },
        { strokeDashoffset: 0, duration: dur || 0.7, ease: opts.ease || EASE }, t);
    }
    return tl.fromTo(els, { strokeDasharray: "1 1", strokeDashoffset: opts.from == null ? 1 : opts.from },
      { strokeDashoffset: 0, duration: dur || 0.7, ease: opts.ease || EASE, stagger: opts.stagger || 0 }, t);
  }
  function undraw(tl, els, t, dur, opts) {
    opts = opts || {};
    return tl.fromTo(els, { strokeDasharray: "1 1", strokeDashoffset: 0 },
      { strokeDashoffset: opts.to == null ? -1 : opts.to, duration: dur || 0.5, ease: opts.ease || "power3.in", stagger: opts.stagger || 0, immediateRender: false }, t);
  }
  function fadeIn(tl, els, t, dur, opts) {
    opts = opts || {};
    const y = opts.y == null ? 10 : opts.y;
    const x = opts.x || 0;
    const from = { opacity: 0 }, to = { opacity: 1, duration: dur || 0.6, ease: opts.ease || EASE, stagger: opts.stagger || 0, immediateRender: opts.immediateRender == null ? true : opts.immediateRender };
    if (y) { from.y = y; to.y = 0; }
    if (x) { from.x = x; to.x = 0; }
    return tl.fromTo(els, from, to, t);
  }
  function fadeOut(tl, els, t, dur, opts) {
    opts = opts || {};
    return tl.to(els, { opacity: 0, duration: dur || 0.4, ease: opts.ease || "power2.in", stagger: opts.stagger || 0 }, t);
  }
  function pop(tl, els, t, dur, opts) {
    opts = opts || {};
    return tl.fromTo(els, { scale: 0, transformOrigin: "50% 50%" }, { scale: 1, duration: dur || 0.55, ease: opts.ease || EASE, stagger: opts.stagger || 0 }, t);
  }
  function fill(tl, el, color, t, dur) {
    return tl.to(el, { fill: color, stroke: color, duration: dur || 0.3, ease: "power2.out" }, t);
  }
  // three-phase nudge curve (ramp-in, linear burst, long tail) on one property
  function nudge(tl, el, prop, from, to, t, dur, extra) {
    const d = to - from;
    const r = dur * 0.24, b = dur * 0.26, tail = dur * 0.5;
    const v1 = {}, v2 = {}, v3 = {};
    v1[prop] = from + d * 0.12; v2[prop] = from + d * 0.68; v3[prop] = to;
    Object.assign(v1, extra || {}, { duration: r, ease: "power2.in" });
    Object.assign(v2, extra || {}, { duration: b, ease: "none" });
    Object.assign(v3, extra || {}, { duration: tail, ease: "power4.out" });
    tl.to(el, v1, t);
    tl.to(el, v2, t + r);
    tl.to(el, v3, t + r + b);
    return t + dur;
  }
  // loop sheet: hairline frame, registration marks and a three-cell title block
  function loopFrame(s, W, H, cells, widths) {
    R(s, 16.5, 16.5, W - 33, H - 33, "hair-s");
    [[34, 34], [W - 34, 34], [34, H - 82], [W - 34, H - 82]].forEach(([x, y]) => reg(s, x, y, 7));
    const ty = H - 64;
    L(s, 16.5, ty, W - 16.5, ty, "hair-s");
    let x = 16.5;
    const out = [];
    cells.forEach((c, k) => {
      if (k) L(s, x, ty, x, H - 16.5, "hair-s");
      out.push(T(s, x + 18, ty + 30, c, k === 0 ? "t-mono-b" : "t-mono ink2", 15));
      x += widths[k];
    });
    return { ty, cells: out, cx: (k) => 16.5 + widths.slice(0, k).reduce((a, b) => a + b, 0) + 18 };
  }
  // swap one of several stacked labels: show index i at time t
  // the old label leaves first, then the new one arrives, so two never overlap
  function swap(tl, els, i, t, dur) {
    const d = dur || 0.25;
    els.forEach((e, k) => {
      if (k === i) tl.to(e, { opacity: 1, duration: d, ease: "power2.out" }, t + d * 0.55);
      else tl.to(e, { opacity: 0, duration: d * 0.5, ease: "power2.in" }, t);
    });
  }
  function fontsReady() {
    return Promise.all([
      document.fonts.load('680 100px "Archivo"'),
      document.fonts.load('420 30px "Archivo"'),
      document.fonts.load('500 20px "Azeret Mono"'),
      document.fonts.load('600 20px "Azeret Mono"'),
    ]).then(() => document.fonts.ready);
  }
  return { NS, C, S, svg, G, T, L, P, R, station, reg, head, dimH, fileGlyph, logo, LOGO_PATH, draw, undraw, fadeIn, fadeOut, pop, fill, nudge, loopFrame, swap, fontsReady, EASE };
})();
