import React from "react";
import { Sidebar } from "@/components/layout/sidebar/sidebar";
import {
  withAuth,
  type Authenticated,
} from "@/lib/features/auth/with-auth/hoc";
import { ChatLifecycleShell } from "@/components/chat/lifecycle-shell";
import { Context7Chat } from "@/components/chat/context7";
import { Main } from "@/components/ui/main";
import { Header } from "@/components/layout/header/header";
import { Logo } from "@/components/layout/header/logo";
import { ThemeToggle } from "@/components/layout/header/theme-toggle";

const Context7Page: React.FC<Authenticated> = async ({ user }) => {
  return (
    <ChatLifecycleShell>
      <Sidebar user={user} />
      <Header.Container>
        <Header.Left>
          <Logo />
        </Header.Left>
        <Header.Right>
          <ThemeToggle />
        </Header.Right>
      </Header.Container>
      <Main>
        <Context7Chat />
      </Main>
    </ChatLifecycleShell>
  );
};

export default withAuth(Context7Page);
