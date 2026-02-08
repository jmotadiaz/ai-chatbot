import { ToolLoopAgent, stepCountIs } from "ai";
import { ChatbotMessage } from "@/lib/features/chat/types";
import {
  URL_CONTEXT_TOOL,
  WEB_SEARCH_TOOL,
} from "@/lib/features/web-search/constants";
import { ModelConfiguration } from "@/lib/features/foundation-model/types";
import { hasToolCallSteps } from "@/lib/features/chat/agents/utils";
import {
  urlContextFactory,
  webSearchFactory,
} from "@/lib/features/web-search/tools";
import {
  hasToExecuteUrlContext,
  urlContextStep,
} from "@/lib/features/chat/agents/url-context-step";

interface CreateWebAgentParams {
  modelConfiguration: ModelConfiguration;
  systemPrompt: string;
  messages: ChatbotMessage[];
  webSearchNumResults: number;
}

export const createWebAgent = ({
  modelConfiguration,
  messages,
  systemPrompt,
  webSearchNumResults,
}: CreateWebAgentParams) => {
  const isTestEnv = !!(process.env.NEXT_PUBLIC_ENV === "test");

  const toolSet = {
    ...webSearchFactory({
      webSearchNumResults,
    }),
    ...urlContextFactory(),
  };

  return new ToolLoopAgent({
    ...modelConfiguration,
    instructions: systemPrompt,
    tools: toolSet,
    maxRetries: 3,
    experimental_telemetry: { isEnabled: true },
    stopWhen: stepCountIs(4),
    activeTools: [WEB_SEARCH_TOOL],
    prepareStep: async ({ steps, stepNumber }) => {
      if (isTestEnv) return {
        activeTools: [],
      };

      if (
        stepNunber === 0 &&
        !hasToolCallSteps({ steps, toolName: WEB_SEARCH_TOOL })
      ) {
        return {toolChoice: { type: "tool", toolName: WEB_SEARCH_TOOL }};
      }

      if (
        !hasToolCallSteps({ steps, toolName: URL_CONTEXT_TOOL }) &&
        (await hasToExecuteUrlContext(messages))
      ) {
        return urlContextStep();
      }
    },
  });
};
