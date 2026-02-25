import { ToolLoopAgent, stepCountIs } from "ai";
import { ChatbotMessage } from "@/lib/features/chat/types";
import { WEB_SEARCH_TOOL } from "@/lib/features/web-search/constants";
import { ModelConfiguration } from "@/lib/features/foundation-model/types";
import {
  urlContextFactory,
  webSearchFactory,
} from "@/lib/features/web-search/tools";
import {
  hasToExecuteUrlContext,
  urlContextStep,
} from "@/lib/features/chat/agents/url-context-step";
import { WEB_SEARCH_AGENT_PROMPT } from "@/lib/features/chat/agents/prompts";
import { withMessageProcessing } from "@/lib/features/chat/agents/utils";

interface CreateWebSearchAgentParams {
  modelConfiguration: ModelConfiguration;
  messages: ChatbotMessage[];
  webSearchNumResults: number;
}

export const createWebSearchAgent = ({
  modelConfiguration,
  messages,
  webSearchNumResults,
}: CreateWebSearchAgentParams) => {
  const toolSet = {
    ...webSearchFactory({
      webSearchNumResults,
    }),
    ...urlContextFactory(),
  };

  return new ToolLoopAgent({
    ...modelConfiguration,
    instructions: WEB_SEARCH_AGENT_PROMPT,
    tools: toolSet,
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
  });
};
