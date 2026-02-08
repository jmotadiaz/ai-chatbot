import { PrepareStepResult } from "ai";
import { toolPrompts } from "@/lib/features/chat/prompts";
import { ChatbotMessage } from "@/lib/features/chat/types";
import { messagePartsToText } from "@/lib/features/chat/utils";
import { URL_CONTEXT_TOOL } from "@/lib/features/web-search/constants";
import { URLContextTool } from "@/lib/features/web-search/tools";
import { hasContextUrls } from "@/lib/features/web-search/utils";
import { hasUrls } from "@/lib/utils/helpers";

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
    system: toolPrompts[URL_CONTEXT_TOOL],
    activeTools: [URL_CONTEXT_TOOL],
  };
};
