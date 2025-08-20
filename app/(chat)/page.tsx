import React from "react";
import { ChatProvider, SidebarProvider } from "@/app/providers";
import Chat from "@/components/chat-with-client-storage";
import { Header } from "@/components/header";
import { Logo } from "@/components/logo";
import { NewChatHome as NewChat } from "@/components/new-chat-home";
import { ModelPicker } from "@/components/model-picker";
import { ThemeToggle } from "@/components/theme-toggle";
import { defaultMetaPrompt } from "@/lib/ai/prompts";
import { Sidebar } from "@/app/(chat)/sidebar";
import { Main } from "@/components/ui/main";
import { AuthCheck } from "@/components/auth-check";

const Page: React.FC = async () => {
  return (
    <SidebarProvider>
      <AuthCheck />
      <Main>
        <Sidebar />
        <ChatProvider metaPrompt={defaultMetaPrompt}>
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
        </ChatProvider>
      </Main>
    </SidebarProvider>
  );
};

export default Page;
