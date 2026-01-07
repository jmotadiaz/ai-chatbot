import React from "react";
import { redirect } from "next/navigation";
import { ChatLayout } from "@/app/(chat)/chat-layout";
import { auth } from "@/lib/features/auth/auth-config";

interface ChatPageProps {
  params: Promise<{ id: string }>;
}

const ChatPage: React.FC<ChatPageProps> = async ({ params }) => {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const { id } = await params;

  return (
    <>
      <ChatLayout chatId={id} />
    </>
  );
};

export default ChatPage;
