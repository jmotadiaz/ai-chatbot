import React from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/features/auth/auth-config";
import { HubClient } from "@/components/chat/hub/hub-client";
import { Sidebar } from "@/components/layout/sidebar/sidebar";
import { Header } from "@/components/layout/header/header";
import { Logo } from "@/components/layout/header/logo";
import { ThemeToggle } from "@/components/layout/header/theme-toggle";
import { NewChatHeader } from "@/components/chat/new";

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


