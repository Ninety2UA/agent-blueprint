// llms.txt (https://llmstxt.org): the site's sections and every skill page with its one-line summary,
// generated from the repository data, so a new or renamed skill changes it on the next build.
//
// Exports
//   llmsTxt(site, nav)   the file's text. `site` is getSiteData(); `nav` is the header's sections
//                        ([{ label, href }], components/nav.ts). Home comes first, then each section,
//                        then one list of skills per README phase, in phase order.

// What each section holds, keyed by its header label. A section missing here is listed without a note.
const SECTION_NOTES = {
  Home: 'What Agent Blueprint is, the loop from idea to pull request, the film and the install command',
  Skills: 'Every skill by phase with its summary, and the helper prompts the skills start',
  Docs: 'Install in each coding CLI, how the blueprint works, customization, updates and the upgrade from v3',
  Tutorials: 'Walkthroughs that take a feature through the skills, step by step',
  Workflow: 'How the skills fit together from idea to pull request',
  Guides: 'Guides for particular jobs, such as unattended runs',
  Kit: 'The film, the loops, the README header, the mark and a short description to copy',
  Changelog: 'Every release, newest first',
};

const listJoin = (items) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);

export function llmsTxt(site, nav) {
  const { siteUrl, counts, tools, phases, skills, version, repoUrl } = site;
  const link = (label, path, note) => `- [${label}](${siteUrl}${path})${note ? `: ${note}` : ''}`;
  const byName = new Map(skills.map((s) => [s.name, s]));
  const lines = [
    '# Agent Blueprint',
    '',
    `> ${counts.skills} skills that take a coding agent from an idea to a reviewed pull request, in ${counts.tools} coding CLIs: ${listJoin(tools.map((t) => t.name))}.`,
    '',
    `Version ${version}. Source and install: ${repoUrl}`,
    '',
    '## Site sections',
    '',
    link('Home', '/', SECTION_NOTES.Home),
    ...nav.map(({ label, href }) => link(label, href, SECTION_NOTES[label])),
  ];
  for (const phase of phases) {
    lines.push('', `## Skills: ${phase.title}`, '');
    for (const name of phase.skills) lines.push(link(name, `/skills/${name}/`, byName.get(name)?.summary));
  }
  return `${lines.join('\n')}\n`;
}
