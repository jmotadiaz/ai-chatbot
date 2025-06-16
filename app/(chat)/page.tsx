import React from "react";
import Chat from "@/components/chat-with-client-storage";
import { Sidebar, SidebarContent, SidebarFooter } from "@/components/sidebar";
import { ChatList } from "@/components/chat-list";
import { Header } from "@/components/header";
import { Logo } from "@/components/logo";
import { NewChatHome as NewChat } from "@/components/new-chat-home";
import { ModelPicker } from "@/components/model-picker";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/user-menu";
import { ChatProvider, SidebarProvider } from "../providers";
import { ProjectList } from "@/components/project-list";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getChats } from "@/lib/db/queries";
import { defaultMetaPrompt } from "@/lib/ai/prompts";

const Page: React.FC = async () => {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const { chats } = await getChats({
    userId: session.user.id,
    limit: 10,
  });

  return (
    <ChatProvider metaPrompt={defaultMetaPrompt}>
      <SidebarProvider>
        <div className="h-svh flex flex-col justify-center w-full stretch">
          <Sidebar>
            <SidebarContent>
              <ProjectList />
              <ChatList chats={chats} />
            </SidebarContent>
            <SidebarFooter>
              <UserMenu />
            </SidebarFooter>
          </Sidebar>
          <Header.Container>
            <Header.Left>
              <Logo />
              <NewChat />
              <ModelPicker />
            </Header.Left>
            <Header.Right>
              <ThemeToggle />
            </Header.Right>
          </Header.Container>
          <Chat />
        </div>
      </SidebarProvider>
    </ChatProvider>
  );
};

export default Page;
