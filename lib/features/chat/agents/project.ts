import { ToolLoopAgent, stepCountIs } from "ai";
import { ChatbotMessage } from "@/lib/features/chat/types";
import { URL_CONTEXT_TOOL } from "@/lib/features/web-search/constants";
import { RAG_TOOL } from "@/lib/features/rag/constants";
import { ModelConfiguration } from "@/lib/features/foundation-model/types";
import { urlContextFactory } from "@/lib/features/web-search/tools";
import { ragFactory } from "@/lib/features/rag/tool";
import {
  hasToExecuteUrlContext,
  urlContextStep,
} from "@/lib/features/chat/agents/url-context-step";
import {
  hasToolCallSteps,
  IS_TEST_ENV,
} from "@/lib/features/chat/agents/utils";
import { Project } from "@/lib/infrastructure/db/schema";
import {
  DEFAULT_PROJECT_AGENT_PROMPT,
  RAG_AGENT_PROMPT,
} from "@/lib/features/chat/agents/prompts";

interface CreateProjectAgentParams {
  modelConfiguration: ModelConfiguration;
  systemPrompt?: string;
  messages: ChatbotMessage[];
  userId: string;
  project: Project;
}

export const createProjectAgent = ({
  modelConfiguration,
  systemPrompt = DEFAULT_PROJECT_AGENT_PROMPT,
  messages,
  userId,
  project,
}: CreateProjectAgentParams) => {
  const toolSet = {
    ...ragFactory({
      userId,
      projectId: project.id,
    }),
    ...urlContextFactory(),
  };

  let isRagEnabled = true;
  if (project && project.tools) {
    isRagEnabled = project.tools.includes(RAG_TOOL);
  }

  return new ToolLoopAgent({
    ...modelConfiguration,
    tools: toolSet,
    maxRetries: 3,
    experimental_telemetry: { isEnabled: true },
    stopWhen: stepCountIs(4),
    activeTools: [],
    prepareStep: async ({ steps }) => {
      if (IS_TEST_ENV)
        return {
          system: systemPrompt,
        };

      if (isRagEnabled && !hasToolCallSteps({ steps, toolName: RAG_TOOL })) {
        return {
          system: RAG_AGENT_PROMPT,
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
