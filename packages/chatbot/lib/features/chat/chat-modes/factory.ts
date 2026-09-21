import { ChatbotMessage } from "@/lib/features/chat/types";
import type { ChatMode, ResolvedChatMode } from "@/lib/features/chat/types";
import { ChatAgentAiPort } from "@/lib/features/chat/conversation/ports";
import { createProjectAgent } from "@/lib/features/chat/chat-modes/project";
import { createContext7Agent } from "@/lib/features/chat/chat-modes/context7";
import { createWebSearchAgent } from "@/lib/features/chat/chat-modes/web-search";
import { createRagAgent } from "@/lib/features/chat/chat-modes/rag";
import { getRelevantMemory } from "@/lib/features/memory/retrieval";
import { messagePartsToText } from "@/lib/features/chat/utils";
import { getProjectById } from "@/lib/features/project/queries";

export const createChatModeAgent = async ({
  ai,
  projectId,
  chatMode,
  messages,
  userId,
  systemPrompt,
  webSearchNumResults,
  ragMaxResources,
  minRagResourcesScore,
}: {
  ai: ChatAgentAiPort;
  projectId?: string;
  chatMode: ChatMode | ResolvedChatMode;
  systemPrompt?: string;
  messages: ChatbotMessage[];
  userId: string;
  webSearchNumResults: number;
  ragMaxResources?: number;
  minRagResourcesScore?: number;
}) => {
  const lastUserMessage = [...messages]
    .reverse()
    .find((m) => m.role === "user");
  const currentMessage = lastUserMessage
    ? messagePartsToText(lastUserMessage)
    : "";
  const memoryContext = await getRelevantMemory({ userId, currentMessage });

  if (projectId) {
    const project = await getProjectById({
      id: projectId,
      userId,
    });

    if (!project) {
      throw new Error("Project not found");
    }

    const augmentedSystemPrompt = memoryContext
      ? `${systemPrompt ?? ""}\n\n${memoryContext}`.trim()
      : systemPrompt;

    return createProjectAgent({
      modelConfiguration: ai.getProjectModelConfiguration(),
      systemPrompt: augmentedSystemPrompt,
      messages,
      userId,
      project,
    });
  } else if (chatMode === "rag") {
    return createRagAgent({
      modelConfiguration: ai.getRagModelConfiguration(),
      messages,
      userId,
      projectId,
      ragMaxResources,
      minRagResourcesScore,
      memoryContext: memoryContext,
    });
  } else if (chatMode === "web") {
    return createWebSearchAgent({
      modelConfiguration: ai.getWebSearchModelConfiguration(),
      messages,
      webSearchNumResults,
      memoryContext: memoryContext,
    });
  } else {
    // Default to the Context7 chat mode — memory injection excluded
    return createContext7Agent({
      modelConfiguration: ai.getContext7ModelConfiguration(),
      memoryContext: memoryContext,
    });
  }
};
