import { ToolLoopAgent, stepCountIs } from "ai";
import { type Tool, TOOLS, ChatbotMessage } from "@/lib/features/chat/types";
import { toolPrompts } from "@/lib/features/chat/prompts";
import {
  URL_CONTEXT_TOOL,
  WEB_SEARCH_TOOL,
} from "@/lib/features/web-search/constants";
import { ModelConfiguration } from "@/lib/features/foundation-model/types";
import { hasContextUrls } from "@/lib/features/web-search/utils";
import { hasUrls } from "@/lib/utils/helpers";
import {
  urlContextFactory,
  webSearchFactory,
} from "@/lib/features/web-search/tools";
import { messagePartsToText } from "@/lib/features/chat/utils";

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
  const lastMessage = messagePartsToText(messages[messages.length - 1]);
  const isUrlPresentInLastMessage = hasUrls(lastMessage);
  const isTestEnv = !!(process.env.NEXT_PUBLIC_ENV === "test");

  const toolSet = {
    ...webSearchFactory({
      webSearchNumResults,
    }),
    ...urlContextFactory(),
  };

  const executedTools = new Set<Tool>(
    isTestEnv || modelConfiguration.toolCalling === false ? TOOLS : [],
  );

  return new ToolLoopAgent({
    ...modelConfiguration,
    tools: toolSet,
    instructions: systemPrompt,
    maxRetries: 3,
    experimental_telemetry: { isEnabled: true },
    stopWhen: stepCountIs(4),
    activeTools: [],
    prepareStep: async () => {
      // Always try Web Search tool first if not executed
      if (!executedTools.has(WEB_SEARCH_TOOL)) {
        executedTools.add(WEB_SEARCH_TOOL);
        return {
          toolChoice: { type: "tool", toolName: WEB_SEARCH_TOOL },
          system: toolPrompts[WEB_SEARCH_TOOL],
          activeTools: [WEB_SEARCH_TOOL],
        };
      }

      if (
        !executedTools.has(URL_CONTEXT_TOOL) &&
        isUrlPresentInLastMessage &&
        (await hasContextUrls(lastMessage))
      ) {
        executedTools.add(URL_CONTEXT_TOOL);
        return {
          toolChoice: { type: "tool", toolName: URL_CONTEXT_TOOL },
          system: toolPrompts[URL_CONTEXT_TOOL],
          activeTools: [URL_CONTEXT_TOOL],
        };
      }

      return {};
    },
  });
};
