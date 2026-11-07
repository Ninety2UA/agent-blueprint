// The demo's look (U8b, U8d): the web app and the gate page carry the product site's tokens, light
// and dark, so the two cannot drift apart silently; the gate page is the approved gate A2 (ruling
// 58), with its headline, the contact links, the Hosted page's Fig. 1 and the footer line;
// the chat is the approved chat C3: the new session's start with the three requests as a real
// list, one composer field holding its Send action, the run panel read from the messages.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { createRequire, registerHooks } from "node:module";
import { join } from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const web = join(import.meta.dirname, "..");

// The app's modules import each other without extensions and through the "@/" alias, as the
// bundlers want; Node needs the file. Its .tsx components are compiled here with the SWC build
// that Next itself compiles them with (TypeScript 7 has no JavaScript transpile API), so a
// component renders to markup with react-dom/server and no bundler.
const swc = createRequire(join(web, "package.json"))("next/dist/build/swc") as {
  loadBindings(): Promise<unknown>;
  transformSync(source: string, options: object): { code: string };
};
await swc.loadBindings();
registerHooks({
  resolve(specifier, context, next) {
    const target = specifier.startsWith("@/") ? pathToFileURL(join(web, specifier.slice(2))).href : specifier;
    try {
      return next(target, context);
    } catch (error) {
      // A package's subpath without an exports map ("next/link") resolves to its .js file.
      if (!target.startsWith(".") && !target.startsWith("file:")) return next(`${target}.js`, context);
      try {
        return next(`${target}.ts`, context);
      } catch {
        return next(`${target}.tsx`, context);
      }
    }
  },
  load(url, context, next) {
    if (!url.endsWith(".tsx")) return next(url, context);
    const { code } = swc.transformSync(readFileSync(fileURLToPath(url), "utf8"), {
      filename: fileURLToPath(url),
      jsc: { parser: { syntax: "typescript", tsx: true }, transform: { react: { runtime: "automatic" } }, target: "es2022" },
      module: { type: "es6" },
    });
    return { format: "module", source: code, shortCircuit: true };
  },
});
const { GATE_STATES } = await import("../lib/gate/states.ts");
const { gatePage } = await import("../lib/gate/pages.ts");
const { fill } = await import("../lib/gate/states.ts");
const { DIAGRAM_TOKENS } = await import("../components/chat/diagram-theme.ts");

const siteTokens = readFileSync(join(web, "..", "..", "..", "site", "src", "styles", "tokens.css"), "utf8");
const appGlobals = readFileSync(join(web, "app", "globals.css"), "utf8");

/** The site's colour tokens that the app and the gate page carry under the same names. */
const TOKENS = [
  "--bg",
  "--bg-sunk",
  "--bg-raise",
  "--ink",
  "--ink-2",
  "--muted",
  "--faint",
  "--hair",
  "--hair-strong",
  "--construct",
  "--accent",
  "--accent-strong",
  "--accent-press",
  "--accent-wash",
  "--on-accent",
  "--scrim",
  "--focus",
  "--mark-line",
];

/** The custom properties declared in the first block that opens with `opener`. */
function declarations(css: string, opener: string): Map<string, string> {
  const start = css.indexOf(opener);
  assert.ok(start >= 0, `no block opens with ${opener}`);
  const body = css.slice(start + opener.length, css.indexOf("}", start));
  const found = new Map<string, string>();
  for (const match of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) found.set(match[1], match[2].trim());
  return found;
}

function assertSame(theme: string, site: Map<string, string>, other: Map<string, string>, where: string) {
  for (const token of TOKENS) {
    assert.ok(site.has(token), `the site's ${theme} tokens name ${token}`);
    assert.equal(other.get(token), site.get(token), `${where}, ${theme}: ${token}`);
  }
}

/** An `oklch(L C h)` token as the sRGB hex a browser paints it with (Ottosson's OKLab matrices). */
function oklchToHex(value: string): string {
  const match = value.match(/^oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)$/);
  assert.ok(match, `${value} is an opaque oklch colour`);
  const [lightness, chroma, hue] = match.slice(1).map(Number);
  const a = chroma * Math.cos((hue * Math.PI) / 180);
  const b = chroma * Math.sin((hue * Math.PI) / 180);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return `#${linear
    .map((channel) => {
      const encoded = channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - 0.055;
      return Math.round(Math.min(1, Math.max(0, encoded)) * 255).toString(16).padStart(2, "0");
    })
    .join("")}`;
}

const siteLight = declarations(siteTokens, ":root {");
const siteDark = declarations(siteTokens, ':root[data-theme="dark"] {');

function demoPage(id: string) {
  const state = GATE_STATES.find((row) => row.id === id)!;
  return gatePage(state, {}, { demo: true });
}

describe("one design system: the site's tokens", () => {
  test("the web app's globals.css carries the site's values, light and dark", () => {
    assertSame("light", siteLight, declarations(appGlobals, ":root,\n.light {"), "globals.css");
    assertSame("dark", siteDark, declarations(appGlobals, ".dark {"), "globals.css");
  });

  test("the gate page carries the site's values, light and dark", () => {
    const html = demoPage("no-cookie");
    assertSame("light", siteLight, declarations(html, ":root {"), "the gate page");
    assertSame("dark", siteDark, declarations(html, "@media (prefers-color-scheme: dark) {\n  :root {"), "the gate page");
  });

  test("a reply's diagram colours are the app's tokens in sRGB hex, light and dark", () => {
    for (const [theme, opener] of [
      ["light", ":root,\n.light {"],
      ["dark", ".dark {"],
    ] as const) {
      const app = declarations(appGlobals, opener);
      for (const [token, hex] of Object.entries(DIAGRAM_TOKENS[theme])) {
        assert.ok(app.has(token), `globals.css, ${theme}, names ${token}`);
        assert.equal(hex, oklchToHex(app.get(token)!), `diagram-theme.ts, ${theme}: ${token}`);
      }
    }
  });

  test("the shadcn names the template reads are mapped onto the site's tokens", () => {
    const light = declarations(appGlobals, ":root,\n.light {");
    for (const [name, token] of [
      ["--background", "var(--bg)"],
      ["--card", "var(--bg-raise)"],
      ["--foreground", "var(--ink)"],
      ["--muted-foreground", "var(--muted)"],
      ["--border", "var(--hair)"],
      ["--primary", "var(--ink)"],
      ["--ring", "var(--focus)"],
    ]) {
      assert.equal(light.get(name), token, name);
    }
  });
});

describe("the gate page: the approved centred sheet", () => {
  test("the panel: the headline, the sub-text, the state's sentence, the labelled field and the action", () => {
    const html = demoPage("no-cookie");
    assert.match(html, /<h1 id="h1"[^>]*>One request in, one pull request out<\/h1>/);
    assert.match(html, /Name a change on the sample repository and the agent works it through to a pull request\./);
    assert.match(html, /role="status" id="state" data-gate-message[^>]*>This demo opens with a code, and the code comes in Dominik's message to you\.</);
    assert.match(html, /<label for="code">The code<\/label>/);
    assert.match(html, /<button class="btn btn-primary" type="submit"[^>]*>Enter the code<\/button>/);
    assert.match(html, /Hosted on <svg class="eve"/, "the lockup credits Eve with its mark");
    assert.match(html, /<span class="sr-only">Eve<\/span>/);
  });

  test("the sheet: the panel before the stage, so the form comes first on a phone, and no dimension line", () => {
    const html = demoPage("no-cookie");
    assert.match(html, /<div class="sheet">/);
    assert.ok(html.indexOf('<section class="panel"') < html.indexOf('<section class="stage"'), "the panel leads the sheet");
    assert.doesNotMatch(html, /class="rail|class="ticks|ab\/&lt;feature&gt;/, "the stage names are not repeated under the figure");
  });

  test("the demo's contact row: both links with their addresses and accessible names, and the caption", () => {
    for (const id of ["no-cookie", "wrong-code"]) {
      const html = demoPage(id);
      const mail = html.match(/<a [^>]*href="mailto:domi@dbenger\.com"[^>]*>/)?.[0] ?? "";
      assert.match(mail, /aria-label="Email Dominik"/, id);
      const linkedin = html.match(/<a [^>]*href="https:\/\/www\.linkedin\.com\/in\/dombenger\/"[^>]*>/)?.[0] ?? "";
      assert.match(linkedin, /aria-label="Dominik on LinkedIn"/, id);
      assert.match(linkedin, /rel="noreferrer"/, id);
      assert.match(html, /<p>Ask Dominik for a code by mail or on LinkedIn\.<\/p>/, id);
    }
    const deployer = gatePage(GATE_STATES[0], {}, { demo: false });
    assert.doesNotMatch(deployer, /mailto:|linkedin\.com|sample repository/, "a deployer's copy shows no contact row and no sample");
  });

  test("the footer line links the product site and the sample repository", () => {
    const html = demoPage("no-cookie");
    const foot = html.match(/<p class="foot">(.*?)<\/p>/)?.[1] ?? "";
    assert.match(foot, /<a href="https:\/\/agent-blueprint\.dbenger\.com\/">agent-blueprint\.dbenger\.com<\/a>/);
    assert.match(foot, /<a href="https:\/\/github\.com\/Ninety2UA\/agent-blueprint-sample"[^>]*>sample repository<\/a>, a small Python package\./);
  });

  test("the wrong-code page: the state's sentence as an alert, the typed value kept, the button reads Try again", () => {
    const state = GATE_STATES.find((row) => row.id === "wrong-code")!;
    const html = gatePage(state, {}, { demo: true, typed: "ab7k2q9ndx4f1hsm8w3rtp6v" });
    assert.match(html, /role="alert" id="state" data-gate-message[^>]*>That code does not match the one in Dominik's message, so check it and try again\.</);
    const input = html.match(/<input id="code"[^>]*>/)?.[0] ?? "";
    assert.match(input, /value="ab7k2q9ndx4f1hsm8w3rtp6v"/);
    assert.match(input, /aria-invalid="true"/);
    assert.match(html, />Try again<\/button>/);
    assert.match(html, /<title>Agent Blueprint demo, wrong code<\/title>/);
  });

  test("the figure: the Hosted page's Fig. 1 in both cuts, posters first, videos muted, looping, inline, preload none", () => {
    const html = demoPage("no-cookie");
    const videos = [...html.matchAll(/<video [^>]*>/g)].map((m) => m[0]);
    assert.equal(videos.length, 2, "a landscape and a portrait cut");
    for (const video of videos) {
      for (const attribute of [" muted", " loop", " playsinline", 'preload="none"', 'aria-labelledby="fig-alt"', 'aria-describedby="fig-cap"']) {
        assert.ok(video.includes(attribute), `the video has ${attribute.trim()}`);
      }
      assert.doesNotMatch(video, /poster=/, "the poster is the picture under the video");
    }
    assert.match(html, /<source src="\/gate-assets\/loop-request-to-pr\.mp4" type="video\/mp4">/);
    assert.match(html, /<source src="\/gate-assets\/loop-request-to-pr-portrait\.mp4" type="video\/mp4">/);
    assert.match(html, /<img class="vf-poster" src="\/gate-assets\/loop-request-to-pr\.jpg" width="1200" height="750"/);
    assert.match(html, /<img class="vf-poster" src="\/gate-assets\/loop-request-to-pr-portrait\.jpg" width="720" height="900"/);
    assert.match(html, /style="aspect-ratio:1200 \/ 750"/, "the box holds the cut's ratio, so nothing shifts");
    assert.match(html, /@container \(width < 540px\)/, "the figure's width picks the cut, as the site's VideoFigure");
    // The caption, the Play control's name and the text alternative are the site's (kit-data.ts).
    assert.match(html, /<b>Fig\. 1<\/b><span id="fig-cap">An example run, from one request to its pull request<\/span>/);
    assert.match(html, /aria-label="Play the example run animation"/);
    assert.match(html, /<span id="fig-alt" hidden>Looping animation, no sound: an example request, Add a short usage section to the README, becomes a draft pull request from your GitHub App as Plan, Execute, Review, Verify and Ship are checked in turn\.<\/span>/);
    assert.doesNotMatch(html, /loop-workflow|Orient to Ship/, "the local workflow loop is gone");
    assert.match(html, /prefers-reduced-motion: reduce/, "the loop stays on its poster under reduced motion");
    assert.match(html, /IntersectionObserver/, "the loop plays only while on screen");
    for (const url of html.matchAll(/(?:src|href|poster)="([^"]+)"|url\("([^"]+)"\)/g)) {
      const value = url[1] ?? url[2];
      if (/^(mailto:|#|https:\/\/(www\.linkedin\.com|agent-blueprint\.dbenger\.com|github\.com\/Ninety2UA)\/?)/.test(value)) continue;
      if (value === "/api/password-auth/login" || value === "/icon.svg") continue;
      assert.match(value, /^\/gate-assets\//, `the page loads ${value} from the open folder`);
    }
    for (const srcset of html.matchAll(/srcset="([^"]+)"/g)) {
      for (const candidate of srcset[1].split(",")) assert.match(candidate.trim(), /^\/gate-assets\/\S+ \d+w$/, candidate);
    }
    assert.doesNotMatch(html, /<script [^>]*src=|<link [^>]*rel="stylesheet"/, "no external script or stylesheet");
  });

  test("every state renders on the same page shape with its own sentence", () => {
    for (const state of GATE_STATES) {
      const values = { branch: "ab/x", stage: "plan", waitSeconds: 45 };
      const html = gatePage(state, values, { demo: true });
      assert.match(html, /One request in, one pull request out/, state.id);
      assert.match(html, /<span class="brand-name">Agent Blueprint<\/span>/, state.id);
      assert.match(html, /data-gate-loop/, state.id);
      assert.match(html, /<div class="sheet">/, state.id);
      assert.ok(html.includes(fill(state.message, values)), `${state.id} shows its sentence`);
      assert.equal(html.includes("<form "), state.action.kind === "enter-code", `${state.id}: the form only where a code is asked`);
      assert.doesNotMatch(html, /\u2014|\u2013/, `${state.id}: no em or en dash`);
    }
  });
});

describe("the chat: the new session's start, the composer and the run panel", () => {
  const REQUESTS = [
    "Add a --version flag to the command-line entry point that prints the version from the package, with a test.",
    "Add input validation to the main function so an empty argument gives a clear error message, with a test.",
    "Add a short usage section to the README that shows the two most common commands and their output.",
  ];

  async function markup(element: unknown) {
    const { renderToStaticMarkup } = await import("react-dom/server");
    return renderToStaticMarkup(element as never);
  }

  async function start(demo: boolean) {
    const { createElement } = await import("react");
    const { SessionStart } = await import("../components/chat/title-block.tsx");
    return markup(createElement(SessionStart, { demo, onPick: () => {} }));
  }

  async function composer(props: Record<string, unknown>) {
    const { createElement } = await import("react");
    const { ChatComposer } = await import("../components/chat/composer.tsx");
    return markup(createElement(ChatComposer, { onChange: () => {}, onSubmit: () => {}, value: "", autoFocus: false, ...props }));
  }

  async function panel(run: unknown, demo = true) {
    const { createElement } = await import("react");
    const { RunPanel } = await import("../components/chat/run-panel.tsx");
    return markup(createElement(RunPanel, { demo, repository: demo ? "Ninety2UA/agent-blueprint-sample" : null, run, title: "New session" } as never));
  }

  test("the demo's start: the title, the intro, the three requests as an ordered list of controls", async () => {
    const html = await start(true);
    assert.match(html, /<h1[^>]*id="sheet-title"[^>]*>New session<\/h1>/);
    assert.match(html, /The agent works on the sample repository, a small Python package with two commands and tests\. Name a change, and each stage is pushed to a branch as it finishes\./);
    assert.doesNotMatch(html, /tally/, "the chat does not name the package");
    assert.match(html, /<h2[^>]*>Suggested requests<\/h2>/);
    const list = html.match(/<ol[^>]*>(.*?)<\/ol>/)?.[1] ?? "";
    const items = [...list.matchAll(/<li><button [^>]*type="button"[^>]*>.*?<span>(.*?)<\/span><\/button><\/li>/g)].map((m) => m[1]);
    assert.deepEqual(items, REQUESTS, "three list items, each a button with its request verbatim");
  });

  test("off the demo: the title only", async () => {
    const html = await start(false);
    assert.match(html, /New session/);
    assert.doesNotMatch(html, /Suggested requests|sample repository/);
  });

  test("one composer: the visible label tied to the field, Send inside the field, disabled while empty", async () => {
    const empty = await composer({ label: "Or write your own request", id: "request" });
    assert.match(empty, /<label [^>]*for="request"[^>]*>Or write your own request<\/label>/);
    const field = empty.match(/<div class="[^"]*"[^>]*data-composer-field[^>]*>(.*?)<\/div>/)?.[1] ?? "";
    assert.match(field, /<textarea [^>]*id="request"/, "the text is inside the field");
    assert.match(field, /<button [^>]*disabled=""[^>]*type="submit"[^>]*>Send<\/button>/, "Send sits inside the same field, disabled while empty");
    const typed = await composer({ label: "Your request", value: "Add a flag" });
    assert.doesNotMatch(typed.match(/<button [^>]*type="submit"[^>]*>/)?.[0] ?? "disabled=\"\"", /disabled=""/, "text enables Send");
    assert.match(empty, /has-\[textarea:focus-visible\]:outline-2/, "focus shows on the whole field");
    assert.match(empty, /max-sheet:min-h-11/, "Send is 44 px on a phone");
  });

  test("the checkpoint's reply box is the same component: one line, Type a response, Reply", async () => {
    const html = await composer({ multiline: false, placeholder: "Type a response", submitLabel: "Reply" });
    assert.match(html, /<input [^>]*aria-label="Type a response"[^>]*placeholder="Type a response"/);
    assert.match(html, /data-composer-field/);
    assert.match(html, />Reply<\/button>/);
  });

  test("the run panel: sheet, repository, the branch pattern before a push, the five stages, the bot", async () => {
    const { EMPTY_RUN } = await import("../lib/chat/run.ts");
    const html = await panel(EMPTY_RUN);
    assert.match(html, /<aside aria-label="The run"/);
    assert.match(html, /Sheet<\/span><h2[^>]*>New session<\/h2>/);
    assert.match(html, /Repository<\/span><a [^>]*href="https:\/\/github\.com\/Ninety2UA\/agent-blueprint-sample"/);
    assert.match(html, /ab\/&lt;feature&gt;-&lt;session&gt;/);
    assert.deepEqual([...html.matchAll(/data-stage="(\w+)"/g)].map((m) => m[1]), ["plan", "execute", "review", "verify", "ship"]);
    assert.match(html, /Pull requests open as<\/span><span[^>]*>agent-blueprint-demo\[bot\]<\/span>/);
    const deployer = await panel(EMPTY_RUN, false);
    assert.doesNotMatch(deployer, /Repository|agent-blueprint-demo/);
  });

  test("the run panel with no stage recorded: one plain line in the Stages cell, no stage list", async () => {
    const { EMPTY_RUN } = await import("../lib/chat/run.ts");
    const html = await panel({ ...EMPTY_RUN, direct: true });
    assert.match(html, /Stages<\/span><p [^>]*data-run-direct[^>]*>Went straight to a pull request<span[^>]*>This run recorded no stages\.<\/span><\/p>/);
    assert.doesNotMatch(html, /data-stage=/);
  });

  test("the phone strip: words instead of bars when no stage was recorded, five bars otherwise", async () => {
    const { createElement } = await import("react");
    const { EMPTY_RUN } = await import("../lib/chat/run.ts");
    const { RunStrip } = await import("../components/chat/run-panel.tsx");
    const strip = (run: typeof EMPTY_RUN) =>
      markup(createElement(RunStrip, { demo: true, repository: "Ninety2UA/agent-blueprint-sample", run, title: "New session" } as never));
    const direct = await strip({ ...EMPTY_RUN, direct: true });
    assert.match(direct, /<b class="font-semibold">Straight to a pull request<\/b>/);
    assert.doesNotMatch(direct, /block h-1 w-3\.5/);
    const usual = await strip(EMPTY_RUN);
    assert.equal(usual.match(/block h-1 w-3\.5/g)?.length, 5);
    assert.doesNotMatch(usual, /Straight to a pull request/);
  });

  test("a helper's stop (ruling 139): the stage reads stopped with its own mark, and the notice links the branch", async () => {
    const { createElement } = await import("react");
    const { EMPTY_RUN } = await import("../lib/chat/run.ts");
    const { RunStopNotice, RunStrip } = await import("../components/chat/run-panel.tsx");
    const stages = EMPTY_RUN.stages.map((stage) =>
      stage.name === "plan"
        ? { ...stage, state: "done" as const, status: "Pushed to the branch" }
        : stage.name === "execute"
          ? { ...stage, state: "stopped" as const, status: "Stopped: a service it needs is busy" }
          : stage,
    );
    const stopped = {
      ...EMPTY_RUN,
      stages,
      current: stages[1],
      branch: "ab/add-a-json-flag-k2m9xq4c",
      repository: "acme/widgets",
      stopped: { notice: "The run stopped after the plan stage because a service it needs is busy." },
    };
    const html = await panel(stopped, false);
    assert.match(html, /data-stage="execute" data-stage-state="stopped"/);
    assert.match(html, /rounded-\[2px\] border-signal/, "a square mark, not the running dot");
    assert.match(html, /Stopped: a service it needs is busy/);
    assert.match(html, /href="https:\/\/github\.com\/acme\/widgets\/tree\/ab\/add-a-json-flag-k2m9xq4c"/, "off the demo the branch links through the run's repository");
    const notice = await markup(createElement(RunStopNotice, { repository: null, run: stopped } as never));
    assert.match(notice, /role="status"/);
    assert.match(notice, /The run stopped after the plan stage because a service it needs is busy\./);
    assert.match(notice, /<a [^>]*href="https:\/\/github\.com\/acme\/widgets\/tree\/ab\/add-a-json-flag-k2m9xq4c"[^>]*>Open the branch<\/a>/);
    assert.equal(await markup(createElement(RunStopNotice, { repository: null, run: EMPTY_RUN } as never)), "", "nothing when the run did not stop");
    const strip = await markup(createElement(RunStrip, { demo: false, repository: null, run: stopped, title: "New session" } as never));
    assert.match(strip, /<b class="font-semibold">Execute<\/b>, stopped: a service it needs is busy/);
  });

  test("no template footer anywhere in the app", () => {
    const sources = (dir: string): string[] =>
      readdirSync(join(web, dir), { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile() && /\.(tsx?|css)$/.test(entry.name))
        .map((entry) => readFileSync(join(entry.parentPath, entry.name), "utf8"));
    for (const source of [...sources("app"), ...sources("components")]) {
      assert.doesNotMatch(source, /Build your own|template-footer-links|Copy Prompt/);
    }
  });
});
