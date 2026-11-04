"use client";

import { ArrowRightIcon, EllipsisIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { AuthDisplayLoggedIn, AuthDisplayLoggedOut } from "@/components/auth/auth-display";
import { UserMenu } from "@/components/auth/user-menu";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ChatListItem, SetupStatus, Viewer } from "@/lib/chat/types";
import { cn } from "@/lib/utils";

// The sidebar as the drawing's margin strip (the approved mock's chat shell): the New session
// control, the sessions as numbered sheets with the titles the app keeps, and at the foot the
// demo's caps line and the sign-out the gate needs.
export function ChatSidebar({
  activeChatId,
  className,
  chats,
  hasMoreChats = false,
  isLoadingChats = false,
  isLoadingMore = false,
  onDeleteChat,
  onLoadMoreChats,
  onNavigate,
  onNewChat,
  onSignIn,
  runningChatId = null,
  setupStatus,
  viewer,
}: {
  readonly activeChatId: string | null;
  readonly className?: string;
  readonly chats: readonly ChatListItem[];
  readonly hasMoreChats?: boolean;
  readonly isLoadingChats?: boolean;
  readonly isLoadingMore?: boolean;
  readonly onDeleteChat: (chatId: string) => void | Promise<void>;
  readonly onLoadMoreChats?: () => void | Promise<void>;
  readonly onNavigate?: (chatId?: string | null) => void;
  readonly onNewChat: () => void;
  readonly onSignIn?: () => void;
  /** The chat whose session the gate counts as running, marked "Running". */
  readonly runningChatId?: string | null;
  readonly setupStatus: SetupStatus;
  readonly viewer: Viewer | null;
}) {
  const authDisabled = !setupStatus.appReady;
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;

    if (!sentinel || !hasMoreChats || !onLoadMoreChats) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isLoadingMore) {
          void onLoadMoreChats();
        }
      },
      { threshold: 0.1 },
    );

    observer.observe(sentinel);

    return () => observer.disconnect();
  }, [hasMoreChats, isLoadingMore, onLoadMoreChats]);

  return (
    <aside
      aria-label="Sessions"
      className={cn(
        "flex h-full w-[252px] shrink-0 flex-col overflow-y-auto border-r border-border bg-background pt-4",
        className,
      )}
    >
      <button
        className="mx-4 inline-flex h-11 shrink-0 items-center justify-center rounded-[var(--r)] border border-line-ui bg-transparent px-5 font-[560] text-foreground transition-colors duration-[180ms] hover:border-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
        onClick={() => {
          onNewChat();
          onNavigate?.(null);
        }}
        type="button"
      >
        New session
      </button>

      <div className="mt-[22px] flex-1 px-4">
        {chats.length ? (
          <div>
            <h2 className="mb-1 px-1 text-[0.8125rem] leading-[1.15] font-[560] tracking-normal text-muted-foreground">
              Sessions
            </h2>
            <ol className="m-0 list-none p-0">
              {chats.map((chat, index) => {
                const active = activeChatId === chat.id;

                return (
                  <li className="group/session relative" key={chat.id}>
                    <Link
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "grid grid-cols-[22px_minmax(0,1fr)] gap-x-2 rounded-[var(--r)] pt-[9px] pr-8 pb-2.5 pl-1 no-underline transition-colors duration-[180ms] hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--focus)]",
                        active && "bg-muted",
                      )}
                      href={`/chat/${chat.id}`}
                      onClick={() => onNavigate?.(chat.id)}
                    >
                      <span aria-hidden="true" className="pt-0.5 text-xs text-muted-foreground tabular-nums">
                        {index + 1}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm leading-[1.3] font-medium text-foreground">
                          {chat.title}
                        </span>
                        <span className="sr-only">Updated {formatHistoryTime(chat.updatedAt)}</span>
                        {runningChatId === chat.id ? (
                          <span className="mt-[3px] inline-flex items-center gap-1.5 text-xs leading-[1.2] font-[560] text-ink-2 before:size-1.5 before:rounded-full before:bg-signal before:content-['']">
                            Running
                          </span>
                        ) : null}
                      </span>
                    </Link>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          aria-label="Chat actions"
                          className="absolute top-2 right-1 opacity-0 transition-opacity hover:bg-muted group-hover/session:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
                          size="icon-xs"
                          type="button"
                          variant="ghost"
                        >
                          <EllipsisIcon className="size-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" sideOffset={6}>
                        <DropdownMenuItem
                          onSelect={(event) => {
                            event.preventDefault();
                            void onDeleteChat(chat.id);
                          }}
                          variant="destructive"
                        >
                          <Trash2Icon className="size-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </li>
                );
              })}
            </ol>
          </div>
        ) : null}
        {hasMoreChats ? (
          <div ref={sentinelRef} className="px-1 py-2">
            {isLoadingMore ? (
              <p className="text-xs text-muted-foreground">Loading more...</p>
            ) : (
              <button
                className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                onClick={() => void onLoadMoreChats?.()}
                type="button"
              >
                Load more
              </button>
            )}
          </div>
        ) : null}
      </div>

      <div className="mt-4 border-t border-border [&>*+*]:border-t">
        {setupStatus.demo ? (
          <p className="m-0 px-5 py-3 text-[0.8125rem] leading-[1.4] text-ink-2" data-demo-caps>
            One running session per visitor, and a session lasts at most 12 hours.
          </p>
        ) : null}
        {viewer ? (
          <UserMenu authMode={setupStatus.authMode} viewer={viewer} />
        ) : isLoadingChats ? (
          <div className="px-3 py-3">
            <AuthDisplayLoggedIn>
              <div className="h-8" />
            </AuthDisplayLoggedIn>
            <AuthDisplayLoggedOut>
              <SidebarSignInButton
                authDisabled={false}
                onNavigate={onNavigate}
                onSignIn={onSignIn}
              />
            </AuthDisplayLoggedOut>
          </div>
        ) : (
          <div className="px-3 py-3">
            <SidebarSignInButton
              authDisabled={authDisabled}
              onNavigate={onNavigate}
              onSignIn={onSignIn}
            />
          </div>
        )}
      </div>
    </aside>
  );
}

function SidebarSignInButton({
  authDisabled,
  onNavigate,
  onSignIn,
}: {
  readonly authDisabled: boolean;
  readonly onNavigate?: (chatId?: string | null) => void;
  readonly onSignIn?: () => void;
}) {
  return (
    <button
      className="flex h-8 w-full items-center justify-between rounded-md px-2 text-sm text-ink-2 transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
      disabled={authDisabled}
      onClick={() => {
        onSignIn?.();
        onNavigate?.();
      }}
      type="button"
    >
      <span className="min-w-0">Sign in</span>
      <ArrowRightIcon className="size-3.5" />
    </button>
  );
}

function formatHistoryTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
