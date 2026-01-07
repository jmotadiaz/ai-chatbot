import React from "react";
import { ChatLayout } from "@/app/(chat)/chat-layout";
import { withAuth, AuthenticatedPage } from "@/lib/features/auth/with-auth";

interface ChatPageProps extends AuthenticatedPage {
  params: Promise<{ id: string }>;
}

const ChatPage: React.FC<ChatPageProps> = async ({ params, user }) => {
  const { id } = await params;

  return (
    <>
      <ChatLayout chatId={id} user={user} />
    </>
  );
};

export default withAuth(ChatPage);
