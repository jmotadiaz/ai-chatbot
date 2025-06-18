import React from "react";
import { redirect } from "next/navigation";
import { SidebarProvider } from "../../providers";
import { Sidebar } from "../sidebar";
import { Header } from "@/components/header";
import { Logo } from "@/components/logo";
import { NewChat } from "@/components/new-chat";
import { ThemeToggle } from "@/components/theme-toggle";
import { auth } from "@/auth";
import EnglishHelperChat from "@/components/english-helper-chat";

const Page: React.FC = async () => {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <SidebarProvider>
      <div className="h-svh flex flex-col justify-center w-full stretch">
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
        <EnglishHelperChat />
      </div>
    </SidebarProvider>
  );
};

export default Page;
