import React from "react";
import { SidebarProvider } from "../../providers";
import { Sidebar } from "../sidebar";
import { Header } from "@/components/header";
import { Logo } from "@/components/logo";
import { NewChat } from "@/components/new-chat";
import { ThemeToggle } from "@/components/theme-toggle";
import EnglishHelperChat from "@/components/english-helper-chat";
import { Main } from "@/components/ui/main";
import { AuthCheck } from "@/components/auth-check";

const Page: React.FC = async () => {
  return (
    <SidebarProvider>
      <AuthCheck />
      <Sidebar />
      <Header.Container>
        <Header.Left>
          <Logo />
          <NewChat />
        </Header.Left>
        <Header.Right>
          <ThemeToggle />
        </Header.Right>
      </Header.Container>
      <Main>
        <EnglishHelperChat />
      </Main>
    </SidebarProvider>
  );
};

export default Page;
