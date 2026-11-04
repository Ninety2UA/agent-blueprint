"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { ChatListItem, SetupStatus, Viewer } from "@/lib/chat/types";

export type EnabledConnections = {
  readonly linear: boolean;
  readonly notion: boolean;
  readonly sentry: boolean;
};

type ChatShellContextValue = {
  readonly activeChatId: string | null;
  /** The demo's sample repository as owner/name; null off the demo. */
  readonly demoRepository: string | null;
  readonly enabledConnections: EnabledConnections;
  readonly removeChat: (chatId: string) => void;
  readonly requestSignIn: (draft?: string) => void;
  /** The chat this browser keeps for the cookie's running session, when the gate names one. */
  readonly runningChatId: string | null;
  readonly setRunningChatId: (chatId: string | null) => void;
  readonly setActiveChatId: (chatId: string | null) => void;
  readonly setConnectionEnabled: (connection: keyof EnabledConnections, enabled: boolean) => void;
  readonly setupStatus: SetupStatus;
  readonly touchChat: (chat: ChatListItem) => void;
  readonly updateChatTitle: (chatId: string, title: string) => void;
  readonly viewer: Viewer | null;
};

const ChatShellContext = createContext<ChatShellContextValue | null>(null);

export function ChatShellProvider({
  children,
  value,
}: {
  readonly children: ReactNode;
  readonly value: ChatShellContextValue;
}) {
  return <ChatShellContext.Provider value={value}>{children}</ChatShellContext.Provider>;
}

export function useChatShell() {
  const value = useContext(ChatShellContext);

  if (!value) {
    throw new Error("useChatShell must be used inside AgentChatShell.");
  }

  return value;
}
