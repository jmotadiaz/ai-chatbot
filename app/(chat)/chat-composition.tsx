import React from "react";
import { redirect } from "next/navigation";
import { Sidebar } from "@/app/(chat)/sidebar";
import Chat from "@/components/chat";
import { Header } from "@/components/header";
import { Logo } from "@/components/logo";
import { ModelPicker } from "@/components/model-picker";
import { ThemeToggle } from "@/components/theme-toggle";
import { NewChatHeader } from "@/components/new-chat";
import {
  defaultTemperature,
  defaultTopP,
  chatModelId,
  defaultModel,
  defaultTopK,
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
import { ChatProvider, ChatProviderProps } from "@/app/(chat)/chat-provider";

interface ChatCompositionProps {
  chatId?: string;
  projectId?: string;
  temporary?: boolean;
}

export const ChatComposition: React.FC<ChatCompositionProps> = async ({
  chatId,
  projectId,
  temporary = false,
}) => {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  let chatConfig: Omit<ChatProviderProps, "children"> = {
    selectedModel: defaultModel,
    temperature: defaultTemperature,
    topP: defaultTopP,
    topK: defaultTopK,
    metaPrompt: defaultMetaPrompt,
    preventChatPersistence: temporary,
  };

  if (chatId) {
    const chat = await getChatById(chatId);

    if (!chat) {
      redirect("/");
    }

    const messages = await getMessagesByChatId(chatId);

    const project = chat.projectId
      ? await getProjectById(chat.projectId ?? "")
      : null;

    let metaPrompt: string | null = defaultMetaPrompt;

    if (project && !project.hasPromptRefiner) {
      metaPrompt = null;
    }

    // Convert to UI messages format
    const initialMessages = dbMessageToChatbotMessage(messages);

    chatConfig = {
      selectedModel: chat.defaultModel as chatModelId,
      temperature: chat.defaultTemperature ?? defaultTemperature,
      topP: chat.defaultTopP ?? defaultTopP,
      topK: chat.defaultTopK ?? defaultTopK,
      chatId,
      projectId: chat.projectId ?? undefined,
      initialMessages,
      tools: filterTools(chat.tools || []),
      metaPrompt: metaPrompt,
      preventChatPersistence: temporary,
    };
  } else if (projectId) {
    const project = await getProjectById(projectId);

    if (!project || project.userId !== session.user.id) {
      redirect("/project/new");
    }

    chatConfig = {
      projectId: project.id,
      selectedModel: (project.defaultModel as chatModelId) || undefined,
      temperature: project.defaultTemperature || undefined,
      topP: project.defaultTopP || undefined,
      systemPrompt: project.systemPrompt,
      metaPrompt: project.hasPromptRefiner ? defaultMetaPrompt : null,
      title: project.name,
      tools: filterTools(project.tools || []),
      preventChatPersistence: temporary,
    };
  }

  return (
    <ChatProvider {...chatConfig}>
      <div className="h-svh flex flex-col justify-center w-full stretch">
        <Sidebar projectId={chatConfig.projectId} chatId={chatConfig.chatId} />
        <Header.Container>
          <Header.Left>
            <Logo />
            <NewChatHeader />
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
