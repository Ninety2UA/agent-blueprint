// The hero's schematic drawings, ported from the approved f/src/svg.py. Every label is a
// real station, skill name or tool from the site data. Classes map to the CSS tokens in
// home.css, so the drawings follow the light and dark themes. Each element carries its
// own draw-on delay (--d); the .is-drawing class on the <svg> plays the entrance once.
import { numberWord, site, STATIONS } from './home-data';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const markers = (p: string) => `
<defs>
  <marker id="${p}-ah" viewBox="0 0 8 8" refX="7.2" refY="4" markerWidth="8" markerHeight="8" orient="auto-start-reverse" markerUnits="userSpaceOnUse">
    <path d="M0 1.2 L7.6 4 L0 6.8 Z" class="ah"/>
  </marker>
  <marker id="${p}-ahi" viewBox="0 0 8 8" refX="7.2" refY="4" markerWidth="8" markerHeight="8" orient="auto-start-reverse" markerUnits="userSpaceOnUse">
    <path d="M0 1.2 L7.6 4 L0 6.8 Z" class="ahi"/>
  </marker>
</defs>`;

const station = (x: number, y: number, i: number, d: number) =>
  `<g class="st" data-st="${i}" transform="translate(${x} ${y})">` +
  `<g class="st-in" style="--d:${d}ms">` +
  '<line class="st-x" x1="-13" y1="0" x2="13" y2="0"/>' +
  '<line class="st-x" x1="0" y1="-13" x2="0" y2="13"/>' +
  '<circle class="st-ring" r="6.5"/>' +
  '</g></g>';

const drawLine = (x1: number, y1: number, x2: number, y2: number, cls: string, d: number, dur = 700) =>
  `<line class="${cls} draw" pathLength="1" style="--d:${d}ms;--dur:${dur}ms" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;

const text = (x: number, y: number, s: string, cls: string, d: number, anchor = 'start') =>
  `<text class="${cls} fade" style="--d:${d}ms" x="${x}" y="${y}"${anchor === 'start' ? '' : ` text-anchor="${anchor}"`}>${esc(s)}</text>`;

const stationList = () => {
  const names = STATIONS.map((s) => s.name);
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
};

/** The schematic beside the hero copy: the stations on one datum, the two full pipelines
 *  as dimensions, the return loop that carries docs/ to the next session, and the tools
 *  as a parts list. */
export function heroDrawing(): string {
  const W = 700;
  const H = 640;
  const p = 'ha';
  const x0 = 210; // datum x
  const ys = STATIONS.map((_, i) => 56 + i * 80);
  const last = ys.at(-1)!;
  const tools = site.tools;
  const out = [
    `<svg class="sch sch-a is-drawing" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="sch-a-t" xmlns="http://www.w3.org/2000/svg">`,
    `<title id="sch-a-t">The loop drawn as a schematic: ${stationList()} on one line, ` +
      `with ab-build-pipeline and ab-ship-pipeline spanning all ${numberWord(STATIONS.length)} stations, a return line that carries docs/ to ` +
      `the next session, and a parts list of the ${numberWord(tools.length)} tools.</title>`,
    markers(p),
    '<g aria-hidden="true">',
  ];
  out.push(`<rect class="frame fade" style="--d:0ms" x="0.5" y="0.5" width="${W - 1}" height="${H - 1}"/>`);
  for (const [cx, cy] of [[14, 14], [W - 14, 14], [14, H - 14], [W - 14, H - 14]]) {
    out.push(
      `<g class="reg fade" style="--d:60ms" transform="translate(${cx} ${cy})">` +
        '<line x1="-6" y1="0" x2="6" y2="0"/><line x1="0" y1="-6" x2="0" y2="6"/><circle r="3"/></g>',
    );
  }
  out.push(drawLine(x0, ys[0] - 24, x0, last + 24, 'datum', 150, 900));
  const lx = 112;
  out.push(
    `<path class="ret draw" pathLength="1" style="--d:1500ms;--dur:1100ms" ` +
      `d="M${x0 - 9} ${last} H${lx} V${ys[0]} H${x0 - 9}" marker-end="url(#${p}-ahi)"/>`,
  );
  const my = Math.floor((ys[2] + ys[3]) / 2);
  out.push(text(lx - 12, my - 4, 'next session', 'lbl-m mut', 2100, 'end'));
  out.push(text(lx - 12, my + 12, 'reads docs/', 'lbl-m mut', 2140, 'end'));
  STATIONS.forEach((st, i) => {
    const y = ys[i];
    const d = 520 + i * 90;
    out.push(drawLine(x0 + 10, y, x0 + 30, y, 'lead', d + 120, 260));
    out.push(text(x0 + 38, y - 1, st.name, 'lbl-n', d + 160));
    out.push(text(x0 + 38, y + 17, st.lead, 'lbl-m', d + 200));
  });
  ys.forEach((y, i) => out.push(station(x0, y, i, 520 + i * 90)));
  // The station callouts own the band x 248..430; the two dimension lines stand clear of
  // it at x 470 and 652, and their labels share the column between them at different
  // heights, each set against its own line with a short leader tick.
  const sx = 470; // ab-ship-pipeline
  const dx = 652; // ab-build-pipeline
  for (const y of [ys[0], last]) out.push(drawLine(x0 + 236, y, dx + 8, y, 'ext', 1150, 420));
  out.push(
    `<line class="dim draw" pathLength="1" style="--d:1250ms;--dur:800ms" x1="${sx}" y1="${ys[0]}" ` +
      `x2="${sx}" y2="${last}" marker-start="url(#${p}-ah)" marker-end="url(#${p}-ah)"/>`,
  );
  out.push(
    `<line class="dim draw" pathLength="1" style="--d:1350ms;--dur:800ms" x1="${dx}" y1="${ys[0]}" ` +
      `x2="${dx}" y2="${last}" marker-start="url(#${p}-ah)" marker-end="url(#${p}-ah)"/>`,
  );
  // ab-ship-pipeline: right of its line, between Plan and Build
  let ty = ys[1] + 34;
  out.push(drawLine(sx, ty - 4, sx + 8, ty - 4, 'dim', 1500, 200));
  out.push(text(sx + 14, ty, 'ab-ship-pipeline', 'lbl-m', 1520));
  out.push(text(sx + 14, ty + 16, 'no checkpoints', 'lbl-m mut', 1560));
  // ab-build-pipeline: left of its line, between Review and Ship
  ty = ys[3] + 30;
  out.push(drawLine(dx - 8, ty - 4, dx, ty - 4, 'dim', 1600, 200));
  out.push(text(dx - 14, ty, 'ab-build-pipeline', 'lbl-m', 1620, 'end'));
  out.push(text(dx - 14, ty + 16, 'a checkpoint', 'lbl-m mut', 1660, 'end'));
  out.push(text(dx - 14, ty + 32, 'after each stage', 'lbl-m mut', 1700, 'end'));
  out.push(
    `<g class="bubble fade" style="--d:1900ms" transform="translate(${x0 - 50} ${ys[0] - 26})">` +
      '<circle r="11"/><text y="4" text-anchor="middle">A</text></g>',
  );
  // the parts list: the tools in two columns, number, name and install id
  ty = 548;
  out.push(`<line class="rule fade" style="--d:1700ms" x1="24" y1="${ty - 24}" x2="${W - 24}" y2="${ty - 24}"/>`);
  out.push(text(24, ty - 32, 'Parts list', 'lbl-n sm', 1700));
  out.push(text(W - 24, ty - 32, 'tool / install id', 'lbl-m mut', 1720, 'end'));
  const rows = Math.ceil(tools.length / 2);
  const cw = Math.floor((W - 48) / 2);
  tools.forEach((tool, k) => {
    const col = Math.floor(k / rows);
    const row = k % rows;
    const x = 24 + col * (cw + 24);
    const y = ty + row * 22;
    const d = 1760 + k * 45;
    out.push(text(x, y, `${k + 1}`, 'lbl-m mut', d));
    out.push(text(x + 22, y, tool.name, 'lbl-t', d));
    out.push(text(x + cw - 12, y, tool.id, 'lbl-m', d, 'end'));
  });
  out.push(`<line class="rule fade" style="--d:1700ms" x1="${W / 2}" y1="${ty - 14}" x2="${W / 2}" y2="${ty + (rows - 1) * 22 + 6}"/>`);
  out.push(`<path id="${p}-track" class="track" d="M${x0} ${ys[0]} V${last} H${lx} V${ys[0]} H${x0}"/>`);
  out.push('<circle class="tracer" r="4.5" cx="0" cy="0"/>');
  out.push('</g></svg>');
  return out.join('');
}

/** The compact drawing for narrow screens: stations, callouts and the return loop; the
 *  parts list renders as HTML underneath. */
export function heroDrawingMobile(): string {
  const W = 340;
  const H = 452;
  const p = 'hm';
  const x0 = 96;
  const ys = STATIONS.map((_, i) => 40 + i * 74);
  const last = ys.at(-1)!;
  const out = [
    `<svg class="sch sch-m is-drawing" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="sch-m-t" xmlns="http://www.w3.org/2000/svg">`,
    `<title id="sch-m-t">The loop: ${stationList()} on one line, with a return line ` +
      'that carries docs/ to the next session.</title>',
    markers(p),
    '<g aria-hidden="true">',
  ];
  out.push(drawLine(x0, ys[0] - 20, x0, last + 20, 'datum', 150, 900));
  const lx = 30;
  out.push(
    `<path class="ret draw" pathLength="1" style="--d:1300ms;--dur:1000ms" ` +
      `d="M${x0 - 9} ${last} H${lx} V${ys[0]} H${x0 - 9}" marker-end="url(#${p}-ahi)"/>`,
  );
  STATIONS.forEach((st, i) => {
    const y = ys[i];
    const d = 420 + i * 90;
    out.push(drawLine(x0 + 10, y, x0 + 24, y, 'lead', d + 100, 240));
    out.push(text(x0 + 30, y - 1, st.name, 'lbl-n', d + 140));
    out.push(text(x0 + 30, y + 17, st.lead, 'lbl-m', d + 180));
  });
  ys.forEach((y, i) => out.push(station(x0, y, i, 420 + i * 90)));
  out.push(`<path id="${p}-track" class="track" d="M${x0} ${ys[0]} V${last} H${lx} V${ys[0]} H${x0}"/>`);
  out.push('<circle class="tracer" r="4.5" cx="0" cy="0"/>');
  out.push('</g></svg>');
  return out.join('');
}

