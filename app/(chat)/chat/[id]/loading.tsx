import React from "react";
import { Header } from "@/components/layout/header/header";
import { Logo } from "@/components/layout/header/logo";
import { ThemeToggle } from "@/components/layout/header/theme-toggle";
import { NewChatHeader } from "@/components/chat/new";
import { ModelPickerLoading } from "@/components/chat/model-picker";
import { SidebarContainer } from "@/components/layout/sidebar/container";

const Loading: React.FC = () => {
  return (
    <div className="h-svh flex flex-col justify-center w-full stretch">
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
      <div className="h-svh w-full max-w-4xl px-4 mx-auto pt-24 relative overflow-hidden">
        <div className="relative z-1 pr-4">
          <div className="flex justify-end">
            <div className="h-20 bg-secondary rounded-tl-3xl rounded-br-3xl rounded-bl-3xl animate-pulse w-3/4 mb-10" />
          </div>
          {Array.from({ length: 10 }).map((_, index) => (
            <div key={index}>
              <div className="pr-6">
                <div className="h-5 bg-gray-200 dark:bg-zinc-700 rounded-md py-1 animate-pulse w-full mb-3" />
              </div>
              <div className="h-5 bg-gray-200 dark:bg-zinc-700 rounded-md py-1 animate-pulse w-full mb-3" />
              <div className="pr-2">
                <div className="h-5 bg-gray-200 dark:bg-zinc-700 rounded-md py-1 animate-pulse w-full mb-3" />
              </div>
              <div className="h-5 bg-gray-200 dark:bg-zinc-700 rounded-md py-1 animate-pulse w-3/5 mb-8" />
            </div>
          ))}
        </div>
        <div className="absolute bottom-0 left-0 right-0 z-2 p-4 bg-background">
          <div className="w-full h-[148px] bg-gray-200 dark:bg-zinc-700 rounded-2xl py-2 animate-pulse" />
        </div>
      </div>
    </div>
  );
};

export default Loading;
