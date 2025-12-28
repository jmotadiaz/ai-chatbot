import React from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/features/auth/auth-config";
import { HubClient } from "@/components/chat-hub/hub-client";
import { Sidebar } from "@/app/(chat)/sidebar";
import { Header } from "@/components/header";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { NewChatHeader } from "@/components/new-chat";

const HubPage: React.FC = async () => {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

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

export default HubPage;


