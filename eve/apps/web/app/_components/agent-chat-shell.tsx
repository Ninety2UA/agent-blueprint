"use client";

import { CheckIcon, UploadIcon } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  CHAT_BOOTSTRAP_SYNC_EVENT,
  type ChatBootstrapSyncDetail,
} from "@/app/_components/agent-chat-events";
import {
  ChatShellProvider,
  useChatShell,
  type EnabledConnections,
} from "@/app/_components/chat-shell-context";
import { AuthDisplayLoggedOut } from "@/components/auth/auth-display";
import { SignInModal } from "@/components/auth/sign-in-modal";
import { Lockup } from "@/components/brand/lockup";
import { ChatSidebar } from "@/components/chat/sidebar";
import { ThemeToggle } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { deleteClientChat, listClientChats } from "@/lib/chat/persistence-client";
import type { ChatListItem, SetupStatus, Viewer } from "@/lib/chat/types";
import { cn } from "@/lib/utils";

// The chat shell (the approved mock's title block shell, ruling 9): a top bar across the page with
// the lockup and the theme toggle, the sidebar as the drawing's margin strip beside the canvas,
// and below the sheet breakpoint the sidebar folded behind the top bar's Sessions control.
export function AgentChatShell({
  children,
  demoRepository,
  initialChats,
  initialNextCursor,
  setupStatus,
  viewer,
}: {
  readonly children: ReactNode;
  readonly demoRepository: string | null;
  readonly initialChats: readonly ChatListItem[];
  readonly initialNextCursor: string | null;
  readonly setupStatus: SetupStatus;
  readonly viewer: Viewer | null;
}) {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [history, setHistory] = useState<ChatListItem[]>([...initialChats]);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const [draftBeforeSignIn, setDraftBeforeSignIn] = useState("");
  const [signInCallbackPath, setSignInCallbackPath] = useState("/");
  const [viewerState, setViewerState] = useState(viewer);
  const [setupStatusState, setSetupStatusState] = useState(setupStatus);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [runningChatId, setRunningChatId] = useState<string | null>(null);
  const [enabledConnections, setEnabledConnections] = useState<EnabledConnections>({
    linear: true,
    notion: true,
    sentry: true,
  });
  const cursorRef = useRef(initialNextCursor);
  const activeChatIdRef = useRef(activeChatId);
  const setupReady = setupStatusState.appReady;
  const router = useRouter();

  useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);

  useEffect(() => {
    cursorRef.current = nextCursor;
  }, [nextCursor]);

  useEffect(() => {
    if (!mobileSidebarOpen) {
      return;
    }

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileSidebarOpen(false);
        document.getElementById("sessions-control")?.focus();
      }
    };

    document.addEventListener("keydown", closeOnEscape);

    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [mobileSidebarOpen]);

  const requestSignIn = useCallback((draft?: string) => {
    setDraftBeforeSignIn(draft?.trim() ?? "");
    setSignInCallbackPath(window.location.pathname || "/");
    setAuthDialogOpen(true);
  }, []);

  const setConnectionEnabled = useCallback(
    (connection: keyof EnabledConnections, enabled: boolean) => {
      setEnabledConnections((current) => ({
        ...current,
        [connection]: enabled,
      }));
    },
    [],
  );

  const touchChat = useCallback((chat: ChatListItem) => {
    setHistory((items) => {
      const current = items.find((item) => item.id === chat.id);

      return [
        {
          id: chat.id,
          title: chat.title || current?.title || "New chat",
          updatedAt: chat.updatedAt,
        },
        ...items.filter((item) => item.id !== chat.id),
      ];
    });
  }, []);

  const updateChatTitle = useCallback((chatId: string, title: string) => {
    setHistory((items) => items.map((item) => (item.id === chatId ? { ...item, title } : item)));
  }, []);

  const removeChat = useCallback((chatId: string) => {
    setHistory((items) => items.filter((item) => item.id !== chatId));
  }, []);

  const startNewChat = useCallback(() => {
    activeChatIdRef.current = null;
    setActiveChatId(null);
    setMobileSidebarOpen(false);
    router.push("/", { scroll: false });
  }, [router]);

  const handleSidebarNavigate = useCallback((chatId?: string | null) => {
    setMobileSidebarOpen(false);

    if (chatId !== undefined) {
      activeChatIdRef.current = chatId;
      setActiveChatId(chatId);
    }
  }, []);

  const handleDeleteChat = useCallback(
    async (chatId: string) => {
      try {
        await deleteClientChat(setupStatusState.storageMode, chatId);
        removeChat(chatId);

        if (activeChatIdRef.current === chatId) {
          startNewChat();
        }
      } catch {
        // Deleting a sidebar item is best-effort. Active chat persistence
        // errors are shown by the chat surface where the user is working.
      }
    },
    [removeChat, setupStatusState.storageMode, startNewChat],
  );

  const loadMoreChats = useCallback(async () => {
    const cursor = cursorRef.current;

    if (!cursor || loadingMore || setupStatusState.storageMode !== "database") {
      return;
    }

    setLoadingMore(true);

    try {
      const response = await fetch(`/api/chats?cursor=${encodeURIComponent(cursor)}`);

      if (!response.ok) {
        return;
      }

      const data = (await response.json()) as {
        readonly chats?: readonly ChatListItem[];
        readonly nextCursor?: string | null;
      };
      const incoming = data.chats ?? [];

      setHistory((items) => {
        const existing = new Set(items.map((item) => item.id));
        const fresh = incoming.filter((item) => !existing.has(item.id));

        return [...items, ...fresh];
      });
      setNextCursor(data.nextCursor ?? null);
    } catch {
      // Ignore network hiccups; the observer/button can retry.
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, setupStatusState.storageMode]);

  const setBootstrapData = useCallback(
    ({
      chats,
      nextCursor: incomingNextCursor,
      setupStatus: incomingSetupStatus,
      viewer: incomingViewer,
    }: {
      readonly chats: readonly ChatListItem[];
      readonly nextCursor: string | null;
      readonly setupStatus: SetupStatus;
      readonly viewer: Viewer | null;
    }) => {
      setSetupStatusState(incomingSetupStatus);
      setViewerState(incomingViewer);
      const usesBrowserStorage = incomingSetupStatus.storageMode === "browser";
      const nextChats =
        incomingViewer && usesBrowserStorage
          ? listClientChats(incomingSetupStatus.storageMode)
          : chats;

      setHistory((items) => (incomingViewer ? mergeChatHistory(nextChats, items) : []));
      setNextCursor(usesBrowserStorage ? null : incomingNextCursor);
      setHistoryLoading(false);
      cursorRef.current = usesBrowserStorage ? null : incomingNextCursor;
    },
    [],
  );

  useEffect(() => {
    const target = window as Window & {
      __eveChatBootstrapSync?: ChatBootstrapSyncDetail;
    };
    const handleBootstrapSync = (event: Event) => {
      setBootstrapData((event as CustomEvent<ChatBootstrapSyncDetail>).detail);
    };

    window.addEventListener(CHAT_BOOTSTRAP_SYNC_EVENT, handleBootstrapSync);
    if (target.__eveChatBootstrapSync) {
      setBootstrapData(target.__eveChatBootstrapSync);
    }

    return () => {
      window.removeEventListener(CHAT_BOOTSTRAP_SYNC_EVENT, handleBootstrapSync);
    };
  }, [setBootstrapData]);

  const contextValue = useMemo(
    () => ({
      activeChatId,
      demoRepository,
      enabledConnections,
      removeChat,
      requestSignIn,
      runningChatId,
      setActiveChatId,
      setConnectionEnabled,
      setRunningChatId,
      setupStatus: setupStatusState,
      touchChat,
      updateChatTitle,
      viewer: viewerState,
    }),
    [
      activeChatId,
      demoRepository,
      enabledConnections,
      removeChat,
      requestSignIn,
      runningChatId,
      setConnectionEnabled,
      setupStatusState,
      touchChat,
      updateChatTitle,
      viewerState,
    ],
  );

  const sidebarProps = {
    activeChatId,
    chats: history,
    hasMoreChats: Boolean(nextCursor),
    isLoadingChats: historyLoading,
    isLoadingMore: loadingMore,
    onDeleteChat: handleDeleteChat,
    onLoadMoreChats: loadMoreChats,
    onNavigate: handleSidebarNavigate,
    onNewChat: startNewChat,
    onSignIn: () => requestSignIn(),
    runningChatId,
    setupStatus: setupStatusState,
    viewer: viewerState,
  };
  const loggedOutAuthActions = historyLoading ? (
    <AuthDisplayLoggedOut>
      <AuthTopActions authMode={setupStatusState.authMode} onSignIn={() => requestSignIn()} />
    </AuthDisplayLoggedOut>
  ) : (
    <AuthTopActions authMode={setupStatusState.authMode} onSignIn={() => requestSignIn()} />
  );

  return (
    <ChatShellProvider value={contextValue}>
      <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
        <a
          className="sr-only rounded-[var(--r)] bg-foreground px-3 py-2 text-background focus:not-sr-only focus:fixed focus:top-3 focus:left-4 focus:z-50"
          href="#request"
        >
          Skip to the request field
        </a>
        <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border bg-background px-5 max-sheet:px-4">
          <Lockup className="min-w-0" />
          <div className="flex shrink-0 items-center gap-2">
            <Suspense fallback={null}>
              <ChatRouteShareButton />
            </Suspense>
            {viewerState ? null : loggedOutAuthActions}
            <ThemeToggle className={cn(QUIET_BUTTON, "max-sheet:px-[9px]")} />
            <button
              aria-controls="sessions-panel"
              aria-expanded={mobileSidebarOpen}
              className={cn(QUIET_BUTTON, "sheet:hidden")}
              id="sessions-control"
              onClick={() => setMobileSidebarOpen((open) => !open)}
              type="button"
            >
              Sessions
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <div className="hidden w-[252px] shrink-0 sheet:block">
            <ChatSidebar {...sidebarProps} />
          </div>

          <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden">{children}</main>
        </div>

        {mobileSidebarOpen ? (
          <div className="fixed inset-x-0 top-14 bottom-0 z-40 sheet:hidden" id="sessions-panel">
            <ChatSidebar {...sidebarProps} className="w-full border-r-0" />
          </div>
        ) : (
          <div hidden id="sessions-panel" />
        )}

        <SignInModal
          authMode={setupStatusState.authMode}
          callbackPath={signInCallbackPath}
          disabled={!setupReady}
          onBeforeSignIn={() => {
            if (draftBeforeSignIn) {
              window.sessionStorage.setItem("eve-chat-draft", draftBeforeSignIn);
            }
          }}
          onOpenChange={setAuthDialogOpen}
          open={authDialogOpen}
        />
      </div>
    </ChatShellProvider>
  );
}

/** The mock's quiet small button: a control-border outline, ink text, the sunk ground on hover. */
const QUIET_BUTTON =
  "inline-flex h-10 items-center justify-center gap-2 rounded-[var(--r)] border border-line-ui bg-transparent px-3 text-[0.9375rem] font-[560] text-foreground transition-colors duration-[180ms] hover:border-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]";

function ChatRouteShareButton() {
  const pathname = usePathname();
  const { setupStatus } = useChatShell();

  if (!pathname.startsWith("/chat/") || setupStatus.storageMode === "browser") {
    return null;
  }

  return <ShareChatButton />;
}

function ShareChatButton() {
  const [copied, setCopied] = useState(false);
  const copyResetTimerRef = useRef<number | null>(null);

  const clearCopyResetTimer = useCallback(() => {
    if (copyResetTimerRef.current === null) {
      return;
    }

    window.clearTimeout(copyResetTimerRef.current);
    copyResetTimerRef.current = null;
  }, []);

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      clearCopyResetTimer();
      setCopied(true);
      copyResetTimerRef.current = window.setTimeout(() => {
        copyResetTimerRef.current = null;
        setCopied(false);
      }, 1600);
    } catch {
      setCopied(false);
    }
  }, [clearCopyResetTimer]);

  useEffect(() => clearCopyResetTimer, [clearCopyResetTimer]);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={copied ? "Copied chat link" : "Copy chat link"}
          className="text-muted-foreground hover:text-foreground"
          onClick={handleCopyLink}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          {copied ? <CheckIcon className="size-4" /> : <UploadIcon className="size-4" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{copied ? "Copied" : "Copy link"}</TooltipContent>
    </Tooltip>
  );
}

function AuthTopActions({
  authMode,
  onSignIn,
}: {
  readonly authMode: SetupStatus["authMode"];
  readonly onSignIn: () => void;
}) {
  const usesPassword = authMode === "password";

  return (
    <div className="flex max-w-[calc(100vw-4rem)] items-center gap-1.5">
      <Button
        className="h-8 rounded-md border border-hair-strong bg-background px-3 text-sm font-medium text-foreground hover:border-foreground hover:bg-background"
        onClick={onSignIn}
        type="button"
        variant="outline"
      >
        {usesPassword ? "Sign in" : "Log In"}
      </Button>
      {usesPassword ? null : (
        <Button
          className="h-8 rounded-md bg-foreground px-3 text-sm font-medium text-background hover:bg-foreground/90"
          onClick={onSignIn}
          type="button"
        >
          Sign Up
        </Button>
      )}
    </div>
  );
}

function mergeChatHistory(incoming: readonly ChatListItem[], current: readonly ChatListItem[]) {
  const incomingById = new Map(incoming.map((item) => [item.id, item]));
  const currentIds = new Set(current.map((item) => item.id));
  const freshIncoming = incoming.filter((item) => !currentIds.has(item.id));

  return [...freshIncoming, ...current.map((item) => incomingById.get(item.id) ?? item)];
}
