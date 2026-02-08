import { ToolLoopAgent, stepCountIs } from "ai";
import { ChatbotMessage } from "@/lib/features/chat/types";
import { toolPrompts } from "@/lib/features/chat/prompts";
import { URL_CONTEXT_TOOL } from "@/lib/features/web-search/constants";
import { RAG_TOOL } from "@/lib/features/rag/constants";
import { ModelConfiguration } from "@/lib/features/foundation-model/types";
import { urlContextFactory } from "@/lib/features/web-search/tools";
import { ragFactory } from "@/lib/features/rag/tool";
import { getProjectById } from "@/lib/features/project/queries";
import {
  hasToExecuteUrlContext,
  urlContextStep,
} from "@/lib/features/chat/agents/url-context-step";
import { hasToolCallSteps } from "@/lib/features/chat/agents/utils";

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
  const isTestEnv = !!(process.env.NEXT_PUBLIC_ENV === "test");

  const toolSet = {
    ...ragFactory({
      messages,
      userId,
      projectId,
    }),
    ...urlContextFactory(),
  };

  let isRagEnabled = true;
  if (projectId) {
    const project = await getProjectById({ id: projectId, userId });
    if (project && project.tools) {
      isRagEnabled = project.tools.includes(RAG_TOOL);
    }
  }

  return new ToolLoopAgent({
    ...modelConfiguration,
    tools: toolSet,
    maxRetries: 3,
    experimental_telemetry: { isEnabled: true },
    stopWhen: stepCountIs(4),
    activeTools: [],
    prepareStep: async ({ steps }) => {
      if (isTestEnv)
        return {
          system: systemPrompt,
        };

      if (isRagEnabled && !hasToolCallSteps({ steps, toolName: RAG_TOOL })) {
        return {
          system: toolPrompts[RAG_TOOL],
          activeTools: [RAG_TOOL],
          ...(!hasRagToolCalled(messages) && {
            toolChoice: { type: "tool", toolName: RAG_TOOL },
          }),
        };
      }

      if (
        !hasToolCallSteps({ steps, toolName: URL_CONTEXT_TOOL }) &&
        (await hasToExecuteUrlContext(messages))
      ) {
        return urlContextStep();
      }

      return {
        system: systemPrompt,
      };
    },
  });
};

const hasRagToolCalled = (messages: ChatbotMessage[]) => {
  return messages.some((message) =>
    message.parts?.some((part) => part.type === "tool-rag"),
  );
};
