import { Context7Agent, AGENT_PROMPT } from "@upstash/context7-tools-ai-sdk";
import { stepCountIs } from "ai";
import type { ChatModelSelection } from "@/lib/features/chat/chat-modes/model";
import { resolveChatModel } from "@/lib/features/chat/chat-modes/model";
import { withMessageProcessing } from "@/lib/features/chat/chat-modes/utils";

/**
 * `Context7Agent` (third-party, from `@upstash/context7-tools-ai-sdk`) is not
 * a `ToolLoopAgent`, so this branch cannot go through the kit's `createAgent`
 * — it still needs the raw Model Configuration to spread into its own
 * constructor, resolved (with tracing) by the kit's `createAgentModel`.
 */
export const createContext7Agent = ({
  selection,
  memoryContext,
}: {
  selection: ChatModelSelection;
  memoryContext: string | null;
}) => {
  const modelConfiguration = resolveChatModel(selection);
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
