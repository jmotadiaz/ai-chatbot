import React from "react";
import { HubClient } from "@/components/chat-hub/hub-client";
import { Header } from "@/components/header";
import { Logo } from "@/components/logo";
import { NewChatHeader } from "@/components/new-chat";
import { Sidebar } from "@/components/sidebar";
import { ThemeToggle } from "@/components/theme-toggle";

const Loading: React.FC = () => {
  return (
    <div className="h-svh flex flex-col justify-center w-full stretch">
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
      <HubClient className="pt-16" />
    </div>
  );
};

export default Loading;


