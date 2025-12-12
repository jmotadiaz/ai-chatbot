import React from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/features/auth/auth-config";
import { ChatComposition } from "@/app/(chat)/chat-composition";

interface ChatPageProps {
  params: Promise<{ id: string }>;
}

const ChatPage: React.FC<ChatPageProps> = async ({ params }) => {
  const { id } = await params;
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return <ChatComposition chatId={id} />;
};

export default ChatPage;
