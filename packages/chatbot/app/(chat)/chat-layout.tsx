import React, { Suspense } from "react";
import Chat from "@/components/chat/chat";
import { Header } from "@/components/layout/header/header";
import { Logo } from "@/components/layout/header/logo";
import { ModelPicker } from "@/components/chat/model-picker";
import { ThemeToggle } from "@/components/layout/header/theme-toggle";
import { ActiveChatMenu } from "@/components/chat/menu";
import { NewChatHeader } from "@/components/chat/new";
import type { ChatProviderProps } from "@/components/chat/provider";
import { ChatShell } from "@/components/chat/shell";
import { Main } from "@/components/ui/main";

interface ChatLayoutProps {
  chatConfig: Omit<ChatProviderProps, "children">;
}

export const ChatLayout: React.FC<ChatLayoutProps> = async ({ chatConfig }) => {
  return (
    <Suspense fallback={null}>
      <ChatShell chatConfig={chatConfig}>
        <Header.Container>
          <Header.Left>
            <Logo />
            <NewChatHeader projectId={chatConfig.projectId} />
            <ModelPicker id="header-model-picker" />
          </Header.Left>
          <Header.Right>
            <ActiveChatMenu />
            <ThemeToggle />
          </Header.Right>
        </Header.Container>
        <Main>
          <Chat className="pt-16" />
        </Main>
      </ChatShell>
    </Suspense>
  );
};
