import React from "react";
import { HubClient } from "@/components/chat/hub/hub-client";
import { Header } from "@/components/layout/header/header";
import { Logo } from "@/components/layout/header/logo";
import { NewChatHeader } from "@/components/chat/new";
import { ThemeToggle } from "@/components/layout/header/theme-toggle";

export const ChatHubComponent: React.FC = () => {
  return (
    <div className="h-svh flex flex-col justify-center w-full stretch">
      <Header.Container>
        <Header.Left>
          <Logo />
          <NewChatHeader />
        </Header.Left>
        <Header.Right>
          <ThemeToggle />
        </Header.Right>
      </Header.Container>
      <HubClient className="pt-16" />
    </div>
  );
};


