import { convertToModelMessages, generateText, stepCountIs } from "ai";
import {
  continuationMetaPrompt,
  initialMetaPrompt,
  systemMetaPrompt,
} from "./prompts";
import { RefinePromptInput } from "./types";
import { RAG_TOOL } from "@/lib/features/rag/constants";
import { ragFactory } from "@/lib/features/rag/tool";
import { languageModelConfigurations } from "@/lib/features/foundation-model/config";

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

  return refineChatPrompt({ input, messages });
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
    ...languageModelConfigurations("GPT OSS"),
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
    ...languageModelConfigurations("Gemini 3 Flash"),
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
