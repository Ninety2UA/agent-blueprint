// text.mjs: small text helpers shared by the pages, the data modules and the node:test suite. Plain
// Node, so .mjs, .ts and .astro files all import the same code.
//
// Exports
//   escapeHtml(s)      s with & < > and " escaped (& first), safe in text and in a quoted attribute.
//   inlineCode(s)      README inline Markdown as HTML: escaped, `code` spans as <code>.
//   listJoin(items)    "a", "a and b", "a, b and c"; an empty list gives "".
//   capitalize(s)      s with its first character upper-cased: "eight" -> "Eight".

/** @param {string} s @returns {string} */
export const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** @param {string} s @returns {string} */
export const inlineCode = (s) => escapeHtml(s).replace(/`([^`]+)`/g, '<code>$1</code>');

/** @param {string[]} items @returns {string} */
export const listJoin = (items) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);

/** @param {string} s @returns {string} */
export const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
