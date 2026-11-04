"use client";

import type { ClientSessionState, SessionStreamEvent } from "eve/client";
import {
  appendLocalChatEvent,
  clearLocalChatPendingMessage,
  createLocalChat,
  deleteLocalChat,
  findLocalChatIdBySession,
  getLocalChat,
  listLocalChats,
  markLocalChatPendingMessage,
  saveLocalChatSession,
  saveLocalChatSnapshot,
} from "./local-store";
import type { StorageMode } from "./types";

// Starter mode keeps chats in the browser only; the template's database path is pruned (KTD20).
// The storage mode argument stays so the template's callers are unchanged.

export function listClientChats(_storageMode: StorageMode) {
  return listLocalChats();
}

/** The chat this browser keeps for a running session, found by the session id the gate names. */
export function findClientChatIdBySession(_storageMode: StorageMode, sessionId: string) {
  return findLocalChatIdBySession(sessionId);
}

export async function getClientChat(_storageMode: StorageMode, chatId: string) {
  return getLocalChat(chatId);
}

export async function createClientChat(
  _storageMode: StorageMode,
  input?: { readonly pendingUserMessage?: string },
) {
  return createLocalChat(input?.pendingUserMessage);
}

export async function deleteClientChat(_storageMode: StorageMode, chatId: string) {
  deleteLocalChat(chatId);
}

export async function checkClientSendLimit(
  _storageMode: StorageMode,
  _input?: { readonly message?: string },
) {
  return { allowed: true } as
    | { readonly allowed: true }
    | { readonly allowed: false; readonly message: string; readonly retryAfter: number };
}

export async function markClientChatPendingMessage(
  _storageMode: StorageMode,
  input: { readonly chatId: string; readonly message: string },
) {
  return markLocalChatPendingMessage(input.chatId, input.message);
}

export async function clearClientChatPendingMessage(_storageMode: StorageMode, chatId: string) {
  clearLocalChatPendingMessage(chatId);
}

export async function appendClientChatEvent(
  _storageMode: StorageMode,
  input: {
    readonly chatId: string;
    readonly event: SessionStreamEvent;
    readonly eventIndex: number;
  },
) {
  appendLocalChatEvent(input);
}

export async function saveClientChatSession(
  _storageMode: StorageMode,
  input: { readonly chatId: string; readonly session: ClientSessionState },
) {
  saveLocalChatSession(input.chatId, input.session);
}

export async function saveClientChatSnapshot(
  _storageMode: StorageMode,
  input: {
    readonly chatId: string;
    readonly events: readonly SessionStreamEvent[];
    readonly session: ClientSessionState | undefined;
  },
) {
  saveLocalChatSnapshot(input);
}
