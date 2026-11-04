import { Suspense, type ReactNode } from "react";
import { AgentChatBootstrapSync } from "@/app/_components/agent-chat-bootstrap-sync";
import { AgentChatShell } from "@/app/_components/agent-chat-shell";
import { getServerViewer } from "@/lib/session";
import { getInitialSetupStatus, getSetupStatus } from "@/lib/setup";

// The demo's sample repository (the README's AB_DEMO_REPOSITORY; unset, the sample, as
// agent/lib/demo-cleanup.ts reads it), named in the new session's title block. Off the demo, none.
function demoRepository(): string | null {
  if (process.env.AB_DEMO !== "1") return null;
  const repository = process.env.AB_DEMO_REPOSITORY?.trim() || "Ninety2UA/agent-blueprint-sample";
  return /^[\w.-]+\/[\w.-]+$/.test(repository) ? repository : null;
}

export default function ChatLayout({ children }: { readonly children: ReactNode }) {
  const setupStatus = getInitialSetupStatus();

  return (
    <AgentChatShell
      demoRepository={demoRepository()}
      initialChats={[]}
      initialNextCursor={null}
      setupStatus={setupStatus}
      viewer={null}
    >
      {children}
      <div className="hidden" aria-hidden>
        <Suspense fallback={null}>
          <ResolvedChatBootstrap />
        </Suspense>
      </div>
    </AgentChatShell>
  );
}

async function ResolvedChatBootstrap() {
  const setupStatus = await getSetupStatus();
  const viewer = await getServerViewer(setupStatus);

  // Starter mode: chats live in the browser, so the server lists none.
  return (
    <AgentChatBootstrapSync
      chats={[]}
      nextCursor={null}
      setupStatus={setupStatus}
      viewer={viewer}
    />
  );
}
