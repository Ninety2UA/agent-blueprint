// The gate's states (U8 step 6): one row per state, with its trigger, the one sentence it shows,
// the next action it offers and whether the chat input is disabled. The README's "Demo gate"
// table is this list; the denial pages and the in-chat notices both render from it, and U11's
// live checks read it. {branch}, {stage} and {wait} are filled in when the state is shown. Busy
// under one cookie also carries the sentence for a running chat this browser does not list and a
// line saying why the state holds.

export type GateStateId =
  | "no-cookie"
  | "wrong-code"
  | "limited"
  | "token-cap"
  | "resting"
  | "busy-cookie"
  | "busy-address"
  | "blocked"
  | "idle-ended";

export type GateAction =
  | { readonly kind: "enter-code"; readonly label: string }
  | { readonly kind: "retry-after"; readonly label: string }
  | { readonly kind: "branch-link"; readonly label: string }
  | { readonly kind: "return-after-reset"; readonly label: string }
  | { readonly kind: "start-again"; readonly label: string };

export interface GateState {
  readonly id: GateStateId;
  readonly trigger: string;
  readonly message: string;
  readonly action: GateAction;
  readonly inputDisabled: boolean;
  /** The HTTP status when the state is a page of its own; in-chat notices have none. */
  readonly status: number | null;
  /** The no-cookie and wrong-code states offer the contact link, on the demo only. */
  readonly contact: boolean;
  /** What a deployer's own copy shows instead, where Dominik's message does not apply. */
  readonly deployerMessage?: string;
  /** Busy under this cookie, when the browser does not list the running chat: the sentence without the way back. */
  readonly goneMessage?: string;
  /** A second line that says why the state holds. */
  readonly why?: string;
}

/** Where a visitor without the code can ask for one. See NEEDS_CONTEXT in the U8 notes. */
export const CONTACT_URL = "https://agent-blueprint.dbenger.com/";

export const IDLE_TIMEOUT_MINUTES = 30;

export const GATE_STATES: readonly GateState[] = [
  {
    id: "no-cookie",
    trigger: "A request for the chat without a valid session cookie.",
    message: "This demo opens with a code, and the code comes in Dominik's message to you.",
    action: { kind: "enter-code", label: "Enter the code" },
    inputDisabled: false,
    status: 401,
    contact: true,
    deployerMessage: "This chat opens with the password the person who deployed it chose.",
  },
  {
    id: "wrong-code",
    trigger: "A posted code that does not match.",
    message: "That code does not match the one in Dominik's message, so check it and try again.",
    action: { kind: "enter-code", label: "Try again" },
    inputDisabled: false,
    status: 401,
    contact: true,
    deployerMessage: "That password does not match, so check it and try again.",
  },
  {
    id: "limited",
    trigger: "More than 10 tries in a minute from one address, or more than 100 from everyone.",
    message: "There have been too many tries from here, so wait {wait} and try again.",
    action: { kind: "retry-after", label: "Try again in {wait}" },
    inputDisabled: true,
    status: 429,
    contact: false,
  },
  {
    id: "token-cap",
    trigger: "The session's model use reached its cap; the next model call was cancelled.",
    message: "This session has used its share of the model, and its work is saved on the branch {branch} after the {stage} stage.",
    action: { kind: "branch-link", label: "Open the branch" },
    inputDisabled: true,
    status: null,
    contact: false,
  },
  {
    id: "resting",
    trigger: "The AI Gateway key's daily budget answered 402 today.",
    message: "The demo has used today's budget and is resting until 00:00 UTC.",
    action: { kind: "return-after-reset", label: "Come back after 00:00 UTC" },
    inputDisabled: true,
    status: 503,
    contact: false,
  },
  {
    id: "busy-cookie",
    trigger: "A second session under the same cookie while the first is still running.",
    message: "You already have a run going in another chat, so carry on there or wait {wait} for it to end.",
    action: { kind: "retry-after", label: "Try again in {wait}" },
    inputDisabled: true,
    status: null,
    contact: false,
    goneMessage: "You already have a run going in a chat this browser does not list, so wait {wait} for it to end.",
    why: `A chat counts as running until it has been idle for ${IDLE_TIMEOUT_MINUTES} minutes.`,
  },
  {
    id: "busy-address",
    trigger: "A third session from one address while two are still running.",
    message: "Two runs are already going from your network, so try again when one ends, within {wait}.",
    action: { kind: "retry-after", label: "Try again in {wait}" },
    inputDisabled: true,
    status: null,
    contact: false,
  },
  {
    id: "blocked",
    trigger: "The model provider answered 429, or the sandbox could not be created.",
    message: "The run stopped after the {stage} stage because a service it needs is busy, and its work is saved on the branch {branch}.",
    action: { kind: "branch-link", label: "Open the branch" },
    inputDisabled: true,
    status: null,
    contact: false,
  },
  {
    id: "idle-ended",
    trigger: `A session that waited ${IDLE_TIMEOUT_MINUTES} minutes for an answer without one.`,
    message: `This session ended after ${IDLE_TIMEOUT_MINUTES} minutes without an answer, and its work is saved on the branch {branch}.`,
    action: { kind: "start-again", label: "Start again" },
    inputDisabled: true,
    status: null,
    contact: false,
  },
];

export function gateState(id: GateStateId): GateState {
  const state = GATE_STATES.find((row) => row.id === id);
  if (!state) throw new Error(`no gate state ${id}`);
  return state;
}

export interface GateValues {
  readonly branch?: string | null;
  readonly stage?: string | null;
  /** Seconds until a retry may succeed. */
  readonly waitSeconds?: number | null;
}

/** "45 seconds", "2 minutes", "30 minutes". */
export function namedWait(seconds: number): string {
  if (seconds < 60) return `${seconds} ${seconds === 1 ? "second" : "seconds"}`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
}

export function fill(text: string, values: GateValues): string {
  return text
    .replaceAll("{branch}", values.branch || "the run's branch")
    .replaceAll("{stage}", values.stage || "last finished")
    .replaceAll("{wait}", namedWait(values.waitSeconds ?? IDLE_TIMEOUT_MINUTES * 60));
}

/** The pushed branch's page on GitHub. */
export function branchUrl(repository: string | null | undefined, branch: string | null | undefined): string | null {
  if (!repository || !branch || !/^[\w.-]+\/[\w.-]+$/.test(repository)) return null;
  return `https://github.com/${repository}/tree/${branch.split("/").map(encodeURIComponent).join("/")}`;
}
