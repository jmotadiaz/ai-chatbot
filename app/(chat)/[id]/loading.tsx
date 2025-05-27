import { Header } from "@/components/header";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { NewChat } from "../../../components/new-chat";
import React from "react";

export default function Loading() {
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
      <div className="h-svh w-full max-w-2xl mx-auto pt-24 relative px-4 overflow-hidden">
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
}
