// model-vars.mjs: how the Hosted page's model choice becomes variables (ruling 30). Plain JavaScript with no
// Node or Astro import, so the build (hosted-data.mjs, Configurator.astro) and the browser chunk
// (model-choice.ts) compose the same values. Tested in site/test/hosted-data.test.mjs.
//
// Exports
//   modelVars(roster, preset, picks?)  [[name, value], ...]: the preset variable set to `preset`, then the role
//                            variable (AB_MODEL_<ROLE>) of each role whose pick differs from that preset's model,
//                            in the roster's role order. A pick equal to the preset adds nothing.
//   exportLine(vars)         the own-server line that sets them: "export NAME=value NAME=value".
//   withModels(link, vars)   a Vercel clone link with the preset variable of its `env` and `envDefaults`
//                            replaced by `vars`, in place, so the names keep the README's order. Every value
//                            is written with encodeURIComponent, as hosted-data.mjs writes the static link,
//                            so the default choice gives back the static link unchanged.

/**
 * @typedef {object} Roster
 * @property {string} variable  the preset variable, AB_ROSTER
 * @property {string} model  the role variable pattern, AB_MODEL_<ROLE>
 * @property {string[]} roles  in the README's order
 * @property {Record<string, Record<string, string>>} presets  preset to role to Gateway model id
 */

/**
 * @param {Roster} roster
 * @param {string} preset
 * @param {Record<string, string>} [picks]  role to the model picked for it
 * @returns {[string, string][]}
 */
export function modelVars(roster, preset, picks = {}) {
  /** @type {[string, string][]} */
  const out = [[roster.variable, preset]];
  for (const role of roster.roles) {
    const pick = picks[role];
    if (pick && pick !== roster.presets[preset][role]) out.push([roster.model.replace('<ROLE>', role.toUpperCase()), pick]);
  }
  return out;
}

/** @param {[string, string][]} vars @returns {string} */
export const exportLine = (vars) => `export ${vars.map(([name, value]) => `${name}=${value}`).join(' ')}`;

/**
 * @param {string} link
 * @param {[string, string][]} vars  modelVars(...), the preset variable first
 * @returns {string}
 */
export function withModels(link, vars) {
  const [base, query] = link.split('?');
  const preset = vars[0][0];
  const params = query.split('&').map((pair) => {
    const at = pair.indexOf('=');
    const key = pair.slice(0, at);
    let value = decodeURIComponent(pair.slice(at + 1));
    if (key === 'env') value = value.split(',').flatMap((name) => (name === preset ? vars.map(([n]) => n) : [name])).join(',');
    if (key === 'envDefaults') {
      const entries = Object.entries(JSON.parse(value)).flatMap((entry) => (entry[0] === preset ? vars : [entry]));
      value = JSON.stringify(Object.fromEntries(entries));
    }
    return `${key}=${encodeURIComponent(value)}`;
  });
  return `${base}?${params.join('&')}`;
}
