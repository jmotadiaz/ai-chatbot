import { ModelConfiguration } from "@/lib/features/foundation-model/types";
import { ChatbotMessage } from "@/lib/features/chat/types";
import { ProjectPort } from "@/lib/features/chat/conversation/ports";
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
  ragMaxResources,
  minRagResourcesScore,
  projectPort,
}: {
  projectId?: string;
  agent: string;
  systemPrompt?: string;
  modelConfiguration: ModelConfiguration;
  messages: ChatbotMessage[];
  userId: string;
  selectedModel: chatModelId;
  webSearchNumResults: number;
  ragMaxResources?: number;
  minRagResourcesScore?: number;
  projectPort?: ProjectPort;
}) => {
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
      ragMaxResources,
      minRagResourcesScore,
    });
  }
};
