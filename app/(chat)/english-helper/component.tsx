import React from "react";
import { Header } from "@/components/header";
import { Logo } from "@/components/logo";
import { NewChat } from "@/components/new-chat";
import { ThemeToggle } from "@/components/theme-toggle";
import EnglishHelperChat from "@/components/english-helper-chat";

export const EnglishHelper: React.FC = async () => {
  return (
    <>
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
    </>
  );
};
