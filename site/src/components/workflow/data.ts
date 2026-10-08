// The Workflow page's data (workflow-data.mjs, plain JS, typed by its JSDoc typedefs). Built once,
// when the page is built; a README section or a skill the page needs that is missing stops the build.
import { capitalize } from '../../lib/text.mjs';
import { numberWord } from '../number-word';
import { getWorkflow, inlineHtml } from './workflow-data.mjs';

export const wf = getWorkflow();

export const skillHref = (name: string) => `/skills/${name}/`;
/** a stage note or other inline Markdown, with nothing linked */
export const md = (text: string) => inlineHtml(text, () => false);
/** "six" -> "Six" */
export const Num = (n: number) => capitalize(numberWord(n));
export { numberWord };
