import { ToolLoopAgent, stepCountIs } from "ai";
import { type Tool, TOOLS, ChatbotMessage } from "@/lib/features/chat/types";
import { toolPrompts } from "@/lib/features/chat/prompts";
import { URL_CONTEXT_TOOL } from "@/lib/features/web-search/constants";
import { RAG_TOOL } from "@/lib/features/rag/constants";
import { ModelConfiguration } from "@/lib/features/foundation-model/types";
import { hasContextUrls } from "@/lib/features/web-search/utils";
import { hasUrls } from "@/lib/utils/helpers";
import { urlContextFactory } from "@/lib/features/web-search/tools";
import { ragFactory } from "@/lib/features/rag/tool";
import { messagePartsToText } from "@/lib/features/chat/utils";
import { getProjectById } from "@/lib/features/project/queries";

interface CreateRagAgentParams {
  modelConfiguration: ModelConfiguration;
  systemPrompt: string;
  messages: ChatbotMessage[];
  userId: string;
  projectId?: string;
}

export const createRagAgent = async ({
  modelConfiguration,
  systemPrompt,
  messages,
  userId,
  projectId,
}: CreateRagAgentParams) => {
  const lastMessage = messagePartsToText(messages[messages.length - 1]);
  const isUrlPresentInLastMessage = hasUrls(lastMessage);
  const isTestEnv = !!(process.env.NEXT_PUBLIC_ENV === "test");

  const toolSet = {
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

  let shouldForceRag = true;
  if (projectId) {
    const project = await getProjectById({ id: projectId, userId });
    if (project && project.tools) {
      shouldForceRag = project.tools.includes(RAG_TOOL);
    }
  }

  return new ToolLoopAgent({
    ...modelConfiguration,
    tools: toolSet,
    instructions: systemPrompt,
    maxRetries: 3,
    experimental_telemetry: { isEnabled: true },
    stopWhen: stepCountIs(4),
    activeTools: [],
    prepareStep: async () => {
      // Always try RAG tool first if not executed
      if (shouldForceRag && !executedTools.has(RAG_TOOL)) {
        executedTools.add(RAG_TOOL);
        return {
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
          toolChoice: { type: "tool", toolName: URL_CONTEXT_TOOL },
          system: toolPrompts[URL_CONTEXT_TOOL],
          activeTools: [URL_CONTEXT_TOOL],
        };
      }

      return {};
    },
  });
};
