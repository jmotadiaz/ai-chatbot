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
import { IS_TEST_ENV } from "@/lib/features/chat/agents/utils";

interface CreateRagAgentParams {
  modelConfiguration: ModelConfiguration;
  messages: ChatbotMessage[];
  userId: string;
  projectId?: string;
  ragMaxResources?: number;
  minRagResourcesScore?: number;
}

export const createRagAgent = ({
  modelConfiguration,
  messages,
  userId,
  projectId,
  ragMaxResources,
  minRagResourcesScore,
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

  return new ToolLoopAgent({
    ...modelConfiguration,
    tools: toolSet,
    maxRetries: 3,
    experimental_telemetry: { isEnabled: true },
    stopWhen: stepCountIs(5),
    instructions: RAG_AGENT_PROMPT,
    activeTools: [RAG_TOOL],
    prepareStep: async ({ stepNumber }) => {
      if (IS_TEST_ENV)
        return {
          activeTools: [],
        };

      if (stepNumber === 1 && (await hasToExecuteUrlContext(messages))) {
        return urlContextStep();
      }
    },
  });
};
