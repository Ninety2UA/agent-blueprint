// The Hosted page's model choice (rulings 30, 33 and 34, after the approved mock v3.2's page.js), the chunk
// configurator.ts loads on the first interaction with the Models row. Quality and Budget show that preset's
// model for each role as text; Per role turns the same rows into the selects, filled from the one shared
// <template> list the first time it opens and set to the preset chosen last. The variables follow
// model-vars.mjs: the preset, then AB_MODEL_<ROLE> for each role whose pick differs from it. On Vercel they
// join the names list after the preset variable and the link pre-fills them; on Railway they fill "Set after
// deploying"; on your own server they make the export line before the build, which Copy copies too. The line
// is marked up as Cmd.astro marks a command, so it wraps at the same places.
import { escapeHtml } from '../../lib/text.mjs';
import { breakAfterSlashes, keepFlagsWhole } from '../wrap-points.mjs';
import { exportLine, modelVars, withModels } from './model-vars.mjs';

interface Data {
  variable: string;
  model: string;
  preset: string;
  roles: string[];
  presets: Record<string, Record<string, string>>;
  /** each preset model's Gateway name */
  labels: Record<string, string>;
  /** the index of the export line in the own-server commands */
  exportAt: number;
}

interface Route {
  host: string;
  link: string | null;
}

export default function modelChoice(form: HTMLFormElement) {
  const data: Data = JSON.parse(form.querySelector('[data-cfg-models]')?.textContent ?? '{}');
  const get = <T extends Element = HTMLElement>(selector: string) => form.querySelector<T>(selector)!;
  const roles = get('#cfg-roles');
  const selects = [...roles.querySelectorAll<HTMLSelectElement>('select')];
  const shown = [...roles.querySelectorAll<HTMLElement>('.role-model')];
  const radios = [...form.querySelectorAll<HTMLInputElement>('input[name="models"]')];
  const list = get<HTMLTemplateElement>('#gw-models');
  const roster = get(`#cfg-names li[data-name="${data.variable}"]`);
  const later = get('#cfg-later');
  const line = form.querySelectorAll<HTMLElement>('.res[data-res="server"] .ln')[data.exportAt];
  const copy = get('.res[data-res="server"] .copy-btn');
  const link = get<HTMLAnchorElement>('.res[data-res="vercel"] a');

  let base = data.preset; // the preset Per role starts from: the last one chosen
  let from = base; // the preset the selects were last set to
  let filled = false; // the selects hold their default only, until Per role first opens
  let perRole = false;

  const vars = () => {
    const mode = radios.find((r) => r.checked)?.value ?? data.preset;
    perRole = mode === 'role';
    if (!perRole) {
      base = mode;
      return modelVars(data, base);
    }
    if (!filled) {
      for (const s of selects) {
        const value = s.value;
        s.replaceChildren(list.content.cloneNode(true));
        s.value = value;
      }
      filled = true;
    }
    if (from !== base) {
      for (const s of selects) s.value = data.presets[base][s.dataset.role!];
      from = base;
    }
    return modelVars(data, base, Object.fromEntries(selects.map((s) => [s.dataset.role!, s.value])));
  };

  const item = ([name, value]: [string, string], cls = '') => `<li${cls}><code>${escapeHtml(`${name}=${value}`)}</code></li>`;

  return {
    show(route: Route) {
      const v = vars();
      roles.dataset.mode = perRole ? 'role' : 'preset';
      shown.forEach((el, i) => (el.textContent = data.labels[data.presets[base][selects[i].dataset.role!]]));
      form.querySelectorAll('#cfg-names .dyn').forEach((li) => li.remove());
      roster.querySelector('code')!.textContent = `${v[0][0]}=${v[0][1]}`;
      if (route.host === 'vercel') roster.insertAdjacentHTML('afterend', v.slice(1).map((m) => item(m, ' class="dyn"')).join(''));
      later.innerHTML = v.map((m) => item(m)).join('');
      const text = exportLine(v);
      line.innerHTML = `<span class="pr" aria-hidden="true">$</span>${breakAfterSlashes(keepFlagsWhole(escapeHtml(text)))}`;
      copy.dataset.copy = (copy.dataset.copy ?? '').split('\n').map((l, i) => (i === data.exportAt ? text : l)).join('\n');
      if (route.link) link.href = withModels(route.link, v);
    },
    count: () => vars().length - 1,
  };
}
