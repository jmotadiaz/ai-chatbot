import React from "react";
import { Header } from "@/components/header";
import { Logo } from "@/components/logo";
import { NewChatHome as NewChat } from "@/components/new-chat-home";
import { ThemeToggle } from "@/components/theme-toggle";
import { Main } from "@/components/ui/main";

const Loading: React.FC = async () => {
  return (
    <Main>
      <Header.Container>
        <Header.Left>
          <Logo />
          <NewChat />
        </Header.Left>
        <Header.Right>
          <ThemeToggle />
        </Header.Right>
      </Header.Container>
    </Main>
  );
};

export default Loading;
