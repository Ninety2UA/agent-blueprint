import type { GateStatus } from "./status";

// Busy under this cookie (ruling 58, ruling 76): the gate names the cookie's running session, and
// the chat this browser keeps for it, found by that session id, is the way back. The new session
// page and a refused chat both read it here, so they show the same sentence and action: the
// browser's own running chat gets "Open that chat"; a chat it does not list (another browser,
// cleared storage) gets the sentence without the way back.

/** The id of the chat this browser keeps for the cookie's running session, or null. */
export function runningChatId(
  status: GateStatus | null | undefined,
  findChatId: (sessionId: string) => string | null,
): string | null {
  if (status?.state !== "busy-cookie" || !status.runningSessionId) return null;
  return findChatId(status.runningSessionId);
}

/** The address "Open that chat" opens. */
export function runningChatHref(chatId: string | null | undefined): string | null {
  return chatId ? `/chat/${chatId}` : null;
}

/** The notice's sentence: busy under this cookie without a listed chat says the browser does not list it. */
export function noticeMessage(status: GateStatus, href: string | null | undefined): string | undefined {
  return status.state === "busy-cookie" && !href && status.goneMessage ? status.goneMessage : status.message;
}
