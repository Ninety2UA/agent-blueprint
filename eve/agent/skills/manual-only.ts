// Hand-written: the one file in this folder the emitter does not generate (KTD9, shape a).
import { defineState } from "eve/context";
import { deliveries, turns, type SessionView } from "eve/events";
import { defineDynamic, defineSkill } from "eve/skills";
import { manualOnlyPackages } from "../lib/manual-only-packages";

// The manual-only skills: offered to the model only once the user names one. The static
// modules leave them out, and this resolver serves the named one. The authorisation is kept
// in the session's durable state, so a checkpoint reply without the name and a reload after a
// compaction still find the skill. It ends when the invocation is over:
//   abandoned: a turn since the naming one settled failed or cancelled;
//   completed: a later user message names another skill and not this one.
export const MANUAL_ONLY = ["ab-migrate", "ab-plugin-update"] as const;
type ManualOnly = (typeof MANUAL_ONLY)[number];

interface Authorisation {
  readonly skills: readonly ManualOnly[];
  /** The turn whose user message named the skill. */
  readonly turnId: string;
  /** Turns already settled when it was named; the view keeps only recent turns, so later ones are the rest. */
  readonly earlier: readonly string[];
}

export const authorisation = defineState<Authorisation | null>("agent-blueprint.manual-only", () => null);

const SKILL_NAME = /(?<![\w-])ab-[a-z0-9]+(?:-[a-z0-9]+)*(?![\w-])/g;

/** The skill names a message mentions, with or without a leading slash. */
export function namedSkills(text: string): string[] {
  return [...text.matchAll(SKILL_NAME)].map((match) => match[0]);
}

/** The latest user message the session received, and the turn that took it in. */
function latestUserMessage(view: SessionView): { text: string; turnId?: string } | null {
  const received = deliveries(view).filter((entry) => entry.parts?.some((part) => part.kind === "text"));
  const last = received.at(-1);
  if (!last) return null;
  const text = (last.parts ?? []).map((part) => (part.kind === "text" ? part.text : "")).join("\n");
  return { text, turnId: last.turnId };
}

function abandoned(view: SessionView, grant: Authorisation): boolean {
  return turns(view).some(
    (entry) =>
      (entry.outcome === "failed" || entry.outcome === "cancelled") && !grant.earlier.includes(entry.turnId),
  );
}

/** The authorisation after the latest message: granted, kept, replaced or ended. */
export function nextAuthorisation(
  current: Authorisation | null,
  message: { text: string; turnId?: string } | null,
  view: SessionView,
): Authorisation | null {
  const kept = current && !abandoned(view, current) ? current : null;
  if (!message) return kept;
  const names = namedSkills(message.text);
  const manual = MANUAL_ONLY.filter((name) => names.includes(name));
  if (manual.length && message.turnId) {
    if (kept && kept.turnId === message.turnId) return kept;
    const earlier = turns(view)
      .filter((entry) => entry.status === "settled")
      .map((entry) => entry.turnId);
    return { skills: manual, turnId: message.turnId, earlier };
  }
  if (kept && names.some((name) => !kept.skills.includes(name as ManualOnly))) return null;
  return kept;
}

export default defineDynamic((ctx) => {
  const current = authorisation.get();
  const next = nextAuthorisation(current, latestUserMessage(ctx.view), ctx.view);
  if (JSON.stringify(next) !== JSON.stringify(current)) authorisation.update(() => next);
  if (!next) return null;
  return Object.fromEntries(next.skills.map((name) => [name, defineSkill(manualOnlyPackages[name])]));
});
