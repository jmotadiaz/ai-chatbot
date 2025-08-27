import React from "react";
import { redirect } from "next/navigation";
import { ChatProvider, SidebarProvider } from "../../providers";
import { Sidebar } from "../sidebar";
import Chat from "@/components/chat";
import { Header } from "@/components/header";
import { Logo } from "@/components/logo";
import { ModelPicker } from "@/components/model-picker";
import { ThemeToggle } from "@/components/theme-toggle";
import { NewChat } from "@/components/new-chat";
import {
  defaultTemperature,
  defaultTopP,
  chatModelId,
} from "@/lib/ai/models/definition";
import {
  getChatById,
  getMessagesByChatId,
  getProjectById,
} from "@/lib/db/queries";
import { auth } from "@/auth";
import { defaultMetaPrompt } from "@/lib/ai/prompts";
import { filterTools } from "@/lib/ai/tools/utils";
import { dbMessageToChatbotMessage } from "@/lib/ai/utils";

interface ChatPageProps {
  params: Promise<{ id: string }>;
}

const ChatPage: React.FC<ChatPageProps> = async ({ params }) => {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const chat = await getChatById(id);

  if (!chat) {
    redirect("/");
  }

  if (chat.userId !== session.user.id) {
    redirect("/");
  }

  const messages = await getMessagesByChatId(id);

  const project = chat.projectId
    ? await getProjectById(chat.projectId ?? "")
    : null;

  let metaPrompt: string | null = defaultMetaPrompt;

  if (project && !project.hasPromptRefiner) {
    metaPrompt = null;
  }

  // Convert to UI messages format
  const initialMessages = dbMessageToChatbotMessage(messages);

  return (
    <ChatProvider
      selectedModel={chat.defaultModel as chatModelId}
      temperature={chat.defaultTemperature ?? defaultTemperature}
      topP={chat.defaultTopP ?? defaultTopP}
      chatId={id}
      tools={filterTools(chat.tools || [])}
      metaPrompt={metaPrompt}
      initialMessages={initialMessages}
    >
      <SidebarProvider>
        <div className="h-svh flex flex-col justify-center w-full stretch">
          <Sidebar projectId={chat.projectId} />
          <Header.Container>
            <Header.Left>
              <Logo />
              <NewChat />
              <ModelPicker />
            </Header.Left>
            <Header.Right>
              <ThemeToggle />
            </Header.Right>
          </Header.Container>
          <Chat />
        </div>
      </SidebarProvider>
    </ChatProvider>
  );
};

export default ChatPage;
