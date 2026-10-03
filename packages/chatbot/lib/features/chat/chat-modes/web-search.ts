import { stepCountIs } from "ai";
import { ChatbotMessage } from "@/lib/features/chat/types";
import { WEB_SEARCH_TOOL } from "@/lib/features/web-search/constants";
import type { ChatAgentAiPort } from "@/lib/features/chat/conversation/ports";
import {
  urlContextFactory,
  webSearchFactory,
} from "@/lib/features/web-search/tools";
import {
  hasToExecuteUrlContext,
  urlContextStep,
} from "@/lib/features/chat/chat-modes/url-context-step";
import { WEB_SEARCH_AGENT_PROMPT } from "@/lib/features/chat/chat-modes/prompts";
import { withMessageProcessing } from "@/lib/features/chat/chat-modes/utils";

interface CreateWebSearchAgentParams {
  ai: ChatAgentAiPort;
  messages: ChatbotMessage[];
  webSearchNumResults: number;
  memoryContext?: string | null;
}

export const createWebSearchAgent = ({
  ai,
  messages,
  webSearchNumResults,
  memoryContext,
}: CreateWebSearchAgentParams) => {
  const toolSet = {
    ...webSearchFactory({
      webSearchNumResults,
    }),
    ...urlContextFactory(),
  };

  const instructions = memoryContext
    ? `${WEB_SEARCH_AGENT_PROMPT}\n\n${memoryContext}`
    : WEB_SEARCH_AGENT_PROMPT;

  const modelConfiguration = ai.getModelConfiguration();

  return ai.createAgent({
    instructions,
    tools: toolSet,
    overrides: {
      maxRetries: 3,
      experimental_telemetry: { isEnabled: true },
      stopWhen: stepCountIs(5),
      activeTools: [WEB_SEARCH_TOOL],
      prepareStep: withMessageProcessing(
        modelConfiguration,
        async ({ stepNumber }) => {
          if (stepNumber === 0 && (await hasToExecuteUrlContext(messages))) {
            return urlContextStep();
          }
        },
      ),
    },
  });
};
