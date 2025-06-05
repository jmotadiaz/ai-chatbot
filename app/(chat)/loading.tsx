import React from "react";
import Chat from "@/components/chat-with-client-storage";
import { Header } from "@/components/header";
import { Logo } from "@/components/logo";
import { NewChatHome } from "@/components/new-chat-home";
import { ModelPicker } from "@/components/model-picker";
import { ThemeToggle } from "@/components/theme-toggle";
import { ChatProvider } from "../providers";

const Loading: React.FC = async () => {
  return (
    <ChatProvider>
      <div className="h-svh flex flex-col justify-center w-full stretch">
        <Header>
          <div className="flex flex-row items-center gap-6 shrink-0">
            <Logo />
            <NewChatHome />
            <ModelPicker />
          </div>
          <div className="flex flex-row items-center gap-2 shrink-0">
            <ThemeToggle />
          </div>
        </Header>
        <Chat />
      </div>
    </ChatProvider>
  );
};

export default Loading;
