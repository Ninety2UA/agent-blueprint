"use client";

import { LockKeyholeIcon } from "lucide-react";
import { PasswordSignInForm } from "@/components/auth/password-sign-in-form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { AuthMode } from "@/lib/chat/types";

// Starter mode only: the shared password. The proxy serves the gate page before the chat loads,
// so this dialog appears only when a cookie expires while the chat is open.
export function SignInModal({
  callbackPath,
  onBeforeSignIn,
  onOpenChange,
  open,
}: {
  readonly authMode: AuthMode;
  readonly callbackPath?: string;
  readonly disabled?: boolean;
  readonly onBeforeSignIn?: () => void;
  readonly onOpenChange: (open: boolean) => void;
  readonly open: boolean;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader className="items-center text-center sm:text-center">
          <div className="mb-2 flex size-10 items-center justify-center rounded-full border border-border bg-muted">
            <LockKeyholeIcon className="size-4 text-foreground" />
          </div>
          <DialogTitle>Enter the code</DialogTitle>
          <DialogDescription>Your session ended, so enter the code again to go on.</DialogDescription>
        </DialogHeader>
        <PasswordSignInForm callbackPath={callbackPath} onBeforeSignIn={onBeforeSignIn} />
      </DialogContent>
    </Dialog>
  );
}
