import React from "react";
import { Header } from "@/components/header";
import { Logo } from "@/components/logo";
import { NewChat } from "@/components/new-chat";
import { ThemeToggle } from "@/components/theme-toggle";
import EnglishHelperChat from "@/components/english-helper-chat";
import { Main } from "@/components/ui/main";

const Loading: React.FC = () => {
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
      <EnglishHelperChat />
    </Main>
  );
};

export default Loading;
