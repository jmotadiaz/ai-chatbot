import { ChatbotMessage } from "@/lib/features/chat/types";
import type { ChatMode, ResolvedChatMode } from "@/lib/features/chat/types";
import { ChatAgentAiPort } from "@/lib/features/chat/conversation/ports";
import { createProjectAgent } from "@/lib/features/chat/chat-modes/project";
import { createContext7Agent } from "@/lib/features/chat/chat-modes/context7";
import { createWebSearchAgent } from "@/lib/features/chat/chat-modes/web-search";
import { createNeutralAgent } from "@/lib/features/chat/chat-modes/neutral";
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
      ai,
      systemPrompt: augmentedSystemPrompt,
      messages,
      userId,
      project,
    });
  }

  switch (chatMode) {
    case "auto":
    case "neutral":
      // `neutral` is the resolved mode of a tool-less Auto turn. A bare `auto`
      // reaching here means no routing decision was available, which degrades to
      // the same branch instead of silently forcing a Context7 lookup.
      return createNeutralAgent({ ai });
    case "context7":
      return createContext7Agent({ ai, memoryContext });
    case "rag":
      return createRagAgent({
        ai,
        messages,
        userId,
        projectId,
        ragMaxResources,
        minRagResourcesScore,
        memoryContext: memoryContext,
      });
    case "web":
      return createWebSearchAgent({
        ai,
        messages,
        webSearchNumResults,
        memoryContext: memoryContext,
      });
    default: {
      // Exhaustiveness check: a new Chat Mode must be dispatched explicitly
      // here instead of falling through to some other mode's agent.
      const unhandled: never = chatMode;
      throw new Error(`Unhandled chat mode: ${String(unhandled)}`);
    }
  }
};
