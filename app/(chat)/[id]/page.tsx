import React from "react";
import { ChatLayout } from "@/app/(chat)/chat-layout";
import { ResourceOwnerCheck } from "@/components/auth/resource-owner-check";

interface ChatPageProps {
  params: Promise<{ id: string }>;
}

const ChatPage: React.FC<ChatPageProps> = async ({ params }) => {
  const { id } = await params;

  return (
    <>
      <ResourceOwnerCheck chatId={id} />
      <ChatLayout chatId={id} />
    </>
  );
};

export default ChatPage;
