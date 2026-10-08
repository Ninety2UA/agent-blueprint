// The Workflow page's data (workflow-data.mjs, plain JS), typed for the templates. Built once,
// when the page is built; a README section or a skill the page needs that is missing stops the build.
import { capitalize } from '../../lib/text.mjs';
import { numberWord } from '../number-word';
import { getWorkflow, inlineHtml } from './workflow-data.mjs';

export interface LoopStep {
  n: number;
  name: string;
  optional: boolean;
  /** the step's README text as HTML, skill names linked */
  html: string;
}
export interface Gate {
  n: number;
  ruleHtml: string;
  skills: string[];
}
export interface Stage {
  label: string;
  skills: string[];
  /** inline Markdown */
  note?: string;
  optional?: boolean;
}
export interface Pipeline {
  name: string;
  when: string;
  summaryHtml: string;
  checkpoints: boolean;
  stages: Stage[];
}
export interface ChainRow {
  from: string[];
  leaves: string;
  what: string;
  to: string[];
  next?: boolean;
}
export interface Phase {
  slug: string;
  title: string;
  skills: string[];
}
interface Workflow {
  loop: LoopStep[];
  gates: Gate[];
  pipelines: Pipeline[];
  chain: ChainRow[];
  phases: Phase[];
  counts: { skills: number; helpers: number; hooks: number; tools: number; phases: number };
}

export const wf = getWorkflow() as Workflow;

export const skillHref = (name: string) => `/skills/${name}/`;
/** a stage note or other inline Markdown, with nothing linked */
export const md = (text: string) => inlineHtml(text, () => false);
/** "six" -> "Six" */
export const Num = (n: number) => capitalize(numberWord(n));
export { numberWord };
