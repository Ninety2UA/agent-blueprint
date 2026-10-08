// The parts of getSiteData() (src/lib/site.mjs, plain JS) the skills templates read, typed.
import { getSiteData } from '../../lib/site.mjs';

export interface Phase {
  slug: string;
  title: string;
  skills: string[];
}

export interface Skill {
  name: string;
  /** phase slug */
  phase: string;
  summary: string;
  when: string;
  description: string;
  helpers: { name: string; path: string }[];
  related: string[];
  prev: string | null;
  next: string | null;
  githubUrl: string;
}

export interface Helper {
  name: string;
  /** the owning skill */
  skill: string;
  path: string;
  summary: string;
  when: string;
  usedBy: string[];
}

export interface Tool {
  name: string;
  id: string;
  naming: { syntax: string | null; example: string };
  support: { hooks: string; helpers: string; manualOnly: string };
}

export interface SiteData {
  version: string;
  repoUrl: string;
  counts: { skills: number; helpers: number; hooks: number; tools: number; phases: number };
  tools: Tool[];
  phases: Phase[];
  skills: Skill[];
  helpers: Helper[];
}

export const siteData = (): SiteData => getSiteData() as unknown as SiteData;
