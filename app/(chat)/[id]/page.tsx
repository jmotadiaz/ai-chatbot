import React from "react";
import { ChatLayout } from "@/app/(chat)/chat-layout";
import { AuthCheck } from "@/components/auth/check";

interface ChatPageProps {
  params: Promise<{ id: string }>;
}

const ChatPage: React.FC<ChatPageProps> = async ({ params }) => {
  const { id } = await params;

  return <>
    <AuthCheck />
    <ChatLayout chatId={id} />
  </>;
};

export default ChatPage;
