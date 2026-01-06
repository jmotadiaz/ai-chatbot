import React from "react";
import { Header } from "@/components/layout/header/header";
import { Logo } from "@/components/layout/header/logo";
import { NewChatHeader } from "@/components/chat/new";
import { Sidebar } from "@/components/layout/sidebar/sidebar";
import { ThemeToggle } from "@/components/layout/header/theme-toggle";

const Loading: React.FC = () => {
  return (
    <>
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

      <div className="flex-1 w-full flex flex-col items-center p-4 pt-28">
        <div className="w-full pb-6 max-w-4xl mx-auto">
          {/* Title */}
          <h1 className="text-2xl font-bold mb-6">Chat History</h1>

          {/* Filter */}
          <div className="flex flex-col lg:flex-row gap-4 mb-8 items-center">
            <div className="relative flex-1 w-full">
              <div className="h-9 bg-gray-200 dark:bg-zinc-700 rounded-md animate-pulse w-full" />
              <div className="absolute top-1/2 left-3 w-4 h-4 rounded-sm bg-gray-300 dark:bg-zinc-600 transform -translate-y-1/2 animate-pulse" />
            </div>
          </div>

          {/* List */}
          <ul
            className="space-y-3 max-h-[70dvh] overflow-hidden"
            aria-label="Chat history list"
          >
            {Array.from({ length: 12 }).map((_, index) => (
              <li
                key={index}
                className="flex items-center justify-between p-3 bg-secondary rounded-lg"
              >
                <div className="flex-1 pr-4">
                  <div className="h-4 bg-gray-200 dark:bg-zinc-700 rounded-md animate-pulse w-2/3" />
                </div>
                <div className="h-8 w-8 bg-gray-200 dark:bg-zinc-700 rounded-md animate-pulse" />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
};

export default Loading;


