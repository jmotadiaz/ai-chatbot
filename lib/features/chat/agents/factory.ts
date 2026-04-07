import { ChatbotMessage } from "@/lib/features/chat/types";
import {
  ProjectPort,
  ChatAgentAiPort,
} from "@/lib/features/chat/conversation/ports";
import { createProjectAgent } from "@/lib/features/chat/agents/project";
import { createContext7Agent } from "@/lib/features/chat/agents/context7";
import { createWebSearchAgent } from "@/lib/features/chat/agents/web-search";
import { createRagAgent } from "@/lib/features/chat/agents/rag";
import { getRelevantMemory } from "@/lib/features/memory/retrieval";
import { messagePartsToText } from "@/lib/features/chat/utils";

export const createAgent = async ({
  ai,
  projectId,
  agent,
  messages,
  userId,
  systemPrompt,
  webSearchNumResults,
  ragMaxResources,
  minRagResourcesScore,
  projectPort,
}: {
  ai: ChatAgentAiPort;
  projectId?: string;
  agent: string;
  systemPrompt?: string;
  messages: ChatbotMessage[];
  userId: string;
  webSearchNumResults: number;
  ragMaxResources?: number;
  minRagResourcesScore?: number;
  projectPort?: ProjectPort;
}) => {
  const lastUserMessage = [...messages]
    .reverse()
    .find((m) => m.role === "user");
  const currentMessage = lastUserMessage
    ? messagePartsToText(lastUserMessage)
    : "";
  const memoryContext = await getRelevantMemory({ userId, currentMessage });

  if (projectId) {
    if (!projectPort) {
      throw new Error("ProjectPort is required for project agent");
    }

    const project = await projectPort.getProjectById({
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
  } else if (agent === "rag") {
    return createRagAgent({
      modelConfiguration: ai.getRagModelConfiguration(),
      messages,
      userId,
      projectId,
      ragMaxResources,
      minRagResourcesScore,
      memoryContext: memoryContext,
    });
  } else if (agent === "web") {
    return createWebSearchAgent({
      modelConfiguration: ai.getWebSearchModelConfiguration(),
      messages,
      webSearchNumResults,
      memoryContext: memoryContext,
    });
  } else {
    // Default to Context7 agent — memory injection excluded
    return createContext7Agent({
      modelConfiguration: ai.getContext7ModelConfiguration(),
      memoryContext: memoryContext,
    });
  }
};
