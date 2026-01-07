import React from "react";
import { getHistoryChatsAction } from "@/lib/features/chat/history/actions";
import { ChatHistory } from "@/components/chat/history";
import { Header } from "@/components/layout/header/header";
import { Logo } from "@/components/layout/header/logo";
import { NewChatHeader } from "@/components/chat/new";
import { ThemeToggle } from "@/components/layout/header/theme-toggle";
import { Sidebar } from "@/components/layout/sidebar/sidebar";
import { withAuth, Authenticated } from "@/lib/features/auth/with-auth/hoc";

const ChatHistoryPage: React.FC<Authenticated> = async ({ user }) => {
  const { chats, hasMore } = await getHistoryChatsAction({
    limit: 20,
    offset: 0,
  });

  return (
    <>
      <Sidebar user={user} />
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

export default withAuth(ChatHistoryPage);
