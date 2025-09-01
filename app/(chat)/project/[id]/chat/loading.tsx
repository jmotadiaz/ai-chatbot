import React from "react";
import { Header } from "@/components/header";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { NewChat } from "@/components/new-chat";
import { ModelPickerLoading } from "@/components/model-picker";
import { Sidebar } from "@/components/sidebar";

const Loading: React.FC = () => {
  return (
    <>
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
      <div className="h-svh flex flex-col items-center justify-center w-full max-w-4xl px-4 mx-auto pt-24 relative overflow-hidden">
        <div className="h-7 bg-gray-200 dark:bg-zinc-700 rounded-md py-1 animate-pulse w-3/5 mb-12" />
        <div className="w-full h-[136px] bg-gray-200 dark:bg-zinc-700 rounded-lg animate-pulse px-4" />
      </div>
    </>
  );
};

export default Loading;
