import React from "react";
import { SidebarContainer } from "@/components/layout/sidebar/container";
import { Header } from "@/components/layout/header/header";
import { Logo } from "@/components/layout/header/logo";
import { ModelPickerLoading } from "@/components/chat/model-picker";
import { ThemeToggle } from "@/components/layout/header/theme-toggle";
import { NewChatHeader } from "@/components/chat/new";

const Loading: React.FC = () => {
  return (
    <>
      <SidebarContainer />
      <Header.Container>
        <Header.Left>
          <Logo />
          <NewChatHeader />
          <ModelPickerLoading />
        </Header.Left>
        <Header.Right>
          <ThemeToggle />
        </Header.Right>
      </Header.Container>
      <div className="h-svh flex flex-col items-center justify-center w-full max-w-5xl px-4 mx-auto pt-24 relative overflow-hidden">
        <div className="h-9 bg-gray-200 dark:bg-zinc-700 rounded-md py-1 animate-pulse w-3/5 mb-12" />
        <div className="w-full h-[152px] bg-gray-200 dark:bg-zinc-700 rounded-lg animate-pulse px-4" />
      </div>
    </>
  );
};

export default Loading;
