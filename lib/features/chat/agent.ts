import { ToolLoopAgent, stepCountIs } from "ai";
import { type Tool, TOOLS, ChatbotMessage  } from "@/lib/features/chat/types";
import { languageModelConfigurations } from "@/lib/features/foundation-model/config";
import { toolPrompts } from "@/lib/features/chat/prompts";
import {
  URL_CONTEXT_TOOL,
  WEB_SEARCH_TOOL,
} from "@/lib/features/web-search/constants";
import { RAG_TOOL } from "@/lib/features/rag/constants";
import { ModelConfiguration } from "@/lib/features/foundation-model/types";
import { hasContextUrls } from "@/lib/features/web-search/utils";
import { hasUrls } from "@/lib/utils/helpers";
import {
  urlContextFactory,
  webSearchFactory,
} from "@/lib/features/web-search/tools";
import { ragFactory } from "@/lib/features/rag/tool";
import { messagePartsToText } from "@/lib/features/chat/utils";

interface CreateAgentParams {
  modelConfiguration: ModelConfiguration;
  systemPrompt: string;
  selectedTools: Tool[]; // The list of tool names available for this chat
  messages: ChatbotMessage[];
  webSearchNumResults: number;
  userId: string;
  projectId?: string;
}

export const createAgent = ({
  modelConfiguration,
  systemPrompt,
  selectedTools,
  messages,
  webSearchNumResults,
  userId,
  projectId,
}: CreateAgentParams) => {
  const lastMessage = messagePartsToText(messages[messages.length - 1]);
  const isUrlPresentInLastMessage = hasUrls(lastMessage);
  const isTestEnv = !!(process.env.NEXT_PUBLIC_ENV === "test");

  const toolSet = {
    ...webSearchFactory({
      webSearchNumResults,
    }),
    ...ragFactory({
      messages,
      userId,
      projectId,
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
      if (selectedTools.includes(RAG_TOOL) && !executedTools.has(RAG_TOOL)) {
        executedTools.add(RAG_TOOL);
        return {
          ...(!modelConfiguration.nativeToolCalling && {
            ...languageModelConfigurations("Gemini 3 Flash Tools"),
            toolChoice: { type: "tool", toolName: RAG_TOOL },
          }),
          system: toolPrompts[RAG_TOOL],
          activeTools: [RAG_TOOL],
        };
      }

      if (
        !executedTools.has(URL_CONTEXT_TOOL) &&
        isUrlPresentInLastMessage &&
        (await hasContextUrls(lastMessage))
      ) {
        executedTools.add(URL_CONTEXT_TOOL);
        return {
          ...(!modelConfiguration.nativeToolCalling && {
            ...languageModelConfigurations("Gemini 3 Flash Tools"),
            toolChoice: { type: "tool", toolName: URL_CONTEXT_TOOL },
          }),
          system: toolPrompts[URL_CONTEXT_TOOL],
          activeTools: [URL_CONTEXT_TOOL],
        };
      }

      if (
        selectedTools.includes(WEB_SEARCH_TOOL) &&
        !executedTools.has(WEB_SEARCH_TOOL)
      ) {
        executedTools.add(WEB_SEARCH_TOOL);
        return {
          ...(!modelConfiguration.nativeToolCalling && {
            ...languageModelConfigurations("Gemini 3 Flash Tools"),
            toolChoice: { type: "tool", toolName: WEB_SEARCH_TOOL },
          }),
          system: toolPrompts[WEB_SEARCH_TOOL],
          activeTools: [WEB_SEARCH_TOOL],
        };
      }
      return {};
    },
  });
};
