import React from "react";
import { Header } from "@/components/header";
import { Logo } from "@/components/logo";
import { NewChat } from "@/components/new-chat";
import { ThemeToggle } from "@/components/theme-toggle";
import { SidebarProvider } from "../../providers";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import EnglishHelperChat from "@/components/english-helper-chat";
import { Sidebar } from "../sidebar";

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
