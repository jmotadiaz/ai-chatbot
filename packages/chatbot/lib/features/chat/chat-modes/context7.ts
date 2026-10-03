import { Context7Agent, AGENT_PROMPT } from "@upstash/context7-tools-ai-sdk";
import { stepCountIs } from "ai";
import type { ChatAgentAiPort } from "@/lib/features/chat/conversation/ports";
import { withMessageProcessing } from "@/lib/features/chat/chat-modes/utils";

/**
 * `Context7Agent` (third-party, from `@upstash/context7-tools-ai-sdk`) is not
 * a `ToolLoopAgent`, so this branch cannot go through the kit's `createAgent`
 * — it still needs the raw Model Configuration to spread into its own
 * constructor, via `ai.getModelConfiguration()`.
 */
export const createContext7Agent = ({
  ai,
  memoryContext,
}: {
  ai: ChatAgentAiPort;
  memoryContext: string | null;
}) => {
  const modelConfiguration = ai.getModelConfiguration();
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
