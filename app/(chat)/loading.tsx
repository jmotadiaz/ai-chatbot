import React from "react";
import { ChatProvider } from "../providers";
import Chat from "@/components/chat-with-client-storage";
import { Header } from "@/components/header";
import { Logo } from "@/components/logo";
import { NewChatHome } from "@/components/new-chat-home";
import { ModelPicker } from "@/components/model-picker";
import { ThemeToggle } from "@/components/theme-toggle";

const Loading: React.FC = async () => {
  return (
    <ChatProvider>
      <div className="h-svh flex flex-col justify-center w-full stretch">
        <Header.Container>
          <Header.Left>
            <Logo />
            <NewChatHome />
            <ModelPicker />
          </Header.Left>
          <Header.Right>
            <ThemeToggle />
          </Header.Right>
        </Header.Container>
        <Chat />
      </div>
    </ChatProvider>
  );
};

export default Loading;
