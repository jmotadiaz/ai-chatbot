import React, { Suspense } from "react";
import { redirect } from "next/navigation";
import { Sidebar } from "@/app/(chat)/sidebar";
import Chat from "@/components/chat";
import { Header } from "@/components/header";
import { Logo } from "@/components/logo";
import { ModelPicker, ModelPickerLoading } from "@/components/model-picker";
import { ThemeToggle } from "@/components/theme-toggle";
import { NewChatHeader } from "@/components/new-chat";
import type { chatModelId } from "@/lib/ai/models/definition";
import {
  defaultTemperature,
  defaultModel,
  defaultWebSearchNumResults,
  defaultRagSimilarityPercentage,
  defaultRagMaxResources,
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
import type { ChatProviderProps } from "@/app/(chat)/chat-provider";
import { ChatProvider } from "@/app/(chat)/chat-provider";

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
    metaPrompt: defaultMetaPrompt,
    preventChatPersistence: temporary,
    webSearchNumResults: defaultWebSearchNumResults,
    ragSimilarityPercentage: defaultRagSimilarityPercentage,
    ragMaxResources: defaultRagMaxResources,
    tools: [],
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
      chatId,
      projectId: chat.projectId ?? undefined,
      systemPrompt: project ? project.systemPrompt : undefined,
      initialMessages,
      tools: filterTools(chat.tools || []),
      metaPrompt: metaPrompt,
      preventChatPersistence: temporary,
      webSearchNumResults:
        chat.webSearchNumResults ?? defaultWebSearchNumResults,
      ragMaxResources: chat.ragMaxResources ?? defaultRagMaxResources,
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
      systemPrompt: project.systemPrompt,
      metaPrompt: project.hasPromptRefiner ? defaultMetaPrompt : null,
      title: project.name,
      tools: filterTools(project.tools || []),
      preventChatPersistence: temporary,
      webSearchNumResults:
        project.webSearchNumResults ?? defaultWebSearchNumResults,
      ragMaxResources: project.ragMaxResources ?? defaultRagMaxResources,
    };
  }

  return (
    <Suspense fallback={<ChatLoading />}>
      <ChatProvider {...chatConfig}>
        <div className="h-svh flex flex-col justify-center w-full stretch">
          <Sidebar
            projectId={chatConfig.projectId}
            chatId={chatConfig.chatId}
          />
          <Header.Container>
            <Header.Left>
              <Logo />
              <NewChatHeader projectId={chatConfig.projectId} />
              <ModelPicker id="header-model-picker" />
            </Header.Left>
            <Header.Right>
              <ThemeToggle />
            </Header.Right>
          </Header.Container>
          <Chat className="pt-16" />
        </div>
      </ChatProvider>
    </Suspense>
  );
};

export const ChatLoading: React.FC = () => {
  return (
    <>
      <Sidebar />
      <Header.Container>
        <Header.Left>
          <Logo />
          <NewChatHeader />
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
