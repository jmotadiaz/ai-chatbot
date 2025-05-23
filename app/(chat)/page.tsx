import Chat from "@/components/chat-with-client-storage";
import Sidebar from "@/components/sidebar";
import { ChatList } from "@/components/chat-list";
import { Header } from "@/components/header";
import { ChatProvider, SidebarProvider } from "../providers";
import { Logo } from "../../components/logo";
import { NewChatHome } from "../../components/new-chat-home";
import { ModelPicker } from "../../components/model-picker";
import { ThemeToggle } from "../../components/theme-toggle";

export default async function Page() {
  return (
    <ChatProvider>
      <SidebarProvider>
        <Sidebar>
          <ChatList />
        </Sidebar>
        <div className="h-dvh flex flex-col justify-center w-full stretch">
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
      </SidebarProvider>
    </ChatProvider>
  );
}
