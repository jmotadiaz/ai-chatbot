import React from "react";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar/sidebar";
import type { chatModelId } from "@/lib/features/foundation-model/config";
import {
  defaultWebSearchNumResults,
  defaultRagMaxResources,
} from "@/lib/features/foundation-model/config";
import { getProjectById } from "@/lib/features/project/queries";
import { getChatById, getMessagesByChatId } from "@/lib/features/chat/queries";
import { defaultMetaPrompt } from "@/lib/features/meta-prompt/prompts";
import {
  filterTools,
  dbMessageToChatbotMessage,
} from "@/lib/features/chat/utils";
import { ChatLayout } from "@/app/(chat)/chat-layout";
import { withAuth, type Authenticated } from "@/lib/features/auth/with-auth";

interface ChatPageProps {
  params: Promise<{ id: string }>;
}

const ChatPage: React.FC<ChatPageProps & Authenticated> = async ({
  params,
  user,
}) => {
  const { id } = await params;
  const chat = await getChatById({ id, userId: user.id! });

  if (!chat) {
    redirect("/");
  }

  const messages = await getMessagesByChatId(id);

  const project = chat.projectId
    ? await getProjectById({
        id: chat.projectId ?? "",
        userId: user.id!,
      })
    : null;

  let metaPrompt: string | null = defaultMetaPrompt;

  if (project && !project.hasPromptRefiner) {
    metaPrompt = null;
  }

  // Convert to UI messages format
  const initialMessages = dbMessageToChatbotMessage(messages);

  return (
    <>
      <Sidebar chatId={id} user={user} />
      <ChatLayout
        chatConfig={{
          selectedModel: chat.defaultModel as chatModelId,
          temperature: chat.defaultTemperature ?? undefined,
          topP: chat.defaultTopP ?? undefined,
          topK: chat.defaultTopK ?? undefined,
          chatId: id,
          projectId: chat.projectId ?? undefined,
          systemPrompt: project ? project.systemPrompt : undefined,
          initialMessages,
          tools: filterTools(chat.tools || []),
          metaPrompt: metaPrompt,
          webSearchNumResults:
            chat.webSearchNumResults ?? defaultWebSearchNumResults,
          ragMaxResources: chat.ragMaxResources ?? defaultRagMaxResources,
        }}
      />
    </>
  );
};

export default withAuth(ChatPage);
