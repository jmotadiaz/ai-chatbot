import { stepCountIs } from "ai";
import { ChatbotMessage } from "@/lib/features/chat/types";
import { RAG_TOOL } from "@/lib/features/rag/constants";
import type { ChatModelSelection } from "@/lib/features/chat/chat-modes/model";
import {
  createChatAgent,
  resolveChatModel,
} from "@/lib/features/chat/chat-modes/model";
import { urlContextFactory } from "@/lib/features/web-search/tools";
import { ragFactory } from "@/lib/features/rag/tool";
import {
  hasToExecuteUrlContext,
  urlContextStep,
} from "@/lib/features/chat/chat-modes/url-context-step";
import { RAG_AGENT_PROMPT } from "@/lib/features/chat/chat-modes/prompts";
import { withMessageProcessing } from "@/lib/features/chat/chat-modes/utils";

interface CreateRagAgentParams {
  selection: ChatModelSelection;
  messages: ChatbotMessage[];
  userId: string;
  projectId?: string;
  ragMaxResources?: number;
  minRagResourcesScore?: number;
  memoryContext?: string | null;
}

export const createRagAgent = ({
  selection,
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

  const modelConfiguration = resolveChatModel(selection);

  return createChatAgent(selection, {
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
