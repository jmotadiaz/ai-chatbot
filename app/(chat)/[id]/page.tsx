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
import { Message } from "@/lib/db/schema";
import { defaultTemperature, defaultTopP, chatModelId } from "@/lib/ai/models";
import {
  getChatById,
  getMessagesByChatId,
  getProjectById,
} from "@/lib/db/queries";
import { auth } from "@/auth";
import { defaultMetaPrompt } from "@/lib/ai/prompts";
import { ChatbotMessage } from "@/lib/ai/types";

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

  const metaPrompt = project ? project.metaPrompt : defaultMetaPrompt;

  // Convert to UI messages format
  const initialMessages = convertToChatbotMessages(messages);

  return (
    <ChatProvider
      selectedModel={chat.defaultModel as chatModelId}
      temperature={chat.defaultTemperature ?? defaultTemperature}
      topP={chat.defaultTopP ?? defaultTopP}
      chatId={id}
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

function convertToChatbotMessages(
  messages: Array<Message>
): Array<ChatbotMessage> {
  return messages.map((message) => ({
    id: message.id,
    parts: message.parts as ChatbotMessage["parts"],
    role: message.role as ChatbotMessage["role"],
    createdAt: message.createdAt,
    // In v5, attachments are handled through parts array
  }));
}
