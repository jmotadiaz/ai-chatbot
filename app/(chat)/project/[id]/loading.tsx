import { Header } from "@/components/header";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { NewChat } from "@/components/new-chat";
import React from "react";

const Loading: React.FC = () => {
  return (
    <div className="h-svh flex flex-col justify-center w-full stretch">
      <Header>
        <div className="flex flex-row items-center gap-6 shrink-0">
          <Logo />
          <NewChat />
          <div className="w-44 xl:w-48 h-[32px] bg-gray-200 dark:bg-zinc-700 rounded-md py-2 animate-pulse" />
        </div>
        <div className="flex flex-row items-center gap-2 shrink-0">
          <ThemeToggle />
        </div>
      </Header>
      <div className="h-svh flex flex-col items-center justify-center w-full max-w-2xl mx-auto pt-24 relative overflow-hidden">
        <div className="h-7 bg-gray-200 dark:bg-zinc-700 rounded-md py-1 animate-pulse w-3/5 mb-12" />
        <div className="w-full h-[136px] bg-gray-200 dark:bg-zinc-700 rounded-lg animate-pulse px-4" />
      </div>
    </div>
  );
};

export default Loading;
