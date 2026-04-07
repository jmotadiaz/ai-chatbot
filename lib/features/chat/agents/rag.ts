import { ToolLoopAgent, stepCountIs } from "ai";
import { ChatbotMessage } from "@/lib/features/chat/types";
import { RAG_TOOL } from "@/lib/features/rag/constants";
import { ModelConfiguration } from "@/lib/features/foundation-model/types";
import { urlContextFactory } from "@/lib/features/web-search/tools";
import { ragFactory } from "@/lib/features/rag/tool";
import {
  hasToExecuteUrlContext,
  urlContextStep,
} from "@/lib/features/chat/agents/url-context-step";
import { RAG_AGENT_PROMPT } from "@/lib/features/chat/agents/prompts";
import { withMessageProcessing } from "@/lib/features/chat/agents/utils";

interface CreateRagAgentParams {
  modelConfiguration: ModelConfiguration;
  messages: ChatbotMessage[];
  userId: string;
  projectId?: string;
  ragMaxResources?: number;
  minRagResourcesScore?: number;
  memoryContext?: string;
}

export const createRagAgent = ({
  modelConfiguration,
  messages,
  userId,
  projectId,
  ragMaxResources,
  minRagResourcesScore,
  memoryContext,
}: CreateRagAgentParams) => {
  const toolSet = {
    ...ragFactory({
      userId,
      projectId,
      ragMaxResources,
      minRagResourcesScore,
    }),
    ...urlContextFactory(),
  };

  const instructions = memoryContext
    ? `${RAG_AGENT_PROMPT}\n\n${memoryContext}`
    : RAG_AGENT_PROMPT;

  return new ToolLoopAgent({
    ...modelConfiguration,
    tools: toolSet,
    maxRetries: 3,
    experimental_telemetry: { isEnabled: true },
    stopWhen: stepCountIs(5),
    instructions,
    activeTools: [RAG_TOOL],
    prepareStep: withMessageProcessing(
      modelConfiguration,
      async ({ stepNumber }) => {
        if (stepNumber === 1 && (await hasToExecuteUrlContext(messages))) {
          return urlContextStep();
        }
      },
    ),
  });
};
