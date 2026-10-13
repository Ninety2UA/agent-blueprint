// naming.mjs: how a reader calls a skill in each tool, from the README naming table (Tool.naming in
// site.mjs). Plain Node, tested in site/test/docs-route.test.mjs.
//
// Exports
//   SETUP_SKILL                   the skill a reader runs after installing, which the install surfaces name.
//   setupSkill(skills)            SETUP_SKILL, checked against the skill folders: throws when none has it,
//                                 so a renamed setup skill stops the build instead of shipping a dead call.
//   callSkill(tools, tool, skill) what to type in `tool` to run `skill`: the tool's syntax and the name
//                                 ("/ab-project-start", "$ab-project-start"), or, for a tool without one, its
//                                 plain-words example with the example's skill swapped for this one
//                                 ("use the ab-project-start skill"). `tools` is the whole install table,
//                                 whose first tool with a syntax gives the example's skill.

export const SETUP_SKILL = 'ab-project-start';

/** @param {{ name: string }[]} skills @returns {string} */
export function setupSkill(skills) {
  if (!skills.some((s) => s.name === SETUP_SKILL)) {
    throw new Error(`site/src/lib/naming.mjs names the setup skill ${SETUP_SKILL}, which skills/ does not have`);
  }
  return SETUP_SKILL;
}

/**
 * @param {{ naming: { syntax: string | null, example: string } }[]} tools
 * @param {{ naming: { syntax: string | null, example: string } }} tool
 * @param {string} skill
 * @returns {string}
 */
export function callSkill(tools, tool, skill) {
  if (tool.naming.syntax !== null) return `${tool.naming.syntax}${skill}`;
  const named = tools.find((t) => t.naming.syntax !== null);
  if (!named) throw new Error('README "Install": the naming table gives no tool a syntax to take the example skill from');
  const exampleSkill = named.naming.example.slice(named.naming.syntax.length);
  return tool.naming.example.replace(exampleSkill, skill);
}
