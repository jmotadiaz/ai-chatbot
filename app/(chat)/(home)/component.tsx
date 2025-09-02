import { ChatProvider } from "@/app/providers";
import Chat from "@/components/chat-with-client-storage";
import { Header } from "@/components/header";
import { Logo } from "@/components/logo";
import { NewChatHome as NewChat } from "@/components/new-chat-home";
import { ThemeToggle } from "@/components/theme-toggle";
import { SettingsToggleButton } from "@/components/settings-toggle-button";
import { defaultMetaPrompt } from "@/lib/ai/prompts";

export const HomeChat: React.FC = async () => {
  return (
    <ChatProvider metaPrompt={defaultMetaPrompt}>
      <Header.Container>
        <Header.Left>
          <Logo />
          <NewChat />
        </Header.Left>
        <Header.Right>
          <SettingsToggleButton />
          <ThemeToggle />
        </Header.Right>
      </Header.Container>
      <Chat />
    </ChatProvider>
  );
};
