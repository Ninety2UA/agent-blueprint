"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ComposerFooterControls,
  ErrorToast,
  type AgentChatControllerStatus,
} from "@/app/_components/agent-chat";
import { useChatShell } from "@/app/_components/chat-shell-context";
import { ChatComposer } from "@/components/chat/composer";
import { GateNotice, readGateStatus, useGateStatus } from "@/components/chat/gate-notice";
import { RunLayout, THREAD } from "@/components/chat/run-layout";
import { SessionStart } from "@/components/chat/title-block";
import { getChatMessageLengthError } from "@/lib/chat/limits";
import { findClientChatIdBySession } from "@/lib/chat/persistence-client";
import { EMPTY_RUN } from "@/lib/chat/run";
import { createProvisionalChatId, writePendingChatMessage } from "@/lib/chat/provisional-chat";
import type { SetupStatus } from "@/lib/chat/types";
import { runningChatHref, runningChatId as findRunningChatId } from "@/lib/gate/running-chat";
import type { GateStatus } from "@/lib/gate/status";

const IDLE_CONTROLLER_STATUS: AgentChatControllerStatus = {
  isBusy: false,
  isDisabled: false,
  isEmpty: true,
};

export function HomeChatPage() {
  const { requestSignIn, setActiveChatId, setRunningChatId, setupStatus, viewer } = useChatShell();
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);
  const [dismissedError, setDismissedError] = useState<string | null>(null);
  // The gate's answer to the check made at send time, shown until the page opens again.
  const [sendGateStatus, setSendGateStatus] = useState<GateStatus | null>(null);
  const submittingRef = useRef(false);
  const setupReady = setupStatus.appReady;
  const pathname = usePathname();
  const router = useRouter();
  const toastError = clientError && dismissedError !== clientError ? clientError : null;

  useEffect(() => {
    setActiveChatId(null);
  }, [setActiveChatId]);

  useEffect(() => {
    if (pathname === "/") {
      submittingRef.current = false;
      setSubmitting(false);
      setSendGateStatus(null);
    }
  }, [pathname]);

  useEffect(() => {
    if (!viewer) {
      return;
    }

    const restoredDraft = window.sessionStorage.getItem("eve-chat-draft");

    if (restoredDraft) {
      setDraft(restoredDraft);
      window.sessionStorage.removeItem("eve-chat-draft");
    }
  }, [viewer]);

  useEffect(() => {
    setDismissedError(null);
  }, [clientError]);

  const handleSubmit = useCallback(
    (text: string) => {
      const message = text.trim();

      if (!message || submittingRef.current) {
        return;
      }

      setClientError(null);

      const lengthError = getChatMessageLengthError(message);

      if (lengthError) {
        setClientError(lengthError);
        return;
      }

      if (!setupReady) {
        setClientError(
          getHomeComposerDisabledReason({ setupStatus, submitting }) ??
            "Finish setup before chatting.",
        );
        return;
      }

      if (!viewer) {
        requestSignIn(message);
        return;
      }

      submittingRef.current = true;
      setSubmitting(true);

      const start = () => {
        setDraft("");

        const provisionalChatId = createProvisionalChatId();
        const didStoreMessage = writePendingChatMessage(provisionalChatId, message);

        if (!didStoreMessage) {
          submittingRef.current = false;
          setSubmitting(false);
          setDraft(message);
          setClientError("Failed to start chat.");
          return;
        }

        setActiveChatId(provisionalChatId);
        router.push(`/chat/${provisionalChatId}`, { scroll: false });
      };

      if (!setupStatus.demo) {
        start();
        return;
      }

      // On the demo the gate is asked again before the session starts (ruling 76): the answer
      // read when the page opened can be missing or stale (still in flight, or a run started
      // since), and a send the gate would refuse stays here, its state in place of the requests.
      // A check that fails lets the send go; the agent's own admission still refuses it.
      void readGateStatus()
        .catch(() => null)
        .then((held) => {
          if (!held) {
            start();
            return;
          }
          submittingRef.current = false;
          setSubmitting(false);
          setSendGateStatus(held);
        });
    },
    [requestSignIn, router, setActiveChatId, setupReady, setupStatus, submitting, viewer],
  );

  // On the demo a new session can be resting or busy before it starts; the gate says so here,
  // from the answer read when the page opened or the one read at send time.
  // Busy under this cookie names the cookie's running session; when this browser keeps its chat,
  // the notice offers it and the sidebar marks it running.
  const openGateStatus = useGateStatus(undefined, pathname);
  const gateStatus = sendGateStatus ?? openGateStatus;
  const runningChatId = useMemo(
    () => findRunningChatId(gateStatus, (sessionId) => findClientChatIdBySession(setupStatus.storageMode, sessionId)),
    [gateStatus, setupStatus.storageMode],
  );
  useEffect(() => {
    setRunningChatId(runningChatId);
  }, [runningChatId, setRunningChatId]);
  const composerDisabled = !setupReady || Boolean(gateStatus?.inputDisabled);
  const composerDisabledReason =
    (gateStatus?.inputDisabled ? gateStatus.message : undefined) ??
    getHomeComposerDisabledReason({
      setupStatus,
      submitting,
    });

  if (pathname !== "/") {
    return null;
  }

  // The suggested requests show on the demo while no gate state holds the composer.
  const showRequests = setupStatus.demo && !gateStatus;

  return (
    <>
      {toastError ? (
        <ErrorToast message={toastError} onDismiss={() => setDismissedError(toastError)} />
      ) : null}
      <RunLayout
        dock={
          <ChatComposer
            autoFocus={false}
            disabled={composerDisabled}
            disabledReason={composerDisabledReason}
            footerStart={
              setupReady && !setupStatus.connectionsAvailable ? undefined : (
                <ComposerFooterControls setupStatus={setupStatus} />
              )
            }
            id="request"
            isBusy={IDLE_CONTROLLER_STATUS.isBusy}
            isPreparing={submitting}
            label={showRequests ? "Or write your own request" : "Your request"}
            onChange={setDraft}
            onSubmit={handleSubmit}
            value={draft}
          />
        }
        run={EMPTY_RUN}
        title="New session"
      >
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className={`${THREAD} flex min-h-full flex-col justify-center-safe py-8`}>
            <SessionStart
              demo={setupStatus.demo}
              notice={
                gateStatus ? (
                  <GateNotice runningChatHref={runningChatHref(runningChatId)} status={gateStatus} />
                ) : undefined
              }
              onPick={showRequests ? handleSubmit : undefined}
            />
          </div>
        </div>
      </RunLayout>
    </>
  );
}

function getHomeComposerDisabledReason({
  setupStatus,
  submitting,
}: {
  readonly setupStatus: SetupStatus;
  readonly submitting: boolean;
}) {
  if (!setupStatus.appReady) {
    const missing = setupStatus.missing.length
      ? ` Missing: ${setupStatus.missing.join(", ")}.`
      : "";

    return `Finish setup before chatting.${missing}`;
  }

  if (submitting) {
    return "Preparing chat.";
  }

  return undefined;
}
