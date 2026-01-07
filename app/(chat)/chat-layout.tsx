import React, { Suspense } from "react";
import Chat from "@/components/chat/chat";
import { Header } from "@/components/layout/header/header";
import { Logo } from "@/components/layout/header/logo";
import { ModelPicker } from "@/components/chat/model-picker";
import { ThemeToggle } from "@/components/layout/header/theme-toggle";
import { NewChatHeader } from "@/components/chat/new";
import type { ChatProviderProps } from "@/components/chat/provider";
import { ChatShell } from "@/components/chat/shell";

interface ChatLayoutProps {
  chatConfig: Omit<ChatProviderProps, "children">;
}

export const ChatLayout: React.FC<ChatLayoutProps> = async ({ chatConfig }) => {
  return (
    <Suspense fallback={null}>
      <ChatShell chatConfig={chatConfig}>
        <div className="h-svh flex flex-col justify-center w-full stretch">
          <Header.Container>
            <Header.Left>
              <Logo />
              <NewChatHeader projectId={chatConfig.projectId} />
              <ModelPicker id="header-model-picker" />
            </Header.Left>
            <Header.Right>
              <ThemeToggle />
            </Header.Right>
          </Header.Container>
          <Chat className="pt-16" />
        </div>
      </ChatShell>
    </Suspense>
  );
};
