import { PrepareStepResult } from "ai";
import { ChatbotMessage } from "@/lib/features/chat/types";
import { messagePartsToText } from "@/lib/features/chat/utils";
import { URL_CONTEXT_TOOL } from "@/lib/features/web-search/constants";
import { URLContextTool } from "@/lib/features/web-search/tools";
import { hasContextUrls } from "@/lib/features/web-search/utils";
import { hasUrls } from "@/lib/utils/helpers";
import { URL_CONTEXT_SYSTEM_PROMPT } from "@/lib/features/chat/agents/prompts";

export const hasToExecuteUrlContext = async (
  messages: ChatbotMessage[],
): Promise<boolean> => {
  const lastMessage = messagePartsToText(messages[messages.length - 1]);
  const isUrlPresentInLastMessage = hasUrls(lastMessage);

  return isUrlPresentInLastMessage && (await hasContextUrls(lastMessage));
};

export const urlContextStep = (): PrepareStepResult<URLContextTool> => {
  return {
    toolChoice: { type: "tool", toolName: URL_CONTEXT_TOOL },
    system: URL_CONTEXT_SYSTEM_PROMPT,
    activeTools: [URL_CONTEXT_TOOL],
  };
};
