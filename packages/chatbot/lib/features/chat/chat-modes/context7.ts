import { Context7Agent, AGENT_PROMPT } from "@upstash/context7-tools-ai-sdk";
import { stepCountIs } from "ai";
import type { ModelConfiguration } from "inference";
import { withMessageProcessing } from "@/lib/features/chat/chat-modes/utils";

export const createContext7Agent = ({
  modelConfiguration,
  memoryContext,
}: {
  modelConfiguration: ModelConfiguration;
  memoryContext: string | null;
}) => {
  const instructions = memoryContext
    ? `${AGENT_PROMPT}\n\n${memoryContext}`
    : AGENT_PROMPT;

  return new Context7Agent({
    ...modelConfiguration,
    prepareStep: withMessageProcessing(modelConfiguration),
    stopWhen: stepCountIs(20),
    instructions,
  });
};
