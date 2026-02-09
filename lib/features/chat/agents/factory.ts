import { ModelConfiguration } from "@/lib/features/foundation-model/types";
import { ChatbotMessage } from "@/lib/features/chat/types";
import { getProjectById } from "@/lib/features/project/queries";
import { createProjectAgent } from "@/lib/features/chat/agents/project";
import { createContext7Agent } from "@/lib/features/chat/agents/context7";
import { createWebSearchAgent } from "@/lib/features/chat/agents/web-search";
import { createRagAgent } from "@/lib/features/chat/agents/rag";
import { chatModelId } from "@/lib/features/foundation-model/config";

export const createAgent = async ({
  projectId,
  agent,
  modelConfiguration,
  messages,
  userId,
  systemPrompt,
  selectedModel,
  webSearchNumResults,
}: {
  projectId?: string;
  agent: string;
  systemPrompt: string;
  modelConfiguration: ModelConfiguration;
  messages: ChatbotMessage[];
  userId: string;
  selectedModel: chatModelId;
  webSearchNumResults: number;
}) => {
  if (projectId) {
    const project = await getProjectById({
      id: projectId,
      userId,
    });

    if (!project) {
      throw new Error("Project not found");
    }

    return createProjectAgent({
      modelConfiguration,
      systemPrompt,
      messages,
      userId,
      project,
    });
  } else if (agent === "context7") {
    return createContext7Agent(selectedModel);
  } else if (agent === "web") {
    return createWebSearchAgent({
      modelConfiguration,
      messages,
      webSearchNumResults,
    });
  } else {
    // Default to RAG agent
    return createRagAgent({
      modelConfiguration,
      messages,
      userId,
      projectId,
    });
  }
};
