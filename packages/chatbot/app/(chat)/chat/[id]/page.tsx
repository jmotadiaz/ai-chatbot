import React from "react";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar/sidebar";
import type { chatModelId } from "@/lib/features/foundation-model/config";
import {
  defaultWebSearchNumResults,
  defaultRagMaxResources,
  defaultMinRagScore,
} from "@/lib/features/foundation-model/config";
import { getProjectById } from "@/lib/features/project/queries";
import { getChatById, getMessagesByChatId } from "@/lib/features/chat/queries";
import { dbMessageToChatbotMessage } from "@/lib/features/chat/utils";
import { ChatLayout } from "@/app/(chat)/chat-layout";
import {
  withAuth,
  type Authenticated,
} from "@/lib/features/auth/with-auth/hoc";
import { ChatLifecycleShell } from "@/components/chat/lifecycle-shell";
import type { RefinePromptMode } from "@/lib/features/meta-prompt/types";

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

  let refinePromptMode: RefinePromptMode | undefined = "chat";

  if (project) {
    refinePromptMode = project.hasPromptRefiner ? "project" : undefined;
  }

  // Convert to UI messages format
  const initialMessages = dbMessageToChatbotMessage(messages);

  return (
    <ChatLifecycleShell>
      <Sidebar chatId={id} user={user} />
      <ChatLayout
        chatConfig={{
          selectedModel: chat.defaultModel as chatModelId,
          temperature: chat.defaultTemperature ?? undefined,
          topP: chat.defaultTopP ?? undefined,
          topK: chat.defaultTopK ?? undefined,
          chatId: id,
          projectId: chat.projectId ?? undefined,
          agent: project ? "rag" : chat.agent,
          systemPrompt: project ? project.systemPrompt : undefined,
          initialMessages,
          refinePromptMode,
          webSearchNumResults:
            chat.webSearchNumResults ?? defaultWebSearchNumResults,
          ragMaxResources: chat.ragMaxResources ?? defaultRagMaxResources,
          minRagResourcesScore: chat.minRagResourcesScore ?? defaultMinRagScore,
        }}
      />
    </ChatLifecycleShell>
  );
};

export default withAuth(ChatPage);
