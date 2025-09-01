import React from "react";
import { NewChat } from "../../../components/new-chat";
import { Header } from "@/components/header";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { ModelPickerLoading } from "@/components/model-picker";
import { Sidebar } from "@/components/sidebar";

const Loading: React.FC = () => {
  return (
    <div className="h-svh flex flex-col justify-center w-full stretch">
      <Sidebar />
      <Header.Container>
        <Header.Left>
          <Logo />
          <NewChat />
          <ModelPickerLoading />
        </Header.Left>
        <Header.Right>
          <ThemeToggle />
        </Header.Right>
      </Header.Container>
      <div className="h-svh w-full max-w-4xl px-4 mx-auto pt-24 relative overflow-hidden">
        <div className="relative z-1 pr-4">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index}>
              <div className="h-5 bg-gray-200 dark:bg-zinc-700 rounded-md py-1 animate-pulse w-full mb-3" />
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
          <div className="w-full h-[102px] bg-gray-200 dark:bg-zinc-700 rounded-md py-2 animate-pulse" />
        </div>
      </div>
    </div>
  );
};

export default Loading;
