import React, { Suspense } from "react";
import Chat from "@/components/chat-with-client-storage";
import { Sidebar, SidebarContent, SidebarFooter } from "@/components/sidebar";
import { ChatList } from "@/components/chat-list";
import { Header } from "@/components/header";
import { Logo } from "@/components/logo";
import { NewChatHome } from "@/components/new-chat-home";
import { ModelPicker } from "@/components/model-picker";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/user-menu";
import { ChatProvider, SidebarProvider } from "../providers";

const Page: React.FC = async () => {
  return (
    <ChatProvider>
      <SidebarProvider>
        <div className="h-svh flex flex-col justify-center w-full stretch">
          <Sidebar>
            <SidebarContent>
              <Suspense fallback={null}>
                <ChatList />
              </Suspense>
            </SidebarContent>
            <SidebarFooter>
              <Suspense fallback={null}>
                <UserMenu />
              </Suspense>
            </SidebarFooter>
          </Sidebar>
          <Header>
            <div className="flex flex-row items-center gap-6 shrink-0">
              <Logo />
              <NewChatHome />
              <ModelPicker />
            </div>
            <div className="flex flex-row items-center gap-2 shrink-0">
              <ThemeToggle />
            </div>
          </Header>
          <Chat />
        </div>
      </SidebarProvider>
    </ChatProvider>
  );
};

export default Page;
