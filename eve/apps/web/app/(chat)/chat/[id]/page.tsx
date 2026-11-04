import { Suspense } from "react";
import { AgentChatRouteSync } from "@/app/_components/agent-chat-route-sync";
import { SessionChatPage } from "@/app/_components/session-chat-page";
import { isProvisionalChatId } from "@/lib/chat/provisional-chat";

export default async function ChatPage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}) {
  const { id: chatId } = await params;

  return (
    <SessionChatPage chatId={chatId} key={chatId}>
      <Suspense fallback={null}>
        <ExistingChat chatId={chatId} />
      </Suspense>
    </SessionChatPage>
  );
}

async function ExistingChat({ chatId }: { readonly chatId: string }) {
  if (isProvisionalChatId(chatId)) {
    return <AgentChatRouteSync activeChat={null} chatId={chatId} />;
  }

  // Starter mode: the chat's history is in the browser, which loads it itself.
  return <AgentChatRouteSync activeChat={null} chatId={chatId} />;
}
