import React from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/features/auth/auth-config";
import { getHistoryChatsAction } from "@/lib/features/chat/history/actions";
import { ChatHistory } from "@/components/chat-history";

const ChatHistoryPage: React.FC = async () => {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const { chats, hasMore } = await getHistoryChatsAction({
    limit: 20,
    offset: 0,
  });

  return (
    <div className="flex-1 w-full flex flex-col items-center p-4 pt-8">
        <ChatHistory initialChats={chats} initialHasMore={hasMore} />
    </div>
  );
};

export default ChatHistoryPage;
