import React from "react";
import { redirect } from "next/navigation";
import { ChatProvider, SidebarProvider } from "../providers";
import Chat from "@/components/chat-with-client-storage";
import { Header } from "@/components/header";
import { Logo } from "@/components/logo";
import { NewChatHome as NewChat } from "@/components/new-chat-home";
import { ModelPicker } from "@/components/model-picker";
import { ThemeToggle } from "@/components/theme-toggle";
import { auth } from "@/auth";
import { defaultMetaPrompt } from "@/lib/ai/prompts";
import { Sidebar } from "@/app/(chat)/sidebar";

const Page: React.FC = async () => {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <SidebarProvider>
      <div className="h-svh flex flex-col justify-center w-full stretch">
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
      </div>
    </SidebarProvider>
  );
};

export default Page;
