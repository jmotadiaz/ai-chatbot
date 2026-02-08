import { ToolLoopAgent, stepCountIs } from "ai";
import { ChatbotMessage } from "@/lib/features/chat/types";
import { toolPrompts } from "@/lib/features/chat/prompts";
import {
  URL_CONTEXT_TOOL,
  WEB_SEARCH_TOOL,
} from "@/lib/features/web-search/constants";
import { ModelConfiguration } from "@/lib/features/foundation-model/types";
import {
  urlContextFactory,
  webSearchFactory,
} from "@/lib/features/web-search/tools";
import { hasToolCallSteps } from "@/lib/features/chat/agents/utils";
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
  systemPrompt,
  messages,
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
    tools: toolSet,
    instructions: systemPrompt,
    maxRetries: 3,
    experimental_telemetry: { isEnabled: true },
    stopWhen: stepCountIs(4),
    activeTools: [],
    prepareStep: async ({ steps }) => {
      if (isTestEnv) return;

      if (!hasToolCallSteps({ steps, toolName: WEB_SEARCH_TOOL })) {
        return {
          system: toolPrompts[WEB_SEARCH_TOOL],
          activeTools: [WEB_SEARCH_TOOL],
          ...(!hasWebSearchToolCalled(messages) && {
            toolChoice: { type: "tool", toolName: WEB_SEARCH_TOOL },
          }),
        };
      }

      if (
        !hasToolCallSteps({ steps, toolName: URL_CONTEXT_TOOL }) &&
        (await hasToExecuteUrlContext(messages))
      ) {
        return urlContextStep();
      }

      return {};
    },
  });
};

const hasWebSearchToolCalled = (messages: ChatbotMessage[]) => {
  return messages.some((message) =>
    message.parts?.some((part) => part.type === "tool-webSearch"),
  );
};
