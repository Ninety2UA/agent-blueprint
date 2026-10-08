// escape-skill-html.mjs: SKILL.md bodies show raw HTML as text.
//
// The skills write placeholders such as <base-branch>, <name> and <path> in prose. Rendered as
// Markdown, those are raw HTML: the browser treats them as unknown elements and their text
// disappears. This Satteri mdast plugin turns every raw HTML node of a SKILL.md into text, so the
// placeholder shows as written. It runs only for skills/<name>/SKILL.md (checked on the file
// path), so README sections, release notes and hand-written pages keep their HTML.
//
// The same plugin keeps command flags intact. Satteri's smart punctuation runs while it parses,
// so "node --prof" in prose reaches the plugin as "node –prof"; an en dash with whitespace (or
// nothing) before it and a letter right after it is put back as the two hyphens it was. En
// dashes between spaces or numbers stay, and code was never converted.
//
// Astro 7 renders Markdown with Satteri, which does not run markdown.remarkPlugins; the
// integration adds the plugin to the processor's own mdastPlugins list, as Astro lets
// integrations do in astro:config:setup.
//
// Exports
//   isSkillFile(fileURL, skillsDir)   true for <skillsDir>/<name>/SKILL.md
//   escapeSkillHtml(skillsDir)        the plugin factory (null for any other file)
//   default(options?)                 the Astro integration; options.skillsDir defaults to the
//                                     repository's skills/ folder

import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { findRepoRoot } from '../site.mjs';

const FLAG = /(^|\s)\u2013(?=[A-Za-z])/g;

// Parents whose children are blocks: raw HTML there becomes a paragraph, elsewhere plain text.
const FLOW_PARENTS = new Set(['root', 'blockquote', 'listItem', 'footnoteDefinition', 'containerDirective']);

export function isSkillFile(fileURL, skillsDir) {
  if (!fileURL) return false;
  const parts = relative(skillsDir, fileURLToPath(fileURL)).split(sep);
  return parts.length === 2 && parts[0] !== '..' && parts[1] === 'SKILL.md';
}

export function escapeSkillHtml(skillsDir) {
  return (ctx) =>
    isSkillFile(ctx.fileURL, skillsDir)
      ? {
          name: 'escape-skill-html',
          html(node, visit) {
            const text = { type: 'text', value: node.value };
            return FLOW_PARENTS.has(visit.parent(node)?.type ?? 'root') ? { type: 'paragraph', children: [text] } : text;
          },
          text(node, visit) {
            const value = node.value.replace(FLAG, '$1--');
            if (value !== node.value) visit.replaceNode(node, { type: 'text', value });
          },
        }
      : null;
}

/** @returns {import('astro').AstroIntegration} */
export default function escapeSkillHtmlIntegration({ skillsDir = join(findRepoRoot(), 'skills') } = {}) {
  return {
    name: 'agent-blueprint:escape-skill-html',
    hooks: {
      'astro:config:setup': ({ config }) => {
        const processor = config.markdown.processor;
        // another processor would skip the plugin and the placeholders would vanish again
        if (processor.name !== 'satteri') {
          throw new Error(`escape-skill-html: expected the satteri Markdown processor, found "${processor.name}"`);
        }
        processor.options.mdastPlugins.push(escapeSkillHtml(skillsDir));
      },
    },
  };
}
