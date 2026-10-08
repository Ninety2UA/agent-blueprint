// route.mjs: README install-table cells for the Getting started tabs. Plain Node, so the tests
// in site/test/docs-route.test.mjs import it directly.
//
//   inlineMarkdown(text)          the cell as HTML: `code` spans become <code>, everything else is
//                                 escaped (README cells name placeholders such as <checkout>).
//   routeSteps(route, commands)   the Install route cell split at its commands:
//                                 [{ kind: 'cmd', text }  one per command, in order, shown copyable
//                                  { kind: 'text', html } the README's words between them, inline code kept]
//                                 A comma that joined the words to the command before them is dropped
//                                 (", then" reads "then" under a command block).

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function inlineMarkdown(text) {
  return text
    .split(/(`[^`]+`)/)
    .map((part) => (/^`[^`]+`$/.test(part) ? `<code>${escapeHtml(part.slice(1, -1))}</code>` : escapeHtml(part)))
    .join('');
}

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
    const html = inlineMarkdown(words.trim().replace(/^,\s*/, ''));
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
  return steps;
}
