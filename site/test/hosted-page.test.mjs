// The Hosted page as built (U7): the approved mock's blocks and words, the configurator's default state
// (AE1), the deploy addresses, the four figures and the heading outline. These read
// site/dist/hosted/index.html, which only a build with the page switched on writes
// (AB_HOSTED_PREVIEW=1, src/lib/hosted-release.mjs); without it the tests are skipped and say so.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { getHosted } from '../src/components/hosted/hosted-data.mjs';
import { LOOPS } from '../src/components/kit/kit-data.ts';
import { getSection, githubSlug, parseHeadings } from '../src/lib/readme.mjs';
import { findRepoRoot, SITE_URL } from '../src/lib/site.mjs';

const root = findRepoRoot();
const file = join(root, 'site', 'dist', 'hosted', 'index.html');
const skip = !existsSync(file) && 'site/dist/hosted/ is not built (run AB_HOSTED_PREVIEW=1 npm run build in site/)';
const hosted = getHosted();
const readme = readFileSync(join(root, 'eve', 'README.md'), 'utf8');

let cached;
const html = () => (cached ??= readFileSync(file, 'utf8'));

const decode = (s) =>
  s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
// a tag's attributes, stepping over quoted values (a media query such as "(width >= 1200px)" holds a >)
const tags = (text, name) => [...text.matchAll(new RegExp(`<${name}\\b(?:"[^"]*"|[^>"])*>`, 'g'))].map(([tag]) => tag);
const attr = (tag, name) => {
  const m = tag.match(new RegExp(`\\s${name}(?:="([^"]*)")?(?=[\\s/>])`));
  return m ? decode(m[1] ?? '') : undefined;
};
const has = (tag, name) => attr(tag, name) !== undefined;
const classes = (tag) => (attr(tag, 'class') ?? '').split(/\s+/);
// the visible words of a stretch of HTML: no scripts, styles or noscript fallbacks, whitespace folded
const words = (text) =>
  decode(text.replace(/<(script|style|noscript)\b[^]*?<\/\1>/g, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const main = () => html().match(/<main\b[^>]*>([^]*)<\/main>/)[1];
const sections = () => [...main().matchAll(/<section\b[^>]*>[^]*?<\/section>/g)].map(([s]) => s);
const figures = () => [...main().matchAll(/<figure\b[^>]*>[^]*?<\/figure>/g)].map(([f]) => f);
const version = (path) => createHash('sha1').update(readFileSync(join(root, 'site', 'public', path))).digest('hex').slice(0, 8);
const versioned = (url) => {
  const [path, query] = url.split('?');
  return path.startsWith('/media/') && query === `v=${version(path)}`;
};

// Step 1's channel rows and step 3's ways to ask, in the approved mock v3.2's order (rulings 41 and 43).
// The page shows a channel only once a route serves it (FACTS section 14), so both follow the channels in
// hosted-data's route states.
const CHANNELS = {
  web: ['Web chat', 'A password you choose', 'open the web chat'],
  slack: ['Slack', "A Slack app's bot token and signing secret", 'mention the agent in Slack'],
  linear: ['Linear', "A Linear app's client ID and secret, and a webhook secret", 'assign it a Linear issue'],
  telegram: ['Telegram', 'A bot token and a webhook secret', 'message its Telegram bot'],
  mcp: ['MCP', 'A token you choose; Claude.ai and ChatGPT need an identity provider', 'call it over MCP'],
};
const FULL_ASK =
  'Open the web chat, mention the agent in Slack, assign it a Linear issue, message its Telegram bot or call it over MCP.';
const served = [...new Set(hosted.states.map((s) => s.channel))];
const channels = Object.keys(CHANNELS).filter((c) => served.includes(c));
const joinAsks = (list) => `${[list.slice(0, -1).join(', '), list.at(-1)].filter(Boolean).join(' or ')}.`.replace(/^./, (c) => c.toUpperCase());
const askLine = joinAsks(channels.map((c) => CHANNELS[c][2]));
// the word cap (ruling 43): hidden panels counted, the dropdowns' option labels not
const WORD_CAP = 960;

// The copy deck's strings (r2/d2/src/copy.md; steps 1 to 3 from the approved mock v3.2), block by block in
// page order.
const BLOCKS = [
  [
    'Agent Blueprint, hosted.',
    'The same skills as in your terminal, running as an agent on your own Vercel account, Railway or server.',
    'Deploy',
    'Try the demo',
    'You ask through the web chat, Slack, Linear, Telegram or MCP, and the agent works in a sandbox. It pushes a branch as each stage finishes and opens a pull request as your GitHub App.',
  ],
  [
    'Set up your own copy.',
    'What a copy needs, one group at a time',
    'Have these ready',
    'Every route needs',
    'GitHub',
    'An account, and a GitHub App on the one repository the agent works on: Contents and Pull requests read and write, Metadata read-only',
    'Vercel',
    'An account with AI Gateway credits, because the models run through the Gateway on every route',
    'Where the agent runs (pick one)',
    'Vercel',
    `The same Vercel account runs the agent, the web chat and the sandbox. Runs over ${hosted.tierMinutes} minutes need the Pro plan.`,
    'Railway',
    'A Railway account to run the agent, and a Daytona account for the sandbox',
    'Your own server',
    'A server with Node 24 or later that stays up, and Docker or a Daytona account for the sandbox',
    'How you reach it (pick one)',
    ...channels.flatMap((c) => CHANNELS[c].slice(0, 2)),
    'Deploy',
    'Pick a host, a channel and the models to get the deploy button or the commands. The deploy link holds none of the sensitive values.',
    'Ask for a change',
    `${askLine} Name the repository and a feature. The agent asks you at its checkpoints and before it opens the pull request.`,
  ],
  // the launch film, Fig. 5 (parent plan U14, ruling 79), before the demo block its end card points to
  [
    'Watch one request reach its pull request.',
    'An example run, from the request in the web chat to the pull request your GitHub App opens.',
    'Sound',
    'Ask',
    'Sandbox',
    'Stages',
    'Pull request',
    'Deploy',
    'Scored',
  ],
  [
    'Try it before you deploy.',
    "The demo is Dominik's own copy of this agent, working on a public sample repository. It opens with a code that comes in his message to you.",
    'Try the demo',
  ],
];

test("the page carries the mock's three sections and the film's in order, each with its words", { skip }, () => {
  const found = sections();
  assert.equal(found.length, BLOCKS.length, 'sections in <main>');
  BLOCKS.forEach((strings, i) => {
    const text = words(found[i]);
    let at = 0;
    for (const s of strings) {
      const next = text.indexOf(s, at);
      assert.ok(next >= 0, `section ${i + 1}: "${s}" missing or out of order`);
      at = next + s.length;
    }
  });
  assert.doesNotMatch(words(main()), /tally/i, 'the sample repository is never called tally');
  assert.doesNotMatch(main(), /[\u2013\u2014]/, 'no en or em dash');
});

test("the Node version in step 1's own-server row is the one eve/README.md asks for on your own server", { skip }, () => {
  const page = words(main()).match(/A server with Node (\d+) or later/)?.[1];
  const wanted = getSection(readme, 'Your own server').lines.join('\n').match(/Node (\d+) or later/)?.[1];
  assert.ok(wanted, 'eve/README.md > Your own server names no Node version');
  assert.equal(page, wanted);
});

test("step 1's GitHub App link opens eve/README.md's Pre-flight section on GitHub main", { skip }, () => {
  const step = main().match(/<li id="github-app">[^]*?<\/li>/)?.[0];
  assert.ok(step, 'no step 1');
  const a = tags(step, 'a').find((t) => step.slice(step.indexOf(t) + t.length).startsWith('GitHub App</a>'));
  assert.ok(a, 'no GitHub App link in step 1');
  const slug = githubSlug('Pre-flight');
  assert.ok(parseHeadings(readme).some((h) => h.slug === slug), 'eve/README.md has no Pre-flight heading');
  assert.equal(attr(a, 'href'), hosted.links.variables.replace(/#.*$/, `#${slug}`));
});

test('AE1: the built default state is Vercel with the web chat, the Vercel result alone, and the web chat link', { skip }, () => {
  const form = main().match(/<form\b[^>]*id="cfg"[^]*?<\/form>/)?.[0];
  assert.ok(form, 'no configurator form');
  const radios = tags(form, 'input').filter((t) => attr(t, 'type') === 'radio');
  assert.deepEqual(
    radios.filter((t) => has(t, 'checked') && attr(t, 'name') !== 'sandbox').map((t) => `${attr(t, 'name')}=${attr(t, 'value')}`),
    ['host=vercel', 'channel=web', 'models=quality'],
  );
  const results = tags(form, 'div').filter((t) => classes(t).includes('res'));
  assert.deepEqual(results.filter((t) => !has(t, 'hidden')).map((t) => attr(t, 'data-res')), ['vercel']);
  assert.deepEqual(results.filter((t) => has(t, 'hidden')).map((t) => attr(t, 'data-res')).sort(), ['railway', 'server']);
  const vercel = form.slice(form.indexOf('data-res="vercel"'));
  const link = attr(tags(vercel, 'a')[0], 'href');
  assert.equal(link, hosted.hosts.find((h) => h.id === 'vercel').links.web);
  const params = new URL(link).searchParams;
  assert.deepEqual(params.get('env').split(','), ['AB_ROSTER', 'AB_GITHUB_APP_ID', 'AB_GITHUB_APP_PRIVATE_KEY', 'EVE_CHAT_PASSWORD']);
  assert.deepEqual(JSON.parse(params.get('envDefaults')), { AB_ROSTER: 'quality' });
  assert.equal(params.get('root-directory'), 'eve');
});

test('no address on the page gives a sensitive name a value or an envDefaults key', { skip }, () => {
  const sensitive = new Set(hosted.names.filter((n) => n.sensitive).map((n) => n.name));
  assert.ok(sensitive.size > 0);
  const hrefs = [...html().matchAll(/\shref="([^"]*)"/g)].map(([, h]) => decode(h));
  assert.ok(hrefs.length > 0);
  for (const href of hrefs) {
    const url = new URL(href, SITE_URL);
    for (const [key, value] of url.searchParams) {
      assert.ok(!sensitive.has(key), `${href}: the parameter ${key}`);
      for (const name of sensitive) assert.ok(!value.includes(`${name}=`), `${href}: ${name}= in ${key}`);
      if (key === 'envDefaults') {
        const keys = Object.keys(JSON.parse(value));
        assert.deepEqual(keys.filter((k) => sensitive.has(k)), [], `${href}: envDefaults`);
      }
    }
  }
});

test('Figs. 1 to 3: two boxes each, lazy videos with one shared text alternative and versioned media', { skip }, () => {
  const figs = figures();
  const loops = ['loop-request-to-pr', 'loop-prereqs', 'loop-routes'];
  const caps = [...main().matchAll(/<b>Fig\. (\d+)<\/b>/g)].map(([, n]) => Number(n));
  assert.deepEqual(caps, [1, 2, 3, 4], 'figure numbers in page order');
  loops.forEach((name, i) => {
    const fig = figs[i];
    const where = `Fig. ${i + 1}`;
    const entry = LOOPS.find((l) => l.name === name);
    const boxes = tags(fig, 'div').filter((t) => classes(t).includes('vf-media'));
    assert.deepEqual(boxes.map((t) => classes(t).find((c) => c === 'vf-land' || c === 'vf-port')), ['vf-land', 'vf-port'], `${where}: boxes`);
    for (const box of boxes) assert.match(attr(box, 'style') ?? '', /aspect-ratio:\s*\d+ \/ \d+/, `${where}: aspect ratio`);
    const videos = tags(fig, 'video');
    assert.equal(videos.length, 2, `${where}: videos`);
    const altId = attr(videos[0], 'aria-labelledby');
    for (const v of videos) {
      assert.equal(attr(v, 'preload'), 'none', `${where}: preload`);
      assert.ok(!has(v, 'autoplay') && !has(v, 'poster'), `${where}: autoplay or poster attribute`);
      assert.ok(Number(attr(v, 'width')) > 0 && Number(attr(v, 'height')) > 0, `${where}: width and height`);
      assert.equal(attr(v, 'aria-labelledby'), altId, `${where}: both videos share one text alternative`);
    }
    const alt = [...html().matchAll(new RegExp(`<span id="${altId}" hidden>([^<]*)</span>`, 'g'))];
    assert.equal(alt.length, 1, `${where}: the text alternative exists once`);
    assert.equal(decode(alt[0][1]), entry.alt, `${where}: the text alternative is the LOOPS entry's`);
    assert.ok(entry.alt.startsWith('Looping animation, no sound: '));
    const sources = tags(fig, 'source').filter((t) => has(t, 'src')).map((t) => attr(t, 'src'));
    assert.deepEqual(sources.map((s) => s.split('?')[0]), [`/media/${name}.mp4`, `/media/${entry.portrait}.mp4`], `${where}: sources`);
    assert.ok(sources.every(versioned), `${where}: unversioned source`);
  });

  // Fig. 2 and 3: a poster in each box; the portrait box offers its AVIF still first and keeps the JPG
  // as the fallback (ruling 38), the landscape box keeps its bare JPG. Neither is the page's largest
  // paint, so both wait for the reader (ruling 47): data-src and data-srcset, no URL a browser fetches
  // while the page loads, and a lazy <noscript> copy with the real URLs for a reader without JavaScript.
  ['loop-prereqs', 'loop-routes'].forEach((name, i) => {
    const fig = figs[i + 1];
    const where = `Fig. ${i + 2}`;
    const entry = LOOPS.find((l) => l.name === name);
    const fallbacks = fig.match(/<noscript>[^]*?<\/noscript>/g) ?? [];
    const live = fig.replace(/<noscript>[^]*?<\/noscript>/g, '');
    const posters = tags(live, 'img').filter((t) => classes(t).includes('vf-poster'));
    assert.equal(posters.length, 2, `${where}: posters`);
    for (const p of posters) {
      assert.ok(!has(p, 'src') && !has(p, 'loading'), `${where}: a poster src the browser would fetch before the reader nears it`);
      assert.ok(versioned(attr(p, 'data-src')), attr(p, 'data-src'));
      assert.ok(Number(attr(p, 'width')) > 0 && Number(attr(p, 'height')) > 0, `${where}: poster width and height`);
    }
    assert.deepEqual(posters.map((p) => attr(p, 'data-src').split('?')[0]), [`/media/${name}.jpg`, `/media/${entry.portrait}.jpg`], `${where}: JPG posters`);
    const pictures = live.match(/<picture>[^]*?<\/picture>/g) ?? [];
    assert.equal(pictures.length, 1, `${where}: one <picture>, the portrait poster`);
    const port = live.indexOf(tags(live, 'div').find((t) => classes(t).includes('vf-port')));
    assert.ok(live.indexOf(pictures[0]) > port, `${where}: the <picture> sits in the portrait box`);
    assert.ok(live.indexOf(posters[0]) < port, `${where}: the landscape poster stays a bare <img>`);
    const sources = tags(pictures[0], 'source');
    assert.equal(sources.length, 1, `${where}: one AVIF source`);
    assert.equal(attr(sources[0], 'type'), 'image/avif', `${where}: source type`);
    assert.ok(!has(sources[0], 'srcset'), `${where}: an AVIF srcset the browser would fetch before the reader nears it`);
    const avif = attr(sources[0], 'data-srcset');
    assert.equal(avif.split('?')[0], `/media/${entry.portrait}-720.avif`, `${where}: AVIF still`);
    assert.ok(versioned(avif), avif);
    assert.deepEqual(tags(pictures[0], 'img'), [posters[1]], `${where}: the JPG fallback is the portrait poster`);
    // without JavaScript: one noscript copy per box, the same files, lazy and at the same size
    assert.equal(fallbacks.length, 2, `${where}: a noscript copy in each box`);
    fallbacks.forEach((copy, k) => {
      const img = tags(copy, 'img')[0];
      assert.ok(img && classes(img).includes('vf-poster'), `${where}: the noscript copy is a poster`);
      assert.equal(attr(img, 'src'), attr(posters[k], 'data-src'), `${where}: the noscript copy's JPG`);
      assert.equal(attr(img, 'loading'), 'lazy', `${where}: the noscript copy loads lazily`);
      assert.deepEqual([attr(img, 'width'), attr(img, 'height')], [attr(posters[k], 'width'), attr(posters[k], 'height')], `${where}: the noscript copy's size`);
    });
    assert.equal(attr(tags(fallbacks[1], 'source')[0], 'srcset'), avif, `${where}: the noscript copy offers the same AVIF`);
    assert.equal(tags(fallbacks[0], 'source').length, 0, `${where}: the landscape noscript copy stays a bare <img>`);
  });

  // Fig. 1, in the hero: one eager <picture> with an AVIF source per band and a high-priority fallback
  const hero = figs[0];
  assert.ok(sections()[0].includes(hero), 'Fig. 1 sits in the hero');
  const picture = hero.match(/<picture>[^]*?<\/picture>/)?.[0];
  assert.ok(picture, 'Fig. 1 has no <picture>');
  const avif = tags(picture, 'source');
  assert.ok(avif.length >= 2 && avif.every((t) => attr(t, 'type') === 'image/avif'), 'AVIF sources');
  for (const s of avif) {
    for (const c of attr(s, 'srcset').split(',')) {
      const url = c.trim().split(/\s+/)[0];
      assert.ok(url.split('?')[0].endsWith('.avif') && versioned(url), url);
    }
  }
  const img = tags(picture, 'img')[0];
  assert.equal(attr(img, 'loading'), 'eager');
  assert.equal(attr(img, 'fetchpriority'), 'high');
  assert.ok(versioned(attr(img, 'src')), attr(img, 'src'));

  // Fig. 4: the chat run, in the third step
  const chat = figs[3];
  assert.ok(/data-chat-run/.test(tags(chat, 'figure')[0]) && attr(tags(chat, 'figure')[0], 'id') === 'fig-4', 'Fig. 4 is the chat run');
});

test("Fig. 2 is the prerequisites piece with ruling 43's caption and text alternative", { skip }, () => {
  const entry = LOOPS.find((l) => l.name === 'loop-prereqs');
  assert.ok(entry, 'loop-prereqs is not in LOOPS');
  assert.equal(entry.caption, 'What a copy needs, one group at a time');
  assert.equal(entry.alt, 'Looping animation, no sound: the prerequisites fill in group by group, then a lens frames each in turn.');
  assert.equal(entry.label, 'the prerequisites animation');
  assert.equal(entry.portrait, 'loop-prereqs-portrait');
  const fig = figures()[1];
  assert.match(words(fig), /Fig\. 2 ?What a copy needs, one group at a time/);
  const buttons = tags(fig, 'button');
  assert.ok(buttons.length > 0 && buttons.every((t) => attr(t, 'aria-label') === 'Play the prerequisites animation'), 'Play labels');
});

test('step 1 lists every channel a route serves, and only those; step 3 names the same ones', { skip }, () => {
  assert.deepEqual(served.filter((c) => !CHANNELS[c]), [], 'a route serves a channel step 1 has no row for');
  const step = main().match(/<li id="github-app">[^]*?<\/li>/)[0];
  const groups = [...step.matchAll(/<h4\b[^>]*>([^<]*)<\/h4>\s*<dl\b[^>]*>([^]*?)<\/dl>/g)];
  assert.deepEqual(groups.map(([, h]) => decode(h)), ['Every route needs', 'Where the agent runs (pick one)', 'How you reach it (pick one)']);
  const rows = [...groups[2][2].matchAll(/<dt\b[^>]*>([^<]*)<\/dt>\s*<dd\b[^>]*>([^]*?)<\/dd>/g)].map(([, dt, dd]) => [decode(dt), words(dd)]);
  assert.deepEqual(rows, channels.map((c) => CHANNELS[c].slice(0, 2)));
  // ruling 43's full sentence is these clauses joined; the page leaves out the ones no route serves yet
  assert.equal(joinAsks(Object.values(CHANNELS).map((c) => c[2])), FULL_ASK);
  const ask = main().match(/<li id="ask">[^]*?<\/li>/)[0];
  assert.ok(words(ask).includes(`${askLine} Name the repository and a feature.`), 'step 3 sentence');
});

// Ruling 43: the page holds at most 960 words, counted as the mock was: the title and description, the
// body's words with hidden panels shown, and every alt, aria-label and title, but not the dropdowns'
// option labels (ruling 33). The chat run draws its frames from a script as its figure approaches, so
// the built page carries only its sentence and caption; U9's copy audit counts the drawn frame as well.
// Fig. 5, the launch film, stays out of the count (ruling 84): its section is removed before counting,
// and the rest of the page keeps the 960.
test(`the page stays within the word cap of ${WORD_CAP}`, { skip }, () => {
  const page = html();
  const title = page.match(/<title>([^<]*)<\/title>/)[1];
  const desc = attr(tags(page, 'meta').find((t) => attr(t, 'name') === 'description'), 'content');
  const body = page
    .match(/<body\b[^>]*>([^]*)<\/body>/)[1]
    .replace(/<section class="hs-film"[^]*?<\/section>/, ' ')
    .replace(/<(script|style|noscript|template|select)\b[^]*?<\/\1>/g, ' ')
    .replace(/<wbr\s*\/?>/g, '');
  assert.match(page, /<section class="hs-film"/, 'the film section the count leaves out is on the page');
  const labels = [...body.matchAll(/\s(?:aria-label|alt|title)="([^"]*)"/g)].map(([, v]) => decode(v));
  const count = [decode(title), desc, words(body), ...labels].join(' ').split(/\s+/).filter(Boolean).length;
  assert.ok(count > 0);
  assert.ok(count <= WORD_CAP, `${count} words, over the cap of ${WORD_CAP}`);
});

// Chrome takes a playing video's first frame as a largest-paint candidate and measures its area one
// pixel row larger than the poster image in the same box, so once Fig. 1's video started it replaced
// the poster as the page's largest paint (P7 r1, U9: at 1440 px on a cold Slow 4G load the LCP moved
// from 1.4 s to 3.3 s). Clipping one row top and bottom keeps the video's area under the poster's; the
// loops' outer rows are plain ground in every frame.
test("Fig. 1's videos are clipped a pixel row top and bottom, so the poster stays the largest paint", { skip }, () => {
  const css = [...html().matchAll(/<style\b[^>]*>([^]*?)<\/style>/g)].map(([, s]) => s).join('\n');
  assert.match(css, /\.vf-bands \.vf-media video\{clip-path:inset\(1px 0\)\}/);
});

test("one h1, a heading for every section, the Deploy anchor on the steps, and no island but the header's", { skip }, () => {
  assert.equal(tags(html(), 'h1').length, 1, 'h1 count');
  for (const s of sections()) {
    const id = attr(tags(s, 'section')[0], 'aria-labelledby');
    assert.ok(id, 'a section without aria-labelledby');
    assert.match(s, new RegExp(`<h[12]\\b[^>]*\\sid="${id}"`), `section labelled by ${id} has no heading of that id`);
  }
  assert.equal(attr(tags(sections()[1], 'section')[0], 'id'), 'deploy');
  assert.ok(tags(sections()[0], 'a').some((t) => attr(t, 'href') === '#deploy'), 'the hero Deploy links #deploy');
  const outsideHeader = html().replace(/<header\b[^>]*class="site-head[^]*?<\/header>/, '');
  assert.doesNotMatch(outsideHeader, /<astro-island\b/, 'an island outside the header');
  assert.ok(main().match(/<div\b[^>]*data-pagefind-body/), 'the page root carries data-pagefind-body');
});

// Fig. 5, the launch film (parent plan U14): FilmPlayer with the hosted film's source, poster, chapters
// file and cells, the Sound toggle starting off, and the text alternative saying the film is scored.
test('Fig. 5 plays film-hosted.mp4 with its chapters, a Sound toggle that starts off, and scored cells', { skip }, () => {
  const fig = figures().find((f) => has(tags(f, 'figure')[0], 'data-film'));
  assert.ok(fig, 'no film figure');
  const chapters = JSON.parse(readFileSync(join(root, 'site', 'public', 'media', 'film-hosted-chapters.json'), 'utf8'));
  assert.deepEqual(tags(fig, 'button').filter((t) => classes(t).includes('chap')).map((t) => Number(attr(t, 'data-t'))), chapters.map((c) => c.start));
  assert.match(fig, /<ol class="chapters"[^>]*style="--chap-n:5"/);
  const src = attr(tags(fig, 'source').find((t) => attr(t, 'type') === 'video/mp4'), 'src');
  assert.ok(src.startsWith('/media/film-hosted.mp4?') && versioned(src), `video source ${src}`);
  const poster = attr(tags(fig, 'img').find((t) => classes(t).includes('vf-poster')), 'data-src');
  assert.ok(poster.startsWith('/media/film-hosted-1280.jpg?') && versioned(poster), `poster ${poster}`);
  const sound = tags(fig, 'button').find((t) => classes(t).includes('fd-sound'));
  assert.ok(sound, 'no Sound toggle');
  assert.equal(attr(sound, 'aria-pressed'), 'false', 'the toggle starts off');
  const video = tags(fig, 'video')[0];
  assert.ok(has(video, 'muted'), 'the film starts muted');
  assert.match(attr(video, 'aria-label'), /^Film, \d+ seconds, scored, starts muted\./);
  assert.match(words(fig), /Sound Scored/);
});

test('the demo block offers one link, to the demo', { skip }, () => {
  const demo = sections().at(-1);
  const links = tags(demo, 'a').map((t) => attr(t, 'href'));
  assert.equal(links.length, 1);
  assert.equal(new URL(links[0]).protocol, 'https:');
  assert.ok(tags(sections()[0], 'a').some((t) => attr(t, 'href') === links[0]), 'the hero links the same demo');
});
