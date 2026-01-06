import React, { Suspense } from "react";
import { Header } from "@/components/layout/header/header";
import { Logo } from "@/components/layout/header/logo";
import { NewChatHeader } from "@/components/chat/new";
import { ThemeToggle } from "@/components/layout/header/theme-toggle";
import EnglishHelperChat from "@/components/english/helper-chat";

export const EnglishHelper: React.FC = async () => {
  return (
    <>
      <Header.Container>
        <Header.Left>
          <Logo />
          <NewChatHeader />
        </Header.Left>
        <Header.Right>
          <ThemeToggle />
        </Header.Right>
      </Header.Container>
      <Suspense fallback={null}>
        <EnglishHelperChat />
      </Suspense>
    </>
  );
};
