// route.mjs: README install-table cells for the Getting started tabs. Plain Node, so the tests
// in site/test/docs-route.test.mjs import it directly. The other cells render through inlineCode() in
// ../../lib/text.mjs: `code` spans become <code>, everything else is escaped (README cells name
// placeholders such as <checkout>).
//
//   routeSteps(route, commands)   the Install route cell split at its commands:
//                                 [{ kind: 'cmd', text }  one per command, in order, shown copyable
//                                  { kind: 'text', html } the README's words between them, inline code kept]
//                                 The comma, period or semicolon that joined the words to the command
//                                 before them is dropped (", then" reads "then" under a command block),
//                                 and the words that end the route end with a period, as a sentence
//                                 under a command block does (README table cells leave it out).
//   leadRoute(route, commands)    the short form the home hero shows: { commands, note }. `commands` is the
//                                 route's first run of commands, joined only by "then" (Cursor CLI's and
//                                 Amp's run is Claude Code's two, before "Without Claude Code:"); `note` is one
//                                 sentence of the route's words as HTML: the opening sentence when the route
//                                 starts with words, else the sentence after the run, capitalized; '' when the
//                                 route has no words.

import { inlineCode } from '../../lib/text.mjs';

/**
 * @param {string} route
 * @param {string[]} commands
 * @returns {({ kind: 'cmd', text: string } | { kind: 'text', html: string })[]}
 */
export function routeSteps(route, commands) {
  /** @type {({ kind: 'cmd', text: string } | { kind: 'text', html: string })[]} */
  const steps = [];
  let words = '';
  const flush = () => {
    const html = inlineCode(words.trim().replace(/^[,.;]\s*/, ''));
    if (html) steps.push({ kind: 'text', html });
    words = '';
  };
  for (const part of route.split(/(`[^`]+`)/)) {
    const code = part.match(/^`([^`]+)`$/)?.[1];
    if (code !== undefined && commands.includes(code)) {
      flush();
      steps.push({ kind: 'cmd', text: code });
    } else {
      words += part;
    }
  }
  flush();
  const last = steps.at(-1);
  if (last?.kind === 'text' && !/[.:;!?]$/.test(last.html.replace(/<[^>]+>/g, ''))) last.html += '.';
  return steps;
}

// The first sentence of a route's words, ending in a period (a colon that led into a command becomes one).
function firstSentence(html) {
  const sentence = (html.match(/^.*?[.:](?=\s|$)/)?.[0] ?? html).replace(/[:.]?$/, '.');
  return sentence.replace(/^[a-z]/, (c) => c.toUpperCase());
}

/**
 * @param {string} route
 * @param {string[]} commands
 * @returns {{ commands: string[], note: string }}
 */
export function leadRoute(route, commands) {
  const steps = routeSteps(route, commands);
  let i = 0;
  const opening = steps[0]?.kind === 'text' ? steps[i++] : null;
  const run = [];
  for (; i < steps.length; i++) {
    const step = steps[i];
    if (step.kind === 'cmd') run.push(step.text);
    else if (!(step.html === 'then' && steps[i + 1]?.kind === 'cmd')) break;
  }
  const words = opening ?? (steps[i]?.kind === 'text' ? steps[i] : null);
  return { commands: run, note: words?.kind === 'text' ? firstSentence(words.html) : '' };
}
