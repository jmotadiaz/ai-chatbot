import { stepCountIs } from "ai";
import { ChatbotMessage } from "@/lib/features/chat/types";
import { RAG_TOOL } from "@/lib/features/rag/constants";
import type { ChatAgentAiPort } from "@/lib/features/chat/conversation/ports";
import { urlContextFactory } from "@/lib/features/web-search/tools";
import { ragFactory } from "@/lib/features/rag/tool";
import {
  hasToExecuteUrlContext,
  urlContextStep,
} from "@/lib/features/chat/chat-modes/url-context-step";
import { RAG_AGENT_PROMPT } from "@/lib/features/chat/chat-modes/prompts";
import { withMessageProcessing } from "@/lib/features/chat/chat-modes/utils";

interface CreateRagAgentParams {
  ai: ChatAgentAiPort;
  messages: ChatbotMessage[];
  userId: string;
  projectId?: string;
  ragMaxResources?: number;
  minRagResourcesScore?: number;
  memoryContext?: string | null;
}

export const createRagAgent = ({
  ai,
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

  const modelConfiguration = ai.getModelConfiguration();

  return ai.createAgent({
    instructions,
    tools: toolSet,
    overrides: {
      maxRetries: 3,
      experimental_telemetry: { isEnabled: true },
      stopWhen: stepCountIs(5),
      activeTools: [RAG_TOOL],
      prepareStep: withMessageProcessing(
        modelConfiguration,
        async ({ stepNumber }) => {
          if (stepNumber === 1 && (await hasToExecuteUrlContext(messages))) {
            return urlContextStep();
          }
        },
      ),
    },
  });
};
