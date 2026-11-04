import type { SessionAuthContext } from "eve/context";
import { addDecision, type RunRecord } from "./run-state";

// Posture by channel (KTD11, R8, R12): interactive channels ask at checkpoints, unattended
// triggers take the skills' documented defaults and never park on an approval. The five channels:
//   web chat      channel:eve; interactive for a person behind the session cookie, local
//                 development and a Vercel OIDC token that carries a user (the eve CLI against a
//                 deployment); unattended for a bearer that names a service or a runtime, not a
//                 person: another deployment, a cron job, a script
//   Slack         channel:slack, interactive by channel
//   Linear        channel:linear, interactive by channel
//   Telegram      channel:telegram, interactive by channel
//   MCP           channel:mcp, interactive by channel, so an OAuth caller Eve types service still asks
// A schedule is unattended on any channel. Slack, Linear, Telegram and MCP are named by channel
// rather than read from the principal's type, so a later principal change cannot flip one of them
// to unattended unnoticed.
// The posture is read from the authenticated principal and the channel, never from anything a
// caller writes in a message. U6's publish tool reads it from the agent-blueprint.posture state;
// hooks/cap-guard.ts writes it at each turn and copies it into the run's decisions.

export type Posture = "interactive" | "unattended";

export interface PostureInput {
  /** The channel's kind as hooks see it, such as channel:eve, channel:slack or schedule. */
  readonly channel: string | undefined;
  readonly principal: Pick<SessionAuthContext, "authenticator" | "principalType"> | null | undefined;
}

const INTERACTIVE_CHANNELS: ReadonlyMap<string, string> = new Map([
  ["slack", "Slack"],
  ["linear", "Linear"],
  ["telegram", "Telegram"],
  ["mcp", "MCP"],
]);

export function postureFor({ channel, principal }: PostureInput): { posture: Posture; reason: string } {
  const where = channel?.replace(/^channel:/, "") || "unknown";
  if (/schedule/i.test(where) || /schedule/i.test(principal?.authenticator ?? "")) {
    return { posture: "unattended", reason: "started by a schedule" };
  }
  const named = INTERACTIVE_CHANNELS.get(where);
  if (named) return { posture: "interactive", reason: `the ${named} channel` };
  if (principal && (principal.principalType === "service" || principal.principalType === "runtime")) {
    return { posture: "unattended", reason: `an HTTP call authenticated as a ${principal.principalType} (${principal.authenticator})` };
  }
  return { posture: "interactive", reason: principal ? `the ${where} channel, ${principal.authenticator}` : `the ${where} channel` };
}

const QUESTION = "Does this run ask at checkpoints (interactive) or take the documented defaults (unattended)?";

/** Adds the posture to the record's decisions when the last posture decision says otherwise. */
export function withPostureDecision(record: RunRecord, posture: Posture, reason: string, now: string): RunRecord {
  const last = [...record.decisions].reverse().find((decision) => decision.question === QUESTION);
  if (last?.choice === posture) return record;
  return addDecision(record, { stage: record.stage ?? "", question: QUESTION, choice: posture, reason: `derived from ${reason}` }, now);
}
