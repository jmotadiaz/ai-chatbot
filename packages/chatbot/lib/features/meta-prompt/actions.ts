import { convertToModelMessages, generateText, stepCountIs } from "ai";
import {
  codingAgentMetaPrompt,
  continuationMetaPrompt,
  initialMetaPrompt,
  systemMetaPrompt,
} from "./prompts";
import { RefinePromptInput } from "./types";
import { RAG_TOOL } from "@/lib/features/rag/constants";
import { ragFactory } from "@/lib/features/rag/tool";
import { inferenceKit } from "@/lib/infrastructure/ai/inference-kit";

export async function refinePrompt({
  input,
  messages,
  projectId,
  userId,
  mode = "chat",
}: RefinePromptInput) {
  if (mode === "project") {
    return refineSystemPrompt({ input, projectId, userId });
  }

  if (mode === "coding-agent") {
    return refineCodingAgentPrompt({ input });
  }

  return refineChatPrompt({ input, messages });
}

async function refineCodingAgentPrompt({
  input,
}: Pick<RefinePromptInput, "input">) {
  const { text } = await generateText({
    ...inferenceKit.languageModel("metaPromptRefiner"),
    system: codingAgentMetaPrompt,
    prompt: input,
  });

  return text;
}

async function refineChatPrompt({
  input,
  messages = [],
}: Pick<RefinePromptInput, "input" | "messages">) {
  const modelMessages = await convertToModelMessages([
    ...(messages ?? []).map((message) => ({
      ...message,
      parts: message.parts.filter((part) => part.type === "text"),
    })),
    {
      role: "user",
      parts: [
        {
          type: "text",
          text: input,
        },
      ],
    },
  ]);

  const metaPrompt =
    messages.length > 0 ? continuationMetaPrompt : initialMetaPrompt;

  const { text } = await generateText({
    ...inferenceKit.languageModel("metaPromptRefiner"),
    system: metaPrompt,
    messages: modelMessages,
  });

  return text;
}

async function refineSystemPrompt({
  input,
  projectId,
  userId,
}: Pick<RefinePromptInput, "input" | "projectId" | "userId">) {
  let ragCalled = false;

  const { text } = await generateText({
    ...inferenceKit.languageModel("metaPromptRefiner"),
    system: systemMetaPrompt,
    prompt: input,
    stopWhen: stepCountIs(3),
    tools: ragFactory({
      projectId,
      userId,
    }),
    activeTools: [],
    experimental_prepareStep: async () => {
      if (!ragCalled && projectId) {
        ragCalled = true;
        return {
          activeTools: [RAG_TOOL],
          toolChoice: { type: "tool", toolName: RAG_TOOL },
        };
      }
    },
  });

  return text;
}
