// The Changelog's layout, from the README release history (getSiteData().releases, newest first).
// Every release down to the oldest one with a docs/releases/v<version>-release-notes.md file is a
// revision block (ported from the approved h/changelog.html); the releases older than that are rows
// of one table. Splitting at the oldest release with notes keeps the page newest first even when a
// newer release has no notes file.
//
// Exports
//   changelog(releases)   { blocks, older }; each block also carries `previous`, the version it follows.
//   headline(summary)     a block's heading: the README summary's first sentence without its full
//                         stop, cut before a colon ("X becomes Y: the details" reads "X becomes Y").
//   releaseType(version)  "Major" (x.0.0), "Minor" (x.y.0, or x.y) or "Patch".
//   releaseId(version)    "4.0.1" -> "v4-0-1", the anchor of a block or row.
//   splitNotes(html)      a release's rendered notes as { lede, groups: [{ label, html }] }: the first
//                         paragraph is the lede, what comes before the first h2 is "What changed", and
//                         each h2 starts a group named by its text.

/** @typedef {{ version: string, date: string, summary: string, notes: string | null }} Release */

/**
 * @param {Release[]} releases
 * @returns {{ blocks: (Release & { previous: string | undefined })[], older: Release[] }}
 */
export function changelog(releases) {
  const last = releases.findLastIndex((r) => r.notes);
  const blocks = releases.slice(0, last + 1).map((r, i) => ({ ...r, previous: releases[i + 1]?.version }));
  return { blocks, older: releases.slice(last + 1) };
}

/** @param {string} summary */
export function headline(summary) {
  const sentence = summary.match(/^.+?\.(?=\s|$)/s)?.[0] ?? summary;
  return sentence.split(': ')[0].replace(/\.$/, '');
}

/** @param {string} version */
export function releaseType(version) {
  const [, minor = '0', patch = '0'] = version.split('.');
  if (patch !== '0') return 'Patch';
  return minor === '0' ? 'Major' : 'Minor';
}

/** @param {string} version */
export function releaseId(version) {
  return `v${version.replace(/\./g, '-')}`;
}

/**
 * @param {string} html
 * @returns {{ lede: string, groups: { label: string, html: string }[] }}
 */
export function splitNotes(html) {
  const parts = html.trim().split(/^<h2[^>]*>(.*?)<\/h2>\n?/m);
  let head = parts[0].trim();
  let lede = '';
  if (head.startsWith('<p>')) {
    const end = head.indexOf('</p>') + '</p>'.length;
    lede = head.slice(0, end);
    head = head.slice(end).trim();
  }
  const groups = head ? [{ label: 'What changed', html: head }] : [];
  for (let i = 1; i < parts.length; i += 2) {
    groups.push({ label: parts[i].replace(/<[^>]+>/g, ''), html: parts[i + 1].trim() });
  }
  return { lede, groups };
}
