"use client";

import { useState } from "react";
import { Loader2Icon, LogOutIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import type { AuthMode, Viewer } from "@/lib/chat/types";

// What the gate needs at the sidebar's foot: signing out, which clears the cookie so the next
// request meets the gate again. Local development has no gate, so nothing shows there.
export function UserMenu({
  authMode,
}: {
  readonly authMode: AuthMode;
  readonly viewer: Viewer;
}) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  if (authMode === "local-dev") {
    return null;
  }

  return (
    <div className="px-3 py-3">
      <button
        aria-busy={signingOut}
        className="flex h-8 w-full items-center gap-2 rounded-[var(--r)] px-2 text-left text-sm text-ink-2 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--focus)] disabled:cursor-not-allowed disabled:opacity-60"
        disabled={signingOut}
        onClick={() => {
          if (signingOut) {
            return;
          }

          setSigningOut(true);
          const signOut = fetch("/api/password-auth/logout", { method: "POST" }).then((response) => {
            if (!response.ok) {
              throw new Error("Failed to sign out.");
            }
          });

          void signOut
            .then(() => {
              router.replace("/");
              router.refresh();
            })
            .catch(() => {
              setSigningOut(false);
            });
        }}
        type="button"
      >
        {signingOut ? (
          <Loader2Icon aria-hidden="true" className="size-4 animate-spin" />
        ) : (
          <LogOutIcon aria-hidden="true" className="size-4" />
        )}
        {signingOut ? "Signing out..." : "Sign out"}
      </button>
    </div>
  );
}
