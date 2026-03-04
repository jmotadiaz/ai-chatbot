import { ChatbotMessage } from "@/lib/features/chat/types";
import {
  ProjectPort,
  ChatAgentAiPort,
} from "@/lib/features/chat/conversation/ports";
import { createProjectAgent } from "@/lib/features/chat/agents/project";
import { createContext7Agent } from "@/lib/features/chat/agents/context7";
import { createWebSearchAgent } from "@/lib/features/chat/agents/web-search";
import { createRagAgent } from "@/lib/features/chat/agents/rag";

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
      modelConfiguration: ai.getProjectModelConfiguration(),
      systemPrompt,
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
    });
  } else if (agent === "web") {
    return createWebSearchAgent({
      modelConfiguration: ai.getWebSearchModelConfiguration(),
      messages,
      webSearchNumResults,
    });
  } else {
    // Default to Context7 agent
    return createContext7Agent({
      modelConfiguration: ai.getContext7ModelConfiguration(),
    });
  }
};
