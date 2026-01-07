import React from "react";
import { redirect } from "next/navigation";
import { getHistoryChatsAction } from "@/lib/features/chat/history/actions";
import { ChatHistory } from "@/components/chat/history";
import { Header } from "@/components/layout/header/header";
import { Logo } from "@/components/layout/header/logo";
import { NewChatHeader } from "@/components/chat/new";
import { ThemeToggle } from "@/components/layout/header/theme-toggle";
import { Sidebar } from "@/components/layout/sidebar/sidebar";
import { auth } from "@/lib/features/auth/auth-config";

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
    <>
      <Sidebar />
      <Header.Container>
        <Header.Left>
          <Logo />
          <NewChatHeader />
        </Header.Left>
        <Header.Right>
          <ThemeToggle />
        </Header.Right>
      </Header.Container>
      <div className="flex-1 w-full flex flex-col items-center p-4 pt-28">
        <ChatHistory initialChats={chats} initialHasMore={hasMore} />
      </div>
    </>
  );
};

export default ChatHistoryPage;
